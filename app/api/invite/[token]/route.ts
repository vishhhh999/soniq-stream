import { NextRequest, NextResponse } from "next/server";
import { CopyObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inviteLinks, albums, tracks, albumMembers, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

export const dynamic = "force-dynamic";

async function resolveLink(token: string) {
  const [link] = await db.select().from(inviteLinks).where(eq(inviteLinks.token, token));
  if (!link || !link.active) return null;
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return null;
  if (link.maxUses !== null && link.usedCount >= link.maxUses) return null;
  return link;
}

// GET — returns album preview info (no auth required, for showing the invite page).
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const link = await resolveLink(params.token);
  if (!link) return NextResponse.json({ error: "Invite link is invalid or expired." }, { status: 404 });

  const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
  if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });

  const [owner] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, album.userId));

  const albumTracks = await db.select({ id: tracks.id, title: tracks.title }).from(tracks).where(eq(tracks.albumId, link.albumId));

  return NextResponse.json({
    album: { id: album.id, name: album.name, coverUrl: album.coverUrl },
    owner: { username: owner?.username ?? null, avatarUrl: owner?.avatarUrl ?? null },
    trackCount: albumTracks.length,
    usesLeft: link.maxUses !== null ? link.maxUses - link.usedCount : null,
  });
}

// POST — accept the invite: save album copy to user's library, record membership.
export async function POST(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Sign in to accept this invite." }, { status: 401 });

  const link = await resolveLink(params.token);
  if (!link) return NextResponse.json({ error: "Invite link is invalid or expired." }, { status: 410 });

  const [album] = await db.select().from(albums).where(eq(albums.id, link.albumId));
  if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });

  if (album.userId === userId) return NextResponse.json({ error: "This is your own album." }, { status: 400 });

  // Idempotent: don't create a second copy if already a member.
  const [existing] = await db
    .select()
    .from(albumMembers)
    .where(eq(albumMembers.userId, userId));
  if (existing?.savedAlbumId) {
    return NextResponse.json({ ok: true, albumId: existing.savedAlbumId, alreadyMember: true });
  }

  const [owner] = await db
    .select({ username: users.username, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, album.userId));

  const albumTracks = await db.select().from(tracks).where(eq(tracks.albumId, link.albumId));

  // Copy all tracks to R2 + DB.
  const newAlbumId = nanoid();
  await db.insert(albums).values({
    id: newAlbumId,
    userId,
    folderId: null,
    name: album.name,
    coverUrl: album.coverUrl,
    accessMode: "private",
    allowEdit: link.albumId ? (album.allowEdit ?? false) : false,
    allowDownload: album.allowDownload ?? false,
    sharedFromAlbumId: album.id,
    sharedByUserId: album.userId,
    sharedByUsername: owner?.username ?? null,
    sharedByAvatarUrl: owner?.avatarUrl ?? null,
    createdAt: new Date(),
  });

  await Promise.all(albumTracks.map(async (t) => {
    const sourceKey = new URL(t.fileUrl).pathname.replace(/^\//, "");
    const ext = sourceKey.match(/\.[^.]+$/)?.[0] || "";
    const newKey = `tracks/${nanoid()}${ext}`;
    await r2.send(new CopyObjectCommand({ Bucket: R2_BUCKET, CopySource: `${R2_BUCKET}/${sourceKey}`, Key: newKey }));
    const newId = nanoid();
    await db.insert(tracks).values({
      ...t,
      id: newId,
      userId,
      albumId: newAlbumId,
      fileUrl: `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${newKey}`,
      versionGroupId: newId,
      versionNumber: 1,
      sortOrder: t.sortOrder,
      originalTrackId: t.id,
      createdAt: new Date(),
    });
  }));

  // Record membership.
  await db.insert(albumMembers).values({
    id: nanoid(),
    albumId: album.id,
    userId,
    ownerId: album.userId,
    canEdit: false,
    canDownload: album.allowDownload ?? false,
    savedAlbumId: newAlbumId,
    createdAt: new Date(),
  });

  // Increment invite link use count.
  await db
    .update(inviteLinks)
    .set({ usedCount: link.usedCount + 1 })
    .where(eq(inviteLinks.id, link.id));

  return NextResponse.json({ ok: true, albumId: newAlbumId });
}
