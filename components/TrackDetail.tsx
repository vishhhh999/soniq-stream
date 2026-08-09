"use client";

import { useState, useEffect } from "react";
import { triggerFeedback } from "@/lib/feedback";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Link2, Check, Download, Trash2, ChevronDown, FileText, Mic2,
  Music2, ListPlus, Copy, Share2, Info,
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

// Collapsible detail row used on the right panel.
function Row({
  icon, label, open, onToggle, children, rightHint,
}: {
  icon: React.ReactNode; label: string; open: boolean;
  onToggle: () => void; children: React.ReactNode; rightHint?: string;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-canvas/60 transition-colors text-left rounded-lg"
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
  icon, label, onClick, disabled, danger, rightHint,
}: {
  icon: React.ReactNode; label: string; onClick: () => void;
  disabled?: boolean; danger?: boolean; rightHint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-3 transition-colors disabled:opacity-40 rounded-lg ${
        danger ? "text-error hover:bg-error/10" : "text-primary hover:bg-canvas/60"
      }`}
    >
      <span className={`shrink-0 ${danger ? "text-error" : "text-secondary"}`}>{icon}</span>
      <span className="text-sm text-left flex-1">{label}</span>
      {rightHint && <span className="text-xs text-tertiary">{rightHint}</span>}
    </button>
  );
}

export default function TrackDetail({
  track, onClose, onSaved, onDeleted,
}: {
  track: Track; onClose: () => void; onSaved: () => void; onDeleted: () => void;
}) {
  const { queue, reorderQueue } = usePlayer();
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
  const [showMoreInfo, setShowMoreInfo] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tracks/${track.id}/play`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPlayCount(d.count ?? null); })
      .catch(() => {});
  }, [track.id]);

  // Previously this only ever lived in local state, set once right after
  // Generate link was clicked — reopening this panel (or the whole track)
  // always showed "Private" again even if a real, still-active link
  // existed. Now it actually checks.
  useEffect(() => {
    fetch(`/api/tracks/${track.id}/share`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.link) {
          setShareUrl(`${window.location.origin}/s/${d.link.token}`);
          setAllowDownload(!!d.link.allowDownload);
        }
      })
      .catch(() => {});
  }, [track.id]);

  const toggleRow = (name: string) => setOpenRow((r) => (r === name ? null : name));

  const saveField = async (fields: Record<string, unknown>) => {
    setSaving(true);
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Could not delete this track. Try again.");
        return;
      }
      onDeleted();
    } catch {
      alert("Could not delete this track. Check your connection and try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(track.fileUrl);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = track.fileUrl.match(/\.[^./?]+(?:\?|$)/)?.[0]?.replace("?", "") || ".mp3";
      a.download = `${track.title}${ext}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      alert("Download failed. This is usually an R2 CORS issue on GET requests.");
    } finally {
      setDownloading(false);
    }
  };

  const handleDuplicate = async () => {
    setDuplicating(true);
    const res = await fetch(`/api/tracks/${track.id}/duplicate`, { method: "POST" }).catch(() => null);
    setDuplicating(false);
    if (!res?.ok) { alert("Could not duplicate this track."); return; }
    onSaved();
  };

  const runDetection = async () => {
    setDetecting(true);
    try {
      const [bpmResult, keyResult] = await Promise.all([
        detectBPM(track.fileUrl).catch((e) => ({ bpm: 0, confidence: 0, error: e })),
        detectKey(track.fileUrl).catch((e) => ({ key: "", confidence: 0, error: e })),
      ]);
      const patch: Record<string, unknown> = {};
      if (bpmResult.bpm > 0) { setBpm(bpmResult.bpm); patch.bpm = bpmResult.bpm; patch.bpmConfidence = bpmResult.confidence; }
      if (keyResult.key) { setKey(keyResult.key); patch.key = keyResult.key; }
      if (Object.keys(patch).length === 0) {
        const detail = (bpmResult as any).error?.message || (keyResult as any).error?.message || "unknown";
        alert(`Detection failed: ${detail}`);
        return;
      }
      await fetch(`/api/tracks/${track.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setDetecting(false); }
  };

  const createShare = async () => {
    setShareError(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, expiresInDays: expiryDays === 0 ? null : expiryDays, allowDownload }),
      });
      if (!res.ok) throw new Error();
      const link = await res.json();
      setShareUrl(`${window.location.origin}/s/${link.token}`);
    } catch {
      setShareError("Couldn't create the share link. Try again.");
    }
  };

  // Toggling download AFTER a link already exists — previously this could
  // only be set once, at creation, with no way to change your mind later.
  const toggleShareDownload = async (next: boolean) => {
    const previous = allowDownload;
    setAllowDownload(next);
    setShareError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowDownload: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAllowDownload(previous);
      setShareError("Couldn't update that. Try again.");
    }
  };

  // Previously a share link, once created, lived until its expiry with no
  // way to kill it early.
  const revokeShare = async () => {
    setShareError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setShareUrl(null);
      setConfirmingRevoke(false);
    } catch {
      setShareError("Couldn't deactivate the link. Try again.");
    }
  };

  const fmt = (s?: number | null) => {
    if (!s) return null;
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  const filename = track.fileUrl.split("/").pop()?.split("?")[0] || "";
  const bars = waveformBars(track.id, 48);
  const subtitleParts = [fmt(track.durationSec), track.key, track.bpm ? `${Math.round(track.bpm)} BPM` : null].filter(Boolean);

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient-60 z-40"
        onClick={onClose}
      />

      {/* Floating modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4 pointer-events-none"
      >
        <div
          className="bg-elevated border border-border rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col sm:flex-row pointer-events-auto shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* LEFT PANEL — track identity */}
          <div className="sm:w-64 shrink-0 bg-canvas sm:rounded-l-2xl p-5 flex flex-col gap-4 border-b sm:border-b-0 sm:border-r border-border">
            <div className="flex items-start justify-between sm:block">
              <div className="flex-1 min-w-0">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => {
                    const t = title.trim();
                    if (t && t !== track.title) saveField({ title: t });
                    else if (!t) setTitle(track.title);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="text-base font-bold text-primary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate"
                />
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  onBlur={() => {
                    const t = artist.trim();
                    if (t !== (track.artist || "")) saveField({ artist: t || null });
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder="Unknown artist"
                  className="text-xs text-secondary bg-transparent border-b border-transparent hover:border-border focus:border-border-strong outline-none w-full truncate mt-0.5"
                />
              </div>
              <button onClick={onClose} className="sm:hidden text-tertiary hover:text-primary ml-3 shrink-0">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            {subtitleParts.length > 0 && (
              <p className="text-xs text-tertiary">{subtitleParts.join(" · ")}</p>
            )}

            {/* Waveform */}
            <div className="flex items-end gap-[2px] h-10">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-[1px] bg-border-strong" style={{ height: `${h * 100}%` }} />
              ))}
            </div>

            {filename && <p className="text-[11px] text-tertiary truncate font-mono">{filename}</p>}

            {/* More info expandable */}
            <button
              onClick={() => setShowMoreInfo((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary transition-colors w-fit"
            >
              <Info size={12} strokeWidth={1.5} />
              More info
              <motion.span animate={{ rotate: showMoreInfo ? 180 : 0 }}>
                <ChevronDown size={11} strokeWidth={1.5} />
              </motion.span>
            </button>

            <AnimatePresence>
              {showMoreInfo && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1 text-xs text-tertiary">
                    {(track as any).sampleRate && <p>Sample rate: {(track as any).sampleRate / 1000}kHz</p>}
                    {(track as any).bitrate && <p>Bitrate: {(track as any).bitrate}kbps</p>}
                    {(track as any).channels && <p>Channels: {(track as any).channels === 1 ? "Mono" : "Stereo"}</p>}
                    {(track as any).format && <p>Format: {(track as any).format.toUpperCase()}</p>}
                    {playCount !== null && <p>{playCount} play{playCount === 1 ? "" : "s"}</p>}
                    {(saving || saved) && <p className="text-accent">{saving ? "Saving..." : "Saved"}</p>}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT PANEL — details */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <p className="text-sm font-semibold text-primary">Details</p>
              <button onClick={onClose} className="hidden sm:block text-tertiary hover:text-primary transition-colors">
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              {/* Group 1 */}
              <div className="m-3 bg-surface rounded-xl overflow-hidden">
                <Row icon={<Share2 size={15} strokeWidth={1.5} />} label="Share" open={openRow === "share"} onToggle={() => toggleRow("share")} rightHint={shareUrl ? "Active" : "Private"}>
                  {!shareUrl ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs text-tertiary mb-2">Link expires after</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {EXPIRY_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setExpiryDays(opt.value)}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${expiryDays === opt.value ? "border-accent text-accent" : "border-border text-secondary hover:border-border-strong"}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-2.5 text-sm text-secondary cursor-pointer w-fit">
                        <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
                        Allow download
                      </label>
                      <button onClick={createShare} className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors">
                        <Link2 size={13} strokeWidth={1.5} /> Generate link
                      </button>
                      {shareError && <p className="text-xs text-error">{shareError}</p>}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <input readOnly value={shareUrl} className="flex-1 bg-canvas border border-border rounded-md px-3 py-2.5 text-xs text-secondary" />
                        <button onClick={() => { navigator.clipboard.writeText(shareUrl); setCopied(true); triggerFeedback("tap"); setTimeout(() => setCopied(false), 1500); }} className="w-9 h-9 flex items-center justify-center rounded-md border border-border hover:border-border-strong shrink-0">
                          {copied ? <Check size={13} className="text-accent" /> : <Link2 size={13} className="text-secondary" />}
                        </button>
                      </div>
                      <label className="flex items-center gap-2.5 text-sm text-secondary cursor-pointer w-fit">
                        <input type="checkbox" checked={allowDownload} onChange={(e) => toggleShareDownload(e.target.checked)} className="accent-[var(--accent)] w-4 h-4" />
                        Allow download
                      </label>
                      {shareError && <p className="text-xs text-error">{shareError}</p>}
                      {!confirmingRevoke ? (
                        <button onClick={() => setConfirmingRevoke(true)} className="text-xs text-error hover:text-error/80 transition-colors">
                          Deactivate link
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="text-secondary">Deactivate this link? It'll stop working immediately.</span>
                          <button onClick={revokeShare} className="text-error border border-error/40 rounded-md px-3 py-1.5 hover:bg-error/10 transition-colors">
                            Yes, deactivate
                          </button>
                          <button onClick={() => setConfirmingRevoke(false)} className="text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors">
                            Never mind
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </Row>
                <div className="h-px bg-border mx-4" />
                <Row icon={<FileText size={15} strokeWidth={1.5} />} label="Notes" open={openRow === "notes"} onToggle={() => toggleRow("notes")}>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={() => saveField({ notes: notes || null })}
                    rows={3}
                    placeholder="Mix notes, context, anything..."
                    className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none resize-none"
                  />
                </Row>
                <div className="h-px bg-border mx-4" />
                <Row icon={<Music2 size={15} strokeWidth={1.5} />} label="BPM & Key" open={openRow === "bpmkey"} onToggle={() => toggleRow("bpmkey")}>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-xs text-tertiary mb-1.5 block">BPM</label>
                      <input value={bpm} onChange={(e) => setBpm(e.target.value === "" ? "" : Number(e.target.value))} onBlur={() => saveField({ bpm: bpm === "" ? null : Number(bpm) })} type="number" className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none" placeholder="—" />
                    </div>
                    <div>
                      <label className="text-xs text-tertiary mb-1.5 block">Key</label>
                      <input value={key} onChange={(e) => setKey(e.target.value)} onBlur={() => saveField({ key: key || null })} className="w-full bg-canvas border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none" placeholder="e.g. A min" />
                    </div>
                  </div>
                  <button onClick={runDetection} disabled={detecting} className="text-xs text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-50">
                    {detecting ? "Analyzing..." : "Re-detect BPM & key"}
                  </button>
                </Row>
                <div className="h-px bg-border mx-4" />
                <Row icon={<Mic2 size={15} strokeWidth={1.5} />} label="Lyrics" open={openRow === "lyrics"} onToggle={() => toggleRow("lyrics")}>
                  <LyricsEditor track={track} initialLyrics={(track as any).lyrics ?? ""} initialSynced={(track as any).lyricsSynced ?? null} />
                </Row>
                <div className="h-px bg-border mx-4" />
                <ActionRow icon={<ListPlus size={15} strokeWidth={1.5} />} label="Add to queue" onClick={() => reorderQueue([...queue, track])} />
              </div>

              {/* Group 2 */}
              <div className="mx-3 mb-3 bg-surface rounded-xl overflow-hidden">
                <ActionRow icon={<Download size={15} strokeWidth={1.5} />} label={downloading ? "Downloading..." : "Download"} onClick={handleDownload} disabled={downloading} />
                <div className="h-px bg-border mx-4" />
                <ActionRow icon={<Copy size={15} strokeWidth={1.5} />} label={duplicating ? "Duplicating..." : "Duplicate"} onClick={handleDuplicate} disabled={duplicating} />
              </div>

              {/* Group 3 — danger */}
              <div className="mx-3 mb-4 bg-surface rounded-xl overflow-hidden">
                {!confirmingDelete ? (
                  <ActionRow icon={<Trash2 size={15} strokeWidth={1.5} />} label="Delete" onClick={() => setConfirmingDelete(true)} danger />
                ) : (
                  <div className="px-4 py-3 flex items-center gap-2">
                    <span className="text-xs text-secondary flex-1">Delete permanently?</span>
                    <button onClick={handleDelete} disabled={deleting} className="text-xs text-error font-medium hover:underline disabled:opacity-50">{deleting ? "..." : "Yes"}</button>
                    <button onClick={() => setConfirmingDelete(false)} className="text-xs text-tertiary hover:text-primary">No</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
