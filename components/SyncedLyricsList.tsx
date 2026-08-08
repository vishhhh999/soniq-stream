"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import { getCurrentLineIndex, SyncedLine } from "@/lib/lyricsSync";

export default function SyncedLyricsList({
  lines,
  currentTime,
  variant = "sidebar",
}: {
  lines: SyncedLine[];
  currentTime: number;
  variant?: "sidebar" | "fullscreen";
}) {
  const { audioRef } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const [offset, setOffset] = useState(0);

  const activeIndex = getCurrentLineIndex(lines, currentTime);

  useEffect(() => {
    if (!activeLineRef.current || !containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const lineTop = activeLineRef.current.offsetTop;
    const lineHeight = activeLineRef.current.offsetHeight;
    setOffset(lineTop - containerHeight / 2 + lineHeight / 2);
  }, [activeIndex]);

  const seekTo = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const sizing =
    variant === "fullscreen"
      ? { active: "text-3xl", inactive: "text-xl", gap: "space-y-6", padY: "py-[45vh]" }
      : { active: "text-sm font-medium", inactive: "text-sm", gap: "space-y-4", padY: "py-[40vh]" };

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden">
      <motion.div
        animate={{ y: -offset }}
        transition={{ type: "spring", stiffness: 170, damping: 26 }}
        className={`absolute top-0 left-0 right-0 ${sizing.gap} ${sizing.padY}`}
      >
        {lines.map((line, i) => {
          const isActive = i === activeIndex;
          return (
            <p
              key={i}
              ref={isActive ? activeLineRef : undefined}
              onClick={() => seekTo(line.time)}
              className={`transition-colors duration-300 cursor-pointer ${
                variant === "fullscreen" ? "text-center" : ""
              } ${
                isActive
                  ? `text-primary ${sizing.active}`
                  : `text-tertiary hover:text-secondary ${sizing.inactive}`
              }`}
              style={{
                textShadow: isActive ? "0 0 14px var(--accent)" : "none",
                transition: "text-shadow 400ms ease, color 300ms ease",
              }}
            >
              {line.text}
            </p>
          );
        })}
      </motion.div>
    </div>
  );
}
