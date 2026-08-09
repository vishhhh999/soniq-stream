"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell } from "lucide-react";
import { gradientFromSeed } from "@/lib/gradient";

type NotificationItem = {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  type: "track_added" | "version_added" | "track_removed" | "track_played" | "album_downloaded" | "download_enabled" | "download_disabled";
  albumName: string | null;
  trackTitle: string | null;
  seen: boolean;
  createdAt: string;
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function notifText(n: NotificationItem): string {
  const actor = n.actorUsername ? `@${n.actorUsername}` : "Someone";
  const track = n.trackTitle ?? "a track";
  const album = n.albumName ? ` in ${n.albumName}` : "";
  switch (n.type) {
    case "track_added":    return `${actor} added ${track}${album}`;
    case "version_added":  return `${actor} uploaded a new version of ${track}`;
    case "track_removed":  return `${actor} removed ${track}${album}`;
    case "track_played":   return `${actor} played ${track}`;
    case "album_downloaded": return `${actor} downloaded ${album ? album.replace(/^ in /, "") : "an album"}`;
    case "download_enabled": return `${actor} turned on downloads for ${album ? album.replace(/^ in /, "") : "an album"}`;
    case "download_disabled": return `${actor} turned off downloads for ${album ? album.replace(/^ in /, "") : "an album"}`;
  }
}

function Avatar({ userId, username }: { userId: string | null; username: string | null }) {
  const { from, to } = gradientFromSeed(userId ?? "anon");
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {username ? username[0].toUpperCase() : "?"}
    </div>
  );
}

export default function NotificationsBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [open, setOpen] = useState(false);
  // Snapshot of "new" items taken at the moment the dropdown was opened —
  // so the "New" section label doesn't immediately disappear after mark-seen.
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const fetch_ = () =>
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setUnseenCount(d.unseenCount ?? 0);
      })
      .catch(() => {});

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [open]);

  const handleOpen = () => {
    // Snapshot which items are currently unseen before marking them seen.
    setNewIds(new Set(items.filter((n) => !n.seen).map((n) => n.id)));
    setOpen(true);
    if (unseenCount > 0) {
      setUnseenCount(0);
      fetch("/api/notifications", { method: "PATCH" }).catch(() => {});
    }
  };

  const newItems = items.filter((n) => newIds.has(n.id));
  const earlierItems = items.filter((n) => !newIds.has(n.id));

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="relative w-8 h-8 flex items-center justify-center rounded-full border border-border hover:border-border-strong transition-colors text-secondary hover:text-primary"
        aria-label="Notifications"
      >
        <Bell size={15} strokeWidth={1.5} />
        {unseenCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-error text-[9px] font-bold text-white flex items-center justify-center">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="absolute right-0 top-10 w-[calc(100vw-2rem)] max-w-80 max-h-[420px] bg-elevated border border-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col"
          >
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-sm font-medium text-primary">Notifications</p>
            </div>

            <div className="overflow-y-auto flex-1 no-scrollbar">
              {items.length === 0 ? (
                <p className="text-sm text-tertiary text-center py-10">Nothing yet.</p>
              ) : (
                <>
                  {newItems.length > 0 && (
                    <>
                      <p className="text-[10px] uppercase tracking-wide text-tertiary px-4 pt-3 pb-1">New</p>
                      {newItems.map((n) => (
                        <NotifRow key={n.id} n={n} />
                      ))}
                    </>
                  )}
                  {earlierItems.length > 0 && (
                    <>
                      {newItems.length > 0 && <div className="h-px bg-border mx-4 my-1" />}
                      <p className="text-[10px] uppercase tracking-wide text-tertiary px-4 pt-2 pb-1">Earlier</p>
                      {earlierItems.map((n) => (
                        <NotifRow key={n.id} n={n} />
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotifRow({ n }: { n: NotificationItem }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors">
      <Avatar userId={n.actorUserId} username={n.actorUsername} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-primary leading-snug">{notifText(n)}</p>
        <p className="text-xs text-tertiary mt-0.5">{timeAgo(n.createdAt)}</p>
      </div>
    </div>
  );
}
