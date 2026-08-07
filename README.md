# SONIQ — personal WIP music library

Organize, play, and share your own work-in-progress tracks.

## Stack
- Next.js 14 on Vercel
- Auth.js v5 — email+password (bcrypt-hashed, in Postgres) and Google sign-in
- Postgres via Neon, Cloudflare R2 for audio + cover art
- Drizzle ORM, `wavesurfer.js`, client-side BPM estimation, Framer Motion

## Upload architecture — read this before setting up R2
Files upload **directly from your browser to R2**, not through a Vercel
function. This isn't a style choice — Vercel serverless functions have a
hard 4.5MB request body limit that cannot be raised by any plan or config,
and a real audio file routinely exceeds it. The flow:

1. Browser asks our server for a signed upload URL (`/api/upload/presign`)
2. Browser PUTs the file straight to R2 using that URL — never touches our
   server, so the 4.5MB limit doesn't apply
3. Browser tells our server the upload finished (`/api/upload/finalize`) —
   the server fetches the file back from R2 (server-to-server, also not
   subject to that limit) to extract metadata and run duplicate detection

**This means your R2 bucket needs a CORS policy, or step 2 fails.** Browsers
block cross-origin PUT requests by default. In the Cloudflare dashboard:
R2 → your bucket → Settings → CORS Policy → add a rule:
```json
[
  {
    "AllowedOrigins": ["https://your-app.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
Replace the domain with your real one. Without this, uploads will fail in
the browser with a CORS error at the PUT step, even though everything else
(presign, R2 credentials) is configured correctly.

## Auth — how it actually works
Not open signup. First run with an empty `users` table sends you to
`/setup` to create the one account; after that `/setup` refuses to create
another. `/login` offers email+password (bcrypt, stored in your Postgres)
and Google sign-in (deny-by-default allowlist via `ALLOWED_EMAILS` — an
unconfigured allowlist blocks everyone, not "anyone with a Google account").

### Setting up Google sign-in
1. console.cloud.google.com → new project
2. APIs & Services → OAuth consent screen → External → fill in basics
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application
4. Authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`
5. Copy Client ID / Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
6. Set `ALLOWED_EMAILS=you@gmail.com`
7. While the consent screen is in Testing mode, also add yourself under
   Test Users on that same screen — Google blocks non-test-users regardless
   of your app's own allowlist until you publish the app.

Skip all of this and email+password still works fine on its own.

## Env vars

