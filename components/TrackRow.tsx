"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDraggable } from "@dnd-kit/core";
import { Play, Pause, MoreHorizontal, ChevronDown } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import PlayingIndicator from "./PlayingIndicator";
import { useLongPress } from "@/lib/useLongPress";
import TrackContextMenu from "./TrackContextMenu";
import type { TrackGroup } from "@/lib/groupVersions";
import type { Album } from "./AlbumCard";

function Row({
  track,
  onOpenDetail,
  versionBadge,
  queueTracks,
  queueIndex,
  isSelected,
  onSelect,
  dragEnabled,
  isMobile,
  selectionMode,
  onLongPressSelect,
  onToggleSelect,
  albums,
  onDeleteSuccess,
  isReadOnly,
}: {
  track: Track;
  onOpenDetail: (t: Track) => void;
  versionBadge?: number;
  queueTracks: Track[];
  queueIndex: number;
  isSelected: boolean;
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  dragEnabled?: boolean;
  isMobile?: boolean;
  selectionMode?: boolean;
  onLongPressSelect?: () => void;
  onToggleSelect?: () => void;
  albums?: Album[];
  onDeleteSuccess?: () => void;
  isReadOnly?: boolean;
}) {
  const { current, isPlaying, playQueue, toggle } = usePlayer();
  const isCurrent = current?.id === track.id;
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const dotButtonRef = useRef<HTMLButtonElement>(null);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `track:${track.id}`,
    data: { type: "track", track },
    disabled: !dragEnabled || isMobile,
  });

  const fmt = (s?: number | null) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const handlePlay = () => {
    if (isCurrent) toggle();
    else playQueue(queueTracks, queueIndex);
  };

  const longPress = useLongPress(
    () => onLongPressSelect?.(),
    () => (selectionMode ? onToggleSelect?.() : handlePlay())
  );

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClick = (e: React.MouseEvent) => {
    if (isMobile) return;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    const mods = { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey };
    clickTimerRef.current = setTimeout(() => {
      onSelect(mods);
      clickTimerRef.current = null;
    }, 220);
  };
  const handleDoubleClickDesktop = () => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    handlePlay();
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMobile) {
      setMenuPos(null);
    } else {
      const rect = dotButtonRef.current?.getBoundingClientRect();
      if (rect) {
        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
      }
    }
    setMenuOpen(true);
  };

  const desktopProps = !isMobile
    ? { onClick: handleClick, onDoubleClick: handleDoubleClickDesktop }
    : longPress;

  return (
    <>
      <div
        ref={dragEnabled && !isMobile ? setNodeRef : undefined}
        {...(dragEnabled && !isMobile ? attributes : {})}
        {...(dragEnabled && !isMobile ? listeners : {})}
        {...desktopProps}
        className={`group flex items-center gap-4 px-4 py-3 rounded-md transition-colors select-none ${
          dragEnabled && !isMobile ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
        } ${
          isSelected
            ? "bg-accent/20 ring-1 ring-inset ring-accent"
            : isCurrent
            ? "bg-surface"
            : "hover:bg-surface"
        } ${isDragging ? "opacity-40" : ""}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handlePlay(); }}
          className="w-8 h-8 flex items-center justify-center rounded-full border border-border group-hover:border-border-strong transition-colors shrink-0"
        >
          {isCurrent && isPlaying ? (
            <Pause size={13} strokeWidth={2} className="text-accent" />
          ) : (
            <Play size={13} strokeWidth={2} className="ml-0.5 text-secondary group-hover:text-primary" />
          )}
        </button>

        <div className="min-w-0 flex-1 flex items-center gap-2">
          {isCurrent && isPlaying && <PlayingIndicator />}
          <div className="min-w-0">
            <p className={`text-sm truncate ${isCurrent ? "text-primary font-medium" : "text-primary"}`}>{track.title}</p>
            <p className="text-xs text-secondary truncate">{track.artist || "Unknown artist"}</p>
          </div>
          {versionBadge && versionBadge > 1 && (
            <span className="text-[10px] uppercase tracking-wide text-tertiary border border-border rounded-full px-1.5 py-0.5 shrink-0">
              v{versionBadge}
            </span>
          )}
        </div>

        <span className="text-xs text-tertiary tabular-nums w-12 text-right">{fmt(track.durationSec)}</span>

        <button
          ref={dotButtonRef}
          onClick={openMenu}
          className={`text-tertiary hover:text-primary transition-opacity p-1 -m-1 ${
            isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <MoreHorizontal size={16} strokeWidth={1.5} />
        </button>
      </div>

      {menuOpen && (
        <TrackContextMenu
          track={track}
          position={menuPos}
          isMobile={!!isMobile}
          albums={albums ?? []}
          onClose={() => setMenuOpen(false)}
          onOpenDetail={onOpenDetail}
          onDeleteSuccess={() => onDeleteSuccess?.()}
          isReadOnly={isReadOnly}
        />
      )}
    </>
  );
}

export default function TrackRowGroup({
  group,
  onOpenDetail,
  queueTracks,
  queueIndex,
  isSelected,
  onSelect,
  dragEnabled,
  isMobile,
  selectionMode,
  onLongPressSelect,
  onToggleSelect,
  albums,
  onDeleteSuccess,
  isReadOnly,
}: {
  group: TrackGroup;
  onOpenDetail: (t: Track) => void;
  queueTracks: Track[];
  queueIndex: number;
  isSelected: boolean;
  onSelect: (mods: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => void;
  dragEnabled?: boolean;
  isMobile?: boolean;
  selectionMode?: boolean;
  onLongPressSelect?: () => void;
  onToggleSelect?: () => void;
  albums?: Album[];
  onDeleteSuccess?: () => void;
  isReadOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasVersions = group.olderVersions.length > 0;

  return (
    <div>
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <Row
            track={group.latest}
            onOpenDetail={onOpenDetail}
            versionBadge={group.latest.versionNumber ?? undefined}
            queueTracks={queueTracks}
            queueIndex={queueIndex}
            isSelected={isSelected}
            onSelect={onSelect}
            dragEnabled={dragEnabled}
            isMobile={isMobile}
            selectionMode={selectionMode}
            onLongPressSelect={onLongPressSelect}
            onToggleSelect={onToggleSelect}
            albums={albums}
            onDeleteSuccess={onDeleteSuccess}
            isReadOnly={isReadOnly}
          />
        </div>
        {hasVersions && (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="text-tertiary hover:text-primary transition-colors px-2 shrink-0"
            title={`${group.olderVersions.length} older version${group.olderVersions.length > 1 ? "s" : ""}`}
          >
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} className="inline-block">
              <ChevronDown size={14} strokeWidth={1.5} />
            </motion.span>
          </button>
        )}
      </div>
      <AnimatePresence>
        {expanded && hasVersions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pl-8 border-l border-border ml-8"
          >
            {group.olderVersions.map((v) => (
              <Row
                key={v.id}
                track={v}
                onOpenDetail={onOpenDetail}
                versionBadge={v.versionNumber ?? undefined}
                queueTracks={[v]}
                queueIndex={0}
                isSelected={false}
                onSelect={() => {}}
                albums={albums}
                onDeleteSuccess={onDeleteSuccess}
                isReadOnly={isReadOnly}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
