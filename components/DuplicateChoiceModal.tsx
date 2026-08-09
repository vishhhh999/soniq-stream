"use client";

import { motion, AnimatePresence } from "framer-motion";
import { MODAL_SPRING } from "@/lib/motion";

export default function DuplicateChoiceModal({
  filename,
  existingTitle,
  onChoose,
}: {
  filename: string;
  existingTitle: string;
  onChoose: (choice: "version" | "independent" | "cancel") => void;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient z-[60] flex items-center justify-center px-6"
        onClick={() => onChoose("cancel")}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={MODAL_SPRING}
          className="bg-elevated border border-border rounded-lg w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-md font-medium text-primary mb-2">Same name found</h3>
          <p className="text-sm text-secondary mb-6">
            &ldquo;{existingTitle}&rdquo; already exists here. Uploading &ldquo;{filename}&rdquo; — is this a new
            version of the same track, or a separate one that just happens to share the name?
          </p>
          <div className="space-y-2">
            <button
              onClick={() => onChoose("version")}
              className="w-full text-left bg-accent text-on-accent text-sm font-medium px-4 py-3 rounded-md hover:bg-accent-strong transition-colors"
            >
              New version — group with the existing track
            </button>
            <button
              onClick={() => onChoose("independent")}
              className="w-full text-left text-sm text-secondary border border-border px-4 py-3 rounded-md hover:border-border-strong hover:text-primary transition-colors"
            >
              Keep both — treat as separate tracks
            </button>
            <button
              onClick={() => onChoose("cancel")}
              className="w-full text-center text-xs text-tertiary py-2 hover:text-secondary transition-colors"
            >
              Cancel this upload
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
