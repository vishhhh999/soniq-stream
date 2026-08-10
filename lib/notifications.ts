import { nanoid } from "nanoid";
import { db } from "./db";
import { contentFollows, notifications, users } from "./db/schema";
import { eq, inArray } from "drizzle-orm";

// Fetch a user's username — used to denormalize into notification rows.
export async function getUsernameById(userId: string): Promise<string | null> {
  const [u] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));
  return u?.username ?? null;
}

// Notify all followers of an album when its content changes.
// Only fires if the album has at least one content_follow row.
export async function notifyAlbumFollowers({
  ownerId,
  actorUserId,
  actorUsername,
  albumId,
  albumName,
  trackId,
  trackTitle,
  type,
}: {
  ownerId: string;
  actorUserId: string;
  actorUsername: string | null;
  albumId: string;
  albumName: string;
  trackId: string;
  trackTitle: string;
  type: "track_added" | "version_added" | "track_removed";
}) {
  const follows = await db
    .select()
    .from(contentFollows)
    .where(eq(contentFollows.albumId, albumId));

  const recipients = follows.filter((f) => f.userId !== actorUserId);
  if (recipients.length === 0) return;

  await db.insert(notifications).values(
    recipients.map((f) => ({
      id: nanoid(),
      recipientUserId: f.userId,
      actorUserId,
      type,
      albumId,
      trackId,
      trackTitle,
      albumName,
      actorUsername,
      seen: false,
      createdAt: new Date(),
    }))
  );
}

// Notify the album owner when a receiver downloads their shared album.
// Skips the owner downloading their own album.
export async function notifyOwnerOfDownload({
  ownerId,
  actorUserId,
  actorUsername,
  albumId,
  albumName,
}: {
  ownerId: string;
  actorUserId: string;
  actorUsername: string | null;
  albumId: string;
  albumName: string;
}) {
  if (actorUserId === ownerId) return;

  await db.insert(notifications).values({
    id: nanoid(),
    recipientUserId: ownerId,
    actorUserId,
    type: "album_downloaded",
    albumId,
    trackId: null,
    trackTitle: null,
    albumName,
    actorUsername,
    seen: false,
    createdAt: new Date(),
  });
}

// Notify a member when the owner turns downloads on/off for an album
// they have a saved copy of.
export async function notifyDownloadPermissionChanged({
  recipientUserId,
  ownerId,
  ownerUsername,
  albumId,
  albumName,
  enabled,
}: {
  recipientUserId: string;
  ownerId: string;
  ownerUsername: string | null;
  albumId: string;
  albumName: string;
  enabled: boolean;
}) {
  await db.insert(notifications).values({
    id: nanoid(),
    recipientUserId,
    actorUserId: ownerId,
    type: enabled ? "download_enabled" : "download_disabled",
    albumId,
    trackId: null,
    trackTitle: null,
    albumName,
    actorUsername: ownerUsername,
    seen: false,
    createdAt: new Date(),
  });
}
// Notify the track owner when someone plays their track via a share link.
// Skips self-plays. Anonymous plays (actorUserId=null) still notify the owner.
export async function notifyOwnerOfPlay({
  ownerId,
  actorUserId,
  actorUsername,
  trackId,
  trackTitle,
  albumId,
  albumName,
}: {
  ownerId: string;
  actorUserId: string | null;
  actorUsername: string | null;
  trackId: string;
  trackTitle: string;
  albumId: string | null;
  albumName: string | null;
}) {
  if (actorUserId === ownerId) return; // never notify owner of their own plays

  await db.insert(notifications).values({
    id: nanoid(),
    recipientUserId: ownerId,
    actorUserId,
    type: "track_played",
    albumId,
    trackId,
    trackTitle,
    albumName,
    actorUsername,
    seen: false,
    createdAt: new Date(),
  });
}

// Notify a track owner once their stem-extraction job finishes. No
// actorUserId — this is a system/automated event, not something another
// user did, so it renders without an "@username" attribution (see the
// null-actor handling already in NotificationsBell's Avatar component).
export async function notifyStemsReady({
  ownerId,
  trackId,
  trackTitle,
  ownerUsername,
}: {
  ownerId: string;
  trackId: string;
  trackTitle: string;
  ownerUsername: string | null;
}) {
  await db.insert(notifications).values({
    id: nanoid(),
    recipientUserId: ownerId,
    actorUserId: null,
    type: "stems_ready",
    trackId,
    trackTitle,
    albumId: null,
    albumName: null,
    actorUsername: ownerUsername,
    seen: false,
    createdAt: new Date(),
  });
}
