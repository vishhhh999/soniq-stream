"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AmbientColorState = {
  from: string;
  to: string;
  pulse: number; // 0-1, decays every frame, spikes on a detected beat onset
};

const DEFAULT_COLOR_STATE: AmbientColorState = { from: "#888888", to: "#444444", pulse: 0 };

type AmbientContextValue = {
  enabled: boolean;
  toggle: () => void;
  // Ref-based, not state — AmbientBackground's draw loop updates this every
  // animation frame, and putting it in React state would re-render every
  // consumer 60x/second (the same problem AmbientBackground itself already
  // solved internally with refs, see its own comments). Consumers that need
  // to react visually (scrubber color, play-button glow) subscribe and run
  // their own rAF loop reading the ref, same pattern as AmbientBackground.
  colorStateRef: React.MutableRefObject<AmbientColorState>;
};

const AmbientContext = createContext<AmbientContextValue>({
  enabled: true,
  toggle: () => {},
  colorStateRef: { current: DEFAULT_COLOR_STATE },
});

export function AmbientProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true); // on by default, per spec
  const colorStateRef = useRef<AmbientColorState>(DEFAULT_COLOR_STATE);

  useEffect(() => {
    const stored = window.localStorage.getItem("soniq-ambient");
    if (stored !== null) setEnabled(stored === "true");
  }, []);

  const toggle = () => {
    setEnabled((v) => {
      window.localStorage.setItem("soniq-ambient", String(!v));
      return !v;
    });
  };

  const value = useMemo(() => ({ enabled, toggle, colorStateRef }), [enabled]);

  return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>;
}

export const useAmbient = () => useContext(AmbientContext);
