"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Lock, Volume2, VolumeX, Download, Gauge } from "lucide-react";
import { usePlayer, Track } from "../PlayerProvider";
import { SNIPPET_TEMPLATES, SnippetTemplateId, DiscColor, GradientChoice, VINYL_ASSET_PATHS } from "@/lib/snippetTemplates";
import { TEMPLATE_RENDERERS } from "@/lib/snippetRenderers";
import { useSnippetExport } from "@/lib/useSnippetExport";
import { MODAL_SPRING } from "@/lib/motion";
import WaveformTrimSelector from "../WaveformTrimSelector";
import { openSettings } from "@/lib/settingsBus";

const MAX_SNIPPET_SEC = 30;

export default function NewSnippetModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const { audioContext, getFrequencyData } = usePlayer();
  const [mounted, setMounted] = useState(false);
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [templateId, setTemplateId] = useState<SnippetTemplateId>("vinyl-rise");
  const [discColor, setDiscColor] = useState<DiscColor>("black");
  const [gradient, setGradient] = useState<GradientChoice>("dark");
  const [useAlbumArt, setUseAlbumArt] = useState(!!track.albumCoverUrl);
  const [muted, setMuted] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(1);
  const [trimStart, setTrimStart] = useState(0);
  const [trackDuration, setTrackDuration] = useState(track.durationSec ?? MAX_SNIPPET_SEC);
  const [trimEnd, setTrimEndState] = useState(Math.min(MAX_SNIPPET_SEC, track.durationSec ?? MAX_SNIPPET_SEC));

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewRafRef = useRef<number | null>(null);
  const albumArtImgRef = useRef<HTMLImageElement | null>(null);
  const vinylImgsRef = useRef<Record<DiscColor, HTMLImageElement> | null>(null);

  const exportState = useSnippetExport();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    fetch("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsPaid(!!d?.isPaid))
      .catch(() => setIsPaid(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => res(img); img.onerror = rej; img.src = src;
    });
    Promise.all([load(VINYL_ASSET_PATHS.white), load(VINYL_ASSET_PATHS.black), load(VINYL_ASSET_PATHS.orange)])
      .then(([white, black, orange]) => { if (!cancelled) vinylImgsRef.current = { white, black, orange }; })
      .catch(() => {});
    if (track.albumCoverUrl) {
      load(track.albumCoverUrl).then((img) => { if (!cancelled) albumArtImgRef.current = img; }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [track.albumCoverUrl]);

  // Live canvas preview loop -- plays the trimmed window on repeat with a
  // dedicated (muted-optional) audio element, independent of the main
  // player so opening this modal never disturbs whatever's actually playing
  // in the app.
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const audio = new Audio(track.fileUrl);
    audio.crossOrigin = "anonymous";
    audio.loop = false;
    audio.muted = muted;
    audio.currentTime = trimStart;
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && !track.durationSec) {
        setTrackDuration(audio.duration);
      }
    }, { once: true });

    const startWall = performance.now();
    const segDuration = trimEnd - trimStart;

    const draw = () => {
      const vinylImages = vinylImgsRef.current;
      if (!vinylImages) { previewRafRef.current = requestAnimationFrame(draw); return; }
      let elapsed = (performance.now() - startWall) / 1000;
      if (elapsed >= segDuration) {
        audio.currentTime = trimStart;
        audio.play().catch(() => {});
        elapsed = 0;
      }
      const renderer = TEMPLATE_RENDERERS[templateId];
      renderer({
        ctx, width: canvas.width, height: canvas.height,
        t: elapsed, duration: segDuration, progress: elapsed / segDuration,
        frequencyData: getFrequencyData(),
        trackTitle: track.title,
        albumArt: useAlbumArt ? albumArtImgRef.current : null,
        vinylImages, discColor, gradient, useAlbumArt,
        spinSpeed,
      });
      previewRafRef.current = requestAnimationFrame(draw);
    };
    previewRafRef.current = requestAnimationFrame(draw);

    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      audio.pause();
      previewAudioRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, discColor, gradient, useAlbumArt, trimStart, trimEnd, muted, spinSpeed, track.id]);

  const selectedMeta = SNIPPET_TEMPLATES.find((t) => t.id === templateId)!;
  const locked = selectedMeta.premium && isPaid === false;

  const handleTrimChange = (s: number, e: number) => {
    setTrimStart(s); setTrimEndState(e);
  };

  const handleExport = () => {
    if (locked) return;
    exportState.start({
      templateId, discColor, gradient, useAlbumArt,
      albumArtUrl: track.albumCoverUrl ?? null,
      trackTitle: track.title,
      trimStart, trimEnd,
      audioUrl: track.fileUrl,
      spinSpeed,
      getFrequencyData,
    });
  };

  const handleDownload = () => {
    if (!exportState.resultUrl) return;
    const a = document.createElement("a");
    a.href = exportState.resultUrl;
    a.download = `${track.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-snippet.webm`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  if (!mounted) return null;
  void audioContext;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-canvas flex flex-col"
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-medium text-primary">New Snippet</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors"
          >
            {muted ? <VolumeX size={16} strokeWidth={1.5} /> : <Volume2 size={16} strokeWidth={1.5} />}
          </button>
          {exportState.resultUrl ? (
            <button
              onClick={handleDownload}
              className="w-9 h-9 rounded-full bg-accent text-on-accent flex items-center justify-center hover:bg-accent-strong transition-colors"
              title="Download"
            >
              <Download size={16} strokeWidth={2} />
            </button>
          ) : (
            <button
              onClick={handleExport}
              disabled={exportState.exporting || locked}
              className="w-9 h-9 rounded-full bg-primary text-canvas flex items-center justify-center disabled:opacity-30 hover:opacity-90 transition-opacity"
              title={locked ? "Upgrade to export this template" : "Export"}
            >
              <Check size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-6">
        <div className="relative h-full max-h-[70vh] aspect-[9/16] rounded-2xl overflow-hidden shadow-xl bg-elevated border border-border">
          <canvas ref={previewCanvasRef} width={1080} height={1920} className="w-full h-full object-cover" />

          {/* Premium block -- locked templates still preview so free users
              can see what they're missing, but the preview sits under a
              50% black overlay so it can't just be screen-recorded and
              lifted clean. Export stays disabled regardless. */}
          {locked && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="w-11 h-11 rounded-full bg-canvas/90 flex items-center justify-center">
                <Lock size={18} strokeWidth={1.5} className="text-primary" />
              </div>
              <p className="text-sm font-medium text-white">Premium template</p>
              <p className="text-xs text-white/70 max-w-[220px]">Upgrade to unlock this template and export it in full quality.</p>
              <button
                onClick={() => { onClose(); openSettings("billing"); }}
                className="mt-1 text-[11px] uppercase tracking-wide px-4 py-2 rounded-full bg-accent text-on-accent hover:bg-accent-strong transition-colors"
              >
                Upgrade
              </button>
            </div>
          )}

          {exportState.exporting && (
            <div className="absolute inset-0 bg-canvas/90 flex flex-col items-center justify-center gap-3">
              <div className="w-6 h-6 border-2 border-tertiary border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-tertiary">Rendering... {Math.round(exportState.progress * 100)}%</p>
              <button onClick={exportState.cancel} className="text-xs text-error underline hover:no-underline mt-2">Cancel</button>
            </div>
          )}
        </div>
      </div>

      {/* Template carousel */}
      <div className="px-6 pt-4 shrink-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 pb-2 w-max">
          {SNIPPET_TEMPLATES.map((tpl) => {
            const tplLocked = tpl.premium && isPaid === false;
            return (
              <button
                key={tpl.id}
                onClick={() => setTemplateId(tpl.id)}
                className={`relative shrink-0 px-4 py-2.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  templateId === tpl.id ? "bg-primary text-canvas" : "bg-elevated text-secondary hover:text-primary"
                }`}
              >
                {tplLocked && <Lock size={11} strokeWidth={2} />}
                {tpl.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Options: disc color / gradient / spin speed / album art toggle --
          grouped into a card matching AdjustPanel/EQPanel's bg-canvas
          block style, instead of a loose stack of rows that read as
          visually disconnected from the rest of the app. */}
      <div className="px-6 pt-2 pb-4 shrink-0">
        <div className="bg-elevated border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-tertiary w-16 shrink-0">Disc</span>
            {(["black", "white", "orange"] as DiscColor[]).map((c) => (
              <button
                key={c}
                onClick={() => setDiscColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-colors ${discColor === c ? "border-accent" : "border-transparent"}`}
                style={{ background: c === "black" ? "#111" : c === "white" ? "#eee" : "#e8650a" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-tertiary w-16 shrink-0">Background</span>
            {(["dark", "light", "orange"] as GradientChoice[]).map((g) => (
              <button
                key={g}
                onClick={() => setGradient(g)}
                className={`w-7 h-7 rounded-full border-2 transition-colors capitalize ${gradient === g ? "border-accent" : "border-transparent"}`}
                style={{ background: g === "dark" ? "#111" : g === "light" ? "#e5e0d8" : "#ff8a3d" }}
              />
            ))}
          </div>
          {selectedMeta.supportsAlbumArt && (
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tertiary w-16 shrink-0 flex items-center gap-1"><Gauge size={11} strokeWidth={1.5} /> Spin</span>
              <input
                type="range" min={0.5} max={2} step={0.1} value={spinSpeed}
                onChange={(e) => setSpinSpeed(Number(e.target.value))}
                className="flex-1 accent-[var(--accent)] cursor-pointer"
              />
              <span className="text-[11px] text-tertiary tabular-nums w-8 text-right">{spinSpeed.toFixed(1)}x</span>
            </div>
          )}
          {selectedMeta.supportsAlbumArt && track.albumCoverUrl && (
            <label className="flex items-center gap-2 text-[11px] text-tertiary pt-1">
              <input type="checkbox" checked={useAlbumArt} onChange={(e) => setUseAlbumArt(e.target.checked)} className="accent-[var(--accent)]" />
              Overlay album art on label
            </label>
          )}
        </div>
        {exportState.error && <p className="text-xs text-error mt-3">{exportState.error}</p>}
      </div>

      {/* Trim bar -- shared component with AdjustPanel, capped to the
          30s max snippet length, same card treatment as the options block
          above. */}
      <div className="px-6 pb-8 shrink-0">
        <div className="bg-elevated border border-border rounded-xl p-4">
          <WaveformTrimSelector
            trackId={track.id}
            duration={trackDuration}
            start={trimStart}
            end={trimEnd}
            onChange={handleTrimChange}
            maxWindowSec={MAX_SNIPPET_SEC}
          />
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
