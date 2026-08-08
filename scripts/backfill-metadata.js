// One-off backfill: finds tracks with missing duration (durationSec is
// null — the em-dash you see in the track list instead of a time) and
// re-parses their audio file from storage to fill it in, along with
// sampleRate/bitrate/channels if those are also missing. Safe to re-run —
// only touches rows where durationSec IS NULL, so it won't re-process
// tracks that already have real data.
//
// Run with: npm run db:backfill-metadata  (or: dotenv -e .env.local -- node scripts/backfill-metadata.js)
const postgres = require("postgres");
const { parseBuffer } = require("music-metadata");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local (or export it) and retry.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });

const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

async function main() {
  const rows = await sql`
    SELECT id, title, file_url, format
    FROM tracks
    WHERE duration_sec IS NULL
    ORDER BY created_at ASC
  `;

  console.log(`Found ${rows.length} track(s) with missing duration.`);
  let fixed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const res = await fetch(row.file_url);
      if (!res.ok) {
        console.error(`  [skip] ${row.title}: could not fetch file (${res.status})`);
        failed++;
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const meta = await parseBuffer(buffer, undefined);

      const durationSec = finite(meta.format.duration);
      const sampleRate = finite(meta.format.sampleRate);
      const bitrate = meta.format.bitrate ? finite(Math.round(meta.format.bitrate / 1000)) : null;
      const channels = finite(meta.format.numberOfChannels);

      if (durationSec === null) {
        console.error(`  [skip] ${row.title}: metadata parsed but no duration found`);
        failed++;
        continue;
      }

      await sql`
        UPDATE tracks
        SET duration_sec = ${durationSec},
            sample_rate = COALESCE(sample_rate, ${sampleRate}),
            bitrate = COALESCE(bitrate, ${bitrate}),
            channels = COALESCE(channels, ${channels})
        WHERE id = ${row.id}
      `;
      console.log(`  [fixed] ${row.title}: ${durationSec.toFixed(1)}s`);
      fixed++;
    } catch (err) {
      console.error(`  [error] ${row.title}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\nDone. Fixed ${fixed}, failed ${failed}, skipped 0.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
