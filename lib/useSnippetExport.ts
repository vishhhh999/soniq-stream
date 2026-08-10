"use client";

import { useCallback, useRef, useState } from "react";
import { SnippetRenderContext, SnippetTemplateId, DiscColor, GradientChoice, TextColor, VINYL_ASSET_PATHS } from "./snippetTemplates";
import { TEMPLATE_RENDERERS } from "./snippetRenderers";

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface ExportOptions {
  templateId: SnippetTemplateId;
  discColor: DiscColor;
  gradient: GradientChoice;
  useAlbumArt: boolean;
  albumArtUrl: string | null;
  trackTitle: string;
  trimStart: number;
  trimEnd: number;
  trackDuration: number; // full track length, for the live "current / total" counter
  audioUrl: string;
  spinSpeed: number; // multiplier on the base rotation rate, 0.5x-2x
  textColor: TextColor;
  getFrequencyData: () => Uint8Array | null;
}

// Reverted to client-side rendering (v8.15.0) after the server-render path
// (v8.13/8.14) turned out to require Vercel Pro for the 300s maxDuration to
// actually be honored -- Hobby's hard 10s cap kills it regardless of code.
// Decision: stay on Hobby, accept the premium gate is enforced in the UI
// only (locked templates still render for free users behind a blocking
// overlay in NewSnippetModal, not skipped entirely -- see that component).
export function useSnippetExport() {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // MediaRecorder + canvas.captureStream is the only browser-native route
  // to a real video file -- no server render, no ffmpeg dependency. This is
  // the piece the desktop-only guard exists for: iOS Safari's version of
  // this combo has a documented history of recordings that silently never
  // fire onstop. Desktop Chrome/Firefox/Edge/Safari-macOS are solid.
  const start = useCallback(async (opts: ExportOptions) => {
    cancelRef.current = false;
    setExporting(true); setProgress(0); setError(null); setResultUrl(null);

    try {
      const [white, black, orange] = await Promise.all([
        loadImage(VINYL_ASSET_PATHS.white),
        loadImage(VINYL_ASSET_PATHS.black),
        loadImage(VINYL_ASSET_PATHS.orange),
      ]);
      const albumArt = opts.useAlbumArt && opts.albumArtUrl ? await loadImage(opts.albumArtUrl).catch(() => null) : null;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_WIDTH; canvas.height = OUTPUT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering isn't available in this browser.");

      const audio = new Audio(opts.audioUrl);
      audio.crossOrigin = "anonymous";
      audio.currentTime = opts.trimStart;
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener("loadedmetadata", () => resolve(), { once: true });
        audio.addEventListener("error", () => reject(new Error("Couldn't load audio for export.")), { once: true });
      });

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioCtx.createMediaElementSource(audio);
      const dest = audioCtx.createMediaStreamDestination();
      source.connect(dest);
      source.connect(audioCtx.destination);

      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      const duration = opts.trimEnd - opts.trimStart;
      const renderer = TEMPLATE_RENDERERS[opts.templateId];

      const donePromise = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();
      audio.play().catch(() => {});

      const startWallTime = performance.now();
      let raf = 0;
      const drawFrame = () => {
        if (cancelRef.current) { recorder.stop(); audio.pause(); return; }
        const elapsed = (performance.now() - startWallTime) / 1000;
        const t = Math.min(elapsed, duration);
        const rc: SnippetRenderContext = {
          ctx, width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT,
          t, duration, progress: t / duration,
          frequencyData: opts.getFrequencyData(),
          trackTitle: opts.trackTitle,
          albumArt, vinylImages: { white, black, orange },
          discColor: opts.discColor, gradient: opts.gradient, useAlbumArt: opts.useAlbumArt,
          spinSpeed: opts.spinSpeed,
          textColor: opts.textColor,
          trimStartAbs: opts.trimStart,
          trackDurationAbs: opts.trackDuration,
        };
        renderer(rc);
        setProgress(Math.min(1, elapsed / duration));

        if (elapsed >= duration) {
          recorder.stop();
          audio.pause();
          return;
        }
        raf = requestAnimationFrame(drawFrame);
      };
      raf = requestAnimationFrame(drawFrame);

      await donePromise;
      cancelAnimationFrame(raf);
      audioCtx.close().catch(() => {});

      if (cancelRef.current) { setExporting(false); return; }

      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    } catch (e: any) {
      setError(e?.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }, []);

  const cancel = useCallback(() => { cancelRef.current = true; }, []);

  return { start, cancel, exporting, progress, error, resultUrl };
}
