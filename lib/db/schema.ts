import { pgTable, text, integer, real, timestamp, boolean, jsonb, smallint } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // Nullable — null means this account was created via Google sign-in and
  // has no password set. A non-null hash means it was created via
  // email+password signup. This distinction is what prevents the two
  // paths from silently merging (see auth.ts).
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at").notNull(),
  // Set the first time a Google sign-in is matched to an existing
  // password account. Used to show a one-time "accounts linked" toast.
  // Nullable until the user completes the username setup step.
  // Unique constraint enforced at DB level.
  googleLinkedAt: timestamp("google_linked_at"),
  username: text("username").unique(),
  avatarUrl: text("avatar_url"),
  // Billing — subscriptionStatus drives all storage-cap enforcement.
  // 'free' (default) | 'active' | 'past_due' | 'canceled'. Kept in sync
  // via the Razorpay webhook (app/api/billing/webhook/route.ts), never set
  // directly from client-facing routes. Razorpay's own subscription
  // statuses ('authenticated', 'halted', 'completed', 'expired', etc) get
  // mapped onto this smaller internal set — see lib/billing.ts.
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  subscriptionStatus: text("subscription_status").default("free"),
  // Nullable — set on any active/past_due subscription, used to show
  // "renews on X" / "access until X" in Settings. Cleared on cancel.
  subscriptionPeriodEnd: timestamp("subscription_period_end"),
});

export const folders = pgTable("folders", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  createdAt: timestamp("created_at").notNull(),
});

export const albums = pgTable("albums", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  folderId: text("folder_id"),
  name: text("name").notNull(),
  coverUrl: text("cover_url"),
  createdAt: timestamp("created_at").notNull(),
  // Sharing settings — null accessMode means 'private' (default). 'public'
  // was a stored-but-unenforced third value: no route ever checked it, so
  // an album set to "public" wasn't actually reachable by anyone but the
  // owner. Removed from the UI (AlbumSharePanel) rather than wired up,
  // since a real public-access model for albums already exists via the
  // shareLinks table (see /api/albums/[id]/public-share) — building a
  // second, different "public" mechanism here would just be two competing
  // ways to do the same thing. Existing rows with 'public' still behave
  // as unreachable-by-non-owner; harmless, but nothing will set this value
  // going forward.
  accessMode: text("access_mode").default("private"), // 'private' | 'invite_only' | 'public' (legacy, unused)
  allowEdit: boolean("allow_edit").default(false),
  allowDownload: boolean("allow_download").default(false),
  // Set when this album was saved from someone else's share link.
  // Presence of sharedFromAlbumId = read-only for the receiver.
  sharedFromAlbumId: text("shared_from_album_id"),
  sharedByUserId: text("shared_by_user_id"),
  sharedByUsername: text("shared_by_username"),   // denormalized
  sharedByAvatarUrl: text("shared_by_avatar_url"), // denormalized
});

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
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
  // Per-track 5-band EQ, dB gain (-15 to +15), applied via a BiquadFilterNode
  // chain in PlayerProvider (low shelf / low-mid peaking / mid peaking /
  // high-mid peaking / high shelf — matches Apple Music/Spotify's 5-band
  // convention). Same "small saved number next to bpm/key" shape as the
  // rest of this table — deliberately not a separate table, there's
  // exactly one EQ per track. Bumped from 3 to 5 bands in v8.15.0; see
  // scripts/init-db.js for the matching ALTER TABLE statements — this is
  // the file that actually matters for production, not just this one.
  eqLow: real("eq_low").default(0),
  eqLowMid: real("eq_low_mid").default(0),
  eqMid: real("eq_mid").default(0),
  eqHighMid: real("eq_high_mid").default(0),
  eqHigh: real("eq_high").default(0),
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
  // Set when this track was copied from someone else's library via save-to-library.
  // Used to forward play events to the original track's owner.
  originalTrackId: text("original_track_id"),
  createdAt: timestamp("created_at").notNull(),
});