```
DATABASE_URL=postgres://...
AUTH_SECRET=...                # openssl rand -hex 32
AUTH_TRUST_HOST=true
GOOGLE_CLIENT_ID=...           # optional
GOOGLE_CLIENT_SECRET=...       # optional
ALLOWED_EMAILS=you@gmail.com   # required if using Google sign-in
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

`APP_PASSWORD` / `APP_SECRET` from earlier versions are gone — safe to
delete from Vercel if still present.

## This round: functional gap-closing batch

Fixed, in order of how much they were blocking real use:

- **Draggable seek bar.** Was a click-only custom div — you could jump to a
  point in the track but not drag through it. Now a native range input,
  actually draggable.
- **Track rename, delete, download.** Backend already supported rename
  (PATCH already allowed `title`) and delete already existed — this round
  wired both into the UI, added a confirm step on delete, a download link,
  and made delete also clean up the R2 object instead of just the DB row.
- **Album editing** — rename (click the album title) and cover replacement
  (hover the cover, click to swap) via a new `PATCH /api/albums/[id]`
  route that didn't exist before.
- **Album sharing, actually fixed, not just added.** The share button and
  API already accepted an `albumId`, but the *resolve* endpoint
  (`/api/share/[token]`) only ever handled `trackId` and 404'd immediately
  otherwise — so album shares silently never worked despite looking
  functional. Fixed, and verified end-to-end: create an album share,
  resolve the token, get back the album + its full track list.
- **Notes/description field** — the `notes` column already existed in the
  schema from earlier rounds but had no UI; now exposed as a text area on
  each track (mix notes, context, whatever's worth remembering about that
  version).
- **Orphaned-file handling.** Deleting a file directly from the R2 bucket
  (outside the app) used to leave a track that silently failed to play
  forever with no indication why. Now, once both playback attempts
  genuinely fail, a banner appears with "Remove from library."
- **Bigger album art** — capped at 4 columns instead of 5 within the wider
  layout, larger gaps, bumped typography to match.
- **Font swapped again** — Bricolage Grotesque out, JetBrains Mono in for
  display/headlines (kept Inter Tight for body — full mono body text at
  length hurts readability more than it looks premium). Verified against
  this Next.js version's real available font list before using it, same
  check that caught a wrong guess last round.
- **Ambient gradient now actually reacts to the beat**, not just smoothed
  amplitude. Added a real onset detector: tracks a rolling average of bass
  energy, treats a sudden spike above it as a "hit," and pulses the
  gradient with a sharp rise and ~250ms decay — tested against a synthetic
  120bpm kick pattern before shipping (19 of 20 expected hits correctly
  detected at the right timestamps, only missing the very first due to an
  expected cold-start gap with no history yet to compare against).

## Explicitly deferred — not started, not partial

These are real standalone features, not omissions:
- **3D floating vinyl library browser** — a genuinely different navigation
  paradigm from the current list/grid view, worth building as its own
  focused piece of work
- **Lyrics + sync editor** (tap-to-sync timing, Apple Music-style synced
  display)
- **Comments** (for sharing a mix with a collaborator who wants to leave
  feedback)
- **Drag-and-reorder** for tracks within an album — needs a schema change
  (sort-order column) and a drag library; scoped out to keep this round
  bounded rather than half-built

## What's verified this round (real runs against real Postgres)
- Album rename, track rename + notes, album share creation AND resolution
  (the part that was actually broken), track delete with confirmed removal
  — all tested end-to-end via real HTTP requests against a live server and
  real database, not just code review
- Beat-onset detector tested against a synthetic 120bpm signal with known
  correct timing before trusting it
- Full production build compiles clean with the new font, routes, and
  components; server stayed healthy through the entire test sequence above

## What's NOT verified
- Volume slider dragging — the code is a standard native range input and
  looks structurally correct; if it's still not draggable after this
  round, that needs a live look in your actual browser rather than another
  blind guess at the cause
- Cover-replace flow on the album page, against real R2 (same presign/PUT
  pattern already proven elsewhere, but only your deploy proves this
  specific wiring)

## Not built yet
- **Lyrics + synced display** — explicitly scoped out of this round by
  request, to be built properly as its own feature rather than rushed
  alongside everything else. Needs: a lyrics editor, a tap-to-sync timing
  mode (à la Musixmatch/Apple Music), and a synced playback display.
- Pitch shift — schema field + UI exist, no playback engine wired in
- Trim/loop region — visual only, doesn't gate playback yet
- Folder UI — API exists, no frontend (albums are the primary structure)

## Local setup
```bash
npm install
```
`.env.local` with everything above, then:
```bash
npm run db:push   # auto-loads .env.local now — no manual export needed
npm run dev
```

## Deploying
Same Postgres/R2 setup as before, plus:
1. **Set up R2 bucket CORS** (see above) — new requirement this round
2. Add `AUTH_SECRET`, `AUTH_TRUST_HOST`, Google vars if using them
3. After first deploy: `vercel link` then
   `vercel env pull .env.local --environment=production` (plain
   `vercel env pull` defaults to Development, which is usually empty) —
   then `npm run db:push` against the real database

**Note on sensitive env vars:** if `DATABASE_URL` or others are marked
Sensitive in Vercel (common for Storage-integration-created variables),
`vercel env pull` cannot retrieve the real value — it writes the literal
placeholder text `[SENSITIVE]` instead. If `db:push` fails with an
"Invalid URL" error, this is why: open the variable's value directly from
the Storage tab or Neon's own dashboard and paste it into `.env.local`
by hand.

## First-deploy checklist
1. Visit the live URL → `/setup` → create account → `/login` → sign in
2. Create an album with cover art (tests R2 CORS + presign + finalize together)
3. **Upload one real audio track, not a tiny test file** — this is what
   actually exercises the new upload path
4. Upload a second track with the same name into the same album — should
   show a "v2" badge
5. Generate a share link, open in incognito
6. Check whether the ambient background reacts to playback (needs R2 CORS
   to also permit GET for the Web Audio analyser — same CORS policy above
   already covers this)

## Known deploy pitfalls already hit (chronological)
1. SQLite on Vercel — ephemeral filesystem, never going to work
2. `prepare: false` required for Neon's pooled connection string, or writes
   fail silently
3. Node's `crypto` module doesn't run in Vercel Edge middleware — session
   signing needs Web Crypto or (with Auth.js) the edge-safe config split
4. Login route with no error handling turned "APP_SECRET missing" into an
   unparseable HTML error page instead of a real message
5. `/login` and `/setup` rendered permanently blank on any status-check
   failure, with no error path — root cause of the blank-page report
6. `vercel env pull` defaults to Development environment, not Production
7. Sensitive-flagged env vars can't be read back via `vercel env pull` at
   all — writes `[SENSITIVE]` as a literal placeholder
8. **This round:** uploads silently failed on any real audio file because
   they routed through a Vercel function's 4.5MB hard body-size limit —
   fixed with direct browser-to-R2 upload via presigned URLs
