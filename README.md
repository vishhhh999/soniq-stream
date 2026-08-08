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
    "AllowedOrigins": ["https://www.soniq.lol", "https://soniq.lol", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
Replace the domains with your real ones. Without `AllowedOrigins`/`AllowedMethods`,
uploads fail in the browser with a CORS error at the PUT step even though
everything else is configured correctly. **`ExposeHeaders` matters
specifically for playback of large files** — the `<audio>` element loads
tracks in CORS mode (needed so the ambient background's audio analyser can
read real frequency data instead of silence), and CORS mode hides
response headers from the browser unless the server explicitly exposes
them. Without `Content-Range`/`Accept-Ranges` exposed, the browser can't
properly negotiate progressive range-request streaming and may pull much
more of a large file before playback starts. If large files are loading
slowly, this is almost certainly why — check this is actually set, not
just the other three fields.

## Auth — how it actually works
Signup is open — anyone can create an account — but email/password signup
requires proving you own the email first. `/setup` sends a 6-digit code
via Resend (`RESEND_API_KEY` required); the account is only created after
the code is verified (`/api/auth/otp/verify`), so you can't register an
email you don't control. `/api/setup`'s old direct-signup POST is closed
(`410 Gone`) — OTP is the only way in for email/password.

Google sign-in has no allowlist — any Google account can sign in. If a
Google sign-in matches an email that already has a password account, it's
treated as the same person and linked automatically (not a separate
account) — safe now that email/password signup requires OTP verification,
since both paths prove ownership of the email before an account can exist
under it. A one-time toast confirms the first link.

Everyone gets a `username` (optional at signup, promptable later if
skipped) — `GET /api/user/me` / `PATCH /api/user/username`, 3–20 chars,
letters/numbers/underscores.

### Setting up Google sign-in
1. console.cloud.google.com → new project
2. APIs & Services → OAuth consent screen → External → fill in basics
3. APIs & Services → Credentials → Create Credentials → OAuth client ID → Web application
4. Authorized redirect URI: `https://your-domain/api/auth/callback/google`
5. Copy Client ID / Secret → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
6. While the consent screen is in Testing mode, also add yourself under
   Test Users on that same screen — Google blocks non-test-users regardless
   of anything else until you publish the app.

Skip all of this and email+password (with OTP) still works fine on its own.

### Setting up Resend (required for signup)
1. resend.com → create an API key → `RESEND_API_KEY`
2. Verify a sending domain (or use Resend's own for testing) — the app
   sends from `onboarding@soniq.lol` in `lib/email.ts`; change that address
   to match whatever domain you've actually verified in Resend, or OTP
   emails will fail to send.

## Env vars

```
DATABASE_URL=postgres://...
AUTH_SECRET=...                # openssl rand -hex 32
AUTH_TRUST_HOST=true
GOOGLE_CLIENT_ID=...           # optional — enables Google sign-in
GOOGLE_CLIENT_SECRET=...       # optional
RESEND_API_KEY=...             # required — signup is OTP-only now, no path in without it
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=soniq-tracks
R2_PUBLIC_URL=https://pub-xxxxxxxx.r2.dev
```

`APP_PASSWORD` / `APP_SECRET` from earlier versions are gone — safe to
delete from Vercel if still present. `ALLOWED_EMAILS` is also gone as of
this round — signup (both Google and email/password) is open to anyone;
email/password signup is gated by OTP verification instead (see below).

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

## This round: duplicate-upload choice, inline lyrics sidebar, cross-container drag-and-drop

**Duplicate-upload choice prompt.** New `/api/tracks/check-duplicate` runs
before the file even uploads — approximates the title from the filename
(the real ID3-tag title isn't known until the file is parsed server-side
during finalize, which happens after upload; this matches finalize's own
fallback behavior for untagged files). If a match is found in the same
scope, you get an actual choice: group as a new version, or keep both as
fully independent tracks (`independent: true` skips the version-grouping
query entirely on the server). Verified against real Postgres — confirmed
two same-named tracks end up with genuinely different `versionGroupId`s
when "keep both" is chosen, not silently merged.

**Inline lyrics sidebar**, not just the fullscreen modal. A persistent
right column appears automatically when the currently playing track has
synced lyrics — no click needed — and collapses to nothing when it
doesn't, per spec. The sidebar's expand button and the player's mic button
both open the same fullscreen `LyricsView` now, sharing one trigger
(`soniq:expand-lyrics` event) instead of two separate code paths.

**Cross-container drag-and-drop.** Drag a track from Unsorted onto an
album to assign it there. Drag one album onto another and you're asked
whether to group them into a folder. Both `AlbumCard` (drag source *and*
drop target — same id serves both roles in dnd-kit, which is correct, not
a bug) and track rows on the home page are wired into one shared
`DndContext`. Required opening up two PATCH endpoints that didn't allow
it before: `albumId` on tracks, `folderId` on albums. Verified end-to-end
against real Postgres — confirmed a track's `albumId` actually changes on
drop, and confirmed two albums end up sharing the same real folder id
after the folder-creation flow.

## This round: real mobile support, bulk actions, BPM hypothesis narrowed

**Mobile gets a genuinely different player, not a shrunk desktop one.**
`AuthedPlayerShell` now renders `MobilePlayerBar` instead of `PlayerBar`
below the `md` breakpoint (768px) — two distinct states (collapsed
full-width mini-bar with a thin progress line, expanding to a full-screen
sheet on tap) rather than trying to cram nine desktop controls into a
smaller viewport. Desktop `PlayerBar` is unchanged except the waveform bar
is shorter (`h-8` → `h-5`), as asked.

**Selection now has a destination.** New `SelectionToolbar` — appears
whenever tracks are selected, with "move to album" (opens a picker) and
"delete" (with confirm). Works on both desktop and mobile since it's the
same underlying bulk-PATCH/DELETE logic either way. Verified end-to-end
against real Postgres: two tracks correctly reassigned to a target album,
a third correctly deleted, confirmed by re-fetching afterward.

**Mobile gets its own interaction model, not desktop patterns squeezed
down.** Desktop keeps click-to-select/shift-ctrl/double-click/drag-and-drop
exactly as before. Mobile: tap plays, long-press enters selection mode
(same pattern as Photos/Files apps), subsequent taps toggle selection,
and moving tracks goes through the bulk toolbar instead of drag-and-drop
— pointer-drag is unreliable on touch and fights with scrolling, so it's
disabled entirely on mobile (`dragDisabled` prop on `AlbumCard`, `isMobile`
gating in `TrackRow`) rather than left in as a worse experience.

**Multi-track drag** — dragging one track that's part of a larger
selection now moves the whole selection to the drop target, not just the
one physically dragged.

**BPM — narrower hypothesis, not a fix.** Both playback and download
work, and both go through plain `fetch()` — ruling out CORS as the
remaining cause. The one thing BPM detection does that neither of those
does is call `decodeAudioData()`, which is notably stricter than `<audio>`
tag playback. Files from third-party converters/rippers often have
subtly malformed encoding that a tolerant player accepts but a strict
decoder rejects — a real, different failure mode with no code fix if
that's what's happening. Still waiting on the actual error text from a
failed re-detect attempt to confirm.

## This round: the actual lyrics bug, plus real interaction/visibility fixes

**Found the real cause of lyrics never loading — `GET /api/tracks/[id]`
didn't exist.** The route only ever exported `PATCH` and `DELETE`.
`LyricsView` and `LyricsSidebar` both call `fetch(\`/api/tracks/${id}\`)`
with no method specified (defaults to `GET`) to read the full record,
since `lyricsSynced` isn't carried on list-level track objects. Every one
of those calls was hitting a 405, and the empty response body then
crashed the caller's `.json()` parse — this is exactly what showed up in
the console screenshot. **Lyrics could never have loaded, independent of
whether saving worked.** Added the missing `GET` handler (with the same
ownership check as the other methods) and reproduced the exact failing
call from a real browser session — confirmed 405 → 200, `lyricsSynced`
returning as a real array, and confirmed a different user still correctly
gets 404 instead of the data.

**Double-click was also triggering selection — real browser behavior, not
a fluke.** Browsers fire `click` before `dblclick` on every double-click
sequence (click, click, dblclick), so a plain `onClick` selection handler
ran on the way to every double-click too. Fixed with the standard
disambiguation pattern: delay the select action briefly, cancel it if a
second click arrives before it fires.

**Selection visibility was genuinely backwards-looking.** Selected rows
used `bg-accent/15` — a 15%-opacity wash of a near-white accent color,
which reads as barely-there against a dark background — while the
*currently playing but unselected* row used solid `bg-surface`, which
looks more prominent. That's exactly "selected looks transparent, current
song has a black box." Selected rows now get a dominant treatment
(`bg-accent/20` plus a visible ring) that always outranks both hover and
"currently playing" visually, so selection state is unambiguous regardless
of what else is happening in that row.

**BPM — closed the actual diagnostic gap this time, not just the manual
button.** Upload-time detection failures were completely silent — no
alert, nothing — unlike the manual re-detect button. If you were only
testing via fresh uploads (not the re-detect button), you'd have seen
literally no indication anything failed. Now surfaces the real error via
the same banner used for upload failures.

**Selection toolbar centering** — checked against `PlayerBar`, which uses
the identical `left-1/2 -translate-x-1/2` centering and isn't reported as
broken anywhere. The CSS itself is sound; what most likely read as
"off-center" was the toolbar appearing unexpectedly due to the
double-click bug above, now fixed. If it's still off specifically when the
lyrics sidebar is also open, that's a real, narrower issue (viewport
centering vs. the narrower visible content area next to the sidebar) —
flag it if so.

## This round: account-linking security fix, smooth synced lyrics

**A sandbox reset happened mid-round — worth documenting honestly.** The
environment reverted to an earlier file state partway through this
session, silently losing everything from several prior rounds (mobile
player, interactive vinyl, album hero, scrollbar fix, the lyrics 405 fix,
double-click fix, selection visibility fix). Caught it because a file I'd
verified minutes earlier had vanished. Recovered by restoring from the
last zip actually shipped (which had all of that intact) rather than
reconstructing five rounds from memory, then reapplying only this round's
real new work on top, with full re-verification against the actually-
current files — not trusting the earlier checks, which had been run
against a state that no longer existed.

**Real account-linking security gap, fixed.** Google's `signIn` callback
matched existing users by email and silently reused that account
regardless of how it was created. Since password signup has no email
verification, someone could register your email with a password they
control, and later — when you sign in for real via Google — get merged
into their account, which they can still access via that password. Fixed:
`passwordHash` is now nullable (`null` = Google-only account, non-null =
real password account), and whichever method claims an email first wins —
the other is rejected outright, no silent merge in either direction.
Verified both directions against real Postgres: Google sign-in blocked
for an email with a real password account, and password signup still
correctly blocked (409) for an email that already has a Google-only
account.

**On the "Access Denied" you hit testing Google sign-in yourself** — that's
the `ALLOWED_EMAILS` allowlist working as designed (your own explicit
request a few rounds back: deny-by-default unless a Gmail is explicitly
listed). Add your email to `ALLOWED_EMAILS` in Vercel if you want your own
Google account to work — this wasn't a bug, just needed configuring.

**Synced lyrics — actually smooth now, not just less choppy.** The old
implementation used native `scrollIntoView` alongside a separate CSS
`transition-all` on scale/opacity — two different animation systems
fighting each other is exactly what produced the laggy feel. Replaced
with a single GPU-accelerated transform (`translateY`) animated by Framer
Motion spring physics, the same fundamental approach Apple Music/Spotify
use — no native scroll involved at all. Verified the centering math
against known line positions (including first/last lines, which are the
easy place to get this wrong) before trusting it. Added a subtle glow
(`text-shadow`) on the active line, and every line is now clickable to
seek directly to that point in the track.

## This round: mobile lyrics overlap, slow large-file playback, drag-and-drop gating

**Lyrics sidebar had no mobile check at all.** It's desktop-only by design
(mobile gets lyrics through the mic button in the player sheet instead),
but nothing was actually gating it — it rendered and overlapped the whole
mobile page. Now checks screen size and renders nothing on mobile,
including skipping the data fetch entirely, not just hiding the result.

**Large WAV files (50MB+) loading slowly — real cause, not a guess.**
Every track load set `crossOrigin="anonymous"` before assigning `src`,
forcing every single playback attempt into CORS mode. CORS-mode loading
needs R2 to expose specific headers (`Content-Range`, `Accept-Ranges`,
`Content-Length`) for the browser to properly negotiate progressive
range-request streaming — headers that were never configured. Without
them, large files can fall back to pulling far more data before playback
starts. Worse: the existing fallback that removed `crossOrigin` only
triggered on an outright `error` event, which never fires for merely slow
loading — so large files had no escape hatch at all. `crossOrigin` only
ever existed to feed the ambient background's audio-reactive visualizer,
a decorative feature. Removed it from the default playback path entirely
— playback now always uses standard progressive loading, fast and
reliable regardless of file size. Trade-off, stated plainly: the ambient
background's audio reactivity will be muted/silent-ish rather than truly
reactive, since the Web Audio analyser needs CORS-clean media to read
real frequency data. It won't crash or error — `ensureAudioGraph` was
already wrapped in a try/catch for exactly this scenario — it'll just show
closer to idle motion. Reliable playback of your actual files matters
more than a decorative visual, so this is the right trade.

**Drag-and-drop tracks — found a real gating bug.** Track rows were only
draggable when `albums.length > 0`, meaning if you tried dragging before
an album existed (or in some other state where that check failed), it
silently did nothing — indistinguishable from "doesn't work." Tracks are
now always draggable on desktop regardless of album count, and rows show
an actual grab cursor now so it's visually obvious they can be dragged
(they didn't before, which was its own small gap in discoverability).

## This round: drag files from your computer to upload

**New — drag audio files in from your OS anywhere on the library or an
album page to upload them.** This is the native browser file-drag API
(`dragenter`/`dragover`/`drop`, reading `e.dataTransfer.files`) — entirely
separate from dnd-kit, which only handles dragging already-uploaded
tracks/albums around inside the app. The two don't conflict: OS file
drags carry a `Files` entry in `dataTransfer.types` that in-app drags
never do, so the drop zone only activates for real file drags. Dropping
on the library page uploads to Unsorted; dropping on an album page
uploads directly into that album.

Extracted the upload pipeline (presign → PUT → finalize → BPM/key
detection, duplicate-choice handling) out of `UploadButton` into a shared
`useTrackUpload` hook, so the button and the new drop zone run the exact
same tested logic rather than two copies of it. Verified the shared
pipeline still works correctly post-refactor against real Postgres.

## This round (v6.7): the actual BPM bug, duration self-heal, TrackDetail redesign

**Found the real BPM bug — confirmed by reproducing the crash, not
guessed.** `Math.max(...largeArray)` throws `RangeError: Maximum call
stack size exceeded` once the array is large enough to exceed the JS
engine's max argument count — and a real track's sample data (30s+ at a
real sample rate) is ~1.3 million elements, nowhere near safe. This threw
on every real upload, silently, explaining "never works, old or new"
completely. Reproduced the exact crash in isolation before touching any
code, fixed it with a plain loop (no size limit), and verified the fix
produces bit-for-bit identical results to the old method on safe input
while no longer throwing on realistic input.

**Duration self-heals now** — your own suggested fix. The player already
reads real duration from the browser's native audio decode
(`audio.duration` via `loadedmetadata`), completely independent of
whatever's stored in the database. Now, whenever that fires with a real
value that doesn't match what's stored, it patches the track right then.
Every track's duration fixes itself the next time it's played — no bulk
reprocessing needed. Verified the PATCH path against real Postgres:
`null` before, correct value after.

**Album hero gradient** — the vertical fade existed, but the left/right
edges had no fade at all, which is what actually read as abrupt. Added a
horizontal vignette to match.

**Change password** — built and fully verified end-to-end: wrong current
password rejected, correct one accepted, and the new password confirmed
to actually work for a subsequent login. Google-only accounts (no
password yet) get "Set a password" instead and skip the current-password
check, since there's nothing to verify against — this is the account's
own owner adding a second sign-in method to their own already-
authenticated account, not the cross-account-linking scenario `auth.ts`
guards against elsewhere.

**Duplicate — new feature, done properly.** A real server-side R2 copy
(`CopyObjectCommand`), not two database rows pointing at the same file —
sharing one file across two "copies" would mean deleting either one
deletes the underlying object out from under the other. Wired into both
the context menu and the new track panel. Verified the ownership/
existence checks against real data (a track that doesn't exist, and one
belonging to someone else, both correctly 404); the actual R2 copy
operation itself can't be verified without real Cloudflare credentials,
which aren't available here — that part is type-checked and reviewed,
not run against live storage.

**TrackDetail panel — fully rebuilt**, not patched. Grouped collapsible
rows (Share, Notes, BPM & Key, Lyrics, Add to queue, Download, Duplicate,
Delete) replacing the old always-expanded form layout, plus a static
deterministic waveform preview and a duration/key/BPM subtitle line.
Every existing feature carried over — nothing dropped in the rebuild.

**Version bumped to v6.7**, shown in Settings.

## This round: R2 cleanup fix, lyrics scroll/animation, album insights

**R2 files staying after deletion — real bug, found and fixed.** Key
extraction relied on an exact string match against the `R2_PUBLIC_URL`
env var; if that didn't precisely match what was actually stored in
`fileUrl` (trailing slash, custom domain vs r2.dev, anything), the
existing guard silently skipped R2 deletion with zero error logged
anywhere — files stayed in the bucket with no indication why. Replaced
with proper URL parsing (`new URL(fileUrl).pathname`), which correctly
extracts the object key regardless of domain format, and failures are
now logged instead of silent.

**Lyrics scroll was fully blocked, not glitching** — the container used
`overflow-hidden` for the transform-based auto-scroll, but nothing
handled wheel/touch input at all, so any attempt to manually scroll did
nothing. Added manual override: scrolling now directly adjusts position
and auto-follow pauses for ~2.5s, then resumes — the same pattern Apple
Music/Spotify use so browsing ahead doesn't get yanked back immediately.

**Lyrics sizing/animation** — the active line was a different font size
(`text-xl`) than inactive lines (`text-sm`), and that abrupt size jump
every time the highlighted line changed is what made the whole thing read
as jagged. Every line is now one consistent size; highlighting is
color/glow only. Also softened the scroll spring for a smoother feel.

**Album insights** — new `/api/albums/[id]/insights`, total plays and a
per-track breakdown, using data already being tracked. Verified against
real seeded play data: 4 total across two tracks, 3/1 split, correctly
sorted by play count. New three-dot menu on the album page (Insights, Add
to queue — the latter correctly appends to whatever's already playing
rather than restarting playback, unlike the existing Play button).

**On "by listener" insights specifically (from your reference image) —
this needs new work, not just UI.** Right now, only the track owner can
ever generate a play event at all — other accounts are blocked from
playing someone else's tracks by the isolation this app enforces
everywhere, and the public share page doesn't record plays at all. Real
per-listener attribution needs play-tracking added to the share page plus
making `play_events.user_id` nullable for anonymous visitors. Not
attempted this round — flagging the actual gap rather than shipping a
partial/misleading version of it.

## This round: mobile audit, PWA install prompt

**Mobile audit — found and fixed 3 real overflow risks.** Checked every
floating/dropdown element added across recent rounds for viewport-width
safety. `GoogleLinkToast` had no width constraint at all (`whitespace-
nowrap` on a fixed-width-less container — genuine horizontal-overflow
risk on narrow phones), `UploadButton`'s error banner was a fixed 288px
with no clamp, and the new album three-dot menu had the same gap. All
three now use the same `max-w-[calc(100vw-2rem)]` pattern already proven
on `SelectionToolbar`. Checked `TrackContextMenu`'s pixel-positioned
desktop menu too — already correctly gated behind `!isMobile`, so it
never runs below 768px in the first place; no fix needed there.

**PWA install prompt.** Real manifest (`manifest.json`, 192/512px icons
generated from the existing logo mark), wired into page metadata.
Detects iOS vs Android vs desktop via user agent, skips entirely if
already running standalone (installed) or previously dismissed
(localStorage). Android gets the real native install prompt (captures
`beforeinstallprompt`, triggers it on tap) — iOS Safari has no
programmatic install API at all, so it gets manual Share → Add to Home
Screen instructions instead, which is the actual ceiling of what's
possible there, not a shortcut.

**Caught a real bug while verifying this, not before shipping it:** the
middleware's auth matcher didn't exclude `manifest.json` or the icon
files, so unauthenticated requests for them (which is how a browser
actually fetches a manifest) got redirected to `/login` instead of the
real file — a login-page redirect isn't valid manifest JSON, so "add to
home screen" would have silently failed entirely despite everything else
being correct. Fixed the matcher, then re-verified both that the fix
works AND that it didn't accidentally weaken protection anywhere else
(confirmed actual protected routes still correctly redirect).

**On notifications** — clarified the model (you get notified about
changes *someone else* makes to something *they* shared with *you*, not
collaborative editing of your own library). Two open questions before
building: which events should notify (adds/removes only, or also plays —
the latter could get noisy), and whether "shared with me" activates the
moment a logged-in user opens a share link, or requires the owner to pick
a specific recipient. Not started pending those answers.

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
