"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, Music4, Gauge, Scissors, Download, Repeat } from "lucide-react";
import { usePlayer } from "../PlayerProvider";
import WaveformTrimSelector from "../WaveformTrimSelector";
import { useMetronome } from "@/lib/useMetronome";
import { useTuner } from "@/lib/useTuner";
import { exportTrimmedAudio } from "@/lib/exportTrimmedAudio";

// Phase 3. Two honest scope notes up front:
// - Speed uses native playbackRate + preservesPitch. With "preserve pitch"
//   on (default) this is real varispeed: speed changes, pitch doesn't.
//   With it off, pitch is linked to speed (classic tape behavior). What
//   this does NOT do is let you change pitch independently while keeping
//   speed at 100% — that needs a real time-stretch/phase-vocoder library,
//   not implemented here.
// - Beat grid below is a constant-BPM grid anchored at t=0. It doesn't
//   detect the actual downbeat position, so on a track with a pickup/
//   intro silence it may not land exactly on the beat. Good enough to
//   judge tempo/timing by eye, not a substitute for real beat detection.
export default function AdjustPanel() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle,
    playbackRate, setPlaybackRate, preservesPitch, setPreservesPitch,
  } = usePlayer();
  const metronome = useMetronome(current?.bpm);
  const tuner = useTuner();
  const [showBeatGrid, setShowBeatGrid] = useState(true);
  const [showTuner, setShowTuner] = useState(false);

  // Trim/region state, seeded from the track's saved trimStart/trimEnd
  // (real DB columns, already existed, just never had a UI). Falls back to
  // the full track length when nothing's been saved yet.
  const [trimStart, setTrimStart] = useState(current?.trimStart ?? 0);
  const [trimEnd, setTrimEnd] = useState(current?.trimEnd ?? duration ?? 0);
  const trimSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Loop-within-trim is what actually makes the trim handles mean
  // something during playback -- previously they only ever wrote numbers
  // to the DB with nothing in the app reading them back. Opt-in (not on
  // by default) so turning on the Adjust tab doesn't silently change how
  // the track plays elsewhere.
  const [loopTrim, setLoopTrim] = useState(false);
  const trimStartRef = useRef(trimStart);
  const trimEndRef = useRef(trimEnd);
  useEffect(() => { trimStartRef.current = trimStart; trimEndRef.current = trimEnd; }, [trimStart, trimEnd]);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    setTrimStart(current?.trimStart ?? 0);
    setTrimEnd(current?.trimEnd ?? duration ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Loop-within-trim: while enabled, wraps playback back to trimStart the
  // moment it crosses trimEnd. Reading from refs (not the trim state
  // directly) so this doesn't need to re-bind the listener on every drag
  // frame while adjusting the handles.
  useEffect(() => {
    if (!loopTrim) return;
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      if (el.currentTime >= trimEndRef.current) {
        el.currentTime = trimStartRef.current;
      }
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [loopTrim, audioRef]);

  const handleDownloadTrim = async () => {
    if (!current) return;
    setDownloading(true); setDownloadError(null);
    try {
      const blob = await exportTrimmedAudio(current.fileUrl, trimStart, trimEnd);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${current.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-trim.wav`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setDownloadError(e?.message || "Couldn't export the trimmed audio.");
    }
    setDownloading(false);
  };

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  if (!current) return null;

  const beatTimes: number[] = [];
  if (showBeatGrid && current.bpm && current.bpm > 0 && duration > 0) {
    const secPerBeat = 60 / current.bpm;
    for (let t = 0; t < duration; t += secPerBeat) beatTimes.push(t);
  }

  const handleTrimChange = (s: number, e: number) => {
    setTrimStart(s); setTrimEnd(e);
    if (trimSaveTimer.current) clearTimeout(trimSaveTimer.current);
    const trackId = current.id;
    trimSaveTimer.current = setTimeout(() => {
      fetch(`/api/tracks/${trackId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trimStart: s, trimEnd: e }),
      }).catch(() => {});
    }, 400);
  };

  const resetTrim = () => handleTrimChange(0, duration);

  return (
    <div className="flex flex-col h-full overflow-y-auto no-scrollbar">
      <div className="flex items-center justify-between px-1 pb-4">
        <h3 className="text-sm font-medium text-primary">Adjust</h3>
      </div>

      {/* Speed / Varispeed */}
      <div className="bg-canvas rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-secondary flex items-center gap-1.5">
            <Gauge size={13} strokeWidth={1.5} /> Speed
          </span>
          <span className="text-xs text-tertiary tabular-nums">{Math.round(playbackRate * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={playbackRate}
          onChange={(e) => setPlaybackRate(Number(e.target.value))}
          className="w-full accent-[var(--accent)] cursor-pointer"
        />
        <button
          onClick={() => setPreservesPitch(!preservesPitch)}
          className="mt-2 text-[11px] text-tertiary hover:text-primary transition-colors"
        >
          {preservesPitch ? "Pitch held constant — tap to link pitch to speed" : "Pitch linked to speed — tap to hold pitch constant"}
        </button>
      </div>

      {/* Trim / region selector — real start/end handles now, not just a
          speed slider with no way to mark a region. Same shared component
          the snippet export flow uses, so both trim UIs stay in sync by
          construction instead of by discipline. Loop + Download give the
          handles a real effect instead of just writing numbers to the DB
          with nothing reading them back. */}
      <div className="bg-canvas rounded-xl p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-secondary flex items-center gap-1.5">
            <Scissors size={13} strokeWidth={1.5} /> Trim
          </span>
          <button
            onClick={resetTrim}
            className="text-[11px] text-tertiary hover:text-primary transition-colors"
          >
            Reset
          </button>
        </div>
        <WaveformTrimSelector
          trackId={current.id}
          duration={duration}
          start={trimStart}
          end={trimEnd}
          onChange={handleTrimChange}
          playhead={currentTime}
        />
        {beatTimes.length > 0 && (
          <div className="relative h-2 mt-1.5">
            {beatTimes.map((t, i) => (
              <div
                key={i}
                className={`absolute top-0 w-px ${i % 4 === 0 ? "h-2 bg-tertiary" : "h-1 bg-tertiary/40"}`}
                style={{ left: `${(t / duration) * 100}%` }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setLoopTrim((v) => !v)}
            className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full transition-colors ${
              loopTrim ? "bg-accent text-on-accent" : "bg-elevated text-tertiary hover:text-primary"
            }`}
            title="Loop playback within the trimmed region"
          >
            <Repeat size={12} strokeWidth={1.5} /> Loop trim
          </button>
          <button
            onClick={handleDownloadTrim}
            disabled={downloading}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full bg-elevated text-tertiary hover:text-primary transition-colors disabled:opacity-50"
            title="Download the trimmed section as a WAV file"
          >
            <Download size={12} strokeWidth={1.5} /> {downloading ? "Exporting..." : "Download"}
          </button>
        </div>
        {downloadError && <p className="text-xs text-error mt-2">{downloadError}</p>}
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        <button
          onClick={() => { if (audioRef.current) audioRef.current.currentTime = trimStart; }}
          className="text-secondary hover:text-primary transition-colors p-2 -m-2"
          title="Jump to trim start"
        >
          <SkipBack size={18} strokeWidth={1.5} />
        </button>
        <button
          onClick={toggle}
          className="w-12 h-12 rounded-full bg-accent text-on-accent flex items-center justify-center hover:bg-accent-strong transition-colors"
        >
          {isPlaying ? <Pause size={18} strokeWidth={2} /> : <Play size={18} strokeWidth={2} className="ml-0.5" />}
        </button>
        <div className="w-[34px]" />
      </div>

      {/* Tools: metronome, beat grid toggle, tuner */}
      <div className="border-t border-border pt-3 mt-1 space-y-1">
        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-secondary">Metronome{current.bpm ? ` · ${Math.round(current.bpm)} BPM` : " · no BPM detected"}</span>
          <button
            onClick={() => metronome.setOn(!metronome.on)}
            disabled={!current.bpm}
            className={`text-[11px] uppercase tracking-wide px-3 py-1 rounded-full transition-colors disabled:opacity-30 ${
              metronome.on ? "bg-accent text-on-accent" : "bg-elevated text-tertiary hover:text-primary"
            }`}
          >
            {metronome.on ? "On" : "Off"}
          </button>
        </div>

        <div className="flex items-center justify-between py-2">
          <span className="text-xs text-secondary">Beat grid</span>
          <button
            onClick={() => setShowBeatGrid((v) => !v)}
            disabled={!current.bpm}
            className={`text-[11px] uppercase tracking-wide px-3 py-1 rounded-full transition-colors disabled:opacity-30 ${
              showBeatGrid ? "bg-accent text-on-accent" : "bg-elevated text-tertiary hover:text-primary"
            }`}
          >
            {showBeatGrid ? "On" : "Off"}
          </button>
        </div>

        <div className="py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-secondary flex items-center gap-1.5">
              <Music4 size={13} strokeWidth={1.5} /> Tuner
            </span>
            <button
              onClick={() => { if (showTuner) { tuner.stop(); setShowTuner(false); } else { setShowTuner(true); tuner.start(); } }}
              className={`text-[11px] uppercase tracking-wide px-3 py-1 rounded-full transition-colors ${
                showTuner ? "bg-accent text-on-accent" : "bg-elevated text-tertiary hover:text-primary"
              }`}
            >
              {showTuner ? "Stop" : "Start"}
            </button>
          </div>
          {showTuner && (
            <div className="mt-2 bg-elevated rounded-lg p-3 text-center">
              {tuner.error ? (
                <p className="text-xs text-error">{tuner.error}</p>
              ) : tuner.note ? (
                <>
                  <p className="text-xl font-medium text-primary tabular-nums">{tuner.note.name}</p>
                  <p className={`text-[11px] tabular-nums mt-0.5 ${Math.abs(tuner.note.cents) < 8 ? "text-accent" : "text-tertiary"}`}>
                    {tuner.note.cents > 0 ? "+" : ""}{tuner.note.cents} cents
                  </p>
                </>
              ) : (
                <p className="text-xs text-tertiary">Listening...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

