// drizzle-kit's SQLite push has a version-mismatch bug across the drizzle-orm/
// drizzle-kit release pair used here — this script creates the same schema
// directly and reliably for local dev. Swap to real Postgres migrations
// (drizzle-kit generate + migrate) when you move to Neon/Supabase for deploy.
const Database = require("better-sqlite3");
const db = new Database(process.env.DB_PATH || "local.db");

db.exec(`
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY,
  folder_id TEXT,
  name TEXT NOT NULL,
  cover_url TEXT,
  created_at INTEGER NOT NULL
);

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
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  track_id TEXT,
  album_id TEXT,
  expires_at INTEGER,
  allow_download INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

console.log("local.db schema ready");
db.close();
