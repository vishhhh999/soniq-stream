"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Track } from "../PlayerProvider";
import EditPanel from "./EditPanel";
import { MODAL_SPRING } from "@/lib/motion";

// Same modal treatment as TrackDetail's "trackinfo dialog" -- a real
// centered modal with a backdrop, not a small anchored popover squeezed
// against the player bar. The Adjust/Stems/EQ toolset needs more room than
// a 420px popover gives it, and Vish flagged the cramped feel directly.
//
// MUST be portaled to document.body: PlayerBar's own outer wrapper uses
// `-translate-x-1/2` (a CSS transform) to center its floating pill, and any
// transformed ancestor becomes the containing block for position:fixed
// descendants. Without the portal this modal was rendering trapped inside
// that pill's box instead of covering the real viewport -- looked like a
// stray panel glued to the bottom of the screen. TrackDetail gets away
// without a portal because nothing in its own ancestor chain is transformed;
// EditDialog doesn't have that luxury since it's triggered from inside the
// player bar itself.
export default function EditDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient-60 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={MODAL_SPRING}
        className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
      >
        <div
          className="bg-elevated border border-border rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col pointer-events-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
            <h2 className="text-md font-medium text-primary">Edit</h2>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors" aria-label="Close">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
          <div className="p-6 flex-1 min-h-0 overflow-y-auto no-scrollbar">
            <EditPanel track={track} />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
