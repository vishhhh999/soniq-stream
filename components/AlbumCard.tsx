"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Disc3 } from "lucide-react";

export type Album = { id: string; name: string; coverUrl: string | null };

export default function AlbumCard({ album, trackCount }: { album: Album; trackCount: number }) {
  const router = useRouter();
  return (
    <motion.button
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={() => router.push(`/album/${album.id}`)}
      className="text-left group"
    >
      <div className="aspect-square rounded-md overflow-hidden bg-surface border border-border group-hover:border-border-strong transition-colors mb-3">
        {album.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={album.coverUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-tertiary">
            <Disc3 size={28} strokeWidth={1.2} />
          </div>
        )}
      </div>
      <p className="text-sm text-primary truncate">{album.name}</p>
      <p className="text-xs text-tertiary">{trackCount} track{trackCount === 1 ? "" : "s"}</p>
    </motion.button>
  );
}
