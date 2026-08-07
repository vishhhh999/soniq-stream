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
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS albums (
      id TEXT PRIMARY KEY,
      folder_id TEXT,
      name TEXT NOT NULL,
      cover_url TEXT,
      created_at TIMESTAMP NOT NULL
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
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
  console.log("Postgres schema ready");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
