"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

const FAQ_ITEMS = [
  {
    q: "Why switch from untitled.stream to SONIQ?",
    a: "It comes down to fit and workflow rather than a missing-features list — untitled has a strong feature set too, including EQ, metronome, tuner, and stem separation. Where SONIQ differs is the branded vinyl-style export built directly into the app for socials, and the granular per-person sharing permissions (listen / download / edit). If those specific things matter to how you work, SONIQ's built around them.",
  },
  {
    q: "What's the difference between Free and Pro?",
    a: "Free gets you 500MB of storage and 2 of the 6 snippet export templates (Vinyl Rise and Vinyl Edge). Everything else — albums, versioning, sharing permissions, the full mixing toolkit, notifications, analytics — is unlocked on both. Pro removes the storage cap and unlocks all 6 templates.",
  },
  {
    q: "Is my unreleased music actually private?",
    a: "Yes. Nothing is public by default. Tracks are only reachable through a link or invite you create yourself, and you set exactly what each person can do — listen, download, or edit — per share. You can revoke access at any time.",
  },
  {
    q: "What happens if I go over the 500MB free limit?",
    a: "New uploads are blocked once you hit the cap — nothing existing gets deleted or locked. You can free up space by removing old versions, or upgrade to Pro for unlimited storage.",
  },
  {
    q: "Can I use SONIQ on mobile?",
    a: "Yes, the whole app is a responsive web app, install it to your home screen for an app-like experience. There's no dedicated native app yet.",
  },
  {
    q: "Do you use my music to train anything?",
    a: "No. Your tracks are yours. Stem separation runs through a processing pipeline to generate the split files you requested, nothing is retained or used beyond that job.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-2xl mx-auto divide-y divide-border">
      {FAQ_ITEMS.map((item, i) => {
        const open = openIndex === i;
        return (
          <div key={item.q} className="py-2">
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              className="w-full flex items-center justify-between gap-4 text-left py-4"
            >
              <span className="text-primary font-medium text-sm sm:text-base">{item.q}</span>
              <motion.span
                animate={{ rotate: open ? 45 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 text-tertiary"
              >
                <Plus size={18} strokeWidth={1.5} />
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <p className="text-secondary text-sm leading-relaxed pb-5 pr-8">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
