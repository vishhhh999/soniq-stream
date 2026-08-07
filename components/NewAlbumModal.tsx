"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ImagePlus } from "lucide-react";

export default function NewAlbumModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickCover = (file: File) => {
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const album = await res.json();

    if (coverFile) {
      const fd = new FormData();
      fd.append("file", coverFile);
      fd.append("albumId", album.id);
      await fetch("/api/upload/cover", { method: "POST", body: fd }).catch(() => {});
    }

    setBusy(false);
    onCreated();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="bg-elevated border border-border rounded-lg w-full max-w-sm p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-md font-medium text-primary">New album</h3>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-square rounded-md border border-dashed border-border hover:border-border-strong transition-colors flex items-center justify-center mb-4 overflow-hidden bg-surface"
          >
            {coverPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-tertiary">
                <ImagePlus size={22} strokeWidth={1.5} />
                <span className="text-xs">Add cover art</span>
              </div>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => e.target.files?.[0] && pickCover(e.target.files[0])}
          />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Album name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="w-full bg-surface border border-border rounded-md px-3 py-2.5 text-sm text-primary focus:border-border-strong outline-none mb-4"
          />

          <button
            onClick={submit}
            disabled={!name.trim() || busy}
            className="w-full bg-accent text-canvas text-sm font-medium py-2.5 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create album"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
