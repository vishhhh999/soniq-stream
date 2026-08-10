// Creates/updates the schema against your real Postgres (Neon) database.
// Idempotent — safe to re-run after schema changes (uses IF NOT EXISTS /
// ADD COLUMN IF NOT EXISTS throughout instead of dropping anything).
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (or export it) and retry.");
  process.exit(1);
}

// prepare: false — same requirement as lib/db/index.ts, this connects
// through the same pooled Neon endpoint.
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;
  // Existing databases already have this column as NOT NULL from before
  // Google-only accounts (null password) existed as a concept — drop that
  // constraint so those accounts can actually be created.
  await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;`;

  await sql`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT,
      name TEXT NOT NULL,
      cover_url TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      album_id TEXT,
      folder_id TEXT,
      title TEXT NOT NULL,
      artist TEXT,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      format TEXT,
      duration_sec REAL,
      sample_rate INTEGER,
      bitrate INTEGER,
      channels INTEGER,
      bpm REAL,
      bpm_confidence REAL,
      key TEXT,
      notes TEXT,
      trim_start REAL,
      trim_end REAL,
      pitch_shift REAL DEFAULT 0,
      version_group_id TEXT,
      version_number INTEGER DEFAULT 1,
      sort_order REAL,
      created_at TIMESTAMP NOT NULL
    );
  `;
  // Additive migration for databases created before version grouping existed
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS version_group_id TEXT;`;
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;`;
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS sort_order REAL;`;
  await sql`UPDATE tracks SET sort_order = -EXTRACT(EPOCH FROM created_at) * 1000 WHERE sort_order IS NULL;`;
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics TEXT;`;
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrics_synced JSONB;`;

  // Data isolation fix — tracks/albums/folders had NO owner column at all
  // until now, meaning every account could see every other account's
  // files. Adding user_id and backfilling anything created before this
  // column existed to the FIRST account ever created (the original owner,
  // before signup was ever opened to anyone else) — everyone who signed up
  // after that point only ever had their own empty library anyway, so this
  // backfill can't leak their data to someone else; it only correctly
  // assigns pre-existing data to the person who actually uploaded it.
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS user_id TEXT;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS user_id TEXT;`;
  await sql`ALTER TABLE folders ADD COLUMN IF NOT EXISTS user_id TEXT;`;
  const [firstUser] = await sql`SELECT id FROM users ORDER BY created_at ASC LIMIT 1;`;
  if (firstUser) {
    await sql`UPDATE tracks SET user_id = ${firstUser.id} WHERE user_id IS NULL;`;
    await sql`UPDATE albums SET user_id = ${firstUser.id} WHERE user_id IS NULL;`;
    await sql`UPDATE folders SET user_id = ${firstUser.id} WHERE user_id IS NULL;`;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      track_id TEXT,
      album_id TEXT,
      expires_at TIMESTAMP,
      allow_download BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`ALTER TABLE share_links ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;`;
  await sql`
    CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL
    );
  `;
  // v8.5.0 — contact form rate limiting (previously had none at all).
  await sql`
    CREATE TABLE IF NOT EXISTS contact_rate_limits (
      id TEXT PRIMARY KEY,
      ip_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS contact_rate_limits_ip_hash_idx ON contact_rate_limits (ip_hash, created_at);`;

  // Additive migration: first-Google-link timestamp for one-time toast.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_linked_at TIMESTAMP;`;
  // Billing — see lib/db/schema.ts for what drives each column. Switched
  // from Stripe to Razorpay after finding Stripe is invite-only for
  // Indian businesses — drop the never-launched Stripe columns if they
  // exist from an earlier run of this script, add the Razorpay ones.
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS stripe_customer_id;`;
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS stripe_subscription_id;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_subscription_id TEXT;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'free';`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMP;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`;

  await sql`
    CREATE TABLE IF NOT EXISTS play_events (
      id TEXT PRIMARY KEY,
      track_id TEXT NOT NULL,
      user_id TEXT,
      played_at TIMESTAMP NOT NULL
    );
  `;
  // If the table already existed with NOT NULL, drop the constraint.
  await sql`ALTER TABLE play_events ALTER COLUMN user_id DROP NOT NULL;`;


  await sql`
    CREATE TABLE IF NOT EXISTS content_follows (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      album_id TEXT,
      track_id TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL,
      actor_user_id TEXT,
      type TEXT NOT NULL,
      album_id TEXT,
      track_id TEXT,
      track_title TEXT,
      album_name TEXT,
      actor_username TEXT,
      seen BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL
    );
  `;


  // Album sharing columns
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS access_mode TEXT DEFAULT 'private';`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS allow_edit BOOLEAN DEFAULT false;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS allow_download BOOLEAN DEFAULT false;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS shared_from_album_id TEXT;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS shared_by_user_id TEXT;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS shared_by_username TEXT;`;
  await sql`ALTER TABLE albums ADD COLUMN IF NOT EXISTS shared_by_avatar_url TEXT;`;

  // Track original reference for play event forwarding
  await sql`ALTER TABLE tracks ADD COLUMN IF NOT EXISTS original_track_id TEXT;`;

  // Album members
  await sql`
    CREATE TABLE IF NOT EXISTS album_members (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      can_edit BOOLEAN DEFAULT false,
      can_download BOOLEAN DEFAULT false,
      saved_album_id TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;

  // Invite links
  await sql`
    CREATE TABLE IF NOT EXISTS invite_links (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      album_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMP,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL
    );
  `;

  console.log("Postgres schema ready");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
