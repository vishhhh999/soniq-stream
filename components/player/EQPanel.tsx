"use client";

import { useRef, useState, useCallback } from "react";
import { usePlayer } from "../PlayerProvider";

// Matches the reference exactly: a flat horizontal line, three draggable
// nodes (low/mid/high), no frequency curve or numeric readout — vertical
// drag maps to dB gain (-15..+15), the line itself never bends. BYPASS
// toggles the whole chain to unity gain without losing the saved values.
const MIN_DB = -15;
const MAX_DB = 15;
const BANDS: { key: "low" | "mid" | "high"; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "mid", label: "Mid" },
  { key: "high", label: "High" },
];

function dbToY(db: number) {
  // 0dB = center (50%), +15 = top (0%), -15 = bottom (100%)
  const t = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return (1 - t) * 100;
}

function yToDb(ratio: number) {
  const t = 1 - Math.min(1, Math.max(0, ratio));
  return Math.round((MIN_DB + t * (MAX_DB - MIN_DB)) * 10) / 10;
}

export default function EQPanel() {
  const { eq, setEQ, eqBypassed, setEQBypassed } = usePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"low" | "mid" | "high" | null>(null);

  const handlePointer = useCallback((band: "low" | "mid" | "high", clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    setEQ(band, yToDb(ratio));
  }, [setEQ]);

  const startDrag = (band: "low" | "mid" | "high") => (e: React.PointerEvent) => {
    if (eqBypassed) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(band);
    handlePointer(band, e.clientY);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <h3 className="text-sm font-medium text-primary">Equalizer</h3>
        <button
          onClick={() => setEQBypassed(!eqBypassed)}
          className={`text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full transition-colors ${
            eqBypassed ? "bg-accent text-on-accent" : "bg-canvas text-tertiary hover:text-primary"
          }`}
        >
          Bypass
        </button>
      </div>

      <div
        ref={trackRef}
        className={`relative flex-1 min-h-[180px] bg-canvas rounded-xl transition-opacity ${eqBypassed ? "opacity-40" : ""}`}
        onPointerMove={(e) => { if (dragging) handlePointer(dragging, e.clientY); }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* Center reference line (0dB) */}
        <div className="absolute left-4 right-4 top-1/2 h-px bg-border" />

        <div className="absolute inset-4 flex items-center justify-between">
          {BANDS.map(({ key }, i) => (
            <div key={key} className="relative h-full flex-1 flex justify-center" style={{ zIndex: dragging === key ? 2 : 1 }}>
              {/* Connecting line to the next node */}
              {i < BANDS.length - 1 && (
                <svg className="absolute inset-0 w-[calc(100%+100%)] h-full pointer-events-none overflow-visible" style={{ left: "50%" }}>
                  <line
                    x1="0" y1={`${dbToY(eq[key])}%`}
                    x2="100%" y2={`${dbToY(eq[BANDS[i + 1].key])}%`}
                    stroke="var(--text-primary)" strokeWidth={1.5}
                  />
                </svg>
              )}
              <button
                onPointerDown={startDrag(key)}
                className="absolute w-5 h-5 -ml-2.5 rounded-full bg-primary shadow-lg cursor-grab active:cursor-grabbing touch-none"
                style={{ top: `${dbToY(eq[key])}%`, marginTop: "-10px" }}
                disabled={eqBypassed}
                aria-label={`${key} band, ${eq[key]}dB`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between px-1 pt-3">
        {BANDS.map(({ key, label }) => (
          <div key={key} className="text-center flex-1">
            <p className="text-xs text-secondary">{label}</p>
            <p className="text-[11px] text-tertiary tabular-nums">
              {eq[key] > 0 ? "+" : ""}{eq[key]}dB
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
