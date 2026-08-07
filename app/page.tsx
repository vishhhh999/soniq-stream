"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import UploadButton from "@/components/UploadButton";
import ThemeToggle from "@/components/ThemeToggle";
import AmbientToggle from "@/components/AmbientToggle";
import LogoutButton from "@/components/LogoutButton";
import TrackDetail from "@/components/TrackDetail";
import TrackRowGroup from "@/components/TrackRow";
import AlbumCard, { Album } from "@/components/AlbumCard";
import NewAlbumModal from "@/components/NewAlbumModal";
import { groupVersions } from "@/lib/groupVersions";
import { fetchArray } from "@/lib/apiFetch";
import type { Track } from "@/components/PlayerProvider";

export default function Home() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [showNewAlbum, setShowNewAlbum] = useState(false);

  const load = () => {
    fetchArray<Track>("/api/tracks").then(setTracks);
    fetchArray<Album>("/api/albums").then(setAlbums);
  };

  useEffect(() => {
    load();
    const onDeleted = () => load();
    window.addEventListener("soniq:track-deleted", onDeleted);
    return () => window.removeEventListener("soniq:track-deleted", onDeleted);
  }, []);

  const unsorted = tracks.filter((t: any) => !t.albumId);
  const groups = groupVersions(unsorted as any);
  const countInAlbum = (albumId: string) => tracks.filter((t: any) => t.albumId === albumId).length;

  return (
    <main className="max-w-[1600px] mx-auto px-8 lg:px-16 pt-16">
      <header className="flex items-end justify-between mb-16">
        <div>
          <h1 className="text-3xl font-display font-bold text-primary tracking-tight">SONIQ</h1>
          <p className="text-secondary text-base mt-2">
            {tracks.length ? `${tracks.length} track${tracks.length === 1 ? "" : "s"}` : "Your library, empty for now."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AmbientToggle />
          <ThemeToggle />
          <LogoutButton />
          <div className="w-px h-5 bg-border mx-1" />
          <button
            onClick={() => setShowNewAlbum(true)}
            className="flex items-center gap-2 text-sm font-medium text-secondary border border-border px-4 py-2 rounded-md hover:border-border-strong hover:text-primary transition-colors"
          >
            <Plus size={16} strokeWidth={2} />
            New album
          </button>
          <UploadButton onUploaded={load} />
        </div>
      </header>

      {albums.length > 0 && (
        <section className="mb-16">
          <h2 className="text-xs uppercase tracking-wide text-tertiary mb-5">Albums</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-10">
            {albums.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
              >
                <AlbumCard album={a} trackCount={countInAlbum(a.id)} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xs uppercase tracking-wide text-tertiary mb-5">
          {albums.length > 0 ? "Unsorted tracks" : "Tracks"}
        </h2>

        {groups.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-24 text-center">
            <p className="text-secondary text-base">Nothing here yet.</p>
            <p className="text-tertiary text-sm mt-1">Add your first track to get started.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {groups.map((g, i) => (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
              >
                <TrackRowGroup
                group={g}
                onOpenDetail={setDetailTrack}
                queueTracks={groups.map((gr) => gr.latest)}
                queueIndex={i}
              />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {detailTrack && (
        <TrackDetail
          track={detailTrack}
          onClose={() => setDetailTrack(null)}
          onSaved={() => {
            load();
            setDetailTrack(null);
          }}
          onDeleted={() => {
            load();
            setDetailTrack(null);
          }}
        />
      )}

      {showNewAlbum && (
        <NewAlbumModal
          onClose={() => setShowNewAlbum(false)}
          onCreated={() => {
            load();
            setShowNewAlbum(false);
          }}
        />
      )}
    </main>
  );
}
