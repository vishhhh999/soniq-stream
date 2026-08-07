"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, MoreHorizontal, ChevronDown } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import PlayingIndicator from "./PlayingIndicator";
import type { TrackGroup } from "@/lib/groupVersions";

function Row({
  track,
  onOpenDetail,
  versionBadge,
  queueTracks,
  queueIndex,
}: {
  track: Track;
  onOpenDetail: (t: Track) => void;
  versionBadge?: number;
  queueTracks: Track[];
  queueIndex: number;
}) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;

  const fmt = (s?: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handlePlay = () => {
    if (isCurrent) toggle();
    // Play with the full visible list as queue context — this is what
    // makes skip forward/back and auto-advance-on-end actually mean
    // something, instead of the buttons doing nothing at all.
    else playQueue(queueTracks, queueIndex);
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

      <div className="min-w-0 flex-1 flex items-center gap-2">
        {isCurrent && isPlaying && <PlayingIndicator />}
        <div className="min-w-0">
          <p className={`text-sm truncate ${isCurrent ? "text-primary font-medium" : "text-primary"}`}>{track.title}</p>
          <p className="text-xs text-secondary truncate">{track.artist || "Unknown artist"}</p>
        </div>
        {versionBadge && versionBadge > 1 && (
          <span className="text-[10px] uppercase tracking-wide text-tertiary border border-border rounded-full px-1.5 py-0.5 shrink-0">
            v{versionBadge}
          </span>
        )}
      </div>

      <span className="text-xs text-tertiary tabular-nums w-12 text-right">{fmt(track.durationSec)}</span>

      <MoreHorizontal size={16} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

export default function TrackRowGroup({
  group,
  onOpenDetail,
  queueTracks,
  queueIndex,
}: {
  group: TrackGroup;
  onOpenDetail: (t: Track) => void;
  queueTracks: Track[];
  queueIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasVersions = group.olderVersions.length > 0;

  return (
    <div>
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <Row
            track={group.latest}
            onOpenDetail={onOpenDetail}
            versionBadge={group.latest.versionNumber ?? undefined}
            queueTracks={queueTracks}
            queueIndex={queueIndex}
          />
        </div>
        {hasVersions && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-tertiary hover:text-primary transition-colors px-2 shrink-0"
            title={`${group.olderVersions.length} older version${group.olderVersions.length > 1 ? "s" : ""}`}
          >
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-block">
              <ChevronDown size={14} strokeWidth={1.5} />
            </motion.span>
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && hasVersions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-8 border-l border-border ml-8"
          >
            {group.olderVersions.map((v) => (
              // Older versions play standalone, not part of the main queue —
              // they're a deliberate deviation from the main track list.
              <Row key={v.id} track={v} onOpenDetail={onOpenDetail} versionBadge={v.versionNumber ?? undefined} queueTracks={[v]} queueIndex={0} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
