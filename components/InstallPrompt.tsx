"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Share, SquarePlus, Download } from "lucide-react";
import Logo from "./Logo";
import { MODAL_SPRING } from "@/lib/motion";

const DISMISS_KEY = "soniq-install-prompt-dismissed";

export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Never prompt on public pages — someone opening a shared link doesn't
    // have an account yet and hasn't chosen to use the app themselves.
    const path = window.location.pathname;
    if (path.startsWith("/s/") || path.startsWith("/invite/") || path === "/login" || path === "/setup") return;

    // Already installed (running standalone) — never show.
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone === true;
    if (isStandalone) return;

    if (localStorage.getItem(DISMISS_KEY)) return;

    const ua = window.navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !(window as any).MSStream;
    const isAndroid = /Android/.test(ua);
    if (!isIOS && !isAndroid) return; // desktop — no prompt at all

    setPlatform(isIOS ? "ios" : "android");

    // Android/Chrome fires this if the site is installable — capture it so
    // "Install" triggers the real native prompt instead of just closing a
    // banner. iOS Safari has no equivalent API at all; there's no way to
    // trigger installation programmatically, only to tell someone how.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Small delay so this doesn't fire the instant the page loads —
    // showing it after a moment of actual engagement reads as less
    // naggy than an immediate interstitial.
    const t = setTimeout(() => setShow(true), 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const install = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    dismiss();
  };

  if (!platform) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={MODAL_SPRING}
          className="fixed bottom-4 left-4 right-4 z-[65] bg-elevated border border-border rounded-xl shadow-2xl p-4 pb-safe"
        >
          <div className="flex items-start gap-3">
            <Logo size={28} className="text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary">Add SONIQ to your home screen</p>

              {platform === "android" && deferredPrompt ? (
                <>
                  <p className="text-xs text-secondary mt-1 mb-3">Get quick access, full screen, no browser bar.</p>
                  <button
                    onClick={install}
                    className="flex items-center gap-1.5 text-xs bg-accent text-on-accent rounded-md px-3 py-1.5 hover:bg-accent-strong transition-colors"
                  >
                    <Download size={12} strokeWidth={2} />
                    Install
                  </button>
                </>
              ) : platform === "ios" ? (
                <p className="text-xs text-secondary mt-1">
                  Tap <Share size={11} strokeWidth={2} className="inline mx-0.5 -mt-0.5" /> Share, then{" "}
                  <SquarePlus size={11} strokeWidth={2} className="inline mx-0.5 -mt-0.5" /> "Add to Home Screen".
                </p>
              ) : (
                <p className="text-xs text-secondary mt-1">Use your browser's menu to add this site to your home screen.</p>
              )}
            </div>
            <button onClick={dismiss} className="text-tertiary hover:text-primary transition-colors shrink-0">
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
