"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, ListPlus, Pencil, Share2, Download, FolderInput, Copy,
  Trash2, Check, ChevronRight, X,
} from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import type { Album } from "./AlbumCard";

type Props = {
  track: Track;
  position: { top: number; right: number } | null;
  isMobile: boolean;
  albums: Album[];
  onClose: () => void;
  onOpenDetail: (t: Track) => void;
  onDeleteSuccess: () => void;
};

export default function TrackContextMenu({
  track,
  position,
  isMobile,
  albums,
  onClose,
  onOpenDetail,
  onDeleteSuccess,
}: Props) {
  const { playQueue, queue, reorderQueue } = usePlayer();
  const [subMenu, setSubMenu] = useState<"move" | "share" | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Slight delay so the click that opened the menu doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const addToQueue = () => {
    reorderQueue([...queue, track]);
    onClose();
  };

  const playNow = () => {
    playQueue([track], 0);
    onClose();
  };

  const generateShare = async () => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: track.id, expiresInDays: 30, allowDownload: false }),
    });
    const link = await res.json();
    const url = `${window.location.origin}/s/${link.token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => { setCopied(false); onClose(); }, 1500);
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(track.fileUrl);
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
    } catch { /* ignore */ }
    setDownloading(false);
    onClose();
  };

  const moveToAlbum = async (albumId: string) => {
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ albumId }),
    });
    onDeleteSuccess(); // refreshes the list
    onClose();
  };

  const duplicate = async () => {
    setDuplicating(true);
    await fetch(`/api/tracks/${track.id}/duplicate`, { method: "POST" }).catch(() => {});
    setDuplicating(false);
    onDeleteSuccess();
    onClose();
  };

  const deleteTrack = async () => {
    setDeleting(true);
    await fetch(`/api/tracks/${track.id}`, { method: "DELETE" });
    onDeleteSuccess();
    onClose();
  };

  if (!mounted) return null;

  const menuContent = (
    <div ref={menuRef} className="w-56 bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden text-sm">
      {/* Track name header */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-primary font-medium truncate">{track.title}</p>
        <p className="text-tertiary text-xs truncate">{track.artist || "Unknown artist"}</p>
      </div>

      {/* Group 1: Playback */}
      <div className="py-1 border-b border-border">
        <MenuItem icon={<Play size={14} strokeWidth={1.5} />} label="Play now" onClick={playNow} />
        <MenuItem icon={<ListPlus size={14} strokeWidth={1.5} />} label="Add to queue" onClick={addToQueue} />
      </div>

      {/* Group 2: Edit */}
      <div className="py-1 border-b border-border">
        <MenuItem
          icon={<Pencil size={14} strokeWidth={1.5} />}
          label="Edit details"
          onClick={() => { onOpenDetail(track); onClose(); }}
        />
      </div>

      {/* Group 3: Share & Export */}
      <div className="py-1 border-b border-border">
        <MenuItem
          icon={copied ? <Check size={14} className="text-accent" /> : <Share2 size={14} strokeWidth={1.5} />}
          label={copied ? "Link copied!" : "Copy share link"}
          onClick={generateShare}
        />
        <MenuItem
          icon={<Download size={14} strokeWidth={1.5} />}
          label={downloading ? "Downloading..." : "Download"}
          onClick={download}
          disabled={downloading}
        />
        <MenuItem
          icon={<Copy size={14} strokeWidth={1.5} />}
          label={duplicating ? "Duplicating..." : "Duplicate"}
          onClick={duplicate}
          disabled={duplicating}
        />
      </div>

      {/* Group 4: Organize */}
      {albums.length > 0 && (
        <div className="py-1 border-b border-border">
          {subMenu === "move" ? (
            <>
              <button
                onClick={() => setSubMenu(null)}
                className="w-full flex items-center gap-3 px-4 py-2 text-secondary hover:bg-surface transition-colors text-xs"
              >
                <ChevronRight size={12} className="rotate-180" /> Back
              </button>
              {albums.map((a) => (
                <button
                  key={a.id}
                  onClick={() => moveToAlbum(a.id)}
                  className="w-full text-left px-4 py-2 text-primary hover:bg-surface transition-colors truncate"
                >
                  {a.name}
                </button>
              ))}
            </>
          ) : (
            <MenuItem
              icon={<FolderInput size={14} strokeWidth={1.5} />}
              label="Move to album"
              rightIcon={<ChevronRight size={12} className="text-tertiary" />}
              onClick={() => setSubMenu("move")}
            />
          )}
        </div>
      )}

      {/* Group 5: Danger */}
      <div className="py-1">
        {!confirmDelete ? (
          <MenuItem
            icon={<Trash2 size={14} strokeWidth={1.5} />}
            label="Delete"
            onClick={() => setConfirmDelete(true)}
            danger
          />
        ) : (
          <div className="px-4 py-2 flex items-center gap-2">
            <span className="text-xs text-secondary flex-1">Delete permanently?</span>
            <button
              onClick={deleteTrack}
              disabled={deleting}
              className="text-xs text-error font-medium hover:underline disabled:opacity-50"
            >
              {deleting ? "..." : "Yes"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-tertiary hover:text-primary"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Mobile: bottom sheet with backdrop.
  if (isMobile) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl overflow-hidden pb-safe"
          >
            {menuContent}
            <button
              onClick={onClose}
              className="w-full bg-elevated py-4 text-sm text-secondary flex items-center justify-center gap-2 border-t border-border"
            >
              <X size={14} strokeWidth={1.5} /> Cancel
            </button>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  }

  // Desktop: floating card pinned to button position.
  if (!position) return null;

  return createPortal(
    <div
      className="fixed z-50"
      style={{ top: position.top, right: position.right }}
    >
      {menuContent}
    </div>,
    document.body
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  rightIcon,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  rightIcon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-3 px-4 py-2 transition-colors disabled:opacity-40 ${
        danger
          ? "text-error hover:bg-error/10"
          : "text-primary hover:bg-surface"
      }`}
    >
      <span className={danger ? "text-error" : "text-secondary"}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {rightIcon}
    </button>
  );
}
