"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Laptop2 } from "lucide-react";
import { MODAL_SPRING } from "@/lib/motion";

export default function SnippetDesktopOnlyModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-canvas/95 backdrop-blur-sm flex items-center justify-center px-8"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={MODAL_SPRING}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-border"
      >
        {/* Dark gradient hero, same visual language as the snippet templates
            themselves (Depth Vinyl's dark gradient bg) instead of a flat
            neutral card -- the "bland" screen Vish flagged. */}
        <div className="relative bg-gradient-to-b from-[#1a1a1a] to-[#050505] px-8 pt-10 pb-8 text-center">
          <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/8 border border-white/10 flex items-center justify-center mx-auto mb-5">
            <Laptop2 size={22} strokeWidth={1.5} className="text-accent" />
          </div>
          <p className="text-base font-medium text-white mb-2">Desktop only, for now</p>
          <p className="text-xs text-white/60 leading-relaxed max-w-[260px] mx-auto">
            Snippet export is desktop-only for now, we&apos;re working on bringing it to mobile soon.
          </p>
        </div>
        <div className="bg-elevated px-6 py-4 text-center">
          <p className="text-[11px] text-tertiary">Open SONIQ on desktop to create and export a snippet.</p>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
