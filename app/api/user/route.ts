import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import {
  users, tracks, albums, folders, shareLinks, albumMembers, inviteLinks,
  playEvents, contentFollows, notifications,
} from "@/lib/db/schema";
import { eq, or, inArray } from "drizzle-orm";
import { r2, R2_BUCKET } from "@/lib/r2";
import { getRazorpay } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

// Real account deletion — previously didn't exist anywhere in the app.
// You could change your password, username, avatar, and cancel billing,
// but never actually delete your account and data. Deletes: any active
// subscription, every R2 file this user owns (tracks, avatar, own album
// covers — NOT covers on saved/received copies, which point at someone
// else's object), and every DB row that references this user across all
// tables, in dependency-safe order, before finally deleting the user row
// itself.
async function deleteR2Object(url: string | null) {
  if (!url || !R2_BUCKET) return;
  try {
    const key = new URL(url).pathname.replace(/^\//, "");
    if (key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (err) {
    console.error("Account deletion: R2 cleanup failed for one object (non-fatal):", err);
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  const userId = session?.user && (session.user as any).id;
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: "Confirmation text didn't match." }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Best-effort subscription cancellation — don't block account deletion
  // on Razorpay being reachable, but do try, so a deleted account doesn't
  // leave a live subscription still charging with no owner left to see it.
  if (user.razorpaySubscriptionId) {
    try {
      const razorpay = getRazorpay();
      await razorpay.subscriptions.cancel(user.razorpaySubscriptionId, false);
    } catch (err) {
      console.error("Account deletion: subscription cancellation failed (continuing anyway):", err);
    }
  }

  const userTracks = await db.select({ id: tracks.id, fileUrl: tracks.fileUrl }).from(tracks).where(eq(tracks.userId, userId));
  const userAlbums = await db.select({ id: albums.id, coverUrl: albums.coverUrl, sharedFromAlbumId: albums.sharedFromAlbumId }).from(albums).where(eq(albums.userId, userId));
  const trackIds = userTracks.map((t) => t.id);
  const albumIds = userAlbums.map((a) => a.id);

  // R2 cleanup — best effort, in parallel. Album covers only for true
  // originals (see the same reasoning in app/api/albums/[id]/route.ts —
  // a saved copy's cover is a shared reference, not its own object).
  await Promise.all([
    ...userTracks.map((t) => deleteR2Object(t.fileUrl)),
    ...userAlbums.filter((a) => !a.sharedFromAlbumId).map((a) => deleteR2Object(a.coverUrl)),
    deleteR2Object(user.avatarUrl),
  ]);

  // DB cleanup, dependency-safe order (rows that reference tracks/albums
  // first, then tracks/albums themselves, then folders, then the user).
  if (trackIds.length > 0 || albumIds.length > 0) {
    const shareLinkConds = [];
    if (trackIds.length > 0) shareLinkConds.push(inArray(shareLinks.trackId, trackIds));
    if (albumIds.length > 0) shareLinkConds.push(inArray(shareLinks.albumId, albumIds));
    if (shareLinkConds.length > 0) await db.delete(shareLinks).where(or(...shareLinkConds));
  }
  if (albumIds.length > 0) {
    await db.delete(albumMembers).where(inArray(albumMembers.albumId, albumIds));
    await db.delete(inviteLinks).where(inArray(inviteLinks.albumId, albumIds));
  }
  await db.delete(albumMembers).where(eq(albumMembers.userId, userId));
  await db.delete(playEvents).where(eq(playEvents.userId, userId));
  await db.delete(contentFollows).where(or(eq(contentFollows.userId, userId), eq(contentFollows.ownerId, userId)));
  await db.delete(notifications).where(or(eq(notifications.recipientUserId, userId), eq(notifications.actorUserId, userId)));

  await db.delete(tracks).where(eq(tracks.userId, userId));
  await db.delete(albums).where(eq(albums.userId, userId));
  await db.delete(folders).where(eq(folders.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true });
}
