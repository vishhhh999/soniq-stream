"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "./PlayerProvider";
import { useAmbient } from "./AmbientProvider";
import { useTheme } from "./ThemeProvider";
import { useIsMobile } from "@/lib/useMediaQuery";
import { gradientFromSeed, gradientFromImage, peekImageGradient } from "@/lib/gradient";

type Gradient = { from: string; to: string };

// Linear RGB interpolation between two hex colors — "good enough" for a
// screen-blended ambient blob, matches the same quality bar as the image
// color sampling elsewhere in this file (not perceptually-uniform, just
// visually smooth).
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

// Shifts a hex color's hue by a small, fixed delta (degrees) while keeping
// saturation/lightness the same — used so the ambient gradient stays a
// single hue FAMILY instead of two visibly distinct colors. Per explicit
// direction: adjacent hues only (toward cyan/blue if the source is warm,
// toward yellow/lime if it's cool), never an unrelated second color.
function hexHue(hex: string): number {
  const p = parseInt(hex.slice(1), 16);
  const r = ((p >> 16) & 255) / 255, g = ((p >> 8) & 255) / 255, b = (p & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return h;
}

function shiftHue(hex: string, degrees: number): string {
  const p = parseInt(hex.slice(1), 16);
  const r = ((p >> 16) & 255) / 255, g = ((p >> 8) & 255) / 255, b = (p & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = (hexHue(hex) + degrees + 360) % 360;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r2, g2, b2] = [0, 0, 0];
  if (h < 60) [r2, g2, b2] = [c, x, 0];
  else if (h < 120) [r2, g2, b2] = [x, c, 0];
  else if (h < 180) [r2, g2, b2] = [0, c, x];
  else if (h < 240) [r2, g2, b2] = [0, x, c];
  else if (h < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

const DEFAULT_TRANSITION_MS = 1200; // manual skip/jump, no crossfade in progress
const RETARGET_CATCHUP_MS = 500;    // if the real color resolves mid-flight, correct over this long instead of snapping

export default function AmbientBackground({ scoped = false }: { scoped?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const { getFrequencyData, isPlaying, current, currentTime, crossfadingToTrack, preloadingTrack, crossfadeDuration } = usePlayer();
  const { enabled, colorStateRef } = useAmbient();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  // Ref, same reasoning as themeRef below — the draw loop's setup effect
  // only depends on [enabled, isPlaying, getFrequencyData], so reading
  // mobile-ness via a ref lets a resize/orientation change take effect on
  // the next frame without tearing down the whole canvas/noise-pool setup.
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  // Ref, not a direct closure value, because the draw loop's effect only
  // re-runs on [enabled, isPlaying, getFrequencyData] (see its own comment
  // about avoiding teardown-on-every-change) — reading theme via a ref lets
  // a light/dark toggle take effect on the very next frame without forcing
  // that whole effect (and its noise-pool setup, resize listener, etc.) to
  // tear down and rebuild.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const tRef = useRef(0);

  // The gradient the draw loop actually paints each frame is the result of
  // interpolating from `fromColors` to `toColors` over `transitionMs`,
  // starting at `transitionStartRef`. All refs (not state) because the draw
  // loop reads them every frame and nothing in this component's JSX depends
  // on them — using state here previously caused the whole animation effect
  // to tear down and rebuild on every track change.
  const fromColorsRef = useRef<Gradient>({ from: "#888888", to: "#444444" });
  const toColorsRef = useRef<Gradient>({ from: "#888888", to: "#444444" });
  const transitionStartRef = useRef(0);
  const transitionMsRef = useRef(DEFAULT_TRANSITION_MS);
  // The color actually on screen right now — becomes the new "from" the
  // next time a transition starts, so back-to-back track changes (e.g.
  // skipping twice quickly) blend from wherever the gradient currently is,
  // not from a stale pre-transition value.
  const currentDisplayedRef = useRef<Gradient>({ from: "#888888", to: "#444444" });

  const beginTransition = (target: Gradient, durationMs: number) => {
    fromColorsRef.current = currentDisplayedRef.current;
    toColorsRef.current = target;
    transitionStartRef.current = performance.now();
    transitionMsRef.current = Math.max(1, durationMs);
  };

  // Corrects the transition's destination without snapping — used when an
  // async color sample resolves after a transition already started toward
  // a provisional guess. Restarts the interpolation from wherever the
  // gradient currently sits, over a short catch-up window, instead of
  // yanking `toColorsRef` directly (which was the actual cause of the
  // "flash" — the displayed color would jump instantly to the corrected
  // target on whatever frame the promise happened to resolve, regardless
  // of how far through the original transition it was).
  const retarget = (target: Gradient) => {
    beginTransition(target, RETARGET_CATCHUP_MS);
  };

  // Warm the color cache well before it's needed — mirrors PlayerProvider's
  // own audio preloading (which starts ~30s before a crossfade). Previously
  // nothing sampled the upcoming track's cover art until the crossfade
  // itself started, so that decode-and-sample work landed right at the
  // exact moment of the audio swap, and the transition had to guess with a
  // seed color and correct itself moments later — both of which showed up
  // as a visible flash right when the crossfade began. Firing this early
  // means the cache is already warm by the time it's actually needed.
  useEffect(() => {
    if (!preloadingTrack?.albumCoverUrl) return;
    if (peekImageGradient(preloadingTrack.albumCoverUrl) !== undefined) return; // already cached
    gradientFromImage(preloadingTrack.albumCoverUrl); // fire and forget — just populates the cache
  }, [preloadingTrack?.albumCoverUrl]);

  // Crossfade-synced transition: the instant PlayerProvider starts ramping
  // audio gain toward the next track, kick off a gradient transition of the
  // SAME duration, so by the time the audio swap completes the colors have
  // already fully arrived.
  useEffect(() => {
    if (!crossfadingToTrack) return;
    let cancelled = false;

    const cachedCover = crossfadingToTrack.albumCoverUrl
      ? peekImageGradient(crossfadingToTrack.albumCoverUrl)
      : undefined;

    if (cachedCover) {
      // Common case now that preloading warms this ~30s ahead — the real
      // color is already known, so this is the ONLY transition that runs
      // for this track change, no guess-then-correct needed at all.
      beginTransition(cachedCover, crossfadeDuration * 1000);
    } else {
      beginTransition(gradientFromSeed(crossfadingToTrack.id), crossfadeDuration * 1000);
      if (crossfadingToTrack.albumCoverUrl) {
        gradientFromImage(crossfadingToTrack.albumCoverUrl).then((imgGradient) => {
          if (cancelled || !imgGradient) return;
          retarget(imgGradient); // smooth correction, not a snap
        });
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfadingToTrack?.id]);

  // Normal (non-crossfade) track change — manual skip, jump, first play.
  useEffect(() => {
    if (!current || crossfadingToTrack) return;
    let cancelled = false;

    const cachedCover = current.albumCoverUrl ? peekImageGradient(current.albumCoverUrl) : undefined;

    if (cachedCover) {
      beginTransition(cachedCover, DEFAULT_TRANSITION_MS);
    } else {
      beginTransition(gradientFromSeed(current.id), DEFAULT_TRANSITION_MS);
      if (current.albumCoverUrl) {
        gradientFromImage(current.albumCoverUrl).then((imgGradient) => {
          if (!cancelled && imgGradient) retarget(imgGradient);
        });
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.albumCoverUrl]);

  // Seeking within a track — read every frame by the draw loop via a ref so
  // a manual scrub is detected as a sudden jump in currentTime, distinct
  // from normal continuous playback advancing a fraction of a second per
  // frame. On a big jump, the beat-detection rolling average gets reset:
  // previously it kept averaging bass energy from wherever you scrubbed
  // FROM, so the reactive pulse felt disconnected from the music for a
  // couple of seconds after a seek — it was comparing the new position's
  // energy against a stale average from a completely different part of
  // the track. Resetting lets it recalibrate to the new position immediately.
  const currentTimeRef = useRef(0);
  const seekResetRef = useRef(false);
  useEffect(() => {
    const prev = currentTimeRef.current;
    if (Math.abs(currentTime - prev) > 1.5) {
      seekResetRef.current = true; // consumed by the draw loop on its next frame
    }
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Pre-generated pool of noise tiles cycled through, instead of
    // rebuilding one from raw random pixels repeatedly — same flicker
    // look, far less continuous CPU cost.
    const NOISE_POOL_SIZE = 4;
    const buildNoiseTile = () => {
      const tile = document.createElement("canvas");
      tile.width = 128;
      tile.height = 128;
      const tctx = tile.getContext("2d")!;
      const imgData = tctx.createImageData(128, 128);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const v = Math.random() * 255;
        imgData.data[i] = v;
        imgData.data[i + 1] = v;
        imgData.data[i + 2] = v;
        imgData.data[i + 3] = 14;
      }
      tctx.putImageData(imgData, 0, 0);
      return tile;
    };
    const noisePool = Array.from({ length: NOISE_POOL_SIZE }, buildNoiseTile);
    let noiseIndex = 0;
    let noiseAge = 0;

    // Beat-onset detection: track a rolling average of bass energy and treat
    // a sudden spike above it as a "hit" — this is what makes the gradient
    // actually feel synced to the music instead of just smoothly (and
    // sluggishly) tracking raw amplitude.
    const bassHistory: number[] = [];
    let pulse = 0;
    let lastPulseTime = 0;

    let frameSkip = 0;
    const draw = () => {
      // Mobile: render every other frame (~30fps instead of 60fps) — still
      // reschedules on every rAF tick so the throttle stays smooth and
      // responsive, just skips the actual (expensive) draw work half the
      // time. Desktop is unaffected, frameSkip only increments/gates when
      // isMobileRef.current is true.
      if (isMobileRef.current) {
        frameSkip++;
        if (frameSkip % 2 !== 0) {
          rafRef.current = requestAnimationFrame(draw);
          return;
        }
      }

      const w = window.innerWidth;
      const h = window.innerHeight;
      tRef.current += 0.006;
      const t = tRef.current;
      const now = performance.now();

      ctx.clearRect(0, 0, w, h);

      // A big seek jump was flagged since the last frame — clear the stale
      // rolling average so beat detection recalibrates to the new position
      // instead of comparing against energy from wherever playback used to be.
      if (seekResetRef.current) {
        bassHistory.length = 0;
        seekResetRef.current = false;
      }

      // Advance the color transition and read the currently-displayed color.
      const elapsed = now - transitionStartRef.current;
      const progress = Math.min(1, elapsed / transitionMsRef.current);
      const displayed: Gradient = progress >= 1
        ? toColorsRef.current
        : {
            from: lerpHex(fromColorsRef.current.from, toColorsRef.current.from, progress),
            to: lerpHex(fromColorsRef.current.to, toColorsRef.current.to, progress),
          };
      currentDisplayedRef.current = displayed;

      let bass = 0.15;
      let mid = 0.1;
      if (isPlaying) {
        const freq = getFrequencyData();
        if (freq) {
          // fftSize is 256 (see PlayerProvider), giving 128 bins at
          // ~172Hz/bin at a standard 44.1kHz sample rate. The old range
          // (bins 0-8, i.e. 0-1378Hz) was actually capturing low-mids and
          // kick transients, not bass — true sub-bass/bass sits in roughly
          // 20-250Hz, which is only bins 0-1 at this resolution. Widened
          // slightly to bins 0-2 (~0-516Hz) purely for signal stability —
          // 1-2 raw bins are too noisy on their own to average meaningfully
          // — while staying anchored to the actual bass range instead of
          // drifting into low-mid/kick-transient territory like before.
          const bassBins = freq.slice(0, 3);
          const midBins = freq.slice(3, 24); // roughly 516Hz-4.1kHz, true mids
          bass = (bassBins.reduce((a, b) => a + b, 0) / bassBins.length / 255) * 0.9 + 0.1;
          mid = (midBins.reduce((a, b) => a + b, 0) / midBins.length / 255) * 0.7 + 0.08;

          bassHistory.push(bass);
          if (bassHistory.length > 40) bassHistory.shift();
          const avgBass = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

          // Debounced so a single sustained hit doesn't re-trigger every
          // frame — ~180ms minimum gap between pulses, roughly matching the
          // fastest beats a listener perceives as distinct hits rather than
          // a single sustained sound. Skipped for the first couple of
          // samples after a reset (bassHistory.length < 4) since an average
          // of 1-2 samples is too noisy to compare against meaningfully.
          // Threshold loosened (1.35x -> 1.2x avg, 0.3 -> 0.22 floor) and
          // the reacted pulse strength increased below — true bass energy
          // is generally lower-amplitude than the old wider band was
          // reading, so the old thresholds were tuned for a signal that's
          // no longer what's being measured.
          if (bassHistory.length >= 4 && bass > avgBass * 1.2 && bass > 0.22 && now - lastPulseTime > 180) {
            pulse = 1;
            lastPulseTime = now;
          }
        }
      }
      pulse *= 0.87; // decay — fades to near-zero within ~250-300ms

      // Publish this frame's color + pulse for anything outside this
      // canvas to read (scrubber fill, play-button glow, modal backdrops).
      // Ref write only, no re-render triggered — consumers read this off
      // their own rAF loop the same way this component reads player state.
      colorStateRef.current = { from: displayed.from, to: displayed.to, pulse };

      // Bottom-only now, not centered — and single-hue-family, not two
      // visibly distinct colors. `to` is no longer a separately-sampled
      // second hue; it's a shifted version of `from` (toward cyan/blue if
      // warm, or toward yellow/lime if cool — i.e. always an adjacent hue,
      // never a jump to an unrelated color), so all three blobs read as
      // one gradient family, not two competing colors. Radius is capped
      // relative to h (height) instead of w (width) — sizing off width on
      // a wide/short viewport let the blob bleed vertically well past the
      // masked band regardless of where its center sat, which is the
      // actual reason color was visible outside the intended region.
      // Direction depends on the source hue's warmth, not a fixed shift —
      // a warm color shifts toward cyan/blue, a cool color shifts toward
      // yellow/lime, per explicit direction: adjacent hue only, whichever
      // direction is "away from itself" rather than always the same turn.
      const srcHue = hexHue(displayed.from);
      const isWarm = srcHue < 90 || srcHue > 300; // reds/oranges/yellows/magentas
      const shifted = shiftHue(displayed.from, isWarm ? 30 : -30);
      const maxR = h * 0.55; // hard cap so blobs can't bleed past the bottom-only mask band below
      // Mobile drops the third (center) blob — 2 blobs instead of 3 is a
      // real per-frame cost reduction (each is a radial gradient fill),
      // and left+right alone still reads as the same gradient family.
      const blobs = [
        { x: w * 0.22 + Math.sin(t) * 50, y: h * (1.02 - bass * 0.05), r: Math.min(maxR, w * 0.3 + pulse * w * 0.12 + bass * w * 0.04), color: displayed.from },
        { x: w * 0.78 + Math.cos(t * 0.8) * 60, y: h * (1.05 - mid * 0.04), r: Math.min(maxR, w * 0.26 + pulse * w * 0.08 + mid * w * 0.03), color: shifted },
        ...(isMobileRef.current ? [] : [
          { x: w * 0.5 + Math.sin(t * 1.3) * 60, y: h * 1.08, r: Math.min(maxR, w * 0.34 + pulse * w * 0.1 + bass * w * 0.03), color: displayed.from },
        ]),
      ];

      // Blend mode is theme-aware, not fixed to "screen" — screen only
      // brightens, so it did nothing against a light background and read
      // as nearly invisible whenever the ambient color itself was dark
      // (dark cover art on dark theme, or vice versa on light theme,
      // exactly the cases flagged as "not prominent enough"). Multiply
      // darkens instead, which is the correct direction against a light
      // background — a colored blob needs to visibly deepen a light canvas
      // the way it visibly brightens a dark one.
      ctx.globalCompositeOperation = themeRef.current === "light" ? "multiply" : "screen";
      for (const b of blobs) {
        try {
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          grad.addColorStop(0, b.color);
          grad.addColorStop(0.5, b.color + "88");
          grad.addColorStop(1, "transparent");
          // Floor raised (0.28 -> 0.42) — the ambient effect was reading
          // as too subtle across the board, not just in the dark/light
          // mismatch cases the blend-mode fix above addresses.
          ctx.globalAlpha = 0.42 + pulse * 0.5;
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
        } catch (err) {
          console.error("Ambient background: skipping malformed color", b.color, err);
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // Skipped entirely on mobile — a full-viewport pattern fill is real
      // per-frame cost for a subtle texture flourish that reads much less
      // noticeably on a smaller phone screen anyway.
      if (!isMobileRef.current) {
        noiseAge++;
        if (noiseAge > 6) {
          noiseIndex = (noiseIndex + 1) % noisePool.length;
          noiseAge = 0;
        }
        const pattern = ctx.createPattern(noisePool[noiseIndex], "repeat");
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fillRect(0, 0, w, h);
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, isPlaying, getFrequencyData]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={scoped ? "absolute inset-0 pointer-events-none z-0" : "fixed inset-0 pointer-events-none z-0"}
      style={scoped ? undefined : {
        maskImage: "linear-gradient(to bottom, transparent 0%, transparent 45%, black 70%, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 45%, black 70%, black 100%)",
      }}
    />
  );
}
