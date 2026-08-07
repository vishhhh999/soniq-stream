"use client";

import { motion } from "framer-motion";

// Small animated equalizer bars — the "this row is currently playing"
// indicator, same idea as the inline audio-active icon on reference sites.
export default function PlayingIndicator() {
  const bars = [0, 1, 2];
  return (
    <div className="flex items-end gap-0.5 h-3 w-3.5 shrink-0">
      {bars.map((i) => (
        <motion.span
          key={i}
          className="w-[3px] bg-primary rounded-full"
          animate={{ height: ["30%", "100%", "45%", "80%", "30%"] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
