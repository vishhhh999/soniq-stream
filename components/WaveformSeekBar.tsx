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
    <div className="relative flex-1 h-5 flex items-center group">
      {/* Fixed colors, not ambient-tinted — played bars are white/primary,
         unplayed are grey/tertiary, dragger is the fixed accent orange.
         var(--text-primary) and var(--text-tertiary) already have correct,
         separate values for light and dark mode in globals.css, so this
         naturally inverts correctly without any extra logic here. */}
      <div className="flex items-center gap-[2px] w-full h-full justify-between">
        {bars.map((h, i) => {
          const barPosition = bars.length > 1 ? i / (bars.length - 1) : 0;
          const isPlayed = barPosition <= playedRatio;
          return (
            <div
              key={i}
              className="rounded-[1px] shrink-0"
              style={{
                width: "2px",
                height: `${h * 100}%`,
                backgroundColor: isPlayed ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            />
          );
        })}
      </div>

      {/* Playhead/dragger — fixed accent orange, not ambient-tinted. */}
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