export const shareLinks = pgTable("share_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  trackId: text("track_id"),
  albumId: text("album_id"),
  expiresAt: timestamp("expires_at"),
  allowDownload: boolean("allow_download").default(false),
  // Previously there was no way to revoke a track/album share link early,
  // or to see whether one already existed when reopening the share panel
  // — every visit looked like "no link yet" even if one was still live,
  // and old links lived forever until expiresAt. `active` lets a link be
  // revoked without losing the row (matches inviteLinks' own `active`
  // flag below).
  active: boolean("active").default(true),
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
// Tracks who has access to a shared album, and their permissions.
// Created when someone joins via invite link or saves from share page.
export const albumMembers = pgTable("album_members", {
  id: text("id").primaryKey(),
  albumId: text("album_id").notNull(), // the ORIGINAL album (owner's)
  userId: text("user_id").notNull(),   // the member
  ownerId: text("owner_id").notNull(),  // the album owner
  canEdit: boolean("can_edit").default(false),
  canDownload: boolean("can_download").default(false),
  // savedAlbumId: the copy in the member's own library (null if not yet saved)
  savedAlbumId: text("saved_album_id"),
  createdAt: timestamp("created_at").notNull(),
});

// Invite links for album access. Either maxUses OR expiresAt, not both.
export const inviteLinks = pgTable("invite_links", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  albumId: text("album_id").notNull(),
  ownerId: text("owner_id").notNull(),
  maxUses: integer("max_uses"),     // null = unlimited
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"), // null = never expires
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull(),
});

export const otpCodes = pgTable("otp_codes", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  attempts: smallint("attempts").notNull().default(0),
  createdAt: timestamp("created_at").notNull(),
});

// One row per contact-form submission, keyed by a hash of the requester's
// IP (never the raw IP — no reason to keep that around). Purely for rate
// limiting: the contact route was previously wide open with zero
// throttling, unlike the OTP route right next to it — trivially scriptable
// for spam or to burn through the Resend sending quota.
export const contactRateLimits = pgTable("contact_rate_limits", {
  id: text("id").primaryKey(),
  ipHash: text("ip_hash").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

// One row per play event. Debounced server-side: a new row is only
// inserted if the last play_event for this user+track was > 60s ago,
// so scrubbing and replay within a session don't inflate counts.
export const playEvents = pgTable("play_events", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull(),
  // Nullable — null means an anonymous listener via a share link.
  // Authenticated listeners have their real userId recorded.
  userId: text("user_id"),
  playedAt: timestamp("played_at").notNull(),
});

export const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  trackId: text("track_id"),
  albumId: text("album_id"),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull(),
});

// Created when a logged-in user opens someone else's share link.
// Represents "I am watching this owner's content."
// One row per viewer+album pair — idempotent on insert.
export const contentFollows = pgTable("content_follows", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),    // the watcher
  ownerId: text("owner_id").notNull(),  // whose content
  albumId: text("album_id"),
  trackId: text("track_id"),
  createdAt: timestamp("created_at").notNull(),
});

// Titles/names/usernames are denormalized at insert time so notifications
// survive track deletions and username changes without broken joins.
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  recipientUserId: text("recipient_user_id").notNull(),
  actorUserId: text("actor_user_id"),       // null = anonymous
  type: text("type").notNull(),             // track_added | version_added | track_removed | track_played
  albumId: text("album_id"),
  trackId: text("track_id"),
  trackTitle: text("track_title"),
  albumName: text("album_name"),
  actorUsername: text("actor_username"),    // null = anonymous
  seen: boolean("seen").notNull().default(false),
  createdAt: timestamp("created_at").notNull(),
});

// One row per stem-extraction attempt for a track. Owner-only feature (see
// the ownership check in app/api/tracks/[id]/stems/route.ts) — runs on
// Replicate (cjwbw/demucs), which reports completion via webhook rather
// than a synchronous response, since real separation takes 30s-several
// minutes and can't complete inside a single serverless request.
export const stemJobs = pgTable("stem_jobs", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull(),
  userId: text("user_id").notNull(), // denormalized owner, so the webhook
                                       // (which has no session) knows who to
                                       // notify without a join back to tracks
  status: text("status").notNull(), // 'processing' | 'completed' | 'failed'
  replicatePredictionId: text("replicate_prediction_id"),
  vocalsUrl: text("vocals_url"),
  drumsUrl: text("drums_url"),
  bassUrl: text("bass_url"),
  otherUrl: text("other_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull(),
  completedAt: timestamp("completed_at"),
});
