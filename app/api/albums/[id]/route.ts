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
  return NextResponse.json({ ok: true });
}
