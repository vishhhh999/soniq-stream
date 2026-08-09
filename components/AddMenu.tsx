"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, AlertCircle, Music, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTrackUpload } from "@/lib/useTrackUpload";
import DuplicateChoiceModal from "./DuplicateChoiceModal";
import RecordModal from "./RecordModal";

// Replaces the old plain "Add tracks" button with a small menu — Upload
// audio (the existing flow, unchanged) and Record (new). Structured so
// Convert (video -> audio) can be added as a third menu item later
// without touching either of the other two flows.
export default function AddMenu({
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const { busy, label, error, setError, duplicatePrompt, uploadFiles, resolveDuplicateChoice } = useTrackUpload({
    albumId,
    folderId,
    onUploaded,
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => e.target.files && uploadFiles(e.target.files)}
      />
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="flex items-center gap-2 text-sm font-medium bg-accent text-canvas px-4 py-2 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2} />
        {busy ? label : labelProp}
      </button>

      <AnimatePresence>
        {open && !busy && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-2 right-0 z-20 w-48 bg-elevated border border-border rounded-lg shadow-lg overflow-hidden"
          >
            <button
              onClick={() => {
                setOpen(false);
                inputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors text-left"
            >
              <Music size={14} strokeWidth={1.5} className="text-secondary" />
              Upload audio
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setShowRecord(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors text-left"
            >
              <Mic size={14} strokeWidth={1.5} className="text-secondary" />
              Record
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {showRecord && (
        <RecordModal
          albumId={albumId}
          folderId={folderId}
          onRecorded={onUploaded}
          onClose={() => setShowRecord(false)}
        />
      )}

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
            <p className="text-xs text-secondary flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-tertiary hover:text-primary text-xs">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
