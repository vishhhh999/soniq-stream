"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, FolderInput, X } from "lucide-react";
import type { Album } from "./AlbumCard";
import { MODAL_SPRING } from "@/lib/motion";

export default function SelectionToolbar({
  count,
  albums,
  onDelete,
  onMoveToAlbum,
  onClear,
}: {
  count: number;
  albums: Album[];
  onDelete: () => void;
  onMoveToAlbum: (albumId: string) => void;
  onClear: () => void;
}) {
  const [showAlbumPicker, setShowAlbumPicker] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (count === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={MODAL_SPRING}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-elevated border border-border rounded-full shadow-xl px-4 sm:px-5 py-3 flex items-center gap-3 sm:gap-4 max-w-[calc(100vw-2rem)]"
      >
        <span className="text-sm text-primary font-medium">{count} selected</span>

        <div className="relative">
          <button
            onClick={() => setShowAlbumPicker((v) => !v)}
            disabled={albums.length === 0}
            className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors disabled:opacity-40"
          >
            <FolderInput size={15} strokeWidth={1.5} />
            <span className="hidden sm:inline">Move to album</span>
            <span className="sm:hidden">Move</span>
          </button>
          <AnimatePresence>
            {showAlbumPicker && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-56 bg-elevated border border-border rounded-lg shadow-xl overflow-hidden"
              >
                {albums.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      onMoveToAlbum(a.id);
                      setShowAlbumPicker(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors truncate"
                  >
                    {a.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-1.5 text-sm text-error hover:text-error/80 transition-colors"
          >
            <Trash2 size={15} strokeWidth={1.5} />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onDelete();
                setConfirmingDelete(false);
              }}
              className="text-xs text-error border border-error/40 rounded-full px-3 py-1 hover:bg-error/10 transition-colors"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="text-xs text-secondary hover:text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        <button onClick={onClear} className="text-tertiary hover:text-primary transition-colors">
          <X size={16} strokeWidth={1.5} />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
