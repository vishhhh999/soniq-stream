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
  const bars = useMemo(() => waveformBars(trackId), [trackId]);
  const playedRatio = duration ? progress / duration : 0;

  return (
    <div className="relative flex-1 h-8 flex items-center group">
      <div className="flex items-center gap-[2px] w-full h-full">
        {bars.map((h, i) => {
          const barPosition = i / bars.length;
          const isPlayed = barPosition <= playedRatio;
          return (
            <div
              key={i}
              className="flex-1 rounded-full transition-colors"
              style={{
                height: `${h * 100}%`,
                backgroundColor: isPlayed ? "var(--accent)" : "var(--border-strong)",
              }}
            />
          );
        })}
      </div>
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
