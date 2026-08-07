"use client";

import { createContext, useContext, useEffect, useState } from "react";

const AmbientContext = createContext<{ enabled: boolean; toggle: () => void }>({
  enabled: true,
  toggle: () => {},
});

export function AmbientProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true); // on by default, per spec

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

  return <AmbientContext.Provider value={{ enabled, toggle }}>{children}</AmbientContext.Provider>;
}

export const useAmbient = () => useContext(AmbientContext);
