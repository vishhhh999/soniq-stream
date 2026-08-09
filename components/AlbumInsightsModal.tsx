"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play } from "lucide-react";
import { gradientFromSeed } from "@/lib/gradient";
import { MODAL_SPRING } from "@/lib/motion";

type TrackStat = { trackId: string; title: string; plays: number };
type ListenerStat = { userId: string | null; username: string | null; plays: number };
type InsightsData = { totalPlays: number; byTrack: TrackStat[]; byListener: ListenerStat[] };

function Avatar({ userId, username }: { userId: string | null; username: string | null }) {
  const { from, to } = gradientFromSeed(userId ?? "anon");
  const label = username ? username[0].toUpperCase() : "?";
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {label}
    </div>
  );
}

export default function AlbumInsightsModal({
  albumId,
  albumName,
  onClose,
}: {
  albumId: string;
  albumName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tracks" | "listeners">("tracks");

  useEffect(() => {
    fetch(`/api/albums/${albumId}/insights`)
      .then((r) => {
        if (!r.ok) throw new Error(`Insights request failed (${r.status})`);
        return r.json();
      })
      .then(setData)
      .catch((err) => {
        // Previously this fell through to setData() with an error-shaped
        // body ({ error: "..." }) on a non-ok response (e.g. a 403 for a
        // non-owner). `data.byTrack` was then undefined, and the
        // maxTrackPlays calc below called .reduce on it directly, which
        // threw and crashed the modal instead of showing "Couldn't load."
        console.error("Failed to load insights:", err);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [albumId]);

  const maxTrackPlays = data?.byTrack?.reduce((m, t) => Math.max(m, t.plays), 0) || 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-ambient z-[60] flex items-center justify-center px-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={MODAL_SPRING}
          className="bg-elevated border border-border rounded-lg w-full max-w-sm max-h-[85vh] overflow-y-auto no-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-5 border-b border-border">
            <div>
              <h2 className="text-md font-medium text-primary">Insights</h2>
              <p className="text-xs text-tertiary truncate">{albumName}</p>
            </div>
            <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors">
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>

          <div className="p-6">
            {loading ? (
              <p className="text-sm text-secondary text-center py-8">Loading...</p>
            ) : !data ? (
              <p className="text-sm text-secondary text-center py-8">Couldn't load insights.</p>
            ) : (
              <>
                <div className="text-center mb-6">
                  <p className="text-3xl font-display font-bold text-primary">{data.totalPlays}</p>
                  <p className="text-xs text-tertiary uppercase tracking-wide mt-1">Total plays</p>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-5 bg-surface rounded-md p-1">
                  {(["tracks", "listeners"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`flex-1 text-xs py-1.5 rounded transition-colors capitalize ${
                        tab === t
                          ? "bg-elevated text-primary shadow-sm"
                          : "text-tertiary hover:text-secondary"
                      }`}
                    >
                      By {t === "tracks" ? "track" : "listener"}
                    </button>
                  ))}
                </div>

                {tab === "tracks" ? (
                  data.byTrack.length === 0 ? (
                    <p className="text-sm text-tertiary text-center py-4">No tracks yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byTrack.map((t) => (
                        <div key={t.trackId}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-primary truncate mr-2">{t.title}</span>
                            <span className="text-xs text-tertiary tabular-nums shrink-0 flex items-center gap-1">
                              <Play size={10} strokeWidth={2} />
                              {t.plays}
                            </span>
                          </div>
                          <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all"
                              style={{ width: `${(t.plays / maxTrackPlays) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  data.byListener.length === 0 ? (
                    <p className="text-sm text-tertiary text-center py-4">No plays recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byListener.map((l, i) => (
                        <div key={l.userId ?? "anon"} className="flex items-center gap-3">
                          <Avatar userId={l.userId} username={l.username} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-primary truncate">
                              {l.username ? `@${l.username}` : "Anonymous"}
                            </p>
                          </div>
                          <span className="text-xs text-tertiary tabular-nums flex items-center gap-1 shrink-0">
                            <Play size={10} strokeWidth={2} />
                            {l.plays}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
