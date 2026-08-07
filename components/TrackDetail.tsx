"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Check, Download, Trash2 } from "lucide-react";
import type { Track } from "./PlayerProvider";
import { detectBPM } from "@/lib/bpm";
import { detectKey } from "@/lib/key";
import LyricsEditor from "./LyricsEditor";

const EXPIRY_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never", value: 0 },
];

export default function TrackDetail({
  track,
  onClose,
  onSaved,
  onDeleted,
}: {
  track: Track;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist ?? "");
  const [bpm, setBpm] = useState(track.bpm ?? "");
  const [key, setKey] = useState(track.key ?? "");
  const [notes, setNotes] = useState((track as any).notes ?? "");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [allowDownload, setAllowDownload] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveField = async (fields: Record<string, unknown>) => {
    setSaving(true);
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Trim/loop removed for now — the region-editing UI wasn't actually wired
  // to playback (saved coordinates, but nothing read them back), so it was
  // dead weight sitting in the panel. Worth rebuilding properly later,
  // alongside a real playback-gating implementation, not before.
  const saveChanges = async () => {
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || track.title,
        artist: artist.trim() || null,
        bpm: bpm === "" ? null : Number(bpm),
        key: key || null,
        notes: notes || null,
      }),
    });
    onSaved();
  };

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
    onDeleted();
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(track.fileUrl);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = track.fileUrl.match(/\.[^./?]+(?:\?|$)/)?.[0]?.replace("?", "") || ".mp3";
      a.download = `${track.title}${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed — the file couldn't be fetched. This is usually an R2 CORS issue on GET requests.");
    } finally {
      setDownloading(false);
    }
  };

  const runDetection = async () => {
    setDetecting(true);
    try {
      const [bpmResult, keyResult] = await Promise.all([
        detectBPM(track.fileUrl).catch((e) => ({ bpm: 0, confidence: 0, error: e })),
        detectKey(track.fileUrl).catch((e) => ({ key: "", confidence: 0, error: e })),
      ]);
      const patch: Record<string, unknown> = {};
      if (bpmResult.bpm > 0) {
        setBpm(bpmResult.bpm);
        patch.bpm = bpmResult.bpm;
        patch.bpmConfidence = bpmResult.confidence;
      }
      if (keyResult.key) {
        setKey(keyResult.key);
        patch.key = keyResult.key;
      }
      if (Object.keys(patch).length === 0) {
        // Surfacing the actual error now instead of a generic message —
        // "still doesn't work" with no detail is impossible to diagnose
        // further without this.
        const bpmErr = (bpmResult as any).error;
        const keyErr = (keyResult as any).error;
        const detail = bpmErr?.message || keyErr?.message || "unknown reason";
        alert(
          `Couldn't analyze this file (${detail}). Most likely cause: the R2 bucket's CORS policy allows PUT for uploads but the browser's fetch() for reading the file back still isn't getting a valid response — check that the CORS policy's AllowedMethods includes GET and that AllowedOrigins exactly matches your live domain.`
        );
        return;
      }
      await fetch(`/api/tracks/${track.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setDetecting(false);
    }
  };

  const createShare = async () => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: track.id,
        expiresInDays: expiryDays === 0 ? null : expiryDays,
        allowDownload,
      }),
    });
    const link = await res.json();
    setShareUrl(`${window.location.origin}/s/${link.token}`);
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="fixed inset-y-0 right-0 w-full max-w-md bg-elevated border-l border-border z-40 flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="min-w-0 flex-1 mr-4 space-y-1">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const trimmed = title.trim();
                if (trimmed && trimmed !== track.title) saveField({ title: trimmed });
                else if (!trimmed) setTitle(track.title);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="text-md font-medium text-primary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate"
            />
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onBlur={() => {
                const trimmed = artist.trim();
                if (trimmed !== (track.artist || "")) saveField({ artist: trimmed || null });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Unknown artist"
              className="text-sm text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate"
            />
            {(saving || saved) && (
              <p className="text-xs text-tertiary">{saving ? "Saving..." : "Saved"}</p>
            )}
          </div>
          <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors shrink-0">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">BPM</label>
              <input
                value={bpm}
                onChange={(e) => setBpm(e.target.value === "" ? "" : Number(e.target.value))}
                type="number"
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
                placeholder="—"
              />
              {track.bpm != null && <p className="text-xs text-tertiary mt-1">Auto-detected — correct if off.</p>}
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">Key</label>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
                placeholder="e.g. A minor"
              />
              {track.key != null && <p className="text-xs text-tertiary mt-1">Auto-detected — correct if off.</p>}
            </div>
          </div>

          <div>
            <button
              onClick={runDetection}
              disabled={detecting}
              className="text-xs text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-50"
            >
              {detecting ? "Analyzing..." : "Re-detect BPM & key"}
            </button>
            <p className="text-xs text-tertiary mt-1.5">
              Tracks uploaded before storage access was fully configured may have missed
              auto-detection — use this to run it now.
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Mix notes, context, anything worth remembering about this version..."
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">Lyrics</label>
            <LyricsEditor
              track={track}
              initialLyrics={(track as any).lyrics ?? ""}
              initialSynced={(track as any).lyricsSynced ?? null}
            />
          </div>

          <div className="border-t border-border pt-6">
            <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Share</label>

            {!shareUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExpiryDays(opt.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        expiryDays === opt.value
                          ? "border-accent text-accent"
                          : "border-border text-secondary hover:border-border-strong hover:text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={allowDownload}
                    onChange={(e) => setAllowDownload(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Allow download
                </label>

                <button
                  onClick={createShare}
                  className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors"
                >
                  <Link2 size={14} strokeWidth={1.5} />
                  Generate share link
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input readOnly value={shareUrl} className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-xs text-secondary" />
                <button onClick={copy} className="w-9 h-9 flex items-center justify-center rounded-md border border-border hover:border-border-strong shrink-0">
                  {copied ? <Check size={14} className="text-accent" /> : <Link2 size={14} className="text-secondary" />}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-6 flex items-center gap-3">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-50"
            >
              <Download size={14} strokeWidth={1.5} />
              {downloading ? "Downloading..." : "Download"}
            </button>

            {!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-2 text-sm text-error border border-error/40 rounded-md px-4 py-2 hover:bg-error/10 transition-colors"
              >
                <Trash2 size={14} strokeWidth={1.5} />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">Delete this track permanently?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-error border border-error/40 rounded-md px-3 py-1.5 hover:bg-error/10 transition-colors disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : "Yes, delete"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-border">
          <button onClick={saveChanges} className="w-full bg-accent text-canvas text-sm font-medium py-2.5 rounded-md hover:bg-accent-strong transition-colors">
            Save changes
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
