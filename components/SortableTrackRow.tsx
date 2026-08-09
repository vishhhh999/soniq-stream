"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import TrackRowGroup from "./TrackRow";
import type { TrackGroup } from "@/lib/groupVersions";
import type { Track } from "./PlayerProvider";
import type { Album } from "./AlbumCard";

export default function SortableTrackRow({
  group,
  onOpenDetail,
  queueTracks,
  queueIndex,
  isSelected,
  onSelect,
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
  albums?: Album[];
  onDeleteSuccess?: () => void;
  isReadOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.latest.id,
    disabled: isReadOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1">
      {!isReadOnly && (
        <button
          {...attributes}
          {...listeners}
          className="text-tertiary hover:text-primary cursor-grab active:cursor-grabbing shrink-0 touch-none p-1"
          title="Drag to reorder"
        >
          <GripVertical size={14} strokeWidth={1.5} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <TrackRowGroup
          group={group}
          onOpenDetail={onOpenDetail}
          queueTracks={queueTracks}
          queueIndex={queueIndex}
          isSelected={isSelected}
          onSelect={onSelect}
          albums={albums}
          onDeleteSuccess={onDeleteSuccess}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
