"use client";

import { useState, useRef, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadCloud, AlertCircle } from "lucide-react";
import { useTrackUpload } from "@/lib/useTrackUpload";
import DuplicateChoiceModal from "./DuplicateChoiceModal";

// Drag files in from the OS file system anywhere on the page to upload
// them — the native browser drag-and-drop API (dragenter/dragover/drop),
// which is entirely separate from dnd-kit's pointer-based dragging of
// already-uploaded tracks/albums between albums. The two don't conflict:
// OS file drags carry `e.dataTransfer.files`, in-app dnd-kit drags don't.
export default function UploadDropZone({
  albumId,
  folderId,
  onUploaded,
  children,
}: {
  albumId?: string;
  folderId?: string;
  onUploaded: () => void;
  children: ReactNode;
}) {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const dragCounter = useRef(0);
  const { busy, label, error, setError, duplicatePrompt, uploadFiles, resolveDuplicateChoice } = useTrackUpload({
    albumId,
    folderId,
    onUploaded,
  });

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  const onDragEnter = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current += 1;
    setIsDraggingFiles(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingFiles(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingFiles(false);
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative"
    >
      {children}

      <AnimatePresence>
        {isDraggingFiles && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-canvas/90 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="border-2 border-dashed border-accent rounded-2xl px-16 py-12 flex flex-col items-center gap-4">
              <UploadCloud size={40} strokeWidth={1.2} className="text-accent" />
              <p className="text-lg text-primary font-medium">Drop to upload</p>
              <p className="text-sm text-secondary">Audio files only</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {busy && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-elevated border border-border rounded-full shadow-xl px-5 py-2.5 text-sm text-secondary">
          {label}
        </div>
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
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-96 max-w-[calc(100vw-2rem)] bg-elevated border border-error/40 rounded-lg shadow-xl px-4 py-3 flex items-start gap-2"
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
