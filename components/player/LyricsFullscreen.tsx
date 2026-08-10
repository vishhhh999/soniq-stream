"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Track } from "../PlayerProvider";
import LyricsPanel from "./LyricsPanel";

// Was a small anchored popover (w-96, positioned relative to a button
// buried in the middle of the player bar) that read as cramped and
// oddly placed regardless of alignment settings. Just goes fullscreen now,
// same portal + full-viewport treatment as NewSnippetModal, so there's no
// positioning judgment call left to get wrong.
export default function LyricsFullscreen({ track, onClose }: { track: Track; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-canvas flex flex-col"
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-medium text-primary truncate max-w-[60%]">{track.title}</span>
        <div className="w-9" />
      </div>
      <div className="flex-1 min-h-0 px-6 pb-8 max-w-2xl w-full mx-auto">
        <LyricsPanel track={track} />
      </div>
    </motion.div>,
    document.body
  );
}
