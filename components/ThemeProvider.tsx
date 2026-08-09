"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer runs synchronously during the first client render —
  // before the "apply theme to <html>" effect below ever fires. Previously
  // this always started at "dark" and only got corrected a useEffect later,
  // so a light-theme user's ThemeProvider would briefly re-apply "dark"
  // right after hydration (undoing the blocking pre-hydration script in
  // layout.tsx) before self-correcting again a render later — a flash on
  // every load. Resolving it here means both the script and this state
  // agree from the very first render, nothing to correct.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark"; // SSR — corrected on the client immediately below
    try {
      const stored = window.localStorage.getItem("soniq-theme") as Theme | null;
      return stored ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("soniq-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
