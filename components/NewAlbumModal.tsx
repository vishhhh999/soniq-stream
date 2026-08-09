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

  const [error, setError] = useState<string | null>(null);
  const [albumCreated, setAlbumCreated] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) {
      // Previously unchecked — a failed create (expired session, bad
      // request) still fell through to onCreated(), closing the modal as
      // if the album had been made when nothing was actually created.
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Could not create the album. Try again.");
      setBusy(false);
      return;
    }
    const album = await res.json();
    setAlbumCreated(true);

    if (coverFile) {
      try {
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: coverFile.name, contentType: coverFile.type, kind: "cover" }),
        });
        if (!presignRes.ok) throw new Error((await presignRes.json().catch(() => ({}))).error || "Could not prepare cover upload.");
        const { uploadUrl, publicUrl } = await presignRes.json();

        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: coverFile,
          headers: { "Content-Type": coverFile.type || "application/octet-stream" },
        });
        if (!putRes.ok) throw new Error(`Storage rejected the upload (${putRes.status}).`);

        await fetch("/api/upload/cover/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: album.id, publicUrl }),
        });
      } catch (e: any) {
        // Album itself was created successfully — only the cover art failed.
        // Surface it and let the user decide when to move on, rather than
        // flashing an error that immediately gets hidden by an auto-close.
        setError(`Album created, but cover art failed: ${e.message}`);
        setBusy(false);
        return;
      }
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
        className="fixed inset-0 backdrop-ambient z-50 flex items-center justify-center px-6"
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

          {error && (
            <div className="mb-4 text-xs text-error border border-error/40 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={error ? (albumCreated ? onCreated : submit) : submit}
            disabled={!name.trim() || busy}
            className="w-full bg-accent text-on-accent text-sm font-medium py-2.5 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {busy ? "Creating..." : error ? (albumCreated ? "Continue without cover" : "Try again") : "Create album"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
