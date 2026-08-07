"use client";

import { useRef, useState } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { detectBPM } from "@/lib/bpm";

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
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(labelProp);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      setLabel(`Uploading ${file.name}...`);
      const fd = new FormData();
      fd.append("file", file);
      if (albumId) fd.append("albumId", albumId);
      if (folderId) fd.append("folderId", folderId);

      const res = await fetch("/api/upload", { method: "POST", body: fd });

      if (!res.ok) {
        // This is the fix for the bug where uploads silently vanished:
        // previously nothing checked res.ok, so a failed insert (or storage
        // error) looked identical to success from the UI's perspective.
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(`${file.name}: ${data.error || "upload failed"}`);
        continue;
      }

      const track = await res.json();
      onUploaded();

      setLabel(`Estimating BPM for ${file.name}...`);
      try {
        const { bpm, confidence } = await detectBPM(track.fileUrl);
        if (bpm > 0) {
          await fetch(`/api/tracks/${track.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bpm, bpmConfidence: confidence }),
          });
        }
      } catch {
        // decode failed (unsupported format edge case) — track stays without BPM, editable manually
      }
      onUploaded();
    }
    setBusy(false);
    setLabel(labelProp);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-2 text-sm font-medium bg-accent text-canvas px-4 py-2 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        <Plus size={16} strokeWidth={2} />
        {label}
      </button>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full mt-2 right-0 z-10 w-72 bg-elevated border border-error/40 rounded-md px-3 py-2 flex items-start gap-2"
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
