"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Disc3 } from "lucide-react";
import UploadButton from "@/components/UploadButton";
import TrackDetail from "@/components/TrackDetail";
import TrackRowGroup from "@/components/TrackRow";
import { groupVersions } from "@/lib/groupVersions";
import type { Track } from "@/components/PlayerProvider";

export default function AlbumPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);

  const load = () => {
    fetch("/api/albums").then((r) => r.json()).then((all) => setAlbum(all.find((a: any) => a.id === params.id)));
    fetch("/api/tracks")
      .then((r) => r.json())
      .then((all) => setTracks(all.filter((t: any) => t.albumId === params.id)));
  };

  useEffect(() => {
    load();
  }, [params.id]);

  const groups = groupVersions(tracks as any);

  return (
    <main className="max-w-4xl mx-auto px-6 pt-16">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors mb-10"
      >
        <ArrowLeft size={15} strokeWidth={1.5} />
        Library
      </button>

      <div className="flex items-end gap-6 mb-16">
        <div className="w-32 h-32 rounded-md overflow-hidden bg-surface border border-border shrink-0">
          {album?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-tertiary">
              <Disc3 size={32} strokeWidth={1.2} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display font-bold text-primary tracking-tight truncate">
            {album?.name || "Loading..."}
          </h1>
          <p className="text-secondary text-sm mt-1">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </p>
        </div>
        <UploadButton onUploaded={load} albumId={params.id} label="Add tracks" />
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-24 text-center">
          <p className="text-secondary text-base">No tracks in this album yet.</p>
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
              <TrackRowGroup group={g} onOpenDetail={setDetailTrack} />
            </motion.div>
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
