import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

const normalizeTitle = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");

// Checked BEFORE the file is even uploaded — this uses the filename as a
// stand-in for the real title (the actual ID3-tag title isn't known until
// the file is parsed during finalize, which happens after upload). This
// matches finalize's own fallback behavior when a file has no ID3 title
// tag, and covers the common case where the filename IS the track name.
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { title, albumId, folderId } = await req.json();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const scopeCondition = albumId
    ? and(eq(tracks.albumId, albumId), eq(tracks.userId, userId))
    : folderId
    ? and(isNull(tracks.albumId), eq(tracks.folderId, folderId), eq(tracks.userId, userId))
    : and(isNull(tracks.albumId), isNull(tracks.folderId), eq(tracks.userId, userId));

  const siblings = await db
    .select()
    .from(tracks)
    .where(and(scopeCondition, sql`lower(trim(${tracks.title})) = ${normalizeTitle(title)}`));

  return NextResponse.json({
    duplicate: siblings.length > 0,
    existingTitle: siblings[0]?.title ?? null,
    existingCount: siblings.length,
  });
}
