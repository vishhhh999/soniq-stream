"use client";

import { useRef, useState } from "react";
import { detectBPM } from "@/lib/bpm";
import { detectKey } from "@/lib/key";
import { triggerFeedback } from "@/lib/feedback";

export function useTrackUpload({
  albumId,
  folderId,
  onUploaded,
}: {
  albumId?: string;
  folderId?: string;
  onUploaded: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const errorsRef = useRef<string[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{ filename: string; existingTitle: string } | null>(null);
  const duplicateChoiceResolver = useRef<((choice: "version" | "independent" | "cancel") => void) | null>(null);

  // Every failure in a batch previously overwrote `error`, so uploading
  // several files and having one fail for a different reason than the
  // last one meant you'd only ever see the LAST message — the actual
  // failure could be invisible. Accumulate instead, join for display.
  const addError = (msg: string) => {
    errorsRef.current = [...errorsRef.current, msg];
    setError(errorsRef.current.join("\n"));
  };

  const AUDIO_EXT_RE = /\.(mp3|wav|flac|aac|ogg|m4a|aiff?|wma|opus|webm)$/i;

  const askDuplicateChoice = (filename: string, existingTitle: string) => {
    return new Promise<"version" | "independent" | "cancel">((resolve) => {
      duplicateChoiceResolver.current = resolve;
      setDuplicatePrompt({ filename, existingTitle });
    });
  };

  const resolveDuplicateChoice = (choice: "version" | "independent" | "cancel") => {
    duplicateChoiceResolver.current?.(choice);
    duplicateChoiceResolver.current = null;
  };

  const uploadFiles = async (files: FileList | File[]) => {
    setBusy(true);
    setError(null);
    errorsRef.current = [];
    for (const file of Array.from(files)) {
      // Dropped files aren't guaranteed to be audio (OS drag-drop can
      // include anything) — the button's file input already filters via
      // accept="audio/*", but a drop zone has no such native filtering.
      // Some browsers/OSes report an empty file.type for certain formats
      // (.flac, some .m4a) — previously that empty string skipped the
      // check entirely (falsy `file.type &&`), letting anything through.
      // Fall back to checking the extension in that case.
      const looksLikeAudio = file.type ? file.type.startsWith("audio/") : AUDIO_EXT_RE.test(file.name);
      if (!looksLikeAudio) {
        addError(`${file.name}: not an audio file, skipped`);
        continue;
      }

      try {
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
        triggerFeedback("success"); // fires once here, not on the second onUploaded() below — that one is just a metadata refresh after BPM/key analysis, not a new completion event

        setLabel(`Analyzing ${file.name} (BPM & key)...`);
        try {
          const [bpmResult, keyResult] = await Promise.all([
            detectBPM(track.fileUrl).catch((e) => ({ bpm: 0, confidence: 0, error: e })),
            detectKey(track.fileUrl).catch((e) => ({ key: "", confidence: 0, error: e })),
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
          } else {
            const detail = (bpmResult as any).error?.message || (keyResult as any).error?.message || "no error details available";
            addError(`${file.name}: uploaded, but BPM/key analysis failed (${detail})`);
          }
        } catch {
          // decode failed — track stays without BPM/key, editable manually
        }
        onUploaded();
      } catch (e: any) {
        addError(`${file.name}: ${e.message || "upload failed"}`);
      }
    }
    setBusy(false);
    setLabel("");
  };

  const clearError = (_?: string | null) => {
    errorsRef.current = [];
    setError(null);
  };

  return { busy, label, error, setError: clearError, duplicatePrompt, uploadFiles, resolveDuplicateChoice };
}
