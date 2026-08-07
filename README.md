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

## This round: real player, bug batch, drag-reorder

**Player rebuilt with a real queue.** Skip forward/back buttons existed
before this round but had zero `onClick` handlers — pure decoration. Now
`PlayerProvider` has an actual queue: `playQueue()`, `next()`, `previous()`,
shuffle (fair Fisher-Yates shuffle, not just "pick random"), and
auto-advance when a track ends. Clicking a track anywhere in a list plays
it with that list as queue context, so skip navigation means something.
Also added: a queue drawer to see and jump to upcoming tracks, and a
waveform-style seek bar — **stylized, deterministic per-track bars, not
real amplitude data** (true waveform analysis per track wasn't worth the
cost for a visual flourish; the drag-to-seek behavior underneath is real).

**Album delete.** Tracks inside move to Unsorted rather than being
destroyed — no undo exists anywhere in this app, so silently deleting
someone's audio files because they wanted to remove an album grouping
felt like the wrong default.

**Player bar no longer shows before you're signed in.** Was rendering
unconditionally in the root layout, including on `/login`. Now gated
behind an actual session check.

**Found the real reason BPM wasn't showing for some tracks.**
`lib/bpm.ts` uses a plain `fetch()` to pull the file for decoding — unlike
`<audio>` tags (which have a CORS fallback), a raw `fetch()` to a
cross-origin URL just fails outright without proper CORS, no recovery
path. Any track uploaded before your R2 CORS fix landed is permanently
stuck at `bpm: null` with no way to retry. Added a manual "Re-detect BPM &
key" button in the track panel so existing tracks aren't stuck forever.

**Rename now actually feels like it saves.** Title and artist previously
required scrolling down and clicking a separate "Save changes" button,
inconsistent with how album rename already auto-saved on blur — and the
panel closed immediately after saving with zero visible confirmation, so
even a successful save looked like nothing happened. Title/artist now
auto-save on blur (same pattern as album name) with a brief inline
"Saving.../Saved" indicator.

**Drag-and-reorder — the deferred feature tackled this round.** New
`sort_order` column: a fresh upload gets `-Date.now()` (very negative, so
it sorts first ascending — "newest at top" by default). Dragging a track
reassigns sequential integers (0, 1, 2...) to the reordered list — small
non-negative numbers that always sort *after* any `-Date.now()`-based
default, meaning a brand new upload still floats to the very top even
after you've manually reordered everything else. Verified against real
Postgres: default newest-first order, a manual reorder taking effect, and
a simulated new upload after that reorder still landing at position one.
Pre-existing tracks get backfilled with an equivalent `sort_order` derived
from their `created_at`, so nothing already in your library jumps around
when this migration runs.

**On "no signup option, only login" — this is intentional, not a bug.**
Earlier in this project you specifically asked for real accounts instead
of an open-registration system, given this holds your own private files.
`/setup` creates the one account on first run and then locks — that's the
signup flow, it just doesn't live at `/login` because there's deliberately
no ongoing open registration after the first account exists. If you want
this to work differently, say so directly rather than it being "fixed"
into open signup, which would be a real step backward for a personal
library.

## Explicitly deferred — not started, not partial

These remain real standalone features, not omissions. Doing them properly,
one at a time, verified — not a rushed pass:
- **3D floating vinyl library browser** — a genuinely different navigation
  paradigm from the current list/grid, its own focused piece of work
- **Lyrics + sync editor** (tap-to-sync timing, Apple Music-style synced
  display)
- **Comments** (for sharing a mix with a collaborator who wants to leave
  feedback — including from the public share page, which has real design
  implications worth doing carefully: who can post, spam surface area,
  moderation)

## What's verified this round (real runs against real Postgres)
- Reorder logic: default newest-first order, a manual drag-reorder
  persisting via the real API, and a simulated new upload after that
  reorder correctly landing above everything else — all confirmed against
  actual rows in the database, not just code review
- Album delete: tracks confirmed to survive with `albumId` set to null
  (moved to Unsorted), not destroyed; album row itself confirmed gone
- Full production build compiles clean with the queue system, waveform
  seek bar, dnd-kit drag-and-drop, and all new routes; login → album
  creation → delete → reorder sequence run end-to-end against a live
  server without the process crashing

## What's NOT verified
- The actual drag interaction in a real browser (mouse/touch drag physics,
  dnd-kit's visual drag overlay) — the underlying reorder API and sort
  logic are proven, but the pointer-drag UX itself needs your eyes
- Queue/skip/shuffle behavior in a real browser session — the state logic
  in `PlayerProvider` is straightforward React state, but multi-track
  playback sequencing over real audio files is the kind of thing worth
  actually clicking through yourself

## Not built yet
- **Lyrics + synced display**, **comments**, **3D vinyl browser** — see
  "Explicitly deferred" above
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
