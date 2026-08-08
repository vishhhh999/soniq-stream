"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import { getCurrentLineIndex, SyncedLine } from "@/lib/lyricsSync";

export default function LyricsSidebar({ onExpand }: { onExpand: () => void }) {
  const { current, currentTime } = usePlayer();
  const [lines, setLines] = useState<SyncedLine[] | null>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);

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

  const activeIndex = lines ? getCurrentLineIndex(lines, currentTime) : -1;

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  // Nothing to show — the caller (layout) collapses the space entirely
  // rather than rendering an empty column, per spec: "if a track doesn't
  // have synced lyrics, stays as is right now."
  if (!lines || lines.length === 0) return null;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
      className="w-80 shrink-0 border-l border-border pl-8 py-16 sticky top-0 h-screen overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs uppercase tracking-wide text-tertiary">Lyrics</span>
        <button onClick={onExpand} className="text-tertiary hover:text-primary transition-colors" title="Expand">
          <Maximize2 size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div className="space-y-4 pb-24">
        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <p
              key={i}
              ref={i === activeIndex ? activeLineRef : undefined}
              className={`transition-all duration-300 text-sm leading-relaxed ${
                i === activeIndex ? "text-primary font-medium" : "text-tertiary"
              }`}
            >
              {line.text}
            </p>
          ))}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
