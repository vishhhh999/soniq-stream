"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Music2 } from "lucide-react";

// Tap the art to morph between a circular and rounded-square presentation —
// same interaction as reference players. framer-motion animates borderRadius
// directly so the shape genuinely morphs rather than crossfading between
// two separately-shaped elements.
export default function AlbumArtMorph({
  coverUrl,
  gradientFrom,
  gradientTo,
  size = 220,
}: {
  coverUrl?: string | null;
  gradientFrom?: string;
  gradientTo?: string;
  size?: number;
}) {
  const [shape, setShape] = useState<"circle" | "square">("circle");

  return (
    <motion.button
      onClick={() => setShape((s) => (s === "circle" ? "square" : "circle"))}
      animate={{ borderRadius: shape === "circle" ? size / 2 : size * 0.11 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        boxShadow: "0 16px 40px -12px rgba(0,0,0,0.45)",
      }}
      className="relative shrink-0 bg-surface"
      aria-label="Toggle album art shape"
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt="" className="w-full h-full object-cover pointer-events-none" draggable={false} />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${gradientFrom ?? "#333"}, ${gradientTo ?? "#111"})` }}
        >
          <Music2 size={size * 0.28} strokeWidth={1.2} className="text-white/50" />
        </div>
      )}
    </motion.button>
  );
}
