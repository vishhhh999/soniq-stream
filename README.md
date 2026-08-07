# SONIQ — personal WIP music library

Organize, play, and share your own work-in-progress tracks. Built as a scoped
personal alternative to [untitled].

## Stack (as actually deployed, not aspirational)
- Next.js 14, deployed on Vercel
- **Postgres via Neon** for data (was SQLite in an earlier local-only version —
  swapped after the first Vercel deploy failed: Vercel's filesystem is
  ephemeral, so SQLite never had a chance of working there)
- **Cloudflare R2** for audio file storage (S3-compatible, zero egress fees —
  matters here since every play streams the file back out of storage)
- Drizzle ORM, `wavesurfer.js` for waveform, client-side BPM estimation

## What's actually working right now
- Upload tracks (mp3/wav/flac) — folders, albums, tracks, PATCH updates, and
  share links all verified end-to-end against a real Postgres database with
  live round-trips, not just type-checked. Upload itself is coded against R2
  and builds/fails cleanly, but hasn't been run against a real R2 bucket yet
  — verify this first after deploy (see checklist below)
- Real audio metadata on upload (duration, sample rate, bitrate, channels) —
  read directly from file headers, exact
- BPM estimation — client-side after upload, from decoded audio, not a tag.
  Treat it as a starting point — correct it by hand in the track detail panel
  when it's off
- Waveform view with a draggable trim/loop region (visual + saved to DB;
  doesn't yet affect playback — see below)
- Light and dark mode, both designed as separate systems, not an inverted theme
- Share links: token-based, no login required to listen, optional expiry —
  tested end-to-end including the public `/s/[token]` page

## Not built yet
- **Pitch shift** has a schema field and a UI input, no playback engine wired
  in. Needs a phase vocoder (Tone.js or soundtouch.js) — deliberately left out
  of v1 to ship the core loop first. Nothing reads the stored value yet.
- **Trim/loop region is visual only** — saves start/end to the DB, but
  playback doesn't respect it yet (PlayerBar always plays the full file).
- **Folder/album UI** — API routes exist and are tested, no frontend to create
  or browse them yet. Everything lands in one flat library view for now.
- **Musical key** is manual entry only, no auto-detection.

## R2 setup (do this before your first deploy)

1. In the Cloudflare dashboard → R2 → create a bucket (e.g. `soniq-tracks`).
2. **Enable public access** on the bucket: Settings → Public access → either
   turn on the `r2.dev` dev subdomain (fastest, fine for personal use) or
   connect a custom domain. Copy that public base URL — it's `R2_PUBLIC_URL`.
3. R2 → Manage API Tokens → create a token with **Object Read & Write** scoped
   to that bucket. This gives you `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY` — shown once, save them.
4. Your `R2_ACCOUNT_ID` is in the Cloudflare dashboard URL or the R2 overview
   page sidebar.

Env vars needed (same names locally and on Vercel):
```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev      # or your custom domain
```

## Local setup

Also requires a Postgres database — Neon free tier, ~2 minutes to spin up at
neon.tech.

```bash
npm install
```

Create `.env.local` with `DATABASE_URL` plus the five `R2_*` vars above, then:

```bash
npm run db:push   # creates the schema against DATABASE_URL
npm run dev        # http://localhost:3000
```

Without the R2 vars set, everything works except upload — you get a clean
503 with a message telling you which env vars are missing, not a crash.

## Deploying (GitHub + Vercel)

```bash
git init
git add .
git commit -m "postgres + r2 storage"
gh repo create soniq-stream --private --source=. --push
```

Then in the Vercel project:
1. **Storage → Create Database → Postgres (Neon)**, or paste your own
   `DATABASE_URL` if you already made one at neon.tech.
2. **Settings → Environment Variables** — add all five `R2_*` vars from
   above. Unlike Vercel Blob, R2 has no auto-provisioned token — you're
   pasting the values you generated in the Cloudflare dashboard.
3. Redeploy. Run `npm run db:push` once locally with the **production**
   `DATABASE_URL` (pull it with `vercel env pull`) to create the schema on
   the real database — the app doesn't do this automatically on deploy.

## First-deploy checklist (test in this order)
1. Homepage loads, shows empty library — confirms Postgres connection is live
2. Upload one track — confirms R2 credentials and bucket public access are
   correct. If this 503s, the error message names which piece is missing.
3. Refresh — track persists (confirms it's really in Postgres, not just
   in-memory for that request)
4. Open the track, generate a share link, open it in an incognito window —
   confirms the public share path works without your session

## Known deploy pitfall already hit once
The first deploy attempt crashed the build with `SqliteError: no such table:
tracks` — SQLite trying to run inside a Vercel serverless build, which can't
work: the filesystem doesn't persist between build and runtime. If you see a
similar "no such table" or "ECONNREFUSED" on deploy, it almost always means
`DATABASE_URL` isn't set in Vercel's env vars for that environment
(Production vs Preview are separate — check both).
