import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
  if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  // Previously this only ever handled trackId shares and 404'd immediately
  // for album shares — the /api/share POST route already accepted albumId,
  // but nothing could resolve it. That's why "share the whole album" never
  // actually worked even though the button existed.
  if (link.albumId) {
    const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
    if (!album) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const albumTracks = await db.select().from(tracks).where(eq(tracks.albumId, link.albumId));
    return NextResponse.json({ album, tracks: albumTracks, allowDownload: link.allowDownload });
  }

  if (link.trackId) {
    const [track] = await db.select().from(tracks).where(eq(tracks.id, link.trackId));
    if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ track, allowDownload: link.allowDownload });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
