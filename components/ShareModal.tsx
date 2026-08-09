"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link2, Check } from "lucide-react";

const EXPIRY_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never", value: 0 },
];

// Shared by both the per-track share flow (in TrackDetail) and per-album
// share flow (on the album page) — same UI, different payload to /api/share.
export default function ShareModal({
  title,
  trackId,
  albumId,
  onClose,
}: {
  title: string;
  trackId?: string;
  albumId?: string;
  onClose: () => void;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiryDays, setExpiryDays] = useState(30);
  const [allowDownload, setAllowDownload] = useState(false);
  const [busy, setBusy] = useState(false);

  const createShare = async () => {
    setBusy(true);
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackId: trackId || null,
        albumId: albumId || null,
        expiresInDays: expiryDays === 0 ? null : expiryDays,
        allowDownload,
      }),
    });
    const link = await res.json();
    setShareUrl(`${window.location.origin}/s/${link.token}`);
    setBusy(false);
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
            <h3 className="text-md font-medium text-primary truncate">Share &ldquo;{title}&rdquo;</h3>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors shrink-0 ml-3">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          {!shareUrl ? (
            <div className="space-y-4">
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
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 text-sm bg-accent text-canvas rounded-md px-4 py-2.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
              >
                <Link2 size={14} strokeWidth={1.5} />
                {busy ? "Generating..." : "Generate share link"}
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
