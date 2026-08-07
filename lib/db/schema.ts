import { pgTable, text, integer, real, timestamp, boolean } from "drizzle-orm/pg-core";

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
