"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import { getCurrentLineIndex, SyncedLine } from "@/lib/lyricsSync";

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
  const contentRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLParagraphElement>(null);
  const [offset, setOffset] = useState(0);
  const [isManual, setIsManual] = useState(false);
  const manualOverrideRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeIndex = getCurrentLineIndex(lines, currentTime);

  // Auto-follow: keep active line centred when not in manual mode.
  useEffect(() => {
    if (manualOverrideRef.current) return;
    if (!activeLineRef.current || !containerRef.current) return;
    const containerHeight = containerRef.current.offsetHeight;
    const lineTop = activeLineRef.current.offsetTop;
    const lineHeight = activeLineRef.current.offsetHeight;
    setOffset(lineTop - containerHeight / 2 + lineHeight / 2);
  }, [activeIndex]);

  const resumeAutoFollow = () => {
    manualOverrideRef.current = false;
    setIsManual(false);
    if (activeLineRef.current && containerRef.current) {
      const h = containerRef.current.offsetHeight;
      const t = activeLineRef.current.offsetTop;
      const lh = activeLineRef.current.offsetHeight;
      setOffset(t - h / 2 + lh / 2);
    }
  };

  const beginManualOverride = () => {
    manualOverrideRef.current = true;
    setIsManual(true);
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(resumeAutoFollow, RESUME_AUTO_FOLLOW_MS);
  };

  const clampedOffset = (raw: number): number => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return Math.max(0, raw);
    const max = Math.max(0, content.scrollHeight - container.clientHeight);
    return Math.max(0, Math.min(max, raw));
  };

  // Attach wheel listener as non-passive so we can call preventDefault().
  // This stops wheel events from bubbling to the page while the cursor is
  // over the lyrics container — that was the root cause of the page
  // scroll triggering while scrolling inside the lyrics box.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Normalize deltaMode: Firefox uses LINE (1) not PIXEL (0).
      const LINE_HEIGHT = 32;
      const PAGE_HEIGHT = container.offsetHeight;
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= LINE_HEIGHT;
      else if (e.deltaMode === 2) delta *= PAGE_HEIGHT;

      beginManualOverride();
      setOffset((prev) => clampedOffset(prev + delta));
    };

    // { passive: false } is required — React's synthetic onWheel is passive
    // by default in modern browsers, so e.preventDefault() there is a no-op.
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native touch handlers — same passive issue applies.
  const touchStartY = useRef(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const delta = touchStartY.current - e.touches[0].clientY;
      touchStartY.current = e.touches[0].clientY;
      beginManualOverride();
      setOffset((prev) => clampedOffset(prev + delta));
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, []);

  const seekTo = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const sizing =
    variant === "fullscreen"
      ? { size: "text-lg", gap: "space-y-5", padY: "py-[45vh]" }
      : { size: "text-sm", gap: "space-y-4", padY: "py-[40vh]" };

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-hidden"
      // No onWheel/onTouchMove here — handled by native listeners above
      // so we can call preventDefault() which React's synthetic events can't.
    >
      <motion.div
        ref={contentRef}
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
