# SONIQ Handoff — v8.17.0 (continuing from v8.16.2)

Vish is building SONIQ (soniq.lol). No em dashes ever. Direct, terse. Real zips over prose. Root causes, not symptom patches. Independent judgment over check-ins.

## MANDATORY VERSIONING RULE
`lib/version.ts` `APP_VERSION` must always match the zip name. Decimal bump for small fixes, minor bump for features. Carry this rule forward in every future handoff.

---

## This session: snippet export polish, save-to-library, landing page refresh, lyrics weight

### Snippet export -- controls disabled during export + double-audio bug fixed
Two real bugs, not cosmetic:
- **Double audio during export**: the live preview has its own always-playing `Audio` element; `useSnippetExport`'s `start()` spins up a completely separate one to actually render. Nothing paused the preview when export began, so both played simultaneously. Fixed in `NewSnippetModal.handleExport` -- calls `setPreviewPlaying(false)` before starting the export.
- **Controls stayed interactive mid-export**: changing template/colors/spin/trim while a render was in flight had zero effect on the output already being captured, but nothing indicated that. Template carousel, options card, and trim card in `NewSnippetModal.tsx` now get `opacity-40 pointer-events-none` while `exportState.exporting` is true. Play/pause and mute buttons in the header get `disabled` too.
- **Stale-closure fixes while in there**: the preview's `draw()` loop closed over `previewPlaying` and `trackDuration` from whenever the effect last ran, not their live values (the effect's dependency array doesn't include either). Fixed with `previewPlayingRef`/`trackDurationRef`, read inside the loop instead of the closed-over state. Practical effect: pausing right at a loop boundary, or `trackDuration` backfilling asynchronously from `loadedmetadata` on tracks with no saved `durationSec`, now behave correctly instead of occasionally showing stale values.

