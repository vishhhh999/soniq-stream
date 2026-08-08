import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { playEvents, shareLinks, tracks } from "@/lib/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { notifyOwnerOfPlay, getUsernameById } from "@/lib/notifications";
import { albums } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const DEBOUNCE_MS = 60_000;

// Records a play event from the share page. Does NOT require the listener
// to own the track — the token is the authorization. Nullable userId:
// logged-in listeners get their id recorded, anonymous listeners get null.
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  // Validate the token and resolve the trackId.
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, params.token));

  if (!link) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired." }, { status: 410 });
  }

  // Resolve which trackId(s) to record. For album shares, record one
  // play event for each track in the album — caller passes the specific
  // trackId being played.
  const body = await _req.json().catch(() => ({}));
  const trackId: string | undefined = body.trackId ?? link.trackId ?? undefined;
  if (!trackId) return NextResponse.json({ error: "No trackId." }, { status: 400 });

  // Get userId if logged in — null for anonymous.
  const session = await auth();
  const userId: string | null = (session?.user && (session.user as any).id) ?? null;

  // Debounce: same user/anonymous + same track within 60s → skip.
  const cutoff = new Date(Date.now() - DEBOUNCE_MS);

  if (userId) {
    const [recent] = await db
      .select({ id: playEvents.id })
      .from(playEvents)
      .where(
        and(
          eq(playEvents.trackId, trackId),
          eq(playEvents.userId, userId),
          gt(playEvents.playedAt, cutoff)
        )
      )
      .orderBy(desc(playEvents.playedAt))
      .limit(1);
    if (recent) return NextResponse.json({ ok: true, counted: false });
  }
  // Anonymous: no debounce — can't fingerprint without a userId.

  await db.insert(playEvents).values({
    id: nanoid(),
    trackId,
    userId,
    playedAt: new Date(),
  });

  // Notify the track owner about the play.
  try {
    const [fullTrack] = await db.select({ userId: tracks.userId, title: tracks.title, albumId: tracks.albumId }).from(tracks).where(eq(tracks.id, trackId));
    if (fullTrack) {
      let albumName: string | null = null;
      if (fullTrack.albumId) {
        const [album] = await db.select({ name: albums.name }).from(albums).where(eq(albums.id, fullTrack.albumId));
        albumName = album?.name ?? null;
      }
      const actorUsername = userId ? await getUsernameById(userId) : null;
      await notifyOwnerOfPlay({
        ownerId: fullTrack.userId,
        actorUserId: userId,
        actorUsername,
        trackId,
        trackTitle: fullTrack.title,
        albumId: fullTrack.albumId ?? null,
        albumName,
      });
    }
  } catch (err) {
    console.error("Play notification failed (non-fatal):", err);
  }

  return NextResponse.json({ ok: true, counted: true });
}
