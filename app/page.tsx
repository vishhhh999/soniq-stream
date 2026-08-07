"use client";

import { useEffect, useState } from "react";
import TrackRow from "@/components/TrackRow";
import UploadButton from "@/components/UploadButton";
import ThemeToggle from "@/components/ThemeToggle";
import TrackDetail from "@/components/TrackDetail";
import type { Track } from "@/components/PlayerProvider";

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);

  const load = () => fetch("/api/tracks").then((r) => r.json()).then(setTracks);

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="max-w-3xl mx-auto px-6 pt-16">
      <header className="flex items-end justify-between mb-16">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary tracking-tight">SONIQ</h1>
          <p className="text-secondary text-base mt-2">
            {tracks.length ? `${tracks.length} track${tracks.length === 1 ? "" : "s"}` : "Your library, empty for now."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <UploadButton onUploaded={load} />
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-24 text-center">
          <p className="text-secondary text-base">Nothing here yet.</p>
          <p className="text-tertiary text-sm mt-1">Add your first track to get started.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {tracks.map((t) => (
            <TrackRow key={t.id} track={t} onOpenDetail={setDetailTrack} />
          ))}
        </div>
      )}

      {detailTrack && (
        <TrackDetail
          track={detailTrack}
          onClose={() => setDetailTrack(null)}
          onSaved={() => {
            load();
            setDetailTrack(null);
          }}
        />
      )}
    </main>
  );
}
