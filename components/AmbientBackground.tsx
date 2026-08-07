"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "./PlayerProvider";
import { useAmbient } from "./AmbientProvider";

export default function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const { getFrequencyData, isPlaying } = usePlayer();
  const { enabled } = useAmbient();
  const tRef = useRef(0);

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

    // Read the accent color from CSS custom properties — canvas can't use
    // var() directly, and this keeps the effect in sync with light/dark mode
    // without duplicating the color values here.
    const getAccent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c8b99a";

    let noiseTile: HTMLCanvasElement | null = null;
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
        imgData.data[i + 3] = 14; // very subtle
      }
      tctx.putImageData(imgData, 0, 0);
      return tile;
    };
    noiseTile = buildNoiseTile();
    let noiseAge = 0;

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      tRef.current += 0.006;
      const t = tRef.current;

      ctx.clearRect(0, 0, w, h);

      // Amplitude from the analyser when something's playing; gentle idle
      // drift (not flat silence) when nothing is, so the effect never looks
      // simply "off" while still reading as calm/ambient rather than active.
      let bass = 0.15;
      let mid = 0.1;
      if (isPlaying) {
        const freq = getFrequencyData();
        if (freq) {
          const bassBins = freq.slice(0, 8);
          const midBins = freq.slice(8, 40);
          bass = (bassBins.reduce((a, b) => a + b, 0) / bassBins.length / 255) * 0.9 + 0.1;
          mid = (midBins.reduce((a, b) => a + b, 0) / midBins.length / 255) * 0.7 + 0.08;
        }
      }

      const accent = getAccent();
      const blobs = [
        { x: w * 0.3 + Math.sin(t) * 60, y: h * (1.05 - bass * 0.15), r: w * (0.35 + bass * 0.12) },
        { x: w * 0.7 + Math.cos(t * 0.8) * 80, y: h * (1.1 - mid * 0.12), r: w * (0.3 + mid * 0.1) },
        { x: w * 0.5 + Math.sin(t * 1.3) * 50, y: h * 1.15, r: w * (0.4 + bass * 0.08) },
      ];

      ctx.globalCompositeOperation = "screen";
      for (const b of blobs) {
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `${accent}`);
        grad.addColorStop(0.5, `${accent}33`);
        grad.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.16 + bass * 0.1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

      // Grain overlay — regenerated a few times a second, not every frame,
      // so it reads as texture rather than shimmering noise
      noiseAge++;
      if (noiseAge > 6) {
        noiseTile = buildNoiseTile();
        noiseAge = 0;
      }
      if (noiseTile) {
        const pattern = ctx.createPattern(noiseTile, "repeat");
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
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        // Confined to the lower portion of the screen, fading out toward the
        // 40%-from-top line — text above that line is always fully clear.
        maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
      }}
    />
  );
}
