"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { MODAL_SPRING } from "@/lib/motion";

const STORAGE_KEY = "soniq-cookie-consent";

// Honest by design: this app sets exactly one cookie — the NextAuth session
// cookie, which is strictly necessary for staying signed in and can't be
// turned off without breaking login. There's no analytics, no ad tracking,
// no third-party marketing pixels anywhere in this codebase. Theme/ambient/
// crossfade preferences are stored in localStorage, not cookies, and aren't
// covered by cookie consent law the same way — mentioned in the copy for
// transparency, not offered as a toggle here.
export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"banner" | "settings">("banner");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) setVisible(true);

    const openSettings = () => {
      setMode("settings");
      setVisible(true);
    };
    window.addEventListener("soniq:open-cookie-settings", openSettings);
    return () => window.removeEventListener("soniq:open-cookie-settings", openSettings);
  }, []);

  const acknowledge = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ acknowledged: true, at: new Date().toISOString() }));
    setVisible(false);
    setMode("banner");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={MODAL_SPRING}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[80] bg-elevated border border-border rounded-xl shadow-2xl p-5 pb-safe"
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-primary">Cookies</p>
            <button onClick={acknowledge} className="text-tertiary hover:text-primary shrink-0" aria-label="Dismiss">
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>

          {mode === "banner" ? (
            <>
              <p className="text-xs text-secondary leading-relaxed mb-4">
                We use one strictly-necessary cookie to keep you signed in. No
                analytics or ad-tracking cookies — see our{" "}
                <Link href="/cookies" className="text-primary underline">Cookie Policy</Link>.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={acknowledge}
                  className="flex-1 bg-accent text-on-accent text-xs font-medium py-2 rounded-full hover:bg-accent-strong transition-colors"
                >
                  Got it
                </button>
                <button
                  onClick={() => setMode("settings")}
                  className="text-xs text-secondary border border-border px-3 py-2 rounded-md hover:border-border-strong hover:text-primary transition-colors"
                >
                  Manage
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-primary">Essential</p>
                    <p className="text-[11px] text-tertiary">Keeps you signed in. Required.</p>
                  </div>
                  <div className="w-9 h-5 rounded-full bg-accent relative shrink-0 opacity-60">
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-white rounded-full" />
                  </div>
                </div>
                <p className="text-[11px] text-tertiary leading-relaxed">
                  That's the only cookie we set. No analytics, no advertising,
                  no third-party trackers. Some preferences (theme, ambient
                  background, crossfade) are saved in your browser's local
                  storage instead of a cookie — full details in the{" "}
                  <Link href="/cookies" className="text-secondary underline">Cookie Policy</Link>.
                </p>
              </div>
              <button
                onClick={acknowledge}
                className="w-full bg-accent text-on-accent text-xs font-medium py-2 rounded-full hover:bg-accent-strong transition-colors"
              >
                Done
              </button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
