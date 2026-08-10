"use client";

import { useEffect, useState } from "react";
import { usePlayer, Track } from "../PlayerProvider";
import SyncedLyricsList from "../SyncedLyricsList";
import type { SyncedLine } from "@/lib/lyricsSync";

export default function LyricsPanel({ track }: { track: Track }) {
  const { currentTime } = usePlayer();
  const [lines, setLines] = useState<SyncedLine[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const load = () => {
      fetch(`/api/tracks/${track.id}`)
        .then((r) => r.json())
        .then((full) => {
          if (Array.isArray(full.lyricsSynced) && full.lyricsSynced.length > 0) {
            setLines(full.lyricsSynced); setRawText(null);
          } else if (full.lyrics) {
            setLines(null); setRawText(full.lyrics);
          } else {
            setLines(null); setRawText(null);
          }
        })
        .finally(() => setLoading(false));
    };
    load();
    const onUpdated = (e: Event) => {
      if ((e as CustomEvent).detail?.trackId === track.id) load();
    };
    window.addEventListener("soniq:lyrics-updated", onUpdated);
    return () => window.removeEventListener("soniq:lyrics-updated", onUpdated);
  }, [track.id]);

  return (
    <div className="flex flex-col h-full">
      <h3 className="text-sm font-medium text-primary px-1 pb-4">Lyrics</h3>
      <div className="flex-1 min-h-0">
        {loading ? (
          <p className="text-secondary text-sm text-center mt-8">Loading...</p>
        ) : lines && lines.length > 0 ? (
          <div className="h-full">
            <SyncedLyricsList lines={lines} currentTime={currentTime} variant="fullscreen" />
          </div>
        ) : rawText ? (
          <div className="text-center overflow-y-auto no-scrollbar h-full">
            <p className="text-tertiary text-xs mb-4">Not synced to timing yet — showing plain text.</p>
            <p className="text-primary text-sm leading-relaxed whitespace-pre-line font-medium">{rawText}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-secondary text-sm">No lyrics added yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
