import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function copyTrackForUser(
  original: typeof tracks.$inferSelect,
  newUserId: string,
  newAlbumId?: string
) {
  const sourceKey = new URL(original.fileUrl).pathname.replace(/^\//, "");
  const ext = sourceKey.match(/\.[^.]+$/)?.[0] || "";
  const newKey = `tracks/${nanoid()}${ext}`;

  await r2.send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      CopySource: `${R2_BUCKET}/${sourceKey}`,
      Key: newKey,
    })
  );

  const newFileUrl = `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${newKey}`;
  const newId = nanoid();

  await db.insert(tracks).values({
    ...original,
    id: newId,
    userId: newUserId,
    albumId: newAlbumId ?? null,
    fileUrl: newFileUrl,
    versionGroupId: newId,
    versionNumber: 1,
    sortOrder: -Date.now(),
    createdAt: new Date(),
  });

  return newId;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to save to your library." }, { status: 401 });
  }

  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, params.token));

  if (!link) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  try {
    if (link.albumId) {
      // Album share: copy the album row + all its tracks.
      const [originalAlbum] = await db
        .select()
        .from(albums)
        .where(eq(albums.id, link.albumId));
      if (!originalAlbum) return NextResponse.json({ error: "Not found." }, { status: 404 });

      const albumTracks = await db
        .select()
        .from(tracks)
        .where(eq(tracks.albumId, link.albumId));

      const newAlbumId = nanoid();
      await db.insert(albums).values({
        ...originalAlbum,
        id: newAlbumId,
        userId,
        coverUrl: originalAlbum.coverUrl, // share the same cover URL, no R2 copy needed
        createdAt: new Date(),
      });

      await Promise.all(
        albumTracks.map((t) => copyTrackForUser(t, userId, newAlbumId))
      );

      return NextResponse.json({ ok: true, type: "album", albumId: newAlbumId });
    }

    if (link.trackId) {
      const [original] = await db
        .select()
        .from(tracks)
        .where(eq(tracks.id, link.trackId));
      if (!original) return NextResponse.json({ error: "Not found." }, { status: 404 });

      const newId = await copyTrackForUser(original, userId);
      return NextResponse.json({ ok: true, type: "track", trackId: newId });
    }

    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  } catch (err) {
    console.error("Save to library failed:", err);
    return NextResponse.json({ error: "Failed to save. Try again." }, { status: 500 });
  }
}
