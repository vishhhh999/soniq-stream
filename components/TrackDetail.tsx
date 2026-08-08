"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Link2, Check, Download, Trash2, ChevronDown, FileText, Mic2,
  Music2, ListPlus, Copy, Share2,
} from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import { detectBPM } from "@/lib/bpm";
import { detectKey } from "@/lib/key";
import { waveformBars } from "@/lib/waveformBars";
import LyricsEditor from "./LyricsEditor";

const EXPIRY_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never", value: 0 },
];

function Row({
  icon,
  label,
  open,
  onToggle,
  children,
  rightHint,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  rightHint?: string;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left"
      >
        <span className="text-secondary shrink-0">{icon}</span>
        <span className="flex-1 text-sm text-primary font-medium">{label}</span>
        {rightHint && <span className="text-xs text-tertiary">{rightHint}</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-tertiary shrink-0">
          <ChevronDown size={14} strokeWidth={1.5} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors disabled:opacity-40 ${
        danger ? "text-error hover:bg-error/10" : "text-primary hover:bg-surface"
      }`}
    >
      <span className={danger ? "text-error" : "text-secondary"}>{icon}</span>
      <span className="text-sm text-left flex-1">{label}</span>
    </button>
  );
}

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
  const { queue, reorderQueue, playQueue } = usePlayer();
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
  const [duplicating, setDuplicating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playCount, setPlayCount] = useState<number | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tracks/${track.id}/play`)
      .then((r) => r.json())
      .then((d) => setPlayCount(d.count ?? null))
      .catch(() => {});
  }, [track.id]);

  const toggleRow = (name: string) => setOpenRow((r) => (r === name ? null : name));

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

  const handleDuplicate = async () => {
    setDuplicating(true);
    const res = await fetch(`/api/tracks/${track.id}/duplicate`, { method: "POST" }).catch(() => null);
    setDuplicating(false);
    if (!res || !res.ok) {
      alert("Could not duplicate this track.");
      return;
    }
    onSaved(); // refreshes the list, closes the panel — same pattern as other list-changing actions
  };

  const handleAddToQueue = () => {
    reorderQueue([...queue, track]);
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
        const bpmErr = (bpmResult as any).error;
        const keyErr = (keyResult as any).error;
        const detail = bpmErr?.message || keyErr?.message || "unknown reason";
        alert(`Couldn't analyze this file (${detail}). Open the browser console and try again — the exact error there is the fastest way to pin this down.`);
        console.error("BPM/key detection failed — bpm error:", bpmErr, "key error:", keyErr);
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

  const fmt = (s?: number | null) => {
    if (!s) return null;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };
  const filename = track.fileUrl.split("/").pop()?.split("?")[0] || "";
  const bars = waveformBars(track.id, 56);
  const subtitleParts = [fmt(track.durationSec), track.key, track.bpm ? `${Math.round(track.bpm)} BPM` : null].filter(Boolean);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="fixed inset-y-0 right-0 w-full max-w-md bg-elevated border-l border-border z-40 flex flex-col overflow-y-auto no-scrollbar"
      >
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start justify-between mb-4">
            <div className="min-w-0 flex-1 mr-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  const trimmed = title.trim();
                  if (trimmed && trimmed !== track.title) saveField({ title: trimmed });
                  else if (!trimmed) setTitle(track.title);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="text-lg font-medium text-primary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate"
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
                className="text-sm text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate mt-0.5"
              />
              {subtitleParts.length > 0 && (
                <p className="text-xs text-tertiary mt-1.5">{subtitleParts.join(" · ")}</p>
              )}
              {(saving || saved) && <p className="text-xs text-tertiary mt-1">{saving ? "Saving..." : "Saved"}</p>}
              {playCount !== null && <p className="text-xs text-tertiary mt-1">{playCount} play{playCount === 1 ? "" : "s"}</p>}
            </div>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors shrink-0">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {/* Static, deterministic waveform preview — not the interactive
             player seek bar, since this track may not be the one currently
             playing. Purely a visual identifier, same bar generator used
             elsewhere so a track always shows the same shape. */}
          <div className="flex items-end gap-[2px] h-10 mb-2">
            {bars.map((h, i) => (
              <div key={i} className="flex-1 rounded-[1px] bg-border-strong" style={{ height: `${h * 100}%` }} />
            ))}
          </div>
          {filename && <p className="text-xs text-tertiary truncate">{filename}</p>}
        </div>

        <div className="border-t border-border">
          <p className="text-xs uppercase tracking-wide text-tertiary px-4 pt-4 pb-1">Details</p>

          <Row icon={<Share2 size={15} strokeWidth={1.5} />} label="Share" open={openRow === "share"} onToggle={() => toggleRow("share")} rightHint={shareUrl ? "Active" : "Private"}>
            {!shareUrl ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {EXPIRY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExpiryDays(opt.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        expiryDays === opt.value ? "border-accent text-accent" : "border-border text-secondary hover:border-border-strong hover:text-primary"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer w-fit">
                  <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} className="accent-[var(--accent)]" />
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
          </Row>

          <Row icon={<FileText size={15} strokeWidth={1.5} />} label="Notes" open={openRow === "notes"} onToggle={() => toggleRow("notes")}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => saveField({ notes: notes || null })}
              rows={3}
              placeholder="Mix notes, context, anything worth remembering about this version..."
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none resize-none"
            />
          </Row>

          <Row icon={<Music2 size={15} strokeWidth={1.5} />} label="BPM & Key" open={openRow === "bpmkey"} onToggle={() => toggleRow("bpmkey")}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary mb-1.5 block">BPM</label>
                <input
                  value={bpm}
                  onChange={(e) => setBpm(e.target.value === "" ? "" : Number(e.target.value))}
                  onBlur={() => saveField({ bpm: bpm === "" ? null : Number(bpm) })}
                  type="number"
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
                  placeholder="—"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-tertiary mb-1.5 block">Key</label>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onBlur={() => saveField({ key: key || null })}
                  className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
                  placeholder="e.g. A minor"
                />
              </div>
            </div>
            <button
              onClick={runDetection}
              disabled={detecting}
              className="text-xs text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-50"
            >
              {detecting ? "Analyzing..." : "Re-detect BPM & key"}
            </button>
          </Row>

          <Row icon={<Mic2 size={15} strokeWidth={1.5} />} label="Lyrics" open={openRow === "lyrics"} onToggle={() => toggleRow("lyrics")}>
            <LyricsEditor track={track} initialLyrics={(track as any).lyrics ?? ""} initialSynced={(track as any).lyricsSynced ?? null} />
          </Row>

          <ActionRow icon={<ListPlus size={15} strokeWidth={1.5} />} label="Add to queue" onClick={handleAddToQueue} />
        </div>

        <div className="border-t border-border">
          <ActionRow icon={<Download size={15} strokeWidth={1.5} />} label={downloading ? "Downloading..." : "Download"} onClick={handleDownload} disabled={downloading} />
          <ActionRow icon={<Copy size={15} strokeWidth={1.5} />} label={duplicating ? "Duplicating..." : "Duplicate"} onClick={handleDuplicate} disabled={duplicating} />
        </div>

        <div className="border-t border-border">
          {!confirmingDelete ? (
            <ActionRow icon={<Trash2 size={15} strokeWidth={1.5} />} label="Delete" onClick={() => setConfirmingDelete(true)} danger />
          ) : (
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="text-xs text-secondary flex-1">Delete this track permanently?</span>
              <button onClick={handleDelete} disabled={deleting} className="text-xs text-error font-medium hover:underline disabled:opacity-50">
                {deleting ? "..." : "Yes"}
              </button>
              <button onClick={() => setConfirmingDelete(false)} className="text-xs text-tertiary hover:text-primary">
                No
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
