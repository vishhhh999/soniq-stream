"use client";

import { useEffect, useState } from "react";

// Below this width gets the mobile player + selection-based (no drag)
// interaction model. Matches Tailwind's `md` breakpoint (768px) so it
// stays consistent with any responsive Tailwind classes used elsewhere.
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
