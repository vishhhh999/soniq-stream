"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { waveformBars } from "@/lib/waveformBars";
import { useAmbient } from "./AmbientProvider";

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

  // Played-bar/playhead color picks up the ambient system's current track
  // color at a light touch, rather than a fixed accent — one of the small
  // places the ambient engine now reaches beyond its own canvas. Polled at
  // a throttled interval (not full 60fps) since a hex-color swap doesn't
  // need frame-perfect timing the way the canvas draw loop does, and this
  // avoids a rAF loop per seek bar instance when several could exist at once.
  const { enabled, colorStateRef } = useAmbient();
  const [ambientColor, setAmbientColor] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setAmbientColor(null);
      return;
    }
    const id = setInterval(() => {
      setAmbientColor(colorStateRef.current.from);
    }, 200);
    return () => clearInterval(id);
  }, [enabled, colorStateRef]);
  const playedColor = ambientColor ?? "var(--text-primary)";
  const playheadColor = ambientColor ?? "var(--accent)";

  return (
    <div className="relative flex-1 h-5 flex items-center group">
      {/* Bars colored by played/unplayed position, not one flat grey —
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
                backgroundColor: isPlayed ? playedColor : "var(--text-tertiary)",
              }}
            />
          );
        })}
      </div>

      {/* Playhead marker on top of the colored bars */}
      <div
        className="absolute top-0 bottom-0 w-[2px] pointer-events-none rounded-full"
        style={{ left: `${playedRatio * 100}%`, backgroundColor: playheadColor }}
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
