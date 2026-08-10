"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Monitor } from "lucide-react";
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
        className="bg-elevated border border-border rounded-2xl p-8 max-w-sm w-full text-center relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-tertiary hover:text-primary transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
        <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center mx-auto mb-4 text-secondary">
          <Monitor size={20} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-medium text-primary mb-1.5">Desktop only, for now</p>
        <p className="text-xs text-secondary leading-relaxed">
          Snippet export is desktop-only for now, we&apos;re working on bringing it to mobile soon.
        </p>
      </motion.div>
    </motion.div>,
    document.body
  );
}
