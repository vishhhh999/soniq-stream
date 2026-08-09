"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MODAL_SPRING } from "@/lib/motion";

export default function CreateFolderModal({
  albumA,
  albumB,
  onConfirm,
  onCancel,
}: {
  albumA: string;
  albumB: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient z-[60] flex items-center justify-center px-6"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={MODAL_SPRING}
          className="bg-elevated border border-border rounded-lg w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-md font-medium text-primary mb-2">Create a folder?</h3>
          <p className="text-sm text-secondary mb-6">
            Group &ldquo;{albumA}&rdquo; and &ldquo;{albumB}&rdquo; into a folder — you can add more albums to it
            later.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onConfirm}
              className="flex-1 bg-accent text-on-accent text-sm font-medium py-2.5 rounded-md hover:bg-accent-strong transition-colors"
            >
              Create folder
            </button>
            <button
              onClick={onCancel}
              className="text-sm text-secondary border border-border rounded-md px-4 py-2.5 hover:border-border-strong transition-colors"
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
