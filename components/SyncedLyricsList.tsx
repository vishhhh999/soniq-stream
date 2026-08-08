"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import { getCurrentLineIndex, SyncedLine } from "@/lib/lyricsSync";

// How long after the user's last manual scroll/touch input before
// auto-follow (tracking the active line) resumes — same pattern Apple
// Music/Spotify use, so scrolling ahead to read upcoming lines doesn't
// immediately get yanked back to the currently-playing line.
const RESUME_AUTO_FOLLOW_MS = 2500;

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
  const [isManual, setIsManual] = useState(false);
  const manualOverrideRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIndex = getCurrentLineIndex(lines, currentTime);

  useEffect(() => {
    if (manualOverrideRef.current) return; // user is actively browsing — don't yank them back
    if (!activeLineRef.current || !containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const lineTop = activeLineRef.current.offsetTop;
    const lineHeight = activeLineRef.current.offsetHeight;
    setOffset(lineTop - containerHeight / 2 + lineHeight / 2);
  }, [activeIndex]);

  // Previously the container was `overflow-hidden` with nothing handling
  // wheel/touch input at all — any attempt to manually scroll did
  // nothing, which is exactly what "glitches out when trying to scroll"
  // describes. Wheel/drag deltas now directly adjust the offset, and
  // auto-follow pauses while doing so, resuming after a short pause.
  const beginManualOverride = () => {
    manualOverrideRef.current = true;
    setIsManual(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      manualOverrideRef.current = false;
      setIsManual(false);
      if (activeLineRef.current && containerRef.current) {
        const containerHeight = containerRef.current.offsetHeight;
        const lineTop = activeLineRef.current.offsetTop;
        const lineHeight = activeLineRef.current.offsetHeight;
        setOffset(lineTop - containerHeight / 2 + lineHeight / 2);
      }
    }, RESUME_AUTO_FOLLOW_MS);
  };

  const onWheel = (e: React.WheelEvent) => {
    // deltaMode 0 = pixels (default, Chrome/Safari), 1 = lines (Firefox),
    // 2 = pages. Without normalizing, Firefox sends deltaY=3 meaning "3 lines"
    // which we'd treat as 3px — scroll feels nearly frozen. Multiply out to pixels.
    const LINE_HEIGHT = 32;
    const PAGE_HEIGHT = containerRef.current?.offsetHeight ?? 500;
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= LINE_HEIGHT;
    else if (e.deltaMode === 2) delta *= PAGE_HEIGHT;
    beginManualOverride();
    setOffset((prev) => prev + delta);
  };

  const touchStartY = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const delta = touchStartY.current - e.touches[0].clientY;
    touchStartY.current = e.touches[0].clientY;
    beginManualOverride();
    setOffset((prev) => prev + delta);
  };

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const seekTo = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  // Every line is now the same size — the active line was previously
  // larger (text-xl vs text-sm), and that abrupt font-size jump every
  // time the highlighted line changed is what made the whole animation
  // read as jagged. Highlighting is color/glow only now, at one
  // consistent size (a touch smaller than the old "active" size).
  const sizing =
    variant === "fullscreen"
      ? { size: "text-lg", gap: "space-y-5", padY: "py-[45vh]" }
      : { size: "text-sm", gap: "space-y-4", padY: "py-[40vh]" };

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
    >
      <motion.div
        animate={{ y: -offset }}
        transition={isManual ? { duration: 0 } : { type: "spring", stiffness: 100, damping: 20 }}
        className={`absolute top-0 left-0 right-0 ${sizing.gap} ${sizing.padY}`}
      >
        {lines.map((line, i) => {
          const isActive = i === activeIndex;
          return (
            <p
              key={i}
              ref={isActive ? activeLineRef : undefined}
              onClick={() => seekTo(line.time)}
              className={`cursor-pointer ${sizing.size} font-medium ${
                variant === "fullscreen" ? "text-center" : ""
              } ${isActive ? "text-primary" : "text-tertiary hover:text-secondary"}`}
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
