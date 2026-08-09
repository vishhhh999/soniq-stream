import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { tracks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { r2, R2_BUCKET } from "@/lib/r2";
import { albums } from "@/lib/db/schema";
import { notifyAlbumFollowers, getUsernameById } from "@/lib/notifications";

export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

// Was missing entirely — LyricsView and LyricsSidebar both fetch this
// endpoint with no method specified (defaults to GET) to read the full
// track record including lyricsSynced, which isn't carried on the
// list-level Track objects. Every one of those calls was 405ing since
// only PATCH/DELETE existed here, and the empty response body then
// crashed the caller's `.json()` parse. Lyrics could never have loaded.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(track);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  // Ownership check — without the userId condition here, any authenticated
  // user could PATCH any track by guessing/knowing its id, regardless of
  // who owns it.
  const [existing] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const allowed = ["bpm", "bpmConfidence", "key", "notes", "trimStart", "trimEnd", "pitchShift", "title", "artist", "lyrics", "lyricsSynced", "albumId", "durationSec"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  // If albumId is being changed, it must actually belong to this user, and
  // must not be a read-only received copy (sharedFromAlbumId set) — without
  // this, a track could be dropped into a shared-in album on the library
  // page (the UI's own drag-disable for this was missing too, fixed
  // separately) even though that album is supposed to be read-only.
  if ("albumId" in update && update.albumId !== null) {
    const [targetAlbum] = await db.select({ id: albums.id, sharedFromAlbumId: albums.sharedFromAlbumId }).from(albums).where(and(eq(albums.id, update.albumId as string), eq(albums.userId, userId)));
    if (!targetAlbum) return NextResponse.json({ error: "Album not found." }, { status: 404 });
    if (targetAlbum.sharedFromAlbumId) return NextResponse.json({ error: "This album is read-only." }, { status: 403 });
  }

  await db.update(tracks).set(update).where(eq(tracks.id, params.id));
  const [row] = await db.select().from(tracks).where(eq(tracks.id, params.id));
  return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [track] = await db.select().from(tracks).where(and(eq(tracks.id, params.id), eq(tracks.userId, userId)));
  if (!track) return NextResponse.json({ error: "Not found." }, { status: 404 });

  await db.delete(tracks).where(eq(tracks.id, params.id));

  // Notify album followers about the removal (non-fatal if it fails).
  if (track.albumId) {
    try {
      const [album] = await db.select({ name: albums.name }).from(albums).where(eq(albums.id, track.albumId));
      const actorUsername = await getUsernameById(userId as string);
      await notifyAlbumFollowers({
        ownerId: track.userId,
        actorUserId: userId as string,
        actorUsername,
        albumId: track.albumId,
        albumName: album?.name ?? "Unknown album",
        trackId: track.id,
        trackTitle: track.title,
        type: "track_removed",
      });
    } catch (err) {
      console.error("Notification dispatch failed (non-fatal):", err);
    }
  }

  if (track.fileUrl && R2_BUCKET) {
    try {
      // Parsing the actual URL's path is robust regardless of whether
      // R2_PUBLIC_URL exactly matches what's stored in fileUrl (trailing
      // slash, custom domain vs r2.dev, etc.) — the previous string-match
      // approach silently skipped deletion with zero error logged if that
      // env var didn't match precisely, which is very plausibly why files
      // were staying in R2 after being deleted from the library.
      const key = new URL(track.fileUrl).pathname.replace(/^\//, "");
      if (key) {
        await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } else {
        console.error(`R2 cleanup skipped for track ${track.id}: could not extract a key from fileUrl "${track.fileUrl}"`);
      }
    } catch (err) {
      console.error(`R2 cleanup failed for track ${track.id} (track still deleted from library):`, err);
    }
  }

  return NextResponse.json({ ok: true });
}
