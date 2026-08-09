"use client";

import { useEffect, useRef } from "react";
import { useAmbient } from "@/components/AmbientProvider";

// Drives a glow/shadow effect on an element in step with the ambient
// engine's beat pulse, WITHOUT putting the pulse in React state — the
// AmbientBackground draw loop already had to solve this exact problem
// (see its own comments: state here re-renders 60x/second and is the
// actual known cause of past teardown/perf bugs). Same fix applies here:
// read the shared ref on a rAF loop and mutate the DOM node's style
// directly, React never re-renders for this.
//
// Usage: const glowRef = useRef<HTMLElement>(null); useAmbientPulse(glowRef);
// then give the element a base `box-shadow` via CSS/className — this hook
// only varies its spread/opacity on top of that base.
export function useAmbientPulse(targetRef: React.RefObject<HTMLElement>) {
  const { enabled, colorStateRef } = useAmbient();
  const rafRef = useRef<number>();

  useEffect(() => {
    const el = targetRef.current;
    if (!enabled || !el) {
      if (el) el.style.boxShadow = "";
      return;
    }

    const tick = () => {
      const { from, pulse } = colorStateRef.current;
      // Base ambient presence even at rest (small, constant glow) plus an
      // additive spread on top that breathes with detected beat pulses —
      // matches the "quiet by default, one showy beat on a hit" restraint
      // principle from the design audit, applied continuously instead of
      // as a single triggered event.
      const spread = 6 + pulse * 14;
      const alpha = 0.25 + pulse * 0.45;
      el.style.boxShadow = `0 0 ${spread}px ${from}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      el.style.boxShadow = "";
    };
  }, [enabled, colorStateRef, targetRef]);
}

// Writes the ambient color to a CSS variable on <html>, at a very low,
// fixed alpha — used by .backdrop-ambient (globals.css) so every modal's
// existing black/50 scrim picks up a whisper of the current track's color
// instead of being flat neutral black. Global (documentElement) rather
// than per-component on purpose: 13+ separate modal components each roll
// their own backdrop div with no shared wrapper, so a global CSS variable
// is the only way to reach all of them without refactoring every modal.
// Mount this once, near the app root (AuthedPlayerShell is a good spot,
// it's already always mounted whenever a modal could be open).
export function useAmbientBackdropTint() {
  const { enabled, colorStateRef } = useAmbient();
  const rafRef = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      document.documentElement.style.setProperty("--ambient-tint", "transparent");
      return;
    }
    // Polled, not full rAF — a backdrop tint doesn't need frame-accurate
    // beat sync the way the play-button glow does, and this runs for the
    // entire app lifetime, so the lighter interval matters more here.
    const id = setInterval(() => {
      const { from } = colorStateRef.current;
      // Fixed low alpha (0x14 ≈ 8%) — deliberately not pulse-reactive,
      // a pulsing modal backdrop would be distracting rather than ambient.
      document.documentElement.style.setProperty("--ambient-tint", `${from}14`);
    }, 250);
    return () => clearInterval(id);
  }, [enabled, colorStateRef]);
}
