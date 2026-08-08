"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import SyncedLyricsList from "./SyncedLyricsList";
import type { SyncedLine } from "@/lib/lyricsSync";

export default function LyricsSidebar({ onExpand }: { onExpand: () => void }) {
  const { current, currentTime } = usePlayer();
  const [lines, setLines] = useState<SyncedLine[] | null>(null);

  useEffect(() => {
    if (!current) {
      setLines(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/tracks/${current.id}`)
      .then((r) => r.json())
      .then((full) => {
        if (cancelled) return;
        setLines(Array.isArray(full.lyricsSynced) && full.lyricsSynced.length > 0 ? full.lyricsSynced : null);
      })
      .catch(() => setLines(null));
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  if (!lines || lines.length === 0) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="w-80 shrink-0 border-l border-border sticky top-0 h-screen flex flex-col"
    >
      <div className="flex items-center justify-between px-8 pt-16 pb-6 shrink-0">
        <span className="text-xs uppercase tracking-wide text-tertiary">Lyrics</span>
        <button onClick={onExpand} className="text-tertiary hover:text-primary transition-colors" title="Expand">
          <Maximize2 size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div className="flex-1 min-h-0 pl-8 pb-16">
        <SyncedLyricsList lines={lines} currentTime={currentTime} variant="sidebar" />
      </div>
    </motion.aside>
  );
}
