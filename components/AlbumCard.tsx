"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { Disc3 } from "lucide-react";

export type Album = { id: string; name: string; coverUrl: string | null };

// Both a drag source (drop this album onto another to create a folder) and
// a drop target (drop a track onto it to add that track to this album).
// dnd-kit tracks these as separate registries even though they share the
// same underlying id — that's expected, not a bug.
export default function AlbumCard({
  album,
  trackCount,
  dragDisabled,
}: {
  album: Album;
  trackCount: number;
  dragDisabled?: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `album:${album.id}`,
    data: { type: "album", album },
    disabled: dragDisabled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `album:${album.id}`,
    data: { type: "album", album },
    disabled: dragDisabled,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 50 : undefined }
    : undefined;

  return (
    <div ref={setDropRef}>
      <motion.button
        ref={setDragRef}
        {...attributes}
        {...listeners}
        style={style}
        whileHover={{ y: isDragging ? 0 : -4 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        onClick={() => !isDragging && router.push(`/album/${album.id}`)}
        className={`text-left group w-full ${isDragging ? "opacity-40" : ""}`}
      >
        <div
          className={`aspect-square rounded-md overflow-hidden bg-surface border transition-colors mb-4 ${
            isOver ? "border-accent border-2" : "border-border group-hover:border-border-strong"
          }`}
        >
          {album.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-tertiary">
              <Disc3 size={40} strokeWidth={1} />
            </div>
          )}
        </div>
        <p className="text-base text-primary truncate font-medium">{album.name}</p>
        <p className="text-sm text-tertiary">{trackCount} track{trackCount === 1 ? "" : "s"}</p>
      </motion.button>
    </div>
  );
}
