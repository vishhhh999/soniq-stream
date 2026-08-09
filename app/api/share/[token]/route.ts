import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getOwner(userId: string) {
  const [u] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId));
  return { username: u?.username ?? null, avatarUrl: u?.avatarUrl ?? null };
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
  if (!link || !link.active) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  if (link.albumId) {
    const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
    if (!album) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const albumTracks = await db.select().from(tracks).where(eq(tracks.albumId, link.albumId));
    const owner = await getOwner(album.userId);
    return NextResponse.json({ album, tracks: albumTracks, allowDownload: link.allowDownload, owner });
  }

  if (link.trackId) {
    const [track] = await db.select().from(tracks).where(eq(tracks.id, link.trackId));
    if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const owner = await getOwner(track.userId);
    return NextResponse.json({ track, allowDownload: link.allowDownload, owner });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
