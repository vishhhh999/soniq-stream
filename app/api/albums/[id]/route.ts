import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { albums, tracks, albumMembers, contentFollows } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { r2, R2_BUCKET } from "@/lib/r2";

export const dynamic = "force-dynamic";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

// Deletes an album cover object from R2. IMPORTANT: only ever call this for
// an album's OWN original (no sharedFromAlbumId) — a saved/received copy's
// coverUrl points at the exact same R2 object as the original (see
// /api/share/[token]/save, which copies the URL reference directly rather
// than making a real copy the way track files are copied). Deleting a
// received copy's cover would delete the original owner's cover out from
// under them.
async function deleteAlbumCover(coverUrl: string | null) {
  if (!coverUrl || !R2_BUCKET) return;
  try {
    const key = new URL(coverUrl).pathname.replace(/^\//, "");
    if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error("Album cover cleanup failed (non-fatal):", err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [existing] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "coverUrl", "folderId"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) update[k] = body[k];

  await db.update(albums).set(update).where(eq(albums.id, params.id));

  // Clean up the old cover object if it's being replaced — but only for a
  // true original album. A received copy's coverUrl is a shared reference
  // to the original's object, so deleting it here would break the
  // original owner's album cover.
  if ("coverUrl" in update && !existing.sharedFromAlbumId && existing.coverUrl && existing.coverUrl !== update.coverUrl) {
    await deleteAlbumCover(existing.coverUrl);
  }

  const [row] = await db.select().from(albums).where(eq(albums.id, params.id));
  return NextResponse.json(row);
}

// Deleting your OWN album does NOT delete the tracks inside it — they move
// to "unsorted" instead. No undo exists in this app.
//
// Deleting a RECEIVED album (sharedFromAlbumId set — this row is your own
// saved copy, not the original) works differently: this used to be blocked
// entirely in the UI, since the delete button was hidden whenever
// `isReadOnly` was true. That meant a receiver had no way to remove a
// shared album from their own library at all. Fixed: for a received copy,
// this fully purges YOUR copy (tracks + R2 files + the album row) rather
// than unsorting — "unsorting" copied tracks that are duplicates of
// someone else's content would just leave orphaned files sitting in
// Unsorted with no way to tell they came from a share. It also cleans up
// the albumMembers row on the owner's side and any contentFollows row, so
// future uploads/notifications stop targeting a copy that no longer
// exists. The ORIGINAL album, and the owner's own library, are untouched.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const [existing] = await db.select().from(albums).where(and(eq(albums.id, params.id), eq(albums.userId, userId)));
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (existing.sharedFromAlbumId) {
    // Received copy — full purge of this copy only.
    const ownTracks = await db.select().from(tracks).where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));

    await db.delete(tracks).where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));

    if (R2_BUCKET) {
      await Promise.all(
        ownTracks.map(async (t) => {
          if (!t.fileUrl) return;
          try {
            const key = new URL(t.fileUrl).pathname.replace(/^\//, "");
            if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
          } catch (err) {
            console.error(`R2 cleanup failed for received track ${t.id}:`, err);
          }
        })
      );
    }

    await db.delete(albums).where(eq(albums.id, params.id));

    // NOT cleaning up coverUrl here — a received copy's cover is a shared
    // R2 object reference with the original album, not its own copy (see
    // deleteAlbumCover's comment above). Deleting it would break the
    // original owner's cover.

    try {
      await db
        .delete(albumMembers)
        .where(and(eq(albumMembers.albumId, existing.sharedFromAlbumId), eq(albumMembers.userId, userId)));
      await db
        .delete(contentFollows)
        .where(and(eq(contentFollows.albumId, existing.sharedFromAlbumId), eq(contentFollows.userId, userId)));
    } catch (err) {
      console.error("Membership/follow cleanup failed (non-fatal):", err);
    }

    return NextResponse.json({ ok: true, removed: true });
  }

  // Own original album — unsort, don't delete, the tracks.
  await db.update(tracks).set({ albumId: null }).where(and(eq(tracks.albumId, params.id), eq(tracks.userId, userId)));
  await db.delete(albums).where(eq(albums.id, params.id));
  // Safe to clean up here — this branch is only reached for a true
  // original (no sharedFromAlbumId), so nothing else references this
  // specific cover object.
  await deleteAlbumCover(existing.coverUrl);
  return NextResponse.json({ ok: true });
}
