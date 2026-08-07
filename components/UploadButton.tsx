"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { detectBPM } from "@/lib/bpm";

export default function UploadButton({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("Add tracks");

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      setLabel(`Uploading ${file.name}...`);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const track = await res.json();

      onUploaded(); // reflect the track in the library immediately

      // BPM detection runs after upload, in the background, patched in once done
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
    setLabel("Add tracks");
  };

  return (
    <>
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
    </>
  );
}
