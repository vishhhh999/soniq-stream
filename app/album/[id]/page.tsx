"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Disc3, Pencil, Share2, ImagePlus, Trash2, Play, Shuffle, MoreHorizontal, BarChart3, ListPlus, Download } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import AddMenu from "@/components/AddMenu";
import UploadDropZone from "@/components/UploadDropZone";
import TrackDetail from "@/components/TrackDetail";
import SortableTrackRow from "@/components/SortableTrackRow";
import AlbumSharePanel from "@/components/AlbumSharePanel";
import AlbumInsightsModal from "@/components/AlbumInsightsModal";
import LyricsSidebar from "@/components/LyricsSidebar";
import SelectionToolbar from "@/components/SelectionToolbar";
import { groupVersions } from "@/lib/groupVersions";
import { fetchArray } from "@/lib/apiFetch";
import { computeSelection } from "@/lib/selection";
import { gradientFromSeed } from "@/lib/gradient";
import { usePlayer } from "@/components/PlayerProvider";
import type { Track } from "@/components/PlayerProvider";
import { onTrackCreated } from "@/lib/libraryBus";
import type { Album } from "@/components/AlbumCard";

export default function AlbumPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { playQueue, shuffleOn, toggleShuffle, queue, reorderQueue } = usePlayer();
  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [allAlbums, setAllAlbums] = useState<Album[]>([]);
  const [sortMode, setSortMode] = useState<"manual" | "alphabetical">("manual");
  const coverInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Albums saved from someone else's share are read-only for the receiver.
  // isAdminView is a separate read-only reason (see lib/adminAccess.ts) —
  // the admin cross-user account viewing another user's real original
  // album, not a save-to-library copy. Both end up read-only in the UI,
  // but sharedBy's fields come from different places for each: a real
  // stored snapshot for sharedFromAlbumId, vs the live ownerUsername the
  // API attaches at read-time for isAdminView (there's no "save" event to
  // snapshot from).
  const isReadOnly = !!(album?.sharedFromAlbumId) || !!(album?.isAdminView);
  const isAdminView = !!(album?.isAdminView);
  const sharedBy = album?.sharedFromAlbumId
    ? { username: album?.sharedByUsername, avatarUrl: album?.sharedByAvatarUrl }
    : isAdminView
    ? { username: album?.ownerUsername, avatarUrl: null }
    : null;

  const load = () => {
    Promise.all([
      fetchArray<any>("/api/albums"),
      fetchArray<any>("/api/tracks"),
    ]).then(([fetchedAlbums, allTracks]) => {
      const a = fetchedAlbums.find((x: any) => x.id === params.id);
      setAlbum(a);
      setAllAlbums(fetchedAlbums.filter((x: any) => x.id !== params.id));
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
    const offCreated = onTrackCreated(load);
    return () => {
      window.removeEventListener("soniq:track-deleted", onDeleted);
      offCreated();
    };
  }, [params.id]);

  // Keyboard shortcuts. Delete/Backspace removes the current selection —
  // guarded against firing while typing in an input/textarea (album name
  // edit, notes, etc) so it doesn't eat a character in a text field. Only
  // active when something is actually selected, so it's inert otherwise.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping) return;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0 && !isReadOnly) {
        e.preventDefault();
        handleBulkDelete();
      } else if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
        setLastSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedIds, isReadOnly]);

  const handleBulkDelete = async () => {
    if (isReadOnly) return; // no bulk destructive actions on a read-only view (received copy or admin cross-user)
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    setLastSelectedId(null);
    // Optimistic — remove locally first, then fire deletes. A failed
    // delete will resurface on the next load() rather than leaving a
    // ghost row that looks deleted but isn't.
    setTracks((prev) => prev.filter((t) => !ids.includes(t.id)));
    await Promise.all(ids.map((id) => fetch(`/api/tracks/${id}`, { method: "DELETE" })));
    load();
  };

  const handleBulkMove = async (targetAlbumId: string) => {
    if (isReadOnly) return;
    const ids = Array.from(selectedIds);
    setSelectedIds(new Set());
    setLastSelectedId(null);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/tracks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId: targetAlbumId }),
        })
      )
    );
    load();
  };

  // Same fix as the homepage — was recomputing on every render regardless
  // of whether `tracks` actually changed.
  const groups = useMemo(() => groupVersions(tracks as any), [tracks]);

  // Alphabetical is a VIEW only — it never touches sortOrder or calls
  // /api/tracks/reorder, so the underlying manual layout is fully intact
  // the moment you switch back to Manual. Dragging is disabled while this
  // is active (see the DndContext below) so a drag can't happen against
  // a display order that doesn't match what's actually stored.
  const displayGroups = useMemo(() => {
    if (sortMode !== "alphabetical") return groups;
    return [...groups].sort((a, b) => a.latest.title.localeCompare(b.latest.title, undefined, { sensitivity: "base" }));
  }, [groups, sortMode]);

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
    <main className="relative max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-16 pt-8 sm:pt-16 flex-1 min-w-0">
      {/* Hero wash behind the header — blurred cover art if one exists, or
         the same deterministic per-album gradient used for the ambient
         background otherwise, so an album without art still feels
         intentional rather than blank. Fills main's own width (inset-x-0),
         NOT a full-viewport breakout — main's width varies depending on
         whether the lyrics sidebar is showing, so a viewport-relative
         trick here would always eventually misalign against one state or
         the other. This way main's right edge and the hero's right edge
         are always the same edge, sidebar or not. */}
      <div className="absolute inset-x-0 top-0 h-[360px] overflow-hidden -z-10 pointer-events-none">
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
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, var(--bg-base) 0%, transparent 18%, transparent 82%, var(--bg-base) 100%)",
          }}
        />
      </div>

      <button
        onClick={() => router.push("/")}
        className="relative flex items-center gap-2 text-sm text-secondary hover:text-primary transition-colors mb-10"
      >
        <ArrowLeft size={15} strokeWidth={1.5} />
        Library
      </button>

      <div className="relative flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-10 sm:mb-16">
        {/* Cover */}
        <button
          onClick={() => coverInputRef.current?.click()}
          disabled={uploadingCover}
          className="group relative w-28 h-28 sm:w-52 sm:h-52 rounded-md overflow-hidden bg-surface border border-border shrink-0 self-start"
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

        {/* Metadata + actions */}
        <div className="flex-1 min-w-0 flex flex-col gap-3 sm:gap-4">
          <div>
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={saveNameEdit}
                onKeyDown={(e) => e.key === "Enter" && saveNameEdit()}
                className="text-xl sm:text-2xl font-display font-bold text-primary tracking-tight bg-transparent border-b border-border-strong outline-none w-full"
              />
            ) : (
              <button
                onClick={() => {
                  setNameDraft(album?.name || "");
                  setEditingName(true);
                }}
                className="group flex items-center gap-2 text-left w-full"
              >
                <h1 className="text-xl sm:text-2xl font-display font-bold text-primary tracking-tight truncate">
                  {album?.name || "Loading..."}
                </h1>
                <Pencil size={14} strokeWidth={1.5} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            )}
            <p className="text-secondary text-sm mt-1">
              {tracks.length} track{tracks.length === 1 ? "" : "s"}
            </p>

            {/* Attribution badge for received albums */}
            {sharedBy && (
              <div className="flex items-center gap-2 mt-2">
                <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-surface">
                  {sharedBy.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sharedBy.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <p className="text-xs text-tertiary">
                  Shared by{" "}
                  {sharedBy.username ? (
                    <span className="text-secondary">@{sharedBy.username}</span>
                  ) : "someone"}
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Play all */}
            <button
              onClick={() => playQueue(displayGroups.map((g) => g.latest), 0)}
              disabled={groups.length === 0}
              className="flex items-center gap-1.5 text-sm font-medium bg-accent text-on-accent px-4 py-2 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-40"
            >
              <Play size={13} strokeWidth={2} className="ml-0.5" />
              Play
            </button>

            {/* Shuffle */}
            <button
              onClick={() => {
                if (!shuffleOn) toggleShuffle();
                const shuffled = [...groups].sort(() => Math.random() - 0.5);
                playQueue(shuffled.map((g) => g.latest), 0);
              }}
              disabled={groups.length === 0}
              className="flex items-center gap-1.5 text-sm text-secondary border border-border px-4 py-2 rounded-md hover:border-border-strong hover:text-primary transition-colors disabled:opacity-40"
            >
              <Shuffle size={13} strokeWidth={1.5} />
              Shuffle
            </button>

            <div className="flex-1" />

            {/* Share — owner only */}
            {!isReadOnly && (
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 text-sm text-secondary border border-border rounded-md px-3 py-2 hover:border-border-strong hover:text-primary transition-colors"
              >
                <Share2 size={15} strokeWidth={1.5} />
                <span className="hidden sm:inline">Share</span>
              </button>
            )}

            {/* Delete (owner) / Remove from library (receiver) — not shown
                for the admin cross-user view. There's no copy to "remove"
                here (this is the real original row, not a save-to-library
                copy), so the delete route would just reject it as
                not-owned — hiding it avoids presenting a dead-end action. */}
            {!isAdminView && (!confirmingDelete ? (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="flex items-center gap-1.5 text-sm text-error border border-error/40 rounded-md px-3 py-2 hover:bg-error/10 transition-colors"
              >
                <Trash2 size={15} strokeWidth={1.5} />
                <span className="hidden sm:inline">{isReadOnly ? "Remove from library" : "Delete"}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-secondary hidden sm:inline">
                  {isReadOnly ? "Remove this album from your library?" : "Delete album? Tracks move to Unsorted."}
                </span>
                <button onClick={handleDeleteAlbum} className="text-error border border-error/40 rounded-md px-3 py-1.5 hover:bg-error/10 transition-colors">
                  {isReadOnly ? "Yes, remove" : "Yes, delete"}
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="text-secondary border border-border rounded-md px-3 py-1.5 hover:border-border-strong transition-colors">
                  Cancel
                </button>
              </div>
            ))}

            {!isReadOnly && <AddMenu onUploaded={load} albumId={params.id} label="Add tracks" />}

            <div className="relative">
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className="w-9 h-9 flex items-center justify-center rounded-md border border-border hover:border-border-strong transition-colors text-secondary hover:text-primary"
              >
                <MoreHorizontal size={16} strokeWidth={1.5} />
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute top-full right-0 mt-2 w-48 max-w-[calc(100vw-2rem)] bg-elevated border border-border rounded-lg shadow-xl overflow-hidden z-10"
                  >
                    {!isReadOnly && (
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowInsights(true);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors"
                    >
                      <BarChart3 size={14} strokeWidth={1.5} className="text-secondary" />
                      Insights
                    </button>
                    )}
                    <button
                      onClick={() => {
                        setShowMoreMenu(false);
                        if (groups.length > 0) reorderQueue([...queue, ...displayGroups.map((g) => g.latest)]);
                      }}
                      disabled={groups.length === 0}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors disabled:opacity-40"
                    >
                      <ListPlus size={14} strokeWidth={1.5} className="text-secondary" />
                      Add to queue
                    </button>
                    {/* Owner and admin cross-user view always see this; a
                        real receiver only when the owner has allowDownload
                        on (synced onto this album's own allowDownload
                        field — see the PATCH sync in the share route and
                        the toggle handler). Admin bypasses that check
                        entirely — see the isAdminCrossUser branch in
                        app/api/albums/[id]/download/route.ts. */}
                    {(!isReadOnly || album?.allowDownload || isAdminView) && (
                      <a
                        href={`/api/albums/${params.id}/download`}
                        onClick={() => setShowMoreMenu(false)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-surface transition-colors"
                      >
                        <Download size={14} strokeWidth={1.5} className="text-secondary" />
                        Download album
                      </a>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {showInsights && album && (
        <AlbumInsightsModal albumId={params.id} albumName={album.name} onClose={() => setShowInsights(false)} />
      )}

      {!album ? (
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-lg animate-pulse">
              <div className="w-9 h-9 rounded bg-surface shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface rounded w-1/3" />
                <div className="h-2.5 bg-surface rounded w-1/5" />
              </div>
              <div className="h-2.5 bg-surface rounded w-8 shrink-0" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="border border-dashed border-border rounded-lg py-16 sm:py-24 text-center flex flex-col items-center gap-3">
          <Disc3 size={40} strokeWidth={1} className="text-tertiary" />
          <p className="text-secondary text-base">No tracks in this album yet.</p>
        </div>
      ) : (
        <>
        {/* Sort toggle — Alphabetical is a display-only reorder, never
            written back (see displayGroups above). Hidden when there's
            nothing to meaningfully reorder. */}
        {groups.length > 1 && (
          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => setSortMode("manual")}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${sortMode === "manual" ? "bg-surface text-primary" : "text-tertiary hover:text-secondary"}`}
            >
              Manual
            </button>
            <button
              onClick={() => setSortMode("alphabetical")}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${sortMode === "alphabetical" ? "bg-surface text-primary" : "text-tertiary hover:text-secondary"}`}
            >
              A–Z
            </button>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={isReadOnly || sortMode !== "manual" ? () => {} : handleDragEnd}>
          <SortableContext items={displayGroups.map((g) => g.latest.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1" onClick={() => setSelectedIds(new Set())}>
              {displayGroups.map((g, i) => (
                <motion.div
                  key={g.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
                >
                  <SortableTrackRow
                    group={g}
                    onOpenDetail={setDetailTrack}
                    isReadOnly={isReadOnly || sortMode !== "manual"}
                    queueTracks={displayGroups.map((gr) => gr.latest)}
                    queueIndex={i}
                    isSelected={selectedIds.has(g.latest.id)}
                    onSelect={(mods) => {
                      const orderedIds = displayGroups.map((gr) => gr.latest.id);
                      const { next, newLastSelected } = computeSelection(
                        g.latest.id, orderedIds, selectedIds, lastSelectedId, mods
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
        </>
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
        <AlbumSharePanel albumId={params.id} albumName={album.name} albumCoverUrl={album.coverUrl} onClose={() => setShowShare(false)} />
      )}

      {!isReadOnly && (
        <SelectionToolbar
          count={selectedIds.size}
          albums={allAlbums}
          onDelete={handleBulkDelete}
          onMoveToAlbum={handleBulkMove}
          onClear={() => {
            setSelectedIds(new Set());
            setLastSelectedId(null);
          }}
        />
      )}
    </main>
    <LyricsSidebar onExpand={() => window.dispatchEvent(new CustomEvent("soniq:expand-lyrics"))} />
    </div>
    </UploadDropZone>
  );
}
