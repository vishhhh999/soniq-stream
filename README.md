# SONIQ — personal WIP music library

Organize, play, and share your own work-in-progress tracks.

## Stack
- Next.js 14 on Vercel
- Postgres via Neon (Vercel Storage integration)
- Cloudflare R2 for audio + cover art storage
- Drizzle ORM, `wavesurfer.js`, client-side BPM estimation, Framer Motion

## What's working (verified end-to-end against real Postgres this round)
- **Login** — single-password gate via middleware. All routes protected
  except `/login`, the public share pages (`/s/[token]`), and their APIs.
  Tested: redirect when logged out, 401 on API, wrong-password rejection,
  cookie-based session working across both pages and API routes.
- **Albums** — create with name + cover art (uploads to R2), grid view,
  album detail page with its own upload scope.
- **Duplicate/version handling** — uploading a track with a matching title
  (case/whitespace-insensitive) into the same album or folder groups it as
  v2, v3, etc. instead of colliding or duplicating silently. Verified against
  real Postgres: grouping, version incrementing, and cross-album isolation
  all confirmed correct.
- **Share links** — expiry choice (7/30/90 days/never) and allow-download
  toggle, both actually wired now (previously hardcoded). Verified end-to-end
  including the public share page.
- **Ambient background** — canvas-based soft gradient + grain, reacts to
  playback via a Web Audio analyser tapped off the player's `<audio>`
  element, confined to the bottom of the screen with a fade mask, toggle
  defaults on. **Untested against a real R2-hosted file** — see caveat below.
- Real audio metadata, BPM estimation, waveform trim view, light/dark modes
  — carried over from the previous round, still working.

## What's NOT verified this round (needs your real credentials/deploy)
- **The upload route's R2 path itself.** Everything downstream of a
  successful upload (duplicate detection, DB insert, metadata) was verified
  by running the exact same queries directly against Postgres — but the
  actual R2 `PutObjectCommand` call has no real bucket to test against here.
  It fails cleanly when unconfigured (confirmed — clean 503, server survives),
  but "does a real file actually land in R2 and get a working public URL"
  is only provable on your deploy.
- **The ambient background's audio reactivity specifically.** The Web Audio
  analyser requires the audio element's `crossOrigin="anonymous"` to work
  against a cross-origin R2 URL, which in turn requires your R2 bucket to
  send proper CORS headers on GET requests. If your bucket doesn't have a
  CORS policy configured, playback works fine but the ambient background
  falls back to gentle idle motion instead of reacting to the music — it
  won't error, just won't be reactive. **Check your bucket's CORS settings**
  (R2 → your bucket → Settings → CORS Policy) if it doesn't seem to pulse
  with the music: add an entry allowing `GET` from your deployed domain (or
  `*` for simplicity on a personal project).
- The overall visual/UX pass — needs your eyes on the real thing once
  deployed. This got real functional and structural work (albums, versions,
  motion, ambient mode) but a proper design pass on spacing/hierarchy/feel
  across the new pages hasn't happened yet.

## Not built yet
- Pitch shift — schema field + UI exist, no playback engine wired in
- Trim/loop region — visual only, doesn't gate playback yet
- Folder UI — API exists, no frontend (albums are the primary structure now)
- Musical key — manual entry only

## Env vars

```
DATABASE_URL=postgres://...
APP_PASSWORD=choose-a-real-password
APP_SECRET=any-long-random-string      # signs session cookies — generate with: openssl rand -hex 32
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

`APP_SECRET` is new this round — required for login sessions. Generate one
with `openssl rand -hex 32` and add it in Vercel same as the others.

## Local setup

```bash
npm install
```

Create `.env.local` with all the vars above, then:

```bash
npm run db:push   # idempotent — safe to re-run after schema changes
npm run dev
```

## Deploying

Same as before (Postgres via Storage tab, R2 vars pasted manually), plus now:
add `APP_PASSWORD` and `APP_SECRET` to Vercel's Environment Variables. Redeploy,
then visit the site — you'll land on `/login` first.

## First-deploy checklist
1. Homepage redirects to `/login` when logged out — confirms middleware/auth
2. Log in with `APP_PASSWORD` — confirms `APP_SECRET` is set correctly
3. Create an album with cover art — confirms R2 + Postgres both work
4. Upload two tracks with the same name into that album — second one should
   show a "v2" badge with a chevron to expand — confirms version detection
5. Generate a share link, open it in incognito — confirms public share path
6. Check whether the ambient background pulses when something's playing —
   if it's static, check R2 CORS policy (see caveat above)

## Known deploy pitfalls already hit
- **SQLite on Vercel** (fixed, see git history) — ephemeral filesystem,
  never going to work.
- **`prepared statement already exists` / tracks silently not saving**
  (fixed this round) — Vercel's Neon integration gives you a *pooled*
  connection string by default; `postgres-js` needs `{ prepare: false }`
  against it or writes fail silently. This was the root cause of uploads
  landing in R2 but never appearing in the library.
- **Middleware `crypto` module error** (fixed this round, caught before you
  hit it) — Vercel Edge Runtime doesn't support Node's `crypto`; session
  signing uses Web Crypto (`crypto.subtle`) instead, which works in both.
