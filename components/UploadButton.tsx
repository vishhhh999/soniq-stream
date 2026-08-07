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
      try {
        // Step 1: ask our server for a direct-to-R2 upload URL. Tiny
        // request/response — the file itself doesn't touch this call.
        setLabel(`Preparing ${file.name}...`);
        const presignRes = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, contentType: file.type, kind: "track" }),
        });
        if (!presignRes.ok) {
          const d = await presignRes.json().catch(() => ({}));
          throw new Error(d.error || "Could not prepare upload.");
        }
        const { uploadUrl, publicUrl } = await presignRes.json();

        // Step 2: browser uploads the actual file straight to R2. This is
        // the step that used to go through our Vercel function and hit its
        // hard 4.5MB body-size limit on any real audio file. Now it goes
        // directly to storage instead.
        setLabel(`Uploading ${file.name}...`);
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) {
          throw new Error(`Storage rejected the upload (${putRes.status}). Check your R2 bucket's CORS policy.`);
        }

        // Step 3: tell our server the file landed — it fetches it back from
        // R2 (server-to-server, no size limit) to extract metadata and run
        // duplicate detection, then writes the DB row.
        setLabel(`Processing ${file.name}...`);
        const finalizeRes = await fetch("/api/upload/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicUrl,
            filename: file.name,
            contentType: file.type,
            fileSize: file.size,
            albumId,
            folderId,
          }),
        });
        if (!finalizeRes.ok) {
          const d = await finalizeRes.json().catch(() => ({}));
          throw new Error(d.error || "Upload processing failed.");
        }
        const track = await finalizeRes.json();
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
      } catch (e: any) {
        setError(`${file.name}: ${e.message || "upload failed"}`);
      }
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
