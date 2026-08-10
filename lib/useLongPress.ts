"use client";

import { useRef, useCallback } from "react";

// Long-press enters selection mode on mobile — a normal tap plays the
// track (matching mobile players generally), a sustained press selects it
// and switches into selection mode, matching the standard mobile
// file-manager pattern (Photos app, Files app, etc).
//
// MOVE_CANCEL_THRESHOLD_PX guards against scrolling triggering this by
// accident: previously there was no touchmove handling at all, so
// scrolling a track list slowly (finger lingering on a row while the page
// scrolls) could cross the delay threshold and fire onLongPress mid-scroll
// — a real, reproducible "why did selection mode just turn on" bug.
const MOVE_CANCEL_THRESHOLD_PX = 10;

export function useLongPress(onLongPress: () => void, onTap: () => void, delay = 450) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const start = useCallback((e?: React.TouchEvent | React.MouseEvent) => {
    firedRef.current = false;
    if (e && "touches" in e && e.touches[0]) {
      startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      startPos.current = null;
    }
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const move = useCallback((e: React.TouchEvent) => {
    if (!startPos.current || !e.touches[0]) return;
    const dx = e.touches[0].clientX - startPos.current.x;
    const dy = e.touches[0].clientY - startPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_THRESHOLD_PX) {
      // This is a scroll, not a hold — cancel without firing onTap either,
      // same as a genuine scroll gesture shouldn't also count as a tap.
      clearTimer();
      startPos.current = null;
    }
  }, []);

  const clear = useCallback(() => {
    const wasTimerPending = !!timerRef.current;
    clearTimer();
    if (!firedRef.current && wasTimerPending) onTap();
  }, [onTap]);

  const cancel = useCallback(() => {
    clearTimer();
  }, []);

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: clear,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: cancel,
  };
}
