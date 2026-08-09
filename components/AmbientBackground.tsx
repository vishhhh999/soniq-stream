"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { useAmbient } from "./AmbientProvider";
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

export default function AmbientBackground({ scoped = false }: { scoped?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const { getFrequencyData, isPlaying, current, crossfadingToTrack, crossfadeDuration } = usePlayer();
  const { enabled } = useAmbient();
  const tRef = useRef(0);

  // The gradient the draw loop actually paints each frame is the result of
  // interpolating from `fromColors` to `toColors` over `transitionMs`,
  // starting at `transitionStartRef`. All refs (not state) because the draw
  // loop reads them every frame and nothing in this component's JSX depends
  // on them — using state here previously caused the whole animation effect
  // to tear down and rebuild on every track change (see below).
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

  // Crossfade-synced transition: the instant PlayerProvider starts ramping
  // audio gain toward the next track, kick off a gradient transition of the
  // SAME duration, so by the time the audio swap completes the colors have
  // already fully arrived — no lag between "sounds like track B" and
  // "looks like track B". Track's own gradient resolves via the same
  // seed/cover-sample logic as the normal per-track effect below.
  useEffect(() => {
    if (!crossfadingToTrack) return;
    let cancelled = false;

    // Album tracks all resolve to the same cover-derived color anyway — if
    // it's already been sampled this session, transition straight to it
    // instead of flashing through a different per-track seed color first.
    const cachedCover = crossfadingToTrack.albumCoverUrl
      ? peekImageGradient(crossfadingToTrack.albumCoverUrl)
      : undefined;

    if (cachedCover) {
      beginTransition(cachedCover, crossfadeDuration * 1000);
    } else {
      beginTransition(gradientFromSeed(crossfadingToTrack.id), crossfadeDuration * 1000);
      if (crossfadingToTrack.albumCoverUrl) {
        gradientFromImage(crossfadingToTrack.albumCoverUrl).then((imgGradient) => {
          if (cancelled || !imgGradient) return;
          // Retarget mid-flight once the sample resolves — keeps the same
          // start point and elapsed time, just corrects the destination.
          toColorsRef.current = imgGradient;
        });
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crossfadingToTrack?.id]);

  // Normal (non-crossfade) track change — manual skip, jump, first play.
  // Still transitions smoothly rather than snapping instantly; just uses a
  // short fixed duration since there's no audio fade to sync against.
  // Skipped while a crossfade is actively driving the transition above, so
  // the two don't fight over the same target on the same track change.
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
          if (!cancelled && imgGradient) toColorsRef.current = imgGradient;
        });
      }
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.albumCoverUrl]);

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
    // sluggishly) tracking raw amplitude. A continuous glow that rises and
    // falls with volume reads as "there in the background"; a sharp pulse
    // that snaps on kick/bass hits and decays reads as "reacting to the beat".
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
          const bassBins = freq.slice(0, 8);
          const midBins = freq.slice(8, 40);
          bass = (bassBins.reduce((a, b) => a + b, 0) / bassBins.length / 255) * 0.9 + 0.1;
          mid = (midBins.reduce((a, b) => a + b, 0) / midBins.length / 255) * 0.7 + 0.08;

          bassHistory.push(bass);
          if (bassHistory.length > 40) bassHistory.shift();
          const avgBass = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;

          // Debounced so a single sustained hit doesn't re-trigger every
          // frame — ~180ms minimum gap between pulses, roughly matching the
          // fastest beats a listener perceives as distinct hits rather than
          // a single sustained sound.
          if (bass > avgBass * 1.35 && bass > 0.3 && now - lastPulseTime > 180) {
            pulse = 1;
            lastPulseTime = now;
          }
        }
      }
      pulse *= 0.87; // decay — fades to near-zero within ~250-300ms

      // Pulse amplitude roughly doubled across radius, alpha, and added a
      // brightness boost on the gradient's inner stop — previously the
      // pulse was technically there but subtle enough to read as ambient
      // noise rather than a beat visibly landing.
      const blobs = [
        { x: w * 0.3 + Math.sin(t) * 60, y: h * (1.05 - bass * 0.1), r: w * (0.32 + pulse * 0.42 + bass * 0.05), color: displayed.from },
        { x: w * 0.7 + Math.cos(t * 0.8) * 80, y: h * (1.1 - mid * 0.08), r: w * (0.28 + pulse * 0.24 + mid * 0.06), color: displayed.to },
        { x: w * 0.5 + Math.sin(t * 1.3) * 50, y: h * 1.15, r: w * (0.38 + pulse * 0.3), color: displayed.from },
      ];

      ctx.globalCompositeOperation = "screen";
      for (const b of blobs) {
        try {
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
          // Inner stop brightens toward white on a pulse peak instead of
          // staying at flat track color the whole time — gives the hit a
          // visible "flash" core, not just a size change.
          grad.addColorStop(0, pulse > 0.15 ? lerpHex(b.color, "#ffffff", pulse * 0.35) : b.color);
          grad.addColorStop(0.5, b.color + "88");
          grad.addColorStop(1, "transparent");
          ctx.globalAlpha = 0.28 + pulse * 0.5;
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
        maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
      }}
    />
  );
}
