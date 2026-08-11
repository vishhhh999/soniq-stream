"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Check, Lock, Volume2, VolumeX, Download, Gauge, Play, Pause } from "lucide-react";
import { usePlayer, Track } from "../PlayerProvider";
import { SNIPPET_TEMPLATES, SnippetTemplateId, DiscColor, GradientChoice, TextColor, TEXT_COLOR_HEX, VINYL_ASSET_PATHS, ELEMENT_COLOR_PALETTE } from "@/lib/snippetTemplates";
import { TEMPLATE_RENDERERS } from "@/lib/snippetRenderers";
import { useSnippetExport } from "@/lib/useSnippetExport";
import WaveformTrimSelector from "../WaveformTrimSelector";
import { openSettings } from "@/lib/settingsBus";

const MAX_SNIPPET_SEC = 30;

export default function NewSnippetModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const { audioContext } = usePlayer();
  const [mounted, setMounted] = useState(false);
  const [isPaid, setIsPaid] = useState<boolean | null>(null);
  const [templateId, setTemplateId] = useState<SnippetTemplateId>("vinyl-rise");
  const [discColor, setDiscColor] = useState<DiscColor>("black");
  const [gradient, setGradient] = useState<GradientChoice>("dark");
  const [useAlbumArt, setUseAlbumArt] = useState(!!track.albumCoverUrl);
  const [muted, setMuted] = useState(false);
  const [spinSpeed, setSpinSpeed] = useState(1);
  const [textColor, setTextColor] = useState<TextColor>("light");
  const [durationColor, setDurationColor] = useState<TextColor>("light");
  const [showTrackTitle, setShowTrackTitle] = useState(false);
  const [elementColors, setElementColors] = useState<Record<string, string>>({});
  const [trimStart, setTrimStart] = useState(0);
  const [trackDuration, setTrackDuration] = useState(track.durationSec ?? MAX_SNIPPET_SEC);
  const [trimEnd, setTrimEndState] = useState(Math.min(MAX_SNIPPET_SEC, track.durationSec ?? MAX_SNIPPET_SEC));
  const [previewPlaying, setPreviewPlaying] = useState(true);
  const previewPlayingRef = useRef(previewPlaying);
  useEffect(() => { previewPlayingRef.current = previewPlaying; }, [previewPlaying]);
  const trackDurationRef = useRef(trackDuration);
  useEffect(() => { trackDurationRef.current = trackDuration; }, [trackDuration]);

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewRafRef = useRef<number | null>(null);
  // Dedicated analyser for the preview's own audio -- previously the bars
  // (Pulse Grid / Type Wave) read getFrequencyData() off the MAIN app
  // player's analyser, so they went flat/wrong whenever the main player
  // wasn't actively playing this exact track. This mirrors PlayerProvider's
  // own analyser wiring (fftSize 256, tapped between source and
  // destination) but scoped to previewAudioRef specifically.
  const previewAnalyserCtxRef = useRef<AudioContext | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewFreqDataRef = useRef<Uint8Array | null>(null);
  const getPreviewFrequencyData = () => {
    const analyser = previewAnalyserRef.current;
    const data = previewFreqDataRef.current;
    if (!analyser || !data) return null;
    analyser.getByteFrequencyData(data as Uint8Array<ArrayBuffer>);
    return data;
  };
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
  //
  // Elapsed time is derived from audio.currentTime (not a separate
  // performance.now() clock) -- that makes pause a one-line no-op instead
  // of needing its own paused-offset bookkeeping, since the audio element's
  // own currentTime naturally freezes while paused and the draw loop just
  // reads whatever it currently is.
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

    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const analyserCtx = new Ctx();
    const analyser = analyserCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = analyserCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(analyserCtx.destination);
    previewAnalyserCtxRef.current = analyserCtx;
    previewAnalyserRef.current = analyser;
    previewFreqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

    if (previewPlaying) audio.play().catch(() => {});
    audio.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && !track.durationSec) {
        setTrackDuration(audio.duration);
      }
    }, { once: true });

    const segDuration = trimEnd - trimStart;

    const draw = () => {
      const vinylImages = vinylImgsRef.current;
      if (!vinylImages) { previewRafRef.current = requestAnimationFrame(draw); return; }
      let elapsed = audio.currentTime - trimStart;
      // Loop back to the start once the trimmed window ends -- checked every
      // frame rather than relying on the audio element's own 'ended' event,
      // since currentTime is reset before it ever reaches the track's real
      // end (the trim window ends well before the file does, most of the
      // time). Reads previewPlayingRef (not the closed-over previewPlaying)
      // so a pause right at the loop boundary is respected instead of the
      // stale value captured when this effect last ran.
      if (elapsed >= segDuration || audio.currentTime >= trimEnd) {
        audio.currentTime = trimStart;
        if (previewPlayingRef.current) audio.play().catch(() => {});
        elapsed = 0;
      }
      const renderer = TEMPLATE_RENDERERS[templateId];
      renderer({
        ctx, width: canvas.width, height: canvas.height,
        t: elapsed, duration: segDuration, progress: elapsed / segDuration,
        frequencyData: getPreviewFrequencyData(),
        trackTitle: track.title,
        showTrackTitle,
        elementColors,
        albumArt: useAlbumArt ? albumArtImgRef.current : null,
        vinylImages, discColor, gradient, useAlbumArt,
        spinSpeed,
        textColor,
        trimStartAbs: trimStart,
        trackDurationAbs: trackDurationRef.current,
        durationColor,
      });
      previewRafRef.current = requestAnimationFrame(draw);
    };
    previewRafRef.current = requestAnimationFrame(draw);

    return () => {
      if (previewRafRef.current) cancelAnimationFrame(previewRafRef.current);
      audio.pause();
      previewAudioRef.current = null;
      previewAnalyserRef.current = null;
      previewFreqDataRef.current = null;
      analyserCtx.close().catch(() => {});
      previewAnalyserCtxRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, discColor, gradient, useAlbumArt, trimStart, trimEnd, muted, spinSpeed, textColor, durationColor, showTrackTitle, elementColors, track.id]);

  // Play/pause toggle for the preview -- separate effect so toggling it
  // doesn't tear down and rebuild the whole draw loop (which would restart
  // image loading state, etc).
  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (previewPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [previewPlaying]);

  const selectedMeta = SNIPPET_TEMPLATES.find((t) => t.id === templateId)!;

  // Reset element colors to this template's defaults when switching
  // templates -- otherwise a color picked for e.g. Pulse Grid's "barAccent"
  // would silently carry over and mean nothing on a template that doesn't
  // have that element, or worse, collide with a same-named key on another
  // template with different visual intent.
  useEffect(() => {
    const defaults: Record<string, string> = {};
    selectedMeta.elements.forEach((el) => { defaults[el.key] = el.default; });
    setElementColors(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);
  const locked = selectedMeta.premium && isPaid === false;

  const handleTrimChange = (s: number, e: number) => {
    setTrimStart(s); setTrimEndState(e);
  };

  const handleExport = () => {
    if (locked) return;
    // The preview has its own always-playing audio element; the export
    // hook spins up a second, separate one to actually render. Without
    // this, both play at once during export -- audible double-audio, real
    // bug, not just a UX nit. Pausing here (not muting) also means nobody
    // gets surprised by the preview audio suddenly resuming mid-export if
    // some other state change happened to remount it.
    setPreviewPlaying(false);
    exportState.start({
      templateId, discColor, gradient, useAlbumArt,
      albumArtUrl: track.albumCoverUrl ?? null,
      trackTitle: track.title,
      showTrackTitle,
      elementColors,
      trimStart, trimEnd,
      trackDuration,
      audioUrl: track.fileUrl,
      spinSpeed,
      textColor,
      durationColor,
    });
  };

  const handleDownload = () => {
    if (!exportState.resultUrl) return;
    const ext = exportState.resultMimeType === "video/mp4" ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = exportState.resultUrl;
    a.download = `${track.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-snippet.${ext}`;
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
            onClick={() => setPreviewPlaying((p) => !p)}
            disabled={exportState.exporting}
            className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors disabled:opacity-30"
            title={previewPlaying ? "Pause preview" : "Play preview"}
          >
            {previewPlaying ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} className="ml-0.5" />}
          </button>
          <button
            onClick={() => setMuted((m) => !m)}
            disabled={exportState.exporting}
            className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors disabled:opacity-30"
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

      {/* Template carousel -- disabled during export since changing the
          template mid-render has no effect on the render already in
          flight, and leaving it interactive was misleading. */}
      <div className={`px-6 pt-4 shrink-0 overflow-x-auto no-scrollbar transition-opacity ${exportState.exporting ? "opacity-40 pointer-events-none" : ""}`}>
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
          2-column layout at sm+ widths (disc + background on the left,
          text + duration on the right) instead of a single full-width
          stack, which left the entire right half of the dialog empty on
          anything wider than a phone. Spin speed, album art, and the title
          toggle stay full-width below since they're conditional rows, not
          part of the fixed 4-item color grid. */}
      <div className={`px-6 pt-2 pb-4 shrink-0 transition-opacity ${exportState.exporting ? "opacity-40 pointer-events-none" : ""}`}>
        <div className="bg-elevated border border-border rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
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
            {selectedMeta.supportsTitleToggle && showTrackTitle && (
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-tertiary w-16 shrink-0">Text</span>
                {(["dark", "light", "orange"] as TextColor[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTextColor(t)}
                    title={t}
                    className={`w-7 h-7 rounded-full border-2 transition-colors capitalize ${textColor === t ? "border-accent" : "border-transparent"}`}
                    style={{ background: TEXT_COLOR_HEX[t] }}
                  />
                ))}
              </div>
            )}
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
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-tertiary w-16 shrink-0">Duration</span>
              {(["dark", "light", "orange"] as TextColor[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDurationColor(d)}
                  title={d}
                  className={`w-7 h-7 rounded-full border-2 transition-colors capitalize ${durationColor === d ? "border-accent" : "border-transparent"}`}
                  style={{ background: TEXT_COLOR_HEX[d] }}
                />
              ))}
            </div>
          </div>

          {/* Per-template customizable elements -- only rendered when the
              current template actually has any, since Pulse Grid/Frequency
              Bloom/Orbit each have different visual parts worth coloring
              independently, and the vinyl templates don't have any of
              these at all. */}
          {selectedMeta.elements.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 pt-1 border-t border-border">
              {selectedMeta.elements.map((el) => (
                <div key={el.key} className="flex items-center gap-2 pt-3">
                  <span className="text-[11px] text-tertiary w-20 shrink-0">{el.label}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ELEMENT_COLOR_PALETTE.map((c) => (
                      <button
                        key={c}
                        onClick={() => setElementColors((prev) => ({ ...prev, [el.key]: c }))}
                        className={`w-7 h-7 rounded-full border-2 transition-colors ${
                          (elementColors[el.key] ?? el.default) === c ? "border-accent" : "border-transparent"
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedMeta.supportsSpin && (
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
              {selectedMeta.supportsSpin ? "Overlay album art on label" : "Use album cover art"}
            </label>
          )}
          {selectedMeta.supportsTitleToggle && (
            <label className="flex items-center gap-2 text-[11px] text-tertiary pt-1">
              <input type="checkbox" checked={showTrackTitle} onChange={(e) => setShowTrackTitle(e.target.checked)} className="accent-[var(--accent)]" />
              Show track name (duration only by default)
            </label>
          )}
        </div>
        {exportState.error && <p className="text-xs text-error mt-3">{exportState.error}</p>}
      </div>

      {/* Trim bar -- shared component with AdjustPanel, capped to the
          30s max snippet length, same card treatment as the options block
          above. Disabled during export -- dragging the handles mid-render
          doesn't change output already in flight. */}
      <div className={`px-6 pb-8 shrink-0 transition-opacity ${exportState.exporting ? "opacity-40 pointer-events-none" : ""}`}>
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
