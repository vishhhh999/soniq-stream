import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Folders are self-nesting (folder_id points to parent). Albums live inside folders.
export const folders = sqliteTable("folders", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  albumId: text("album_id"),
  folderId: text("folder_id"), // tracks can live loose in a folder, not just an album
  title: text("title").notNull(),
  artist: text("artist"),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  format: text("format"), // mp3, wav, flac
  durationSec: real("duration_sec"),
  sampleRate: integer("sample_rate"),
  bitrate: integer("bitrate"),
  channels: integer("channels"),
  bpm: real("bpm"), // estimated, editable
  bpmConfidence: real("bpm_confidence"), // 0-1, from detection algorithm
  key: text("key"), // manual entry, v1 doesn't auto-detect
  notes: text("notes"),
  trimStart: real("trim_start"), // seconds, for saved trim region
  trimEnd: real("trim_end"),
  pitchShift: real("pitch_shift").default(0), // semitones
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const shareLinks = sqliteTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  trackId: text("track_id"),
  albumId: text("album_id"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  allowDownload: integer("allow_download", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
