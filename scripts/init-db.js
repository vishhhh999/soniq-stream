// Creates the schema against your real Postgres (Neon) database.
// Run once after setting DATABASE_URL: npm run db:push
const postgres = require("postgres");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (or export it) and retry.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function main() {
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
      created_at TIMESTAMP NOT NULL
    );
  `;
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
