"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, ListMusic, Volume2, Volume1, VolumeX,
  X, Mic2, ChevronDown,
} from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import VinylArt from "./VinylArt";
import InteractiveVinyl from "./InteractiveVinyl";
import WaveformSeekBar from "./WaveformSeekBar";
import LyricsView from "./LyricsView";
import { gradientFromSeed } from "@/lib/gradient";

export default function MobilePlayerBar() {
  const { current, isPlaying, currentTime, duration, audioRef, toggle, next, previous, queue, queueIndex, shuffleOn, toggleShuffle } = usePlayer();
  const [expanded, setExpanded] = useState(false);
  const [loopOn, setLoopOn] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triedFallbackRef = useRef(false);
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!audioRef.current || !current) return;
    if (lastTrackIdRef.current === current.id) return;
    lastTrackIdRef.current = current.id;
    triedFallbackRef.current = false;
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.src = current.fileUrl;
    audioRef.current.play().catch(() => {});
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      if (!current || triedFallbackRef.current) return;
      triedFallbackRef.current = true;
      audio.removeAttribute("crossorigin");
      audio.src = current.fileUrl;
      audio.play().catch(() => {});
    };
    audio.addEventListener("error", onError);
    return () => audio.removeEventListener("error", onError);
  }, [current]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = loopOn;
  }, [loopOn]);

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const gradient = current ? gradientFromSeed(current.id) : null;

  if (!current) return null;

  // Collapsed mini-bar — full width, tap anywhere (except play) to expand.
  const collapsed = (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-elevated border-t border-border">
      <div
        className="h-16 flex items-center px-4 gap-3"
        onClick={() => setExpanded(true)}
      >
        <VinylArt coverUrl={current.albumCoverUrl} spinning={isPlaying} size={36} gradientFrom={gradient?.from} gradientTo={gradient?.to} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary truncate">{current.title}</p>
          <p className="text-xs text-secondary truncate">{current.artist || "Unknown"}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="w-10 h-10 rounded-full bg-accent text-canvas flex items-center justify-center shrink-0"
        >
          {isPlaying ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} className="ml-0.5" />}
        </button>
      </div>
      {/* Thin progress line along the very bottom edge of the mini-bar —
         enough context to see where you are without needing to expand. */}
      <div className="h-0.5 bg-border">
        <div className="h-full bg-accent" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
      </div>
    </div>
  );

  // Expanded sheet — full screen, generous touch targets, no hover-only
  // affordances (volume is an inline slider here, not a hover popover).
  const sheet = expanded && (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="fixed inset-0 bg-canvas z-[70] flex flex-col px-6 pt-6 pb-10"
    >
      <div className="flex items-center justify-between mb-8">
        <button onClick={() => setExpanded(false)} className="text-tertiary p-2 -m-2">
          <ChevronDown size={22} strokeWidth={1.5} />
        </button>
        <span className="text-xs uppercase tracking-wide text-tertiary">Now Playing</span>
        <button onClick={() => setShowLyrics(true)} className="text-tertiary p-2 -m-2">
          <Mic2 size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center">
        <InteractiveVinyl coverUrl={current.albumCoverUrl} size={220} gradientFrom={gradient?.from} gradientTo={gradient?.to} />
        <div className="mt-8 text-center w-full">
          <p className="text-lg font-medium text-primary truncate">{current.title}</p>
          <p className="text-sm text-secondary truncate">{current.artist || "Unknown"}</p>
        </div>
      </div>

      <div className="mb-2">
        <WaveformSeekBar
          trackId={current.id}
          progress={currentTime}
          duration={duration}
          onSeek={(v) => {
            if (audioRef.current) audioRef.current.currentTime = v;
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-tertiary tabular-nums mb-8">
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-8 mb-8">
        <Shuffle size={20} strokeWidth={1.5} onClick={toggleShuffle} className={shuffleOn ? "text-primary" : "text-secondary"} />
        <SkipBack size={26} strokeWidth={1.5} onClick={previous} className={queue.length > 1 || currentTime > 3 ? "text-primary" : "text-tertiary"} />
        <button onClick={toggle} className="w-16 h-16 rounded-full bg-accent text-canvas flex items-center justify-center">
          {isPlaying ? <Pause size={24} strokeWidth={2} /> : <Play size={24} strokeWidth={2} className="ml-1" />}
        </button>
        <SkipForward size={26} strokeWidth={1.5} onClick={next} className={queueIndex < queue.length - 1 ? "text-primary" : "text-tertiary"} />
        <Repeat size={20} strokeWidth={1.5} onClick={() => setLoopOn((v) => !v)} className={loopOn ? "text-primary" : "text-secondary"} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setMuted((m) => !m)} className="text-secondary shrink-0">
          <VolIcon size={18} strokeWidth={1.5} />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (v > 0) setMuted(false);
          }}
          className="flex-1 accent-[var(--accent)]"
        />
      </div>
    </motion.div>
  );

  if (!mounted) return null;

  return createPortal(
    <>
      {collapsed}
      <AnimatePresence>{sheet}</AnimatePresence>
      {showLyrics && current && <LyricsView track={current} onClose={() => setShowLyrics(false)} />}
    </>,
    document.body
  );
}
