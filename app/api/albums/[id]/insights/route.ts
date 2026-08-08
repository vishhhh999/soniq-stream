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

  const [album] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const albumTracks = await db
    .select({ id: tracks.id, title: tracks.title })
    .from(tracks)
    .where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));

  const trackIds = albumTracks.map((t) => t.id);

  if (trackIds.length === 0) {
    return NextResponse.json({ totalPlays: 0, byTrack: [], byListener: [] });
  }

  // By track
  const trackRows = await db
    .select({ trackId: playEvents.trackId, count: count() })
    .from(playEvents)
    .where(inArray(playEvents.trackId, trackIds))
    .groupBy(playEvents.trackId);

  const countByTrack = new Map(trackRows.map((r) => [r.trackId, r.count]));
  const byTrack = albumTracks
    .map((t) => ({ trackId: t.id, title: t.title, plays: countByTrack.get(t.id) || 0 }))
    .sort((a, b) => b.plays - a.plays);

  const totalPlays = byTrack.reduce((sum, t) => sum + t.plays, 0);

  // By listener — group play_events by userId across all album tracks.
  const listenerRows = await db
    .select({ userId: playEvents.userId, count: count() })
    .from(playEvents)
    .where(inArray(playEvents.trackId, trackIds))
    .groupBy(playEvents.userId);

  // Fetch usernames for non-null userIds.
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
