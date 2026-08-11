"use client";

import { useRef } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTrackUpload } from "@/lib/useTrackUpload";
import DuplicateChoiceModal from "./DuplicateChoiceModal";

export default function UploadButton({
  onUploaded,
  albumId,
  folderId,
  label: labelProp = "Add tracks",
}: {
  onUploaded: () => void;
  albumId?: string;
  folderId?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, label, error, setError, duplicatePrompt, uploadFiles, resolveDuplicateChoice } = useTrackUpload({
    albumId,
    folderId,
    onUploaded,
  });

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-2 text-sm font-medium bg-accent text-on-accent px-4 py-2 rounded-full hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2} />
        {busy ? label : labelProp}
      </button>

      {duplicatePrompt && (
        <DuplicateChoiceModal
          filename={duplicatePrompt.filename}
          existingTitle={duplicatePrompt.existingTitle}
          onChoose={resolveDuplicateChoice}
        />
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-2 right-0 z-10 w-72 max-w-[calc(100vw-2rem)] bg-elevated border border-error/40 rounded-md px-3 py-2 flex items-start gap-2"
          >
            <AlertCircle size={14} className="text-error shrink-0 mt-0.5" strokeWidth={1.5} />
            <p className="text-xs text-secondary flex-1 whitespace-pre-line">{error}</p>
            <button onClick={() => setError(null)} className="text-tertiary hover:text-primary text-xs">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
