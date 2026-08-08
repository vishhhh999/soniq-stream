"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Disc3, Pencil, Share2, ImagePlus, Trash2 } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import UploadButton from "@/components/UploadButton";
import UploadDropZone from "@/components/UploadDropZone";
import TrackDetail from "@/components/TrackDetail";
import SortableTrackRow from "@/components/SortableTrackRow";
import ShareModal from "@/components/ShareModal";
import LyricsSidebar from "@/components/LyricsSidebar";
import { groupVersions } from "@/lib/groupVersions";
import { fetchArray } from "@/lib/apiFetch";
import { computeSelection } from "@/lib/selection";
import { gradientFromSeed } from "@/lib/gradient";
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = () => {
    Promise.all([
      fetchArray<any>("/api/albums"),
      fetchArray<any>("/api/tracks"),
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

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = groups.findIndex((g) => g.latest.id === active.id);
    const newIndex = groups.findIndex((g) => g.latest.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(groups, oldIndex, newIndex);
    // Optimistic UI update — reorder locally immediately, then persist.
    // groupVersions() is derived from `tracks`, so we reorder the underlying
    // track list to match rather than the derived groups directly.
    const reorderedIds = reordered.map((g) => g.latest.id);
    setTracks((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]));
      const primaryOrdered = reorderedIds.map((id) => byId.get(id)!).filter(Boolean);
      const others = prev.filter((t) => !reorderedIds.includes(t.id));
      return [...primaryOrdered, ...others];
    });

    await fetch("/api/tracks/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackIds: reorderedIds }),
    });
  };

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

  const handleDeleteAlbum = async () => {
    await fetch(`/api/albums/${params.id}`, { method: "DELETE" });
    router.push("/");
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
      // cover replace failure isn't critical enough to block the page
    }
    setUploadingCover(false);
  };

  return (
    <UploadDropZone albumId={params.id} onUploaded={load}>
    <div className="flex">
    <main className="relative max-w-[1600px] mx-auto px-8 lg:px-16 pt-16 flex-1 min-w-0">
      {/* Full-bleed hero wash behind the header — blurred cover art if one
         exists, or the same deterministic per-album gradient used for the
         ambient background otherwise, so an album without art still feels
         intentional rather than blank. The "left-1/2 -translate-x-1/2
         w-screen" trick breaks out of this container's max-width/padding
         to go edge-to-edge behind the constrained content. */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen h-[360px] overflow-hidden -z-10 pointer-events-none">
        {album?.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.coverUrl}
            alt=""
            className="w-full h-full object-cover scale-125 blur-3xl opacity-40"
          />
        ) : (
          album && (
            <div
              className="w-full h-full opacity-30"
              style={{
                background: `linear-gradient(135deg, ${gradientFromSeed(album.id).from}, ${gradientFromSeed(album.id).to})`,
              }}
            />
          )
        )}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, transparent 0%, var(--bg-base) 90%)" }}
        />
      </div>

      <button
        onClick={() => router.push("/")}
        className="relative flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors mb-10"
      >
        <ArrowLeft size={15} strokeWidth={1.5} />
        Library
      </button>

      <div className="relative flex items-end gap-6 mb-16">
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

        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="flex items-center gap-2 text-sm text-error border border-error/40 rounded-md px-4 py-2 hover:bg-error/10 transition-colors"
          >
            <Trash2 size={15} strokeWidth={1.5} />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-secondary">Delete album? Tracks move to Unsorted.</span>
            <button onClick={handleDeleteAlbum} className="text-error border border-error/40 rounded-md px-3 py-1.5 hover:bg-error/10 transition-colors">
              Yes, delete
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors">
              Cancel
            </button>
          </div>
        )}

        <UploadButton onUploaded={load} albumId={params.id} label="Add tracks" />
      </div>

      {groups.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-24 text-center">
          <p className="text-secondary text-base">No tracks in this album yet.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={groups.map((g) => g.latest.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1" onClick={() => setSelectedIds(new Set())}>
              {groups.map((g, i) => (
                <motion.div
                  key={g.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
                >
                  <SortableTrackRow
                    group={g}
                    onOpenDetail={setDetailTrack}
                    queueTracks={groups.map((gr) => gr.latest)}
                    queueIndex={i}
                    isSelected={selectedIds.has(g.latest.id)}
                    onSelect={(e) => {
                      e.stopPropagation();
                      const orderedIds = groups.map((gr) => gr.latest.id);
                      const { next, newLastSelected } = computeSelection(
                        g.latest.id, orderedIds, selectedIds, lastSelectedId, e
                      );
                      setSelectedIds(next);
                      setLastSelectedId(newLastSelected);
                    }}
                  />
                </motion.div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
    <LyricsSidebar onExpand={() => window.dispatchEvent(new CustomEvent("soniq:expand-lyrics"))} />
    </div>
    </UploadDropZone>
  );
}
