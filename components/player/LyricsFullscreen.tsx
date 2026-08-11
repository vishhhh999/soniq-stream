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
      className="fixed inset-0 z-[90] bg-canvas flex flex-col overflow-hidden"
    >
      {/* Ambient gradient wash -- soft accent glow, not the full
          audio-reactive canvas engine (too heavy/distracting for a page
          that's meant to be read), just enough color to keep this from
          feeling like a flat, dead screen. Low opacity so lyrics stay
          legible in both themes; --accent itself already resolves to the
          correct light/dark value via globals.css, no separate handling
          needed here. */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[20%] -left-[15%] w-[70vw] h-[70vw] rounded-full bg-accent/10 blur-[140px]" />
        <div className="absolute -bottom-[25%] -right-[15%] w-[60vw] h-[60vw] rounded-full bg-accent/[0.07] blur-[140px]" />
      </div>

      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0 relative z-10">
        <button onClick={onClose} aria-label="Close lyrics" className="w-9 h-9 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
        <span className="text-sm font-medium text-primary truncate max-w-[60%]">{track.title}</span>
        <div className="w-9" />
      </div>
      <div className="flex-1 min-h-0 px-6 pb-8 max-w-2xl w-full mx-auto relative z-10">
        <LyricsPanel track={track} showHeading={false} />
      </div>
    </motion.div>,
    document.body
  );
}
