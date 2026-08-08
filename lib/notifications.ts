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
