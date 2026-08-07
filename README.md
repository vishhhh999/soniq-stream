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
ALLOWED_EMAILS=you@gmail.com   # optional — controls both Google sign-in AND email/password signup; unset = open
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

`APP_PASSWORD` / `APP_SECRET` from earlier versions are gone — safe to
delete from Vercel if still present.

## This round: lyrics + sync

**Lyrics editor + tap-to-sync timing, Apple-Music-style synced display.**
Paste or type lyrics yourself (this app never generates, fetches, or
supplies lyrics content — it only stores and displays what you enter,
same as any note-taking field). Two pieces:

- **`LyricsEditor`** (in the track panel): a plain textarea for the raw
  text, plus a "Sync timing" flow — plays the track from the start, shows
  one line at a time, and captures the real playback timestamp each time
  you tap "this line starts now." Finishes automatically after the last
  line, saves as an array of `{ time, text }` pairs.
- **`LyricsView`** (opened via the mic icon in the player bar): full-screen
  overlay showing the synced lyrics, current line enlarged and highlighted,
  others dimmed, auto-scrolling to keep pace with playback. Falls back to
  plain unsynced text if you've saved lyrics but haven't run the sync flow
  yet, and to a clear empty state if there's nothing at all.

**Storage:** two new columns on `tracks` — `lyrics` (raw text) and
`lyrics_synced` (Postgres `jsonb`, an array of timestamp/line pairs).

**Also refactored while building this:** `currentTime`/`duration` tracking
moved from `PlayerBar`'s local state into `PlayerProvider` itself, so
`LyricsView` (and anything else added later) can read playback position
without duplicating audio event listeners. This removed a small amount of
duplicate state, not a behavior change.


## This round: upload timeout crash, auth UX

**Real root cause of the "Could not process uploaded file" crash on real
tracks.** Vercel's default serverless function timeout without
`maxDuration` set is ~10 seconds — fine for a small test file, not for
fetching a full-size track back from R2, buffering it, and parsing its
metadata. Hitting that default killed the function at the platform level,
returning an empty response body — which is why the client saw "Unexpected
end of JSON input" rather than an actual error message. Fixed:
`maxDuration = 60` (the Hobby-plan max without Fluid compute) on the
upload/finalize/cover routes, plus internal timeout guards around the R2
fetch and metadata parsing specifically, so a genuinely hanging operation
fails with a real error instead of silently running out the platform
clock. Tested against a 3.8MB real file end-to-end — processed in under
half a second, confirming the fix doesn't slow down normal uploads.

**Login page now has a visible "New here? Sign up" link**, and `/setup`
no longer silently bounces to `/login` with zero explanation when an
account already exists — it now says so directly, with a link back to
sign in. This was a UX/communication gap, not a missing feature: `/setup`
already handled account creation, there was just no visible path to it
and no explanation when it declined to create a second account. Still
single-account by design (no open registration) — that part hasn't
changed, only the messaging around it.


## This round: player rebuild, lyrics/BPM persistence bugs, open signup

**Fixed a real timing bug behind the permanent 0:00/0:00.** The
`currentTime`/`duration`-tracking effect in `PlayerProvider` ran once on
mount with an empty dependency array — but the actual `<audio>` element
lived inside `PlayerBar`, which only mounts *after* the auth session check
resolves. The effect found `audioRef.current` null, attached nothing, and
(with no dependency to re-trigger it) never got a second chance. Fixed by
moving the `<audio>` element itself into `PlayerProvider`, so it exists
the instant the app loads regardless of auth timing.

**Player rebuilt as a floating pill**, not a bar stretching edge to edge —
matches the reference you sent. This also fixes the volume slider clipping
outside the page: it's a bounded popover now, not an inline slider with no
real width constraint on the previous full-width layout.

**Waveform was rendering as blobs, not bars — real CSS bug, not a design
choice.** Each bar used `flex-1` (auto width) with `rounded-full`. On a
wide player, most bars ended up wider than tall, and `rounded-full` on a
wide-short shape renders as a horizontal pill, not a vertical bar. Fixed:
fixed 2px bar width, small radius, plus a single accent playhead line at
the current position instead of a played/unplayed color split across every
bar — closer to what you referenced.

**Lyrics: the actual bug was `LyricsEditor`'s completion callback wired to
the wrong function.** It called `TrackDetail`'s own `onSaved`, which was
built to close the entire panel after the main "Save changes" button — so
finishing a sync (or even just saving the raw text) closed the whole
drawer immediately, before you could see or confirm anything. That's
exactly "the dialog closed without me pressing save." Fixed: lyrics now
confirm locally ("Saved" / "Synced") without touching the parent panel at
all, matching how title/artist auto-save already worked.

**BPM/key re-detect had the same class of bug** — the button only updated
local form fields, never actually called the save API. If you closed the
panel without separately clicking "Save changes" below, detected values
were silently lost. Now persists immediately on detection.

**Signup is open now, not restricted to one account.** Gated by the same
`ALLOWED_EMAILS` allowlist already used for Google sign-in if it's set —
if it's not set, signup is unrestricted. This is a real security tradeoff,
stated plainly: set `ALLOWED_EMAILS` if you want this locked to specific
people, leave it unset if you want it open. `/setup` no longer pre-checks
or blocks; any restriction now surfaces as a normal form error on submit.

**Removed the BPM/key display from the player bar** — redundant clutter,
still visible in the track panel where it's actually useful.

## Explicitly deferred — not started, not partial

Lyrics + sync (was on this list) is done — see above. What remains, still
real standalone features, still not rushed together:
- **3D floating vinyl library browser** — a genuinely different navigation
  paradigm from the current list/grid, immediately next
- **Comments** (for sharing a mix with a collaborator who wants to leave
  feedback — including from the public share page, which has real design
  implications worth doing carefully: who can post, spam surface area,
  moderation)

## What's verified this round (real runs against real Postgres)
- Multi-account signup: two independent accounts created, duplicate email
  correctly rejected (409), both accounts confirmed able to log in
  separately — tested against real Postgres, not just code review
- Lyrics save/load round-trip: raw text and the synced `jsonb` array both
  confirmed persisting and returning correctly (as a real array, not a
  stringified blob) via direct API calls against real Postgres
- The line-matching algorithm (`getCurrentLineIndex`) — the core of what
  makes the synced view actually highlight the right line — tested against
  8 known timestamp/position pairs before trusting it in the UI
- Full production build compiles clean with the new schema columns,
  `LyricsEditor`, `LyricsView`, the `PlayerProvider` refactor, and the
  floating-pill player rebuild

## What's NOT verified
- The actual tap-to-sync UX in a real browser — timing accuracy depends on
  how quickly the button registers your tap relative to the audio, which
  is exactly the kind of thing that needs a real session, not a curl test
- Auto-scroll behavior in `LyricsView` during real playback — the
  `scrollIntoView` call is standard and should work, but hasn't been
  watched scroll in an actual browser
- The visual result of the player/waveform rebuild — the bugs (blob-shaped
  bars, permanent 0:00/0:00, volume clipping) are diagnosed and fixed at
  the code level with clear reasoning for each, but only your browser can
  confirm it actually looks like the reference now

## Not built yet
- **3D vinyl browser**, **comments** — see "Explicitly deferred" above
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
