# SONIQ Handoff — v8.15.0 (continuing from v8.14.0)

Vish is building SONIQ (soniq.lol). No em dashes ever. Direct, terse. Real zips over prose. Root causes, not symptom patches. Independent judgment over check-ins.

## MANDATORY VERSIONING RULE
`lib/version.ts` `APP_VERSION` must always match the zip name. Decimal bump for small fixes, minor bump for features. Carry this rule forward in every future handoff.

---

## Session summary: v8.14.0 -> v8.15.0

### Discovery: v8.14.0 zip was internally inconsistent
The handoff claimed server-side snippet rendering (real ffmpeg mux, `@napi-rs/canvas`) was live and verified end-to-end. The actual zip contents didn't match: no `app/api/snippets/render/route.ts`, no server deps in `package.json`, `lib/useSnippetExport.ts` was still the pre-8.13 client-side MediaRecorder version. `lib/version.ts` said 8.13.0 in the first zip Vish sent. A corrected v8.14.0 zip was provided afterward that did contain the real server-render implementation.

### Decision: revert server-side rendering, stay on Vercel Hobby
The real server-render pipeline requires Vercel Pro (`maxDuration=300`, but Hobby hard-caps at 10s regardless of code). Vish confirmed Hobby-only, no Pro. Options discussed: (A) offload to a second free-tier host (Render/Fly) as a worker, (B) shrink renders to fit under 10s, (C) revert to client-side rendering and accept the premium gate is UI-enforced only. **Vish chose C**, with one addition: locked templates still preview for free users (not hidden entirely) but sit behind a blocking overlay so the preview can't be screen-recorded and lifted clean.

### What changed this session

**Revert (server -> client render):**
- Deleted `app/api/snippets/render/route.ts`, `lib/audioFrequencyEnvelope.ts`
- Removed `@napi-rs/canvas`, `ffmpeg-static`, `fluent-ffmpeg`, `@types/fluent-ffmpeg` from `package.json`; removed the matching entries from `next.config.js`'s `serverComponentsExternalPackages`
- `lib/useSnippetExport.ts` restored to canvas + MediaRecorder + captureStream, same approach as pre-8.13, now with a `spinSpeed` param added (see below)
- `components/snippet/NewSnippetModal.tsx`: premium templates still render in the live preview for free users, but sit under a 50% black + blur overlay with a lock icon and upgrade copy. Export button stays disabled regardless. This is a real UX decision, not a security boundary — it's a deterrent against casual screen-recording, not a hard block. **Standing fact going forward: the premium snippet gate is UI-only, not server-enforced. This is a deliberate tradeoff Vish made, not an oversight — don't "fix" it back to server-side without him asking.**

**Bug list from v8.14.0 handoff — status:**

1. **Edit sheet scroll (fixed)** — root cause was `PlayerPopover.tsx`'s outer container using `overflow-hidden` while relying on a nested `h-full` element to create a scrollable region that never had a real height to inherit (the popover itself is `max-h-[420px]` with content-based sizing, not a fixed height). Changed the popover's own overflow to `overflow-y-auto` so it's the scroll container directly, regardless of how the inner flex/height chain resolves.

2. **Stem icons (fixed)** — `StemsPanel.tsx` now uses `Mic2` (vocals), `Drum` (drums), `Guitar` (bass), `Layers` (other) instead of the same `AudioLines` glyph repeated four times.

3. **EQ redesign (fixed)** — expanded 3-band to 5-band (low / low-mid / mid / high-mid / high), matching Apple Music/Spotify convention per Vish's explicit ask. This touched more than the panel:
   - `lib/db/schema.ts`: added `eqLowMid`, `eqHighMid` columns
   - `scripts/init-db.js`: added the matching `ALTER TABLE` statements **in the same commit**, per the standing lesson from the v8.12.1 production incident — schema.ts and this script are not the same mechanism and must be updated together
   - `app/api/tracks/[id]/route.ts`: PATCH allowlist updated with the two new fields
   - `components/PlayerProvider.tsx`: audio graph now builds a 5-filter BiquadFilterNode chain per element (lowshelf -> peaking -> peaking -> peaking -> highshelf), `eq` state/type/setEQ signature all expanded
   - `components/player/EQPanel.tsx`: rebuilt — smooth curved line (Catmull-Rom -> bezier conversion) instead of straight segments, filled area under the curve at 40% opacity accent orange, line itself accent orange (was black/primary)
   - **Run `npm run db:push` after deploying this** — new columns won't exist in production otherwise.

