import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shareLinks, tracks, albums, users, albumMembers, contentFollows } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
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
    // Preserve original sort order so track sequence matches the source album.
    sortOrder: original.sortOrder,
    originalTrackId: original.id,
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

  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, params.token));
  if (!link || !link.active) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  try {
    if (link.albumId) {
      const [originalAlbum] = await db.select().from(albums).where(eq(albums.id, link.albumId));
      if (!originalAlbum) return NextResponse.json({ error: "Not found." }, { status: 404 });

      // Don't let the owner save their own album.
      if (originalAlbum.userId === userId) {
        return NextResponse.json({ error: "This is your own album." }, { status: 400 });
      }

      // Idempotent — don't create a second copy (and a second album_members
      // row) if this user already saved this exact album. Without this,
      // clicking "Save to library" twice created two full duplicate albums
      // with duplicate tracks, and two album_members rows for the same
      // (albumId, userId) pair — which then made the upload-finalize sync
      // logic copy every future upload into this member's library twice.
      const [alreadyMember] = await db
        .select()
        .from(albumMembers)
        .where(and(eq(albumMembers.albumId, originalAlbum.id), eq(albumMembers.userId, userId)));
      if (alreadyMember?.savedAlbumId) {
        return NextResponse.json({ ok: true, type: "album", albumId: alreadyMember.savedAlbumId, alreadySaved: true });
      }

      // Get the original owner's profile for attribution.
      const [owner] = await db
        .select({ username: users.username, avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, originalAlbum.userId));

      const albumTracks = await db
        .select()
        .from(tracks)
        .where(eq(tracks.albumId, link.albumId));

      const newAlbumId = nanoid();
      // Uses THIS link's own allowDownload, not originalAlbum.allowDownload
      // (the separate invite-system flag). Public share links and invite
      // links are two different access models with their own permission
      // toggles — a receiver saving via a public link should get exactly
      // what that link's own "Allow download" checkbox says, regardless of
      // whatever the invite-system flag happens to be set to. Previously
      // this read the wrong flag, so a public link created with downloads
      // OFF could still hand out full download rights on save if the
      // album's unrelated invite-system flag happened to be on.
      await db.insert(albums).values({
        id: newAlbumId,
        userId,
        folderId: null,
        name: originalAlbum.name,
        coverUrl: originalAlbum.coverUrl,
        accessMode: "private",
        allowEdit: false,
        allowDownload: !!link.allowDownload,
        // Attribution — used to show "Shared by X" on the receiver's album page.
        sharedFromAlbumId: originalAlbum.id,
        sharedByUserId: originalAlbum.userId,
        sharedByUsername: owner?.username ?? null,
        sharedByAvatarUrl: owner?.avatarUrl ?? null,
        createdAt: new Date(),
      });

      await Promise.all(albumTracks.map((t) => copyTrackForUser(t, userId, newAlbumId)));

      // Record the member so the owner can see who saved their album.
      await db.insert(albumMembers).values({
        id: nanoid(),
        albumId: originalAlbum.id,
        userId,
        ownerId: originalAlbum.userId,
        canEdit: false,
        canDownload: !!link.allowDownload,
        savedAlbumId: newAlbumId,
        createdAt: new Date(),
      });

      // Create a content_follows row for future change notifications.
      try {
        await db.insert(contentFollows).values({
          id: nanoid(),
          userId,
          ownerId: originalAlbum.userId,
          albumId: originalAlbum.id,
          trackId: null,
          createdAt: new Date(),
        });
      } catch {}

      return NextResponse.json({ ok: true, type: "album", albumId: newAlbumId });
    }

    if (link.trackId) {
      const [original] = await db.select().from(tracks).where(eq(tracks.id, link.trackId));
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
