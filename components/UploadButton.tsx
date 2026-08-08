"use client";

import { useRef, useState } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { detectBPM } from "@/lib/bpm";
import { detectKey } from "@/lib/key";
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
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState(labelProp);
  const [error, setError] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ filename: string; existingTitle: string } | null>(null);
  const duplicateChoiceResolver = useRef<((choice: "version" | "independent" | "cancel") => void) | null>(null);

  const askDuplicateChoice = (filename: string, existingTitle: string) => {
    return new Promise<"version" | "independent" | "cancel">((resolve) => {
      duplicateChoiceResolver.current = resolve;
      setDuplicatePrompt({ filename, existingTitle });
    });
  };

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    setError(null);
    for (const file of Array.from(files)) {
      try {
        // Approximate title from filename — the real ID3-tag title isn't
        // known until the file is parsed server-side during finalize,
        // which happens after upload. Matches finalize's own fallback for
        // files with no title tag, and covers the common case where the
        // filename already is the track name.
        const approxTitle = file.name.replace(/\.[^.]+$/, "");
        let independent = false;

        setLabel(`Checking ${file.name}...`);
        const dupRes = await fetch("/api/tracks/check-duplicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: approxTitle, albumId, folderId }),
        });
        if (dupRes.ok) {
          const dup = await dupRes.json();
          if (dup.duplicate) {
            const choice = await askDuplicateChoice(file.name, dup.existingTitle);
            setDuplicatePrompt(null);
            if (choice === "cancel") continue;
            independent = choice === "independent";
          }
        }

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

        setLabel(`Uploading ${file.name}...`);
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!putRes.ok) {
          throw new Error(`Storage rejected the upload (${putRes.status}). Check your R2 bucket's CORS policy.`);
        }

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
            independent,
          }),
        });
        if (!finalizeRes.ok) {
          const d = await finalizeRes.json().catch(() => ({}));
          throw new Error(d.error || "Upload processing failed.");
        }
        const track = await finalizeRes.json();
        onUploaded();

        setLabel(`Analyzing ${file.name} (BPM & key)...`);
        try {
          const [bpmResult, keyResult] = await Promise.all([
            detectBPM(track.fileUrl).catch(() => ({ bpm: 0, confidence: 0 })),
            detectKey(track.fileUrl).catch(() => ({ key: "", confidence: 0 })),
          ]);
          const patch: Record<string, unknown> = {};
          if (bpmResult.bpm > 0) {
            patch.bpm = bpmResult.bpm;
            patch.bpmConfidence = bpmResult.confidence;
          }
          if (keyResult.key) {
            patch.key = keyResult.key;
          }
          if (Object.keys(patch).length > 0) {
            await fetch(`/api/tracks/${track.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
          }
        } catch {
          // decode failed (unsupported format edge case) — track stays without BPM/key, editable manually
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

      {duplicatePrompt && (
        <DuplicateChoiceModal
          filename={duplicatePrompt.filename}
          existingTitle={duplicatePrompt.existingTitle}
          onChoose={(choice) => {
            duplicateChoiceResolver.current?.(choice);
            duplicateChoiceResolver.current = null;
          }}
        />
      )}

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
