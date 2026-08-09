"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { useAmbient } from "./AmbientProvider";
import { useTheme } from "./ThemeProvider";
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

const DEFAULT_TRANSITION_MS = 1200; // manual skip/jump, no crossfade in progress
const RETARGET_CATCHUP_MS = 500;    // if the real color resolves mid-flight, correct over this long instead of snapping

export default function AmbientBackground({ scoped = false }: { scoped?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const { getFrequencyData, isPlaying, current, currentTime, crossfadingToTrack, preloadingTrack, crossfadeDuration } = usePlayer();
  const { enabled, colorStateRef } = useAmbient();
  const { theme } = useTheme();
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

    const draw = () => {
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

      // Three blobs, positioned to actually spread left/center/right (the
      // old x: 0.3 / 0.7 / 0.5 set put two of three in the left-center
      // and only one on the right, reading as left-heavy) and vertically
      // centered within the mask's now-centered 25%-75% visible band
      // (previously all three sat at y: 1.05-1.15, i.e. below the
      // viewport entirely, relying on radius bleed to reach up into a
      // bottom-weighted mask — that stopped working once the mask became
      // symmetric, which is why the color read as squeezed into the
      // middle only). Color also rebalanced: two blobs used `from` and
      // only one used `to` before, which visually favored `from`'s hue —
      // now left/right anchor the two sampled colors and center blends
      // both, so no single color visually dominates.
      const blended = lerpHex(displayed.from, displayed.to, 0.5);
      const blobs = [
        { x: w * 0.18 + Math.sin(t) * 60, y: h * (0.5 - bass * 0.08), r: w * (0.34 + pulse * 0.46 + bass * 0.08), color: displayed.from },
        { x: w * 0.82 + Math.cos(t * 0.8) * 80, y: h * (0.5 - mid * 0.06), r: w * (0.3 + pulse * 0.26 + mid * 0.06), color: displayed.to },
        { x: w * 0.5 + Math.sin(t * 1.3) * 70, y: h * (0.5 + Math.cos(t * 0.6) * 0.08), r: w * (0.4 + pulse * 0.34 + bass * 0.05), color: blended },
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
        maskImage: "linear-gradient(to bottom, transparent 0%, transparent 25%, black 50%, black 50%, transparent 75%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 25%, black 50%, black 50%, transparent 75%, transparent 100%)",
      }}
    />
  );
}
