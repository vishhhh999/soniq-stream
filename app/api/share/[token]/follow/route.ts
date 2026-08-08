import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { contentFollows, shareLinks, albums, tracks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ ok: false, reason: "not_authed" });

  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
  if (!link) return NextResponse.json({ ok: false, reason: "not_found" });

  // Resolve the owner of this content.
  let ownerId: string | null = null;
  let albumId: string | null = link.albumId ?? null;
  let trackId: string | null = link.trackId ?? null;

  if (link.albumId) {
    const [album] = await db.select({ userId: albums.userId }).from(albums).where(eq(albums.id, link.albumId));
    ownerId = album?.userId ?? null;
  } else if (link.trackId) {
    const [track] = await db.select({ userId: tracks.userId }).from(tracks).where(eq(tracks.id, link.trackId));
    ownerId = track?.userId ?? null;
  }

  if (!ownerId) return NextResponse.json({ ok: false, reason: "not_found" });

  // Don't follow your own content.
  if (ownerId === userId) return NextResponse.json({ ok: true, reason: "own_content" });

  // Idempotent — check if follow already exists.
  const existing = await db
    .select({ id: contentFollows.id })
    .from(contentFollows)
    .where(
      and(
        eq(contentFollows.userId, userId),
        albumId ? eq(contentFollows.albumId, albumId) : eq(contentFollows.trackId, trackId!)
      )
    )
    .limit(1);

  if (existing.length > 0) return NextResponse.json({ ok: true, reason: "already_following" });

  await db.insert(contentFollows).values({
    id: nanoid(),
    userId,
    ownerId,
    albumId,
    trackId,
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, reason: "followed" });
}
