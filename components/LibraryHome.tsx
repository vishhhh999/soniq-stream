"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, X as XIcon, Settings as SettingsIcon, Disc3 } from "lucide-react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import AddMenu from "@/components/AddMenu";
import UploadDropZone from "@/components/UploadDropZone";
import { openSettings } from "@/lib/settingsBus";
import { onTrackCreated } from "@/lib/libraryBus";
import Logo from "@/components/Logo";
import TrackDetail from "@/components/TrackDetail";
import TrackRowGroup from "@/components/TrackRow";
import AlbumCard, { Album } from "@/components/AlbumCard";
import NewAlbumModal from "@/components/NewAlbumModal";
import LyricsSidebar from "@/components/LyricsSidebar";
import CreateFolderModal from "@/components/CreateFolderModal";
import SelectionToolbar from "@/components/SelectionToolbar";
import UsernamePrompt from "@/components/UsernamePrompt";
import NotificationsBell from "@/components/NotificationsBell";
import { groupVersions } from "@/lib/groupVersions";
import { fetchArray } from "@/lib/apiFetch";
import { computeSelection } from "@/lib/selection";
import { useIsMobile } from "@/lib/useMediaQuery";
import type { Track } from "@/components/PlayerProvider";

export default function LibraryHome() {
  const isMobile = useIsMobile();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  // Distinguishes "genuinely empty library" from "data hasn't arrived yet"
  // — previously both looked identical (tracks.length === 0), so anyone
  // with a real library still briefly saw "Nothing here yet. Add your
  // first track to get started." on every load before the fetch resolved,
  // a misleading flash of the wrong empty state rather than a loading one.
  const [initialLoading, setInitialLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [detailTrack, setDetailTrack] = useState<Track | null>(null);
  const [showNewAlbum, setShowNewAlbum] = useState(false);
  // SettingsModal itself now lives in AuthedPlayerShell (mounted once, on
  // every authenticated route) so it's reachable from outside this
  // component's tree too, e.g. the snippet export upgrade CTA on the
  // standalone album page. This nav button just requests it via the bus.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false); // mobile only
  const [folderPrompt, setFolderPrompt] = useState<{ albumA: Album; albumB: Album } | null>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = () => {
    Promise.all([
      fetchArray<Track>("/api/tracks").then(setTracks),
      fetchArray<Album>("/api/albums").then(setAlbums),
    ]).finally(() => setInitialLoading(false));
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
  }, []);

  // Previously none of this was memoized — tracks.filter(), groupVersions(),
  // and the album-name/count lookups all re-ran on EVERY render, including
  // every single keystroke while typing in the search box (which re-filters
  // the entire track list from scratch on each character) and any unrelated
  // re-render for any other reason. For a library of any real size this is
  // the difference between search feeling instant and feeling laggy.
  // useMemo keys these to their actual inputs so they only redo the work
  // when tracks/albums/query genuinely change.
  const unsorted = useMemo(() => tracks.filter((t: any) => !t.albumId && !t.isAdminView), [tracks]);
  const groups = useMemo(() => groupVersions(unsorted as any), [unsorted]);

  // Was previously a plain function re-scanning the full track list per
  // album card on every render (O(albums × tracks) every time) — now a
  // single O(tracks) pass builds a count map once per tracks change, and
  // each card just does an O(1) lookup.
  const albumTrackCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tracks as any[]) {
      if (t.albumId) counts.set(t.albumId, (counts.get(t.albumId) ?? 0) + 1);
    }
    return counts;
  }, [tracks]);
  const countInAlbum = (albumId: string) => albumTrackCounts.get(albumId) ?? 0;

  const albumNameById = useMemo(() => new Map(albums.map((a) => [a.id, a.name])), [albums]);

  const q = query.trim().toLowerCase();
  // Search runs against ALL tracks, not just unsorted ones — previously
  // this filtered `groups` (already scoped to unsorted-only), so any
  // track sitting inside an album was never searchable at all. When not
  // searching, the normal Albums-grid + Unsorted-list view is unchanged.
  const searchMatches = useMemo(
    () =>
      q
        ? tracks.filter(
            (t: any) =>
              t.title.toLowerCase().includes(q) || (t.artist || "").toLowerCase().includes(q)
          )
        : [],
    [q, tracks]
  );
  const filteredGroups = useMemo(
    () => (q ? groupVersions(searchMatches as any) : groups),
    [q, searchMatches, groups]
  );
  const filteredAlbums = useMemo(
    () => (q ? albums.filter((a) => a.name.toLowerCase().includes(q)) : albums),
    [q, albums]
  );

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as any;
    setActiveDragLabel(data?.type === "track" ? data.track.title : data?.album?.name || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragLabel(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as any;
    const overData = over.data.current as any;
    if (!activeData || !overData) return;

    if (activeData.type === "track" && overData.type === "album") {
      const albumId = overData.album.id;
      // If the dragged track is part of the current multi-selection, move
      // every selected track — not just the one physically dragged. That's
      // the "drag and drop to any album" behavior for multiple tracks.
      const draggedId = activeData.track.id;
      const idsToMove = selectedIds.has(draggedId) && selectedIds.size > 1 ? Array.from(selectedIds) : [draggedId];

      setTracks((prev) => prev.map((t) => (idsToMove.includes(t.id) ? { ...t, albumId } : t)));
      try {
        const results = await Promise.all(
          idsToMove.map((id) =>
            fetch(`/api/tracks/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ albumId }),
            })
          )
        );
        if (results.some((r) => !r.ok)) {
          setActionError("Some tracks couldn't be moved. Try again.");
        }
      } catch {
        setActionError("Couldn't move the tracks. Try again.");
      }
      clearSelection();
      load();
      return;
    }

    if (activeData.type === "album" && overData.type === "album" && activeData.album.id !== overData.album.id) {
      setFolderPrompt({ albumA: activeData.album, albumB: overData.album });
    }
  };

  const confirmCreateFolder = async () => {
    if (!folderPrompt) return;
    const { albumA, albumB } = folderPrompt;
    try {
      const folderRes = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${albumA.name} & ${albumB.name}` }),
      });
      if (!folderRes.ok) throw new Error();
      const folder = await folderRes.json();
      const results = await Promise.all([
        fetch(`/api/albums/${albumA.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        }),
        fetch(`/api/albums/${albumB.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId: folder.id }),
        }),
      ]);
      if (results.some((r) => !r.ok)) throw new Error();
    } catch {
      setActionError("Couldn't create the folder. Try again.");
    }
    setFolderPrompt(null);
    load();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const results = await Promise.all(ids.map((id) => fetch(`/api/tracks/${id}`, { method: "DELETE" })));
    if (results.some((r) => !r.ok)) {
      setActionError("Some tracks couldn't be deleted. Try again.");
    }
    clearSelection();
    load();
  };

  const bulkMoveToAlbum = async (albumId: string) => {
    const ids = Array.from(selectedIds);
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/tracks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumId }),
        })
      )
    );
    clearSelection();
    load();
  };

  return (
    <UploadDropZone onUploaded={load}>
    <UsernamePrompt />
    <div className="flex">
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
    <main className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-16 pt-8 sm:pt-16 flex-1 min-w-0">
      {actionError && (
        <div className="mb-6 px-4 py-3 rounded-lg bg-error/10 border border-error/20 flex items-center justify-between gap-3">
          <p className="text-sm text-error">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-xs text-error/70 hover:text-error shrink-0">Dismiss</button>
        </div>
      )}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 sm:mb-12">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size={26} className="text-primary shrink-0" />
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-primary tracking-tight">SONIQ</h1>
          </div>
          <p className="text-secondary text-sm sm:text-base mt-2">
            {tracks.length ? `${tracks.length} track${tracks.length === 1 ? "" : "s"}` : "Your library, empty for now."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex items-center">
            <Search size={14} strokeWidth={1.5} className="absolute left-3 text-tertiary pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tracks, albums..."
              className="bg-surface border border-border rounded-md pl-8 pr-8 py-2 text-sm text-primary focus:border-border-strong outline-none w-48 sm:w-56 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 text-tertiary hover:text-primary"
              >
                <XIcon size={13} strokeWidth={1.5} />
              </button>
            )}
          </div>
          <button
            onClick={() => openSettings()}
            aria-label="Settings"
            title="Settings"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border hover:border-border-strong transition-colors text-secondary hover:text-primary"
          >
            <SettingsIcon size={15} strokeWidth={1.5} />
          </button>
          <NotificationsBell />
          <div className="w-px h-5 bg-border mx-1 hidden sm:block" />
          <button
            onClick={() => setShowNewAlbum(true)}
            className="flex items-center gap-2 text-sm font-medium text-secondary border border-border px-4 py-2 rounded-md hover:border-border-strong hover:text-primary transition-colors"
          >
            <Plus size={16} strokeWidth={2} />
            <span className="hidden sm:inline">New album</span>
          </button>
          <AddMenu onUploaded={load} />
        </div>
      </header>

      {filteredAlbums.length > 0 && (
        <section className="mb-12 sm:mb-16">
          <h2 className="text-xs uppercase tracking-wide text-tertiary mb-5">
            Albums
            {!isMobile && !query && (
              <span className="normal-case text-tertiary/70"> — drag a track here to sort it, or drag one album onto another to create a folder</span>
            )}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 lg:gap-8">
            {filteredAlbums.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.35 }}
              >
                <AlbumCard album={a} trackCount={countInAlbum(a.id)} dragDisabled={isMobile || !!a.sharedFromAlbumId || !!(a as any).isAdminView} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xs uppercase tracking-wide text-tertiary">
            {q ? `${filteredGroups.length} result${filteredGroups.length === 1 ? "" : "s"}` : albums.length > 0 ? "Unsorted tracks" : "Tracks"}
          </h2>
          {isMobile && selectionMode && (
            <button onClick={clearSelection} className="text-xs text-secondary hover:text-primary transition-colors">
              Cancel selection
            </button>
          )}
        </div>

        {initialLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
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
        ) : filteredGroups.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg py-16 sm:py-24 text-center flex flex-col items-center gap-3">
            {q ? (
              <>
                <Search size={40} strokeWidth={1} className="text-tertiary" />
                <p className="text-secondary text-base">No results for "{query}"</p>
                <button onClick={() => setQuery("")} className="text-tertiary text-sm hover:text-secondary transition-colors">Clear search</button>
              </>
            ) : (
              <>
                <Disc3 size={40} strokeWidth={1} className="text-tertiary" />
                <p className="text-secondary text-base">Nothing here yet.</p>
                <p className="text-tertiary text-sm">Add your first track to get started.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-1" onClick={() => !isMobile && setSelectedIds(new Set())}>
            {filteredGroups.map((g, i) => (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3), duration: 0.25 }}
              >
                {q && (g.latest as any).albumId && (
                  <p className="text-[11px] text-tertiary px-4 pt-2">
                    in {albumNameById.get((g.latest as any).albumId) || "an album"}
                  </p>
                )}
                <TrackRowGroup
                group={g}
                onOpenDetail={setDetailTrack}
                queueTracks={filteredGroups.map((gr) => gr.latest)}
                queueIndex={i}
                isSelected={selectedIds.has(g.latest.id)}
                // Per-track, not page-level — search mixes the admin's own
                // tracks with cross-user ones (see lib/adminAccess.ts) in
                // the same list, unlike the album detail page where every
                // track on the page always shares one owner. Without this,
                // a cross-user track surfaced by search would show full
                // edit/duplicate/move/delete options in its menu — the
                // server would still reject any actual mutation via the
                // ownership check in the PATCH/DELETE routes, but the UI
                // shouldn't offer actions that are guaranteed to fail.
                isReadOnly={!!(g.latest as any).isAdminView}
                dragEnabled={!(g.latest as any).isAdminView}
                isMobile={isMobile}
                selectionMode={selectionMode}
                albums={albums}
                onDeleteSuccess={load}
                onLongPressSelect={() => {
                  setSelectionMode(true);
                  setSelectedIds(new Set([g.latest.id]));
                }}
                onToggleSelect={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(g.latest.id)) next.delete(g.latest.id);
                    else next.add(g.latest.id);
                    return next;
                  });
                }}
                onSelect={(mods) => {
                  if (isMobile) return;
                  const orderedIds = filteredGroups.map((gr) => gr.latest.id);
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

      {folderPrompt && (
        <CreateFolderModal
          albumA={folderPrompt.albumA.name}
          albumB={folderPrompt.albumB.name}
          onConfirm={confirmCreateFolder}
          onCancel={() => setFolderPrompt(null)}
        />
      )}

      {/* SettingsModal itself is rendered globally in AuthedPlayerShell now. */}

      <DragOverlay>
        {activeDragLabel && (
          <div className="bg-elevated border border-accent rounded-md px-3 py-2 text-sm text-primary shadow-xl">
            {selectedIds.size > 1 ? `${selectedIds.size} tracks` : activeDragLabel}
          </div>
        )}
      </DragOverlay>
    </main>
    </DndContext>

    <SelectionToolbar
      count={selectedIds.size}
      albums={albums}
      onDelete={bulkDelete}
      onMoveToAlbum={bulkMoveToAlbum}
      onClear={clearSelection}
    />

    <LyricsSidebar onExpand={() => window.dispatchEvent(new CustomEvent("soniq:expand-lyrics"))} />
    </div>
    </UploadDropZone>
  );
}
