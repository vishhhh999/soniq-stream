import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, tracks, playEvents } from "@/lib/db/schema";
import { and, count, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [album] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!album) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const albumTracks = await db.select({ id: tracks.id, title: tracks.title }).from(tracks).where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));
  const trackIds = albumTracks.map((t) => t.id);

  if (trackIds.length === 0) {
    return NextResponse.json({ totalPlays: 0, byTrack: [] });
  }

  const rows = await db
    .select({ trackId: playEvents.trackId, count: count() })
    .from(playEvents)
    .where(inArray(playEvents.trackId, trackIds))
    .groupBy(playEvents.trackId);

  const countByTrack = new Map(rows.map((r) => [r.trackId, r.count]));
  const byTrack = albumTracks
    .map((t) => ({ trackId: t.id, title: t.title, plays: countByTrack.get(t.id) || 0 }))
    .sort((a, b) => b.plays - a.plays);
  const totalPlays = byTrack.reduce((sum, t) => sum + t.plays, 0);

  return NextResponse.json({ totalPlays, byTrack });
}
