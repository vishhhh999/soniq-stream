# SONIQ — personal WIP music library

Organize, play, and share your own work-in-progress tracks. Built as a scoped
personal alternative to [untitled].

## What's actually working right now
- Upload tracks (mp3/wav/flac), organized loosely (albums/folders schema exists,
  UI for creating them isn't wired yet — see "Not built yet" below)
- Real audio metadata on upload (duration, sample rate, bitrate, channels) — read
  directly from file headers, exact
- BPM estimation — runs client-side after upload, from decoded audio, not a tag.
  Treat it as a starting point, not ground truth — correct it by hand in the
  track detail panel when it's off
- Waveform view with a draggable trim/loop region (visual + saved to DB; doesn't
  yet affect playback — see below)
- Light and dark mode, both designed as separate systems (not an inverted theme)
- Share links: generate a token-based link per track, no login required to listen,
  optional expiry

## Not built yet (be aware before you rely on this)
- **Pitch shift is in the schema and UI has a field for it, but there's no
  pitch-preserving playback engine wired in yet.** Real pitch shift needs a
  phase vocoder (Tone.js or soundtouch.js) — this was left out of v1 to ship
  the core loop first. Don't confuse the stored `pitchShift` value with actual
  audio processing — nothing reads it yet.
- **Trim/loop region is visual only** — it saves start/end to the DB but
  playback doesn't yet respect it (PlayerBar always plays the full file).
  Wiring `wavesurfer`'s region into actual loop playback is the next piece.
- **Folder/album UI** — API routes exist (`/api/folders`, `/api/albums`), no
  frontend to create or browse them yet. Everything currently lands in one flat
  library view.
- **Musical key** is manual entry only, no auto-detection (flagged in original
  scoping conversation as lowest priority / least reliable to automate).

## Local setup
```bash
npm install
npm run db:push      # creates local.db with the schema
npm run dev           # http://localhost:3000
```
Uploaded files land in `public/uploads/` — fine for local use, not for
production (see deployment note).

## Deploying (GitHub + Vercel)
```bash
git init
git add .
git commit -m "initial scaffold"
gh repo create soniq-stream --private --source=. --push
# or manually: create repo on GitHub, git remote add origin <url>, git push
```
Then import the repo in Vercel. **Before deploying, you need to swap two things
— this scaffold's local-disk storage and SQLite won't survive Vercel's
ephemeral filesystem:**

1. **File storage → Cloudflare R2** (S3-compatible, zero egress fees, matters
   since you'll be streaming audio out constantly). Swap the `writeFile` call
   in `app/api/upload/route.ts` for an R2 `putObject` call, store the resulting
   public URL in `fileUrl` — nothing else in the schema changes.
2. **Database → Neon or Supabase Postgres.** Swap `lib/db/index.ts` from
   `better-sqlite3` to `drizzle-orm/postgres-js` (or Neon's serverless driver),
   change `drizzle.config.ts` dialect to `postgresql`, run `db:push` against
   the real connection string.

Both are drop-in swaps — the schema and every API route stay the same shape.
