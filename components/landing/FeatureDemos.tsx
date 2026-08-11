"use client";

import { motion } from "framer-motion";

// Each demo is a tiny, looping, self-contained motion piece -- no video, no
// canvas capture, just framer-motion driving a few DOM nodes on repeat/
// alternate. They're meant to be glanced at inside a feature card, not
// watched start-to-finish, so every loop is short (2.5-4s) and the motion
// reads clearly even at a small size.

const LOOP = { repeat: Infinity, repeatType: "mirror" as const, ease: "easeInOut" as const };

export function VinylExportDemo() {
  return (
    <div className="relative h-44 rounded-xl bg-[#121212] overflow-hidden flex items-center justify-center">
      {/* Trim waveform */}
      <div className="absolute top-5 left-5 right-5 flex items-end gap-[2px] h-8 opacity-70">
        {Array.from({ length: 28 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 bg-white/40 rounded-full"
            animate={{ height: [`${20 + (i % 5) * 8}%`, `${40 + (i % 7) * 8}%`, `${20 + (i % 5) * 8}%`] }}
            transition={{ ...LOOP, duration: 2.4, delay: i * 0.03 }}
          />
        ))}
      </div>
      <motion.div
        className="absolute top-5 h-8 w-10 border-2 border-accent rounded-sm bg-accent/10"
        animate={{ left: ["8%", "42%", "8%"] }}
        transition={{ ...LOOP, duration: 3.6 }}
      />
      {/* Spinning disc + export progress */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2a2a2a] to-black border border-white/10 mt-6 relative"
      >
        <div className="absolute inset-[38%] rounded-full bg-accent" />
      </motion.div>
      <div className="absolute bottom-5 left-5 right-5 h-1 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full bg-accent rounded-full"
          animate={{ width: ["0%", "100%", "0%"] }}
          transition={{ ...LOOP, duration: 3.6 }}
        />
      </div>
    </div>
  );
}

export function MixingToolkitDemo() {
  const bands = [0.3, 0.7, 0.45, 0.8, 0.35];
  return (
    <div className="relative h-44 rounded-xl bg-[#121212] overflow-hidden flex items-center justify-center gap-4 px-8">
      {bands.map((base, i) => (
        <div key={i} className="flex flex-col items-center gap-2 h-full justify-center">
          <div className="relative w-1 h-24 bg-white/10 rounded-full">
            <motion.div
              className="absolute w-3 h-3 -left-1 rounded-full bg-accent"
              animate={{ top: [`${(1 - base) * 100 - 10}%`, `${(1 - base) * 100 + 15}%`, `${(1 - base) * 100 - 10}%`] }}
              transition={{ ...LOOP, duration: 2.2 + i * 0.3 }}
            />
          </div>
          <span className="text-[9px] text-white/30 uppercase tracking-wide">{["Lo", "LM", "Mid", "HM", "Hi"][i]}</span>
        </div>
      ))}
    </div>
  );
}

export function PermissionsDemo() {
  const tiers = ["Listen", "Download", "Edit"];
  return (
    <div className="relative h-44 rounded-xl bg-[#121212] overflow-hidden flex flex-col items-center justify-center gap-4">
      <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60 text-xs font-medium">JM</div>
      <div className="flex gap-2">
        {tiers.map((t, i) => (
          <motion.div
            key={t}
            className="text-[10px] px-3 py-1.5 rounded-full border"
            animate={{
              backgroundColor: ["rgba(255,255,255,0.04)", i === 1 ? "#e8650a" : "rgba(255,255,255,0.04)", "rgba(255,255,255,0.04)"],
              borderColor: ["rgba(255,255,255,0.12)", i === 1 ? "#e8650a" : "rgba(255,255,255,0.12)", "rgba(255,255,255,0.12)"],
              color: ["rgba(255,255,255,0.5)", i === 1 ? "#ffffff" : "rgba(255,255,255,0.5)", "rgba(255,255,255,0.5)"],
            }}
            transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.5, 1], delay: i * 0.15 }}
          >
            {t}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function VersionGroupDemo() {
  return (
    <div className="relative h-44 rounded-xl bg-[#121212] overflow-hidden flex items-center justify-center">
      <motion.div
        className="absolute w-40 h-9 rounded-lg bg-white/10 border border-white/10"
        animate={{ y: [-40, 6, 6], opacity: [0, 1, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.4, 1], ease: "easeOut" }}
      />
      <div className="flex flex-col gap-1.5 items-center">
        <div className="w-40 h-9 rounded-lg bg-white/[0.06] border border-white/10" />
        <div className="w-40 h-9 rounded-lg bg-white/[0.06] border border-white/10 flex items-center px-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent mr-2" />
          <div className="h-1.5 w-16 rounded-full bg-white/20" />
          <span className="ml-auto text-[9px] text-accent-text bg-accent/15 px-1.5 py-0.5 rounded-full">3 versions</span>
        </div>
      </div>
    </div>
  );
}
