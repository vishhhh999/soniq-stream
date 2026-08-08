import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, tracks, playEvents, users } from "@/lib/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [album] = await db.select().from(albums).where(eq(albums.id, params.id));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Receivers can't view insights — only the original owner can.
  if (album.userId !== userId) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const albumTracks = await db
    .select({ id: tracks.id, title: tracks.title })
    .from(tracks)
    .where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));

  const trackIds = albumTracks.map((t) => t.id);
  if (trackIds.length === 0) {
    return NextResponse.json({ totalPlays: 0, byTrack: [], byListener: [] });
  }

  // Also gather play events on any copies of these tracks (saved-to-library copies
  // have originalTrackId pointing back here). This lets the owner see plays
  // that happened from the receivers' libraries, not just from the share page.
  const copies = await db
    .select({ id: tracks.id, originalTrackId: tracks.originalTrackId })
    .from(tracks)
    .where(inArray(tracks.originalTrackId as any, trackIds));

  // Map copy trackId → original trackId for aggregation.
  const copyToOriginal = new Map(copies.map((c) => [c.id, c.originalTrackId as string]));
  const allTrackIds = [...trackIds, ...copies.map((c) => c.id)];

  // By track — aggregate plays on original + all copies back to the original.
  const rawRows = await db
    .select({ trackId: playEvents.trackId, count: count() })
    .from(playEvents)
    .where(inArray(playEvents.trackId, allTrackIds))
    .groupBy(playEvents.trackId);

  const countByOriginal = new Map<string, number>();
  for (const row of rawRows) {
    const origId = copyToOriginal.get(row.trackId) ?? row.trackId;
    countByOriginal.set(origId, (countByOriginal.get(origId) ?? 0) + row.count);
  }

  const byTrack = albumTracks
    .map((t) => ({ trackId: t.id, title: t.title, plays: countByOriginal.get(t.id) || 0 }))
    .sort((a, b) => b.plays - a.plays);

  const totalPlays = byTrack.reduce((sum, t) => sum + t.plays, 0);

  // By listener — group across all track IDs.
  const listenerRows = await db
    .select({ userId: playEvents.userId, count: count() })
    .from(playEvents)
    .where(inArray(playEvents.trackId, allTrackIds))
    .groupBy(playEvents.userId);

  const knownUserIds = listenerRows
    .filter((r) => r.userId !== null)
    .map((r) => r.userId as string);

  const userRows =
    knownUserIds.length > 0
      ? await db
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, knownUserIds))
      : [];

  const usernameById = new Map(userRows.map((u) => [u.id, u.username]));
  const anonymousTotal = listenerRows
    .filter((r) => r.userId === null)
    .reduce((sum, r) => sum + r.count, 0);

  const byListener = [
    ...listenerRows
      .filter((r) => r.userId !== null)
      .map((r) => ({
        userId: r.userId as string,
        username: usernameById.get(r.userId as string) ?? null,
        plays: r.count,
      }))
      .sort((a, b) => b.plays - a.plays),
    ...(anonymousTotal > 0 ? [{ userId: null, username: null, plays: anonymousTotal }] : []),
  ];

  return NextResponse.json({ totalPlays, byTrack, byListener });
}
