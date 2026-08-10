"use client";

import { useState } from "react";
import { Play, Pause, SkipBack, Music4, Gauge } from "lucide-react";
import { usePlayer } from "../PlayerProvider";
import WaveformSeekBar from "../WaveformSeekBar";
import { useMetronome } from "@/lib/useMetronome";
import { useTuner } from "@/lib/useTuner";

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

      {/* Waveform + transport */}
      <div className="mb-2">
        <WaveformSeekBar
          trackId={current.id}
          progress={currentTime}
          duration={duration}
          onSeek={(v) => { if (audioRef.current) audioRef.current.currentTime = v; }}
        />
        {beatTimes.length > 0 && (
          <div className="relative h-2 mt-1">
            {beatTimes.map((t, i) => (
              <div
                key={i}
                className={`absolute top-0 w-px ${i % 4 === 0 ? "h-2 bg-tertiary" : "h-1 bg-tertiary/40"}`}
                style={{ left: `${(t / duration) * 100}%` }}
              />
            ))}
          </div>
        )}
        <div className="flex justify-between text-xs text-tertiary tabular-nums mt-1">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 py-2">
        <button
          onClick={() => { if (audioRef.current) audioRef.current.currentTime = 0; }}
          className="text-secondary hover:text-primary transition-colors p-2 -m-2"
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

