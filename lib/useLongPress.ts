"use client";

import { useRef, useCallback } from "react";

// Long-press enters selection mode on mobile — a normal tap plays the
// track (matching mobile players generally), a sustained press selects it
// and switches into selection mode, matching the standard mobile
// file-manager pattern (Photos app, Files app, etc).
export function useLongPress(onLongPress: () => void, onTap: () => void, delay = 450) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!firedRef.current) onTap();
  }, [onTap]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchCancel: cancel,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: cancel,
  };
}
