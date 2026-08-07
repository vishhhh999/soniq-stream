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

## This round: bugs fixed, design overhaul, real DSP feature

**Playback bug, root-caused and fixed.** `crossOrigin="anonymous"` (added
for the ambient visualizer's audio analyser) made the `<audio>` element
refuse to play entirely whenever R2's CORS headers didn't match — not just
lose the visualizer, lose playback completely. Now it tries with CORS first
and falls back automatically without it on error, so playback always works
regardless of CORS configuration state.

**Design system replaced.** Monochrome — light gray / dark gray (never
pure black or white), no more beige/gold. New typography: Bricolage
Grotesque (display) + Inter Tight (body/UI), verified against this
Next.js version's actual bundled font list after an initial wrong guess
(newer Google Fonts aren't all in every Next.js release — checked the
compiled `.d.ts` before trusting the import). Layout widened from 896px to
1600px max-width; album covers are bigger with fewer columns per row.

**Spinning vinyl component** — album art embedded as the label, spins while
playing, shows a deterministic color gradient when there's no cover art.

**Colorful ambient gradients, persisted without a database column.** Each
track's ambient-background colors are either sampled from its album cover
(client-side canvas pixel sampling) or, with no cover, deterministically
hashed from the track's own id — same track always produces the same two
colors, forever, with zero storage needed since it's a pure function of
data already in the database.

**Real automatic key detection** — not a placeholder. Builds a 12-bin chroma
vector via the Goertzel algorithm (testing 48 specific musical frequencies
across 4 octaves rather than a full FFT) and correlates it against the
published Krumhansl-Kessler major/minor key profiles. Verified against
synthetic C-major and A-minor test signals with known ground truth before
shipping — correctly identified both with >0.88 confidence. Same honesty
framing as BPM: surfaced as editable, not asserted as fact. Runs
automatically on upload now, in parallel with BPM detection.

**Volume slider + mute**, and a small animated equalizer indicator on
whichever track row is currently playing.

## What's verified this round (real runs, not just builds)
- Full build compiles clean with the new fonts, colors, and all new
  components
- Real login → album creation → album page load cycle, all 200s, no
  runtime crashes from the redesign
- Key-detection algorithm tested against synthetic signals with known
  correct answers (see above) — the DSP logic itself is proven, though a
  real MP3's key is naturally messier than a synthetic sine-wave chord
- HSL-to-hex color conversion verified against known color values before
  relying on it for the gradient system

## What's NOT verified
- The crossOrigin CORS fallback fix, against your actual R2 bucket's real
  CORS response — the logic is sound and mirrors the pattern already
  proven elsewhere, but only your deploy can confirm it end-to-end
- Key detection accuracy on real, messy, multi-instrument audio — synthetic
  signals prove the math works, not that every real track gets a musically
  "correct" answer. Treat it exactly like BPM: a starting point, not truth
- Album-art gradient sampling — needs the same R2 CORS policy as playback
  (GET requests need proper headers for the canvas color-sampling to work
  cross-origin); falls back to the deterministic hash-based gradient
  automatically if sampling fails, so this degrades gracefully either way

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