**Known limitation, not fixed this session**: `getFrequencyData()` (used by Pulse Grid and Type Wave's audio-reactive bars) reads off the *main app player's* analyser node, both in the live preview and during actual export -- not a local analyser tied to the snippet's own audio. If the main player isn't playing this track while you're in the snippet modal, those two templates render flat/incorrect bars. Real fix needs a dedicated `AnalyserNode` wired to the preview/export audio elements specifically. Flagging it, didn't have room to build it properly this session.

### Save trim to library (real feature, not download-only anymore)
`AdjustPanel.tsx` gained a **Save to library** button next to Download. Goes through the same `presign -> PUT -> finalize` pipeline every other upload in the app uses (`app/api/upload/presign`, `app/api/upload/finalize`) -- just fed a client-generated WAV `Blob` (from the existing `exportTrimmedAudio`) instead of a file the person picked. Lands in the same album as the source track if it has one, titled `"<title> (trim)"`, always saved as `independent: true` (a new track, not grouped as a version of the original -- it's a derived clip, not a new take).

**Known gap**: no refetch/refresh signal fires anywhere after a successful save. The new track exists for real in the DB and R2, but won't show up in whatever library/album view is currently open until the person navigates away and back or reloads. There's no existing "a track was created, please refetch" event bus in the app to hook into -- would need one built (a `window` CustomEvent + listeners in `LibraryHome`/album page, same pattern as `settingsBus.ts`) if this needs to feel instant. Didn't build it this session, flagging instead of quietly shipping something that looks broken.

### Landing page refresh
- **Hero rebuilt** around the real canonical brand asset (`public/brand/vinyl-black.png`), same dark gradient (`#1a1a1a` -> `#050505`) and ambient-shadow treatment as the Depth Vinyl snippet template, slow continuous rotation via `framer-motion`. This is the "push the vinyl-based visual direction into the landing page" item from the standing invariants, finally done.
- **Feature grid expanded** from 6 to 8 cards -- added "A real mixing toolkit, not a toy" (EQ/stems/varispeed/metronome/tuner) and "Turn a moment into a share" (snippet export), both genuinely new capabilities that didn't exist when the original landing page copy was written.
- Sign-in link inside the now-dark hero restyled for a dark background (`text-white/70 border-white/20`) -- it was using the light-mode `text-secondary`/`border-border` tokens before, which would've been close to invisible against the new dark section.
- **What this pass did NOT touch**: the data-use/OAuth-disclosure section, the collaboration callout, pricing, footer, legal links. Those stay as they were -- correct, not stale, no reason to touch them. If Vish wants the vinyl treatment carried further into those sections too, that's a next-round ask, not assumed here.

### Lyrics text weight
`SyncedLyricsList.tsx`: fullscreen variant now renders at `font-semibold` (was `font-medium`, same as the sidebar variant). Sidebar variant unchanged. `LyricsPanel.tsx`'s plain-text (unsynced) fallback also bumped to `font-medium` (was no weight class at all, i.e. `font-normal`) for consistency -- that path is fullscreen-only now too (both `LyricsFullscreen` on desktop and `MobilePlayerBar` on mobile).

---

## Standing invariants (carried forward, still true)
- No em dashes in responses to Vish, ever
- `scripts/init-db.js` must be updated alongside any `lib/db/schema.ts` change -- this is the actual migration mechanism, not `drizzle-kit push`
- Server-to-server callback routes (webhooks, cron) need BOTH a public-paths entry in `auth.config.ts` AND independent auth inside the route
- Full-body try/catch on API routes handling anything that could throw unhandled
- Nothing outside `PlayerProvider.tsx` should set `audio.src`/`.load()`/`.play()`/`playbackRate`/`preservesPitch` for track-change purposes -- the snippet export's own dedicated audio elements are a deliberate, separate, acceptable exception
- The PATCH `/api/tracks/[id]` route uses an explicit field allowlist -- new per-track fields need to be added there too
- Vinyl brand assets are `public/brand/vinyl-{white,black,orange}.png` -- canonical, real cutouts, don't regenerate or substitute without Vish's explicit say-so. Now used on the landing page too, not just inside the app and snippet exports.
- Mobile player (Queue/Notes/Lyrics/Edit) has full parity with desktop -- Edit gets the complete toolset, nothing trimmed
- Snippet export renders 100% client-side (reverted from server-side in v8.15.0, staying on Vercel Hobby, confirmed again this session -- still no Pro plan). Premium gate is UI-only, not server-enforced. Known, accepted tradeoff.
- EQ is 5-band (low/lowMid/mid/highMid/high), not 3-band
- **Any `position: fixed` modal rendered from inside `PlayerBar`'s component tree MUST be portaled to `document.body`.** `PlayerBar`'s own outer wrapper uses a CSS transform (`-translate-x-1/2`) to center its floating pill, and any transformed ancestor becomes the containing block for `position: fixed` descendants -- caught this exact bug with `EditDialog` in v8.16.2 (rendered trapped inside the pill's box instead of covering the viewport). `NewSnippetModal`, `LyricsFullscreen`, `SnippetDesktopOnlyModal`, and now `EditDialog` all portal correctly. Anything new added inside `PlayerBar` needs the same treatment.
- `settingsBus.ts` pattern (a plain `window` CustomEvent pub/sub) is the established way to let a deeply-nested component trigger something in a globally-mounted component without prop-drilling. Reach for the same pattern if a "refetch the library after X" signal ever needs building.

## v8.17.1 — Duration split into its own entity

- **Duration is now its own thing, not a caption hanging off the title.** `drawTrackInfo` in `lib/snippetRenderers.ts` split into `drawTitle` + `drawDuration`, each with its own color and its own font treatment. The combined `drawTrackInfo` wrapper (used by vinyl-rise, vinyl-edge, depth-vinyl, pulse-grid, orbit) now puts 48px between them (was 32px). `renderTypeWave` calls `drawDuration` directly with 36px of gap under its title block (was 20px).
- **Independent color picker** — new `durationColor: TextColor` field alongside `textColor` in `SnippetRenderContext`, threaded through `useSnippetExport`'s `ExportOptions` the same way `textColor` already was. New "Duration" swatch row in `NewSnippetModal.tsx`, same dark/light/orange pattern as Text, defaults to `light`.
