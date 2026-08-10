"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { waveformBars } from "@/lib/waveformBars";

// Shared trim/region selector — used by both AdjustPanel (persisted per-track
// trimStart/trimEnd) and NewSnippetModal (session-only, capped to a max
// snippet length). One component, one interaction model, per Vish's explicit
// call that these shouldn't be two separate trim UIs.
//
// Bar rendering matches WaveformSeekBar's look (thin 2px fixed-width bars,
// densely packed) instead of flex-1 bars that stretch into chunky blocks on
// wide containers — bar count is measured off the actual container width via
// ResizeObserver so it stays thin whether this renders in a ~350px popover
// or a full-width fullscreen modal.
const BAR_WIDTH = 2;
const BAR_GAP = 2;

export default function WaveformTrimSelector({
  trackId,
  duration,
  start,
  end,
  onChange,
  playhead,
  maxWindowSec,
}: {
  trackId: string;
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  playhead?: number;
  maxWindowSec?: number; // if set, dragging the handles clamps (end - start) to this
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [barCount, setBarCount] = useState(80);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      setBarCount(Math.max(20, Math.floor(w / (BAR_WIDTH + BAR_GAP))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const bars = useMemo(() => waveformBars(trackId, barCount), [trackId, barCount]);
  const [dragging, setDragging] = useState<"start" | "end" | "region" | null>(null);
  const dragOriginRef = useRef<{ x: number; start: number; end: number } | null>(null);

  const ratioAt = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const startDrag = (which: "start" | "end" | "region") => (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
    setDragging(which);
    dragOriginRef.current = { x: e.clientX, start, end };
  };

  const handleMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !duration) return;
    const origin = dragOriginRef.current;
    if (dragging === "region" && origin) {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const deltaSec = ((e.clientX - origin.x) / rect.width) * duration;
      const span = origin.end - origin.start;
      let newStart = Math.min(Math.max(0, origin.start + deltaSec), duration - span);
      onChange(newStart, newStart + span);
      return;
    }
    const t = ratioAt(e.clientX) * duration;
    if (dragging === "start") {
      const maxStart = maxWindowSec ? Math.min(t, end - 0.5) : Math.min(t, end - 0.5);
      const clampedStart = Math.max(0, Math.min(maxStart, end - 0.5));
      const clampedEnd = maxWindowSec ? Math.min(end, clampedStart + maxWindowSec) : end;
      onChange(clampedStart, clampedEnd);
    } else if (dragging === "end") {
      let clampedEnd = Math.min(duration, Math.max(t, start + 0.5));
      if (maxWindowSec) clampedEnd = Math.min(clampedEnd, start + maxWindowSec);
      onChange(start, clampedEnd);
    }
  }, [dragging, duration, end, start, ratioAt, onChange, maxWindowSec]);

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const startPct = duration ? (start / duration) * 100 : 0;
  const endPct = duration ? (end / duration) * 100 : 100;
  const playheadPct = duration && playhead != null ? (playhead / duration) * 100 : null;

  return (
    <div>
      <div className="flex justify-between text-[11px] text-tertiary mb-1.5 tabular-nums">
        <span>{fmt(start)}</span>
        <span className="text-secondary">{fmt(end - start)} selected</span>
        <span>{fmt(end)}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-12 select-none touch-none"
        onPointerMove={handleMove}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* Waveform bars, dimmed outside the selected region -- fixed 2px
            width bars matching the player's own waveform look, not
            container-stretched blocks. */}
        <div className="absolute inset-0 flex items-center justify-between">
          {bars.map((h, i) => {
            const barPct = (i / (bars.length - 1)) * 100;
            const inRegion = barPct >= startPct && barPct <= endPct;
            return (
              <div
                key={i}
                className="rounded-[1px] shrink-0"
                style={{
                  width: `${BAR_WIDTH}px`,
                  height: `${h * 100}%`,
                  backgroundColor: inRegion ? "var(--accent)" : "var(--text-tertiary)",
                  opacity: inRegion ? 1 : 0.35,
                }}
              />
            );
          })}
        </div>

        {/* Dimming overlays outside the region */}
        <div className="absolute inset-y-0 left-0 bg-canvas/70 pointer-events-none" style={{ width: `${startPct}%` }} />
        <div className="absolute inset-y-0 right-0 bg-canvas/70 pointer-events-none" style={{ width: `${100 - endPct}%` }} />

        {/* Draggable region body (move both handles together) */}
        <div
          onPointerDown={startDrag("region")}
          className="absolute inset-y-0 cursor-grab active:cursor-grabbing"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />

        {/* Start handle */}
        <div
          onPointerDown={startDrag("start")}
          className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center"
          style={{ left: `${startPct}%` }}
        >
          <div className="w-1 h-full rounded-full bg-accent shadow" />
        </div>
        {/* End handle */}
        <div
          onPointerDown={startDrag("end")}
          className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize flex items-center justify-center"
          style={{ left: `${endPct}%` }}
        >
          <div className="w-1 h-full rounded-full bg-accent shadow" />
        </div>

        {/* Playhead, if actively playing within the panel */}
        {playheadPct != null && (
          <div
            className="absolute top-0 bottom-0 w-px bg-primary/60 pointer-events-none"
            style={{ left: `${playheadPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
