"use client";

import { useRef, useState } from "react";
import { usePlayer } from "./PlayerProvider";
import VinylArt from "./VinylArt";

// Grab the vinyl and rotate it to seek — a real interaction, not just a
// spinning decoration. Sensitivity is tuned so a full rotation covers a
// fixed amount of playback time regardless of track length, which reads
// as more natural than scaling to the whole track duration (that would
// make a 10-minute track need huge drags to move at all).
const SECONDS_PER_FULL_ROTATION = 20;

export default function InteractiveVinyl({
  coverUrl,
  size = 48,
  gradientFrom,
  gradientTo,
}: {
  coverUrl?: string | null;
  size?: number;
  gradientFrom?: string;
  gradientTo?: string;
}) {
  const { isPlaying, currentTime, duration, audioRef } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragRotation, setDragRotation] = useState<number | null>(null);
  const dragState = useRef<{ startAngle: number; startTime: number; accumulated: number } | null>(null);

  const angleFromEvent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return (Math.atan2(clientY - cy, clientX - cx) * 180) / Math.PI;
  };

  const startDrag = (clientX: number, clientY: number) => {
    const startAngle = angleFromEvent(clientX, clientY);
    dragState.current = { startAngle, startTime: audioRef.current?.currentTime ?? 0, accumulated: 0 };
    setDragRotation(0);
  };

  const moveDrag = (clientX: number, clientY: number) => {
    if (!dragState.current || !audioRef.current) return;
    let angle = angleFromEvent(clientX, clientY);
    let delta = angle - dragState.current.startAngle;
    // normalize to avoid a jump when crossing the -180/180 boundary
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const newRotation = dragState.current.accumulated + delta;
    setDragRotation(newRotation);

    const newTime = Math.max(0, Math.min(duration || 0, dragState.current.startTime + (newRotation / 360) * SECONDS_PER_FULL_ROTATION));
    audioRef.current.currentTime = newTime;

    dragState.current.startAngle = angle;
    dragState.current.accumulated = newRotation;
  };

  const endDrag = () => {
    dragState.current = null;
    setDragRotation(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        startDrag(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragState.current) moveDrag(e.clientX, e.clientY);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="cursor-grab active:cursor-grabbing touch-none"
      title="Drag to seek"
    >
      <VinylArt
        coverUrl={coverUrl}
        spinning={isPlaying}
        size={size}
        gradientFrom={gradientFrom}
        gradientTo={gradientTo}
        rotationOverride={dragRotation !== null ? dragRotation : undefined}
      />
    </div>
  );
}
