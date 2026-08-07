"use client";

import { Play, Pause, MoreHorizontal } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";

export default function TrackRow({ track, onOpenDetail }: { track: Track; onOpenDetail: (t: Track) => void }) {
  const { current, isPlaying, play, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;

  const fmt = (s?: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handlePlay = () => {
    if (isCurrent) toggle();
    else play(track);
  };

  return (
    <div
      className={`group flex items-center gap-4 px-4 py-3 rounded-md hover:bg-surface transition-colors cursor-pointer ${
        isCurrent ? "bg-surface" : ""
      }`}
      onClick={() => onOpenDetail(track)}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handlePlay();
        }}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-border group-hover:border-border-strong transition-colors shrink-0"
      >
        {isCurrent && isPlaying ? (
          <Pause size={13} strokeWidth={2} className="text-accent" />
        ) : (
          <Play size={13} strokeWidth={2} className="ml-0.5 text-secondary group-hover:text-primary" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${isCurrent ? "text-accent" : "text-primary"}`}>{track.title}</p>
        <p className="text-xs text-secondary truncate">{track.artist || "Unknown artist"}</p>
      </div>

      <span className="text-xs text-tertiary tabular-nums w-14 text-right">
        {track.bpm ? `${Math.round(track.bpm)} BPM` : "—"}
      </span>
      <span className="text-xs text-tertiary tabular-nums w-12 text-right">{fmt(track.durationSec)}</span>

      <MoreHorizontal size={16} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}
