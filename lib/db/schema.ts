import { pgTable, text, integer, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: timestamp("created_at").notNull(),
});

export const albums = pgTable("albums", {
  id: text("id").primaryKey(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").notNull(),
});

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  albumId: text("album_id"),
  folderId: text("folder_id"),
  title: text("title").notNull(),
  artist: text("artist"),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  format: text("format"),
  durationSec: real("duration_sec"),
  sampleRate: integer("sample_rate"),
  bitrate: integer("bitrate"),
  channels: integer("channels"),
  bpm: real("bpm"),
  bpmConfidence: real("bpm_confidence"),
  key: text("key"),
  notes: text("notes"),
  trimStart: real("trim_start"),
  trimEnd: real("trim_end"),
  pitchShift: real("pitch_shift").default(0),
  // Duplicate/version handling: tracks uploaded with a matching normalized
  // title into the same album/folder are grouped under one versionGroupId
  // (the id of the first track in the group) instead of rejected or silently
  // duplicated. versionNumber increments within the group.
  versionGroupId: text("version_group_id"),
  versionNumber: integer("version_number").default(1),
  // Default sort position for a newly uploaded track: negative "now" in ms,
  // so newer uploads (more negative) always sort first ascending — matches
  // "newest at top" by default. A manual drag-reorder reassigns small
  // sequential integers (0,1,2...) to the reordered list, which are far
  // less negative than any -Date.now() value, so future uploads still
  // float to the top above whatever order was manually set.
  sortOrder: real("sort_order"),
  // Lyrics are entered/pasted by the user themselves (their own work or
  // material they have rights to) — this app never generates or fetches
  // lyrics content. `lyrics` is the raw text as typed; `lyricsSynced` is
  // populated once the user runs the tap-to-sync flow, an array of
  // { time: number, text: string } pairs in playback order.
  lyrics: text("lyrics"),
  lyricsSynced: jsonb("lyrics_synced"),
  createdAt: timestamp("created_at").notNull(),
});

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  trackId: text("track_id"),
  albumId: text("album_id"),
  expiresAt: timestamp("expires_at"),
  allowDownload: boolean("allow_download").default(false),
  createdAt: timestamp("created_at").notNull(),
});

// Comments are deliberately not tied to a user account — a comment can come
// from someone with a share link who has never logged in (a producer, an
// engineer). authorName is free text they type each time, not an identity.
// This is a real security tradeoff, not an oversight: it means anyone who
// has (or guesses) a trackId/albumId can post a comment on it, same as
// anyone with a share token can view it. That's an acceptable bar for a
// personal tool with random, unguessable nanoid IDs, but it would NOT be
// an acceptable bar if this app ever had untrusted/adversarial users.
export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  trackId: text("track_id"),
  albumId: text("album_id"),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull(),
});
