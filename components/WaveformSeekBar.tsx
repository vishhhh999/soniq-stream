"use client";

import { useMemo } from "react";
import { waveformBars } from "@/lib/waveformBars";

export default function WaveformSeekBar({
  trackId,
  progress,
  duration,
  onSeek,
}: {
  trackId: string;
  progress: number;
  duration: number;
  onSeek: (time: number) => void;
}) {
  const bars = useMemo(() => waveformBars(trackId, 60), [trackId]);
  const playedRatio = duration ? Math.min(1, progress / duration) : 0;

  return (
    <div className="relative flex-1 h-8 flex items-center group">
      {/* Thin vertical bars, fixed width — previously used flex-1 width with
         rounded-full, which made each bar wider than tall and rendered as
         horizontal pills/blobs instead of a waveform. Fixed width + small
         radius keeps them as actual bars regardless of container size. */}
      <div className="flex items-center gap-[2px] w-full h-full justify-between">
        {bars.map((h, i) => (
          <div
            key={i}
            className="rounded-[1px] shrink-0"
            style={{
              width: "2px",
              height: `${h * 100}%`,
              backgroundColor: "var(--border-strong)",
            }}
          />
        ))}
      </div>

      {/* Single playhead line at the current position, not a played/unplayed
         color split across every bar — closer to the reference. */}
      <div
        className="absolute top-0 bottom-0 w-[2px] bg-accent pointer-events-none rounded-full"
        style={{ left: `${playedRatio * 100}%` }}
      />

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.01}
        value={progress}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={!duration}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
      />
    </div>
  );
}
