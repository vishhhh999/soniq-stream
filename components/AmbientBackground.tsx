"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { useAmbient } from "./AmbientProvider";
import { gradientFromSeed, gradientFromImage } from "@/lib/gradient";

export default function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const { getFrequencyData, isPlaying, current } = usePlayer();
  const { enabled } = useAmbient();
  const tRef = useRef(0);
  const [colors, setColors] = useState<{ from: string; to: string }>({ from: "#888", to: "#444" });

  // Resolve the gradient once per track (not per frame) — deterministic from
  // the track's own id when no cover art, or sampled from the album cover
  // when one exists. Same track always gets the same gradient, permanently.
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const seedGradient = gradientFromSeed(current.id);
    setColors(seedGradient); // immediate fallback while image sampling (if any) runs

    if (current.albumCoverUrl) {
      gradientFromImage(current.albumCoverUrl).then((imgGradient) => {
        if (!cancelled && imgGradient) setColors(imgGradient);
      });
    }
    return () => {
      cancelled = true;
    };
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
        imgData.data[i + 3] = 14;
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

      const blobs = [
        { x: w * 0.3 + Math.sin(t) * 60, y: h * (1.05 - bass * 0.15), r: w * (0.35 + bass * 0.12), color: colors.from },
        { x: w * 0.7 + Math.cos(t * 0.8) * 80, y: h * (1.1 - mid * 0.12), r: w * (0.3 + mid * 0.1), color: colors.to },
        { x: w * 0.5 + Math.sin(t * 1.3) * 50, y: h * 1.15, r: w * (0.4 + bass * 0.08), color: colors.from },
      ];

      ctx.globalCompositeOperation = "screen";
      for (const b of blobs) {
        const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, b.color);
        grad.addColorStop(0.5, b.color + "55");
        grad.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.22 + bass * 0.12;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;

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
  }, [enabled, isPlaying, getFrequencyData, colors]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 65%, black 100%)",
      }}
    />
  );
}
