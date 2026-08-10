"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MODAL_SPRING } from "@/lib/motion";

// Generic click-outside-to-close popover anchored above the player pill.
// Used by Queue/Notes/Lyrics (fixed width) and Edit (wider, tabbed).
// The `anchorRefs` list lets a caller exclude its own trigger button from
// the outside-click check, so clicking the button that's already open
// doesn't immediately reopen it via the toggle handler racing this one.
export default function PlayerPopover({
  onClose, children, width = "w-80", anchorRefs = [], align = "right",
}: {
  onClose: () => void;
  children: React.ReactNode;
  width?: string;
  anchorRefs?: React.RefObject<HTMLElement>[];
  align?: "left" | "right" | "center";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchorRefs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    // pointerdown (not click) so this fires before the trigger button's own
    // onClick toggle handler on the next tick, and mousedown-equivalent
    // timing matches the pattern already used in AddMenu/NotificationsBell.
    document.addEventListener("pointerdown", onPointerDown);
    const onEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [onClose, anchorRefs]);

  const alignClass = align === "left" ? "left-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "right-0";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={MODAL_SPRING}
      className={`absolute bottom-full ${alignClass} mb-3 ${width} max-h-[420px] bg-elevated border border-border rounded-2xl shadow-xl p-4 overflow-hidden flex flex-col`}
    >
      {children}
    </motion.div>
  );
}
