"use client";

import { Play, Pause, SkipBack } from "lucide-react";
import { usePlayer } from "../PlayerProvider";
import WaveformSeekBar from "../WaveformSeekBar";

// Deliberately minimal for Phase 1. The reference's "Adjust" tab is really
// Varispeed (independent speed/pitch), which needs a real time-stretch
// library — not just audio.playbackRate, which pitch-shifts as a side
// effect. That's Phase 3. This tab exists so it isn't empty in the
// meantime, and to validate the shared-shell layout with real content.
export default function AdjustPanel() {
  const { current, isPlaying, currentTime, duration, audioRef, toggle } = usePlayer();

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  if (!current) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <h3 className="text-sm font-medium text-primary">Adjust</h3>
        <span className="text-[11px] text-tertiary">Varispeed coming soon</span>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <WaveformSeekBar
          trackId={current.id}
          progress={currentTime}
          duration={duration}
          onSeek={(v) => { if (audioRef.current) audioRef.current.currentTime = v; }}
        />
        <div className="flex justify-between text-xs text-tertiary tabular-nums mt-2">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 pt-4">
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
    </div>
  );
}
