import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { trackId, albumId, expiresInDays, allowDownload } = await req.json();

  // Without this, anyone could generate a share link for a track/album they
  // don't own, just by knowing its id — turning "share my track" into a way
  // to leak someone else's file.
  if (trackId) {
    const [t] = await db.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.userId, userId)));
    if (!t) return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }
  if (albumId) {
    const [a] = await db.select().from(albums).where(and(eq(albums.id, albumId), eq(albums.userId, userId)));
    if (!a) return NextResponse.json({ error: "Album not found." }, { status: 404 });
  }

  const row = {
    id: nanoid(),
    token: nanoid(12),
    trackId: trackId || null,
    albumId: albumId || null,
    expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null,
    allowDownload: !!allowDownload,
    createdAt: new Date(),
  };
  await db.insert(shareLinks).values(row);
  return NextResponse.json(row);
}
