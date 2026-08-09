"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Film, Upload } from "lucide-react";
import { detectBPM } from "@/lib/bpm";
import { detectKey } from "@/lib/key";

// Extracts the audio track from a video file and saves it to the library.
// Runs entirely in the browser via ffmpeg.wasm — Vercel's serverless
// functions don't ship with ffmpeg, and installing a native binary isn't
// an option there, so the alternative would be a separate always-on
// server just for this. Client-side avoids that entirely, at the cost of
// a ~25-30MB one-time download of the ffmpeg core (browser-cached after
// first use) and doing the actual decode/encode work on the user's own
// CPU, which is genuinely slow for long videos — set expectations for
// that in the UI rather than pretending it's instant.
//
// The FFmpeg class itself is dynamically imported inside handleFile
// rather than at module load time, so the (comparatively small) JS for
// it never loads for people who never open this modal.
export default function ConvertModal({
  albumId,
  folderId,
  onConverted,
  onClose,
}: {
  albumId?: string;
  folderId?: string;
  onConverted: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<"pick" | "loading-core" | "converting" | "uploading" | "analyzing">("pick");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      setStage("loading-core");
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL, fetchFile } = await import("@ffmpeg/util");

      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress: p }) => {
        setProgress(Math.min(100, Math.round(p * 100)));
      });

      // Single-threaded core -- avoids needing cross-origin-isolation
      // (COOP/COEP) headers that the multi-threaded build requires, which
      // would mean changing next.config.js in ways that could affect
      // other pages (embeds, R2 media loads, etc). Slower, but works
      // as a drop-in with zero server config changes.
      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      setStage("converting");
      setProgress(0);
      const inputName = "input" + (file.name.match(/\.[^.]+$/)?.[0] || ".mp4");
      const outputName = "output.mp3";
      await ffmpeg.writeFile(inputName, await fetchFile(file));
      // -vn: drop video entirely. -q:a 2: high-quality VBR mp3 (roughly
      // ~190kbps average) -- a reasonable default for a work-in-progress
      // reference, not archival-master quality.
      const exitCode = await ffmpeg.exec(["-i", inputName, "-vn", "-acodec", "libmp3lame", "-q:a", "2", outputName]);
      if (exitCode !== 0) throw new Error("Conversion failed -- the file may not be a supported video format.");

      const data = await ffmpeg.readFile(outputName);
      // Explicit copy into a plain ArrayBuffer -- ffmpeg.wasm's readFile
      // return type is generic over ArrayBufferLike (which includes
      // SharedArrayBuffer), and Blob's constructor wants a concrete
      // ArrayBuffer specifically. A copy sidesteps the type mismatch
      // without an unsafe cast.
      const bytes = data as Uint8Array;
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const audioBlob = new Blob([buffer], { type: "audio/mp3" });
      ffmpeg.terminate();

      await uploadConverted(audioBlob, file.name);
    } catch (e: any) {
      setError(e.message || "Conversion failed. Try a different file.");
      setStage("pick");
    }
  };

  const uploadConverted = async (audioBlob: Blob, originalName: string) => {
    setStage("uploading");
    const baseName = originalName.replace(/\.[^.]+$/, "");
    const filename = `${baseName}.mp3`;

    const presignRes = await fetch("/api/upload/presign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentType: "audio/mp3", kind: "track" }),
    });
    if (!presignRes.ok) throw new Error((await presignRes.json().catch(() => ({}))).error || "Could not prepare upload.");
    const { uploadUrl, publicUrl } = await presignRes.json();

    const putRes = await fetch(uploadUrl, { method: "PUT", body: audioBlob, headers: { "Content-Type": "audio/mp3" } });
    if (!putRes.ok) throw new Error(`Storage rejected the upload (${putRes.status}).`);

    const finalizeRes = await fetch("/api/upload/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicUrl,
        filename,
        contentType: "audio/mp3",
        fileSize: audioBlob.size,
        albumId,
        folderId,
      }),
    });
    if (!finalizeRes.ok) throw new Error((await finalizeRes.json().catch(() => ({}))).error || "Upload processing failed.");
    const track = await finalizeRes.json();

    // Same auto-detection pass a normal upload gets (see useTrackUpload) --
    // this flow bypasses that hook entirely since it has its own
    // conversion step first, so it's replicated here rather than shared.
    setStage("analyzing");
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
      if (keyResult.key) patch.key = keyResult.key;
      if (Object.keys(patch).length > 0) {
        await fetch(`/api/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      }
    } catch {
      // decode failed -- track stays without BPM/key, editable manually
    }

    onConverted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="w-full max-w-md rounded-2xl border border-border bg-elevated p-4 sm:p-6 relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-tertiary hover:text-primary transition-colors">
          <X size={18} strokeWidth={1.5} />
        </button>

        <div className="space-y-5">
          <div className="flex items-center gap-2.5">
            <Film size={18} strokeWidth={1.5} className="text-accent" />
            <span className="text-sm font-medium text-primary">Convert video to audio</span>
          </div>

          {stage === "pick" && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center gap-2 border-2 border-dashed border-border rounded-xl py-10 hover:border-border-strong transition-colors"
              >
                <Upload size={20} strokeWidth={1.5} className="text-secondary" />
                <span className="text-sm text-secondary">Choose a video file</span>
              </button>
              <p className="text-xs text-tertiary">
                Extracts just the audio track and saves it as an MP3. This happens entirely in your
                browser, so it can take a while for longer videos -- the tab needs to stay open until it's done.
              </p>
              {error && <p className="text-xs text-error">{error}</p>}
            </>
          )}

          {stage !== "pick" && (
            <div className="py-6 space-y-3">
              <p className="text-sm text-primary truncate">{fileName}</p>
              <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: stage === "converting" ? `${progress}%` : stage === "loading-core" ? "10%" : "100%" }}
                />
              </div>
              <p className="text-xs text-tertiary">
                {stage === "loading-core" && "Loading the converter (first time only, then cached)..."}
                {stage === "converting" && `Extracting audio... ${progress}%`}
                {stage === "uploading" && "Uploading..."}
                {stage === "analyzing" && "Detecting BPM & key..."}
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
