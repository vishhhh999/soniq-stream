"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { Track } from "./PlayerProvider";

export default function SortableQueueItem({
  track,
  index,
  isCurrent,
  onSelect,
}: {
  track: Track;
  index: number;
  isCurrent: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `${track.id}-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 hover:bg-surface transition-colors ${isCurrent ? "bg-surface" : ""}`}
    >
      <button {...attributes} {...listeners} aria-label="Drag to reorder" className="text-tertiary hover:text-primary cursor-grab active:cursor-grabbing shrink-0 p-1.5 touch-none">
        <GripVertical size={12} strokeWidth={1.5} />
      </button>
      <button onClick={onSelect} className="flex-1 text-left py-2 flex items-center gap-3 min-w-0">
        <span className="text-xs text-tertiary tabular-nums w-5 shrink-0">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm truncate ${isCurrent ? "text-primary font-medium" : "text-primary"}`}>{track.title}</p>
          <p className="text-xs text-secondary truncate">{track.artist || "Unknown"}</p>
        </div>
      </button>
    </div>
  );
}
