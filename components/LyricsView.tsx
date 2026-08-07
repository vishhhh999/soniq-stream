"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import { getCurrentLineIndex, SyncedLine } from "@/lib/lyricsSync";

export default function LyricsView({ track, onClose }: { track: Track; onClose: () => void }) {
  const { currentTime } = usePlayer();
  const [lines, setLines] = useState<SyncedLine[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tracks/${track.id}`)
      .then((r) => r.json())
      .then((full) => {
        if (Array.isArray(full.lyricsSynced) && full.lyricsSynced.length > 0) {
          setLines(full.lyricsSynced);
          setRawText(null);
        } else if (full.lyrics) {
          setLines(null);
          setRawText(full.lyrics);
        } else {
          setLines(null);
          setRawText(null);
        }
      })
      .finally(() => setLoading(false));
  }, [track.id]);

  const activeIndex = lines ? getCurrentLineIndex(lines, currentTime) : -1;

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-canvas z-40 flex flex-col"
      >
        <div className="flex items-center justify-between px-8 py-6 shrink-0">
          <div>
            <p className="text-lg font-medium text-primary">{track.title}</p>
            <p className="text-sm text-secondary">{track.artist || "Unknown"}</p>
          </div>
          <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors">
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>

        <div ref={containerRef} className="flex-1 overflow-y-auto px-8 pb-32 flex flex-col items-center">
          {loading ? (
            <p className="text-secondary text-base mt-24">Loading...</p>
          ) : lines && lines.length > 0 ? (
            <div className="max-w-2xl w-full py-24 space-y-6">
              {lines.map((line, i) => (
                <p
                  key={i}
                  ref={i === activeIndex ? activeLineRef : undefined}
                  className={`text-center transition-all duration-300 ${
                    i === activeIndex
                      ? "text-primary text-3xl font-medium scale-100 opacity-100"
                      : "text-tertiary text-xl scale-95 opacity-50"
                  }`}
                >
                  {line.text}
                </p>
              ))}
            </div>
          ) : rawText ? (
            <div className="max-w-2xl w-full py-24 text-center">
              <p className="text-secondary text-base mb-6">
                Lyrics haven&apos;t been synced to timing yet — showing plain text.
              </p>
              <div className="text-primary text-lg leading-relaxed whitespace-pre-line">{rawText}</div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 mt-24 text-center">
              <p className="text-secondary text-base mb-2">No lyrics added yet.</p>
              <p className="text-tertiary text-sm flex items-center gap-1.5">
                <Pencil size={13} strokeWidth={1.5} />
                Add them from the track panel.
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
