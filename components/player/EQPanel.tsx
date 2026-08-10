"use client";

import { useRef, useState, useCallback, useMemo } from "react";
import { usePlayer } from "../PlayerProvider";

// 5-band EQ, matching the Apple Music/Spotify convention. Curved graph line
// with a filled area under it (accent orange, 40% opacity), draggable nodes,
// vertical drag maps to dB gain (-15..+15). BYPASS toggles the whole chain
// to unity gain without losing the saved values.
const MIN_DB = -15;
const MAX_DB = 15;
type Band = "low" | "lowMid" | "mid" | "highMid" | "high";
const BANDS: { key: Band; label: string }[] = [
  { key: "low", label: "Low" },
  { key: "lowMid", label: "Low Mid" },
  { key: "mid", label: "Mid" },
  { key: "highMid", label: "High Mid" },
  { key: "high", label: "High" },
];

const GRAPH_H = 100;
const GRAPH_W = 100;

function dbToY(db: number) {
  const t = (db - MIN_DB) / (MAX_DB - MIN_DB);
  return (1 - t) * GRAPH_H;
}

function yRatioToDb(ratio: number) {
  const t = 1 - Math.min(1, Math.max(0, ratio));
  return Math.round((MIN_DB + t * (MAX_DB - MIN_DB)) * 10) / 10;
}

// Catmull-Rom -> cubic bezier conversion so the line curves smoothly
// through each node instead of bending sharply at straight-line joints.
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export default function EQPanel() {
  const { eq, setEQ, eqBypassed, setEQBypassed } = usePlayer();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Band | null>(null);

  const handlePointer = useCallback((band: Band, clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    setEQ(band, yRatioToDb(ratio));
  }, [setEQ]);

  const startDrag = (band: Band) => (e: React.PointerEvent) => {
    if (eqBypassed) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(band);
    handlePointer(band, e.clientY);
  };

  const points = useMemo(
    () => BANDS.map((b, i) => ({ x: (i / (BANDS.length - 1)) * GRAPH_W, y: dbToY(eq[b.key]) })),
    [eq]
  );
  const linePath = useMemo(() => smoothPath(points), [points]);
  const fillPath = useMemo(
    () => `${linePath} L ${GRAPH_W} ${GRAPH_H} L 0 ${GRAPH_H} Z`,
    [linePath]
  );

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
        className={`relative flex-1 min-h-[180px] bg-canvas rounded-xl transition-opacity overflow-hidden ${eqBypassed ? "opacity-40" : ""}`}
        onPointerMove={(e) => { if (dragging) handlePointer(dragging, e.clientY); }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        <div className="absolute left-4 right-4 top-1/2 h-px bg-border" />

        <div className="absolute inset-4">
          <svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
            <path d={fillPath} fill="var(--accent)" opacity={0.4} />
            <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
          </svg>

          {BANDS.map(({ key }, i) => (
            <button
              key={key}
              onPointerDown={startDrag(key)}
              className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-primary shadow-lg cursor-grab active:cursor-grabbing touch-none"
              style={{
                left: `${(i / (BANDS.length - 1)) * 100}%`,
                top: `${(dbToY(eq[key]) / GRAPH_H) * 100}%`,
              }}
              disabled={eqBypassed}
              aria-label={`${key} band, ${eq[key]}dB`}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-between px-1 pt-3">
        {BANDS.map(({ key, label }) => (
          <div key={key} className="text-center flex-1">
            <p className="text-[11px] text-secondary leading-tight">{label}</p>
            <p className="text-[11px] text-tertiary tabular-nums">
              {eq[key] > 0 ? "+" : ""}{eq[key]}dB
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