4. **Adjust tab redesign (fixed, tangled with #6 as expected)** — the old tab had a plain seek waveform and a speed slider with no way to mark a region despite `trimStart`/`trimEnd` already existing as real DB columns with nothing in the UI ever writing to them. Rebuilt around a real trim/region selector (see #6).

5. **Snippet vinyl spin speed (fixed)** — `SnippetRenderContext` gained a `spinSpeed` field (default 1, range 0.5x-2x in the UI), multiplies the rotation rate in `drawVinyl` (`lib/snippetRenderers.ts`). Slider added to `NewSnippetModal.tsx`.

6. **Shared trim/region selector (fixed)** — new `components/WaveformTrimSelector.tsx`: draggable start/end handles plus a draggable region body, waveform bars dimmed outside the selected region, accent-orange styling. Used in both:
   - `AdjustPanel.tsx` — persists to the real `trimStart`/`trimEnd` columns via the same debounced-PATCH pattern already used for EQ (400ms), full track length, "Reset" button
   - `NewSnippetModal.tsx` — session-only (not persisted), capped to `MAX_SNIPPET_SEC` (30s) via the component's `maxWindowSec` prop
   
   One component, one interaction model, per Vish's explicit call that these shouldn't be two separate trim UIs.

7. **Snippet export design pass (partially addressed)** — options (disc/background/spin/album art) and the trim selector are now grouped into `bg-elevated border border-border rounded-xl` cards, matching the block style `AdjustPanel`/`EQPanel` already use, instead of a loose stack of rows. **This is a lighter pass than a full redesign** — didn't touch the template carousel styling, the header bar, or do a genuine visual-identity pass (typography, spacing rhythm) beyond making it consistent with existing panel conventions. Flag if Vish wants more here.

8. **Drop artist name from snippet overlay (fixed)** — removed from `drawTrackInfo` and `renderTypeWave` in `lib/snippetRenderers.ts`. `trackArtist` field removed entirely from `SnippetRenderContext` and all callers (was becoming dead weight, cleaner to remove than pass empty strings around).

9. **Desktop-only mobile screen redesign (fixed)** — `SnippetDesktopOnlyModal.tsx` rebuilt with the dark gradient hero treatment (`#1a1a1a` -> `#050505`, matching Depth Vinyl's own background) instead of a flat neutral card, `Laptop2` icon in an accent-tinted circle, same copy Vish confirmed was correct.

10. **Landing page** — not started, per Vish's own explicit order of operations (hold until bug list confirmed stable). Correctly out of scope this session.

**Known gap left open:** the premium-upgrade CTA inside the snippet lock overlay doesn't link anywhere. `SettingsModal` (which has the billing tab) opens via local state inside `LibraryHome.tsx`, not a route — there's no clean way to trigger it from `NewSnippetModal` without prop-drilling a callback down through `TrackContextMenu`. Left as text-only guidance ("Upgrade from Settings -> Billing") rather than ship a broken `window.location.href` link. If Vish wants a real button here, this needs a callback threaded down from wherever `SettingsModal`'s open-state lives.

---

## Standing invariants (carried forward, still true)
- No em dashes in responses to Vish, ever
- **`scripts/init-db.js` must be updated alongside any `lib/db/schema.ts` change** — this is the actual migration mechanism, not `drizzle-kit push`. Root cause of a real production incident once already, took it seriously again this session with the EQ column additions.
- Server-to-server callback routes (webhooks, cron) need BOTH a public-paths entry in `auth.config.ts` AND independent auth inside the route
- Full-body try/catch on API routes handling anything that could throw unhandled
- Nothing outside `PlayerProvider.tsx` should set `audio.src`/`.load()`/`.play()`/`playbackRate`/`preservesPitch` for track-change purposes — the snippet export's own dedicated audio elements are a deliberate, separate, acceptable exception
- The PATCH `/api/tracks/[id]` route uses an explicit field allowlist — new per-track fields need to be added there too (now includes `eqLowMid`, `eqHighMid`)
- Vinyl brand assets are `public/brand/vinyl-{white,black,orange}.png` — canonical, real cutouts, don't regenerate or substitute without Vish's explicit say-so
- Mobile player (Queue/Notes/Lyrics/Edit) has full parity with desktop as of v8.11.0 — Edit gets the complete toolset, nothing trimmed
- Snippet export is desktop-only (originally a MediaRecorder/Safari reliability concern, still true now that we're back on client-side rendering — the guard stays)
- **Snippet export renders 100% client-side again as of v8.15.0.** Server-side rendering was built (v8.13/8.14), verified working, then deliberately reverted because it requires Vercel Pro and Vish is staying on Hobby. The premium template gate is UI-only, not server-enforced — this is a known, accepted tradeoff, not a bug to silently "fix" back.
- EQ is now 5-band (low/lowMid/mid/highMid/high), not 3-band. Any code still assuming 3 bands is stale.
- Before trusting any future handoff's claims about what's "verified end-to-end," diff the actual zip contents against the claims — this session started by catching a handoff that didn't match its own zip.
