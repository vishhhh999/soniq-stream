"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pencil } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import SyncedLyricsList from "./SyncedLyricsList";
import type { SyncedLine } from "@/lib/lyricsSync";
import AmbientBackground from "./AmbientBackground";

export default function LyricsView({ track, onClose }: { track: Track; onClose: () => void }) {
  const { currentTime } = usePlayer();
  const [lines, setLines] = useState<SyncedLine[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/tracks/${track.id}`)
      .then(r => r.json())
      .then(full => {
        if (Array.isArray(full.lyricsSynced) && full.lyricsSynced.length > 0) {
          setLines(full.lyricsSynced); setRawText(null);
        } else if (full.lyrics) {
          setLines(null); setRawText(full.lyrics);
        } else {
          setLines(null); setRawText(null);
        }
      })
      .finally(() => setLoading(false));
  }, [track.id]);

  if (!mounted) return null;

  const content = (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // bg-canvas is the solid base — without it the page bleeds through.
        // AmbientBackground (scoped) layers the reactive gradient on top.
        // Content sits at z-10 above both.
        className="fixed inset-0 z-40 bg-canvas overflow-hidden"
      >
        <AmbientBackground scoped />

        {/* Content layer — needs to be above the ambient canvas */}
        <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between px-8 py-6 shrink-0">
            <div>
              <p className="text-lg font-medium text-primary">{track.title}</p>
              <p className="text-sm text-secondary">{track.artist || "Unknown"}</p>
            </div>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors">
              <X size={22} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex-1 min-h-0 px-8 pb-8">
            {loading ? (
              <p className="text-secondary text-base text-center mt-24">Loading...</p>
            ) : lines && lines.length > 0 ? (
              <div className="max-w-2xl mx-auto h-full">
                <SyncedLyricsList lines={lines} currentTime={currentTime} variant="fullscreen" />
              </div>
            ) : rawText ? (
              <div className="max-w-2xl mx-auto py-24 text-center overflow-y-auto no-scrollbar h-full">
                <p className="text-secondary text-base mb-6">
                  Lyrics haven&apos;t been synced to timing yet — showing plain text.
                </p>
                <div className="text-primary text-lg leading-relaxed whitespace-pre-line">{rawText}</div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-secondary text-base mb-2">No lyrics added yet.</p>
                <p className="text-tertiary text-sm flex items-center gap-1.5">
                  <Pencil size={13} strokeWidth={1.5} />
                  Add them from the track panel.
                </p>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
