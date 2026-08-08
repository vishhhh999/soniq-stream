"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play } from "lucide-react";

export default function AlbumInsightsModal({
  albumId,
  albumName,
  onClose,
}: {
  albumId: string;
  albumName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ totalPlays: number; byTrack: { trackId: string; title: string; plays: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/albums/${albumId}/insights`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [albumId]);

  const maxPlays = data?.byTrack.reduce((m, t) => Math.max(m, t.plays), 0) || 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
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

                {data.byTrack.length === 0 ? (
                  <p className="text-sm text-tertiary text-center py-4">No tracks in this album yet.</p>
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
                            style={{ width: `${(t.plays / maxPlays) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-tertiary text-center mt-6 pt-4 border-t border-border">
                  Per-listener attribution (who played what) needs share-page play
                  tracking, which isn't built yet — this shows total plays across
                  all sources.
                </p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
