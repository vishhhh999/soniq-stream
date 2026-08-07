"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Disc3, Pencil, Share2, ImagePlus } from "lucide-react";
import UploadButton from "@/components/UploadButton";
import TrackDetail from "@/components/TrackDetail";
import TrackRowGroup from "@/components/TrackRow";
import ShareModal from "@/components/ShareModal";
import { groupVersions } from "@/lib/groupVersions";
import type { Track } from "@/components/PlayerProvider";

export default function AlbumPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    Promise.all([
      fetch("/api/albums").then((r) => r.json()),
      fetch("/api/tracks").then((r) => r.json()),
    ]).then(([allAlbums, allTracks]) => {
      const a = allAlbums.find((x: any) => x.id === params.id);
      setAlbum(a);
      const scoped = allTracks
        .filter((t: any) => t.albumId === params.id)
        .map((t: any) => ({ ...t, albumCoverUrl: a?.coverUrl || null }));
      setTracks(scoped);
    });
  };

  useEffect(() => {
    load();
    const onDeleted = () => load();
    window.addEventListener("soniq:track-deleted", onDeleted);
    return () => window.removeEventListener("soniq:track-deleted", onDeleted);
  }, [params.id]);

  const groups = groupVersions(tracks as any);

  const saveNameEdit = async () => {
    if (nameDraft.trim() && nameDraft.trim() !== album?.name) {
      await fetch(`/api/albums/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      load();
    }
    setEditingName(false);
  };

  const replaceCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, kind: "cover" }),
      });
      const { uploadUrl, publicUrl } = await presignRes.json();
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      await fetch("/api/upload/cover/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ albumId: params.id, publicUrl }),
      });
      load();
    } catch {
      // cover replace failure isn't critical enough to block the page — the
      // old cover just stays in place
    }
    setUploadingCover(false);
  };

  return (
    <main className="max-w-[1600px] mx-auto px-8 lg:px-16 pt-16">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors mb-10"
      >
        <ArrowLeft size={15} strokeWidth={1.5} />
        Library
      </button>

      <div className="flex items-end gap-6 mb-16">
        <button
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="group relative w-40 h-40 rounded-md overflow-hidden bg-surface border border-border shrink-0"
        >
          {album?.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-tertiary">
              <Disc3 size={36} strokeWidth={1.2} />
            </div>
          )}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
            <span className="flex items-center gap-1.5 text-white text-xs">
              <ImagePlus size={14} strokeWidth={1.5} />
              {uploadingCover ? "Uploading..." : "Change cover"}
            </span>
          </div>
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => e.target.files?.[0] && replaceCover(e.target.files[0])}
        />

        <div className="flex-1 min-w-0">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveNameEdit}
              onKeyDown={(e) => e.key === "Enter" && saveNameEdit()}
              className="text-2xl font-display font-bold text-primary tracking-tight bg-transparent border-b border-border-strong outline-none w-full"
            />
          ) : (
            <button
              onClick={() => {
                setNameDraft(album?.name || "");
                setEditingName(true);
              }}
              className="group flex items-center gap-2 text-left"
            >
              <h1 className="text-2xl font-display font-bold text-primary tracking-tight truncate">
                {album?.name || "Loading..."}
              </h1>
              <Pencil size={14} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
            </button>
          )}
          <p className="text-secondary text-sm mt-1">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </p>
        </div>

        <button
          onClick={() => setShowShare(true)}
          className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors"
        >
          <Share2 size={15} strokeWidth={1.5} />
          Share
        </button>
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
          onDeleted={() => {
            load();
            setDetailTrack(null);
          }}
        />
      )}

      {showShare && album && (
        <ShareModal title={album.name} albumId={params.id} onClose={() => setShowShare(false)} />
      )}
    </main>
  );
}
