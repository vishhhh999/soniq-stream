"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, ChevronDown, Mic2,
} from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import AlbumArtMorph from "./AlbumArtMorph";
import WaveformSeekBar from "./WaveformSeekBar";
import SyncedLyricsList from "./SyncedLyricsList";
import type { SyncedLine } from "@/lib/lyricsSync";
import { gradientFromSeed } from "@/lib/gradient";

export default function MobilePlayerBar() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle, next, previous,
    queue, queueIndex, shuffleOn, toggleShuffle, repeatMode, cycleRepeatMode,
  } = usePlayer();

  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [lines, setLines] = useState<SyncedLine[] | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  useEffect(() => setMounted(true), []);

  // Fetch lyrics for the scrollable section below the player, only while expanded.
  useEffect(() => {
    if (!expanded || !current) return;
    setLyricsLoading(true);
    fetch(`/api/tracks/${current.id}`)
      .then((r) => r.json())
      .then((full) => {
        if (Array.isArray(full.lyricsSynced) && full.lyricsSynced.length > 0) {
          setLines(full.lyricsSynced); setRawText(null);
        } else if (full.lyrics) {
          setLines(null); setRawText(full.lyrics);
        } else {
          setLines(null); setRawText(null);
        }
      })
      .finally(() => setLyricsLoading(false));
  }, [expanded, current?.id]);

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const gradient = current ? gradientFromSeed(current.id) : null;

  if (!current) return null;

  // Collapsed mini-bar. Fixed to viewport bottom, above the mobile nav-safe area.
  const collapsed = (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-elevated border-t border-border">
      <div className="h-16 flex items-center px-4 gap-3" onClick={() => setExpanded(true)}>
        <div
          className="w-9 h-9 rounded-full shrink-0 overflow-hidden bg-surface"
          style={{ background: current.albumCoverUrl ? undefined : `linear-gradient(135deg, ${gradient?.from}, ${gradient?.to})` }}
        >
          {current.albumCoverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.albumCoverUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-primary truncate">{current.title}</p>
          <p className="text-xs text-secondary truncate">{current.artist || "Unknown"}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          className="w-11 h-11 rounded-full bg-accent text-canvas flex items-center justify-center shrink-0 -mr-1"
        >
          {isPlaying ? <Pause size={17} strokeWidth={2} /> : <Play size={17} strokeWidth={2} className="ml-0.5" />}
        </button>
      </div>
      <div className="h-0.5 bg-border">
        <div className="h-full bg-accent" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
      </div>
    </div>
  );

  // Expanded sheet — scrollable. Now Playing content is the first screen,
  // scrolling down reveals lyrics below it (same pattern as Spotify's
  // full-screen player). No separate lyrics button/overlay needed.
  const sheet = expanded && (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="fixed inset-0 bg-canvas z-[70] flex flex-col overflow-y-auto no-scrollbar"
    >
      {/* Sticky header so it stays visible while scrolling into lyrics */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 pt-6 pb-4 bg-canvas/95 backdrop-blur-sm shrink-0">
        <button onClick={() => setExpanded(false)} className="text-tertiary p-2 -m-2">
          <ChevronDown size={22} strokeWidth={1.5} />
        </button>
        <span className="text-xs uppercase tracking-wide text-tertiary">Now Playing</span>
        <div className="w-9" /> {/* balance the header */}
      </div>

      {/* Screen 1 — vinyl, transport controls. min-h so it fills the viewport
          before lyrics content starts, giving the scroll-down affordance. */}
      <div className="flex flex-col px-6 pb-8" style={{ minHeight: "calc(100dvh - 76px)" }}>
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <AlbumArtMorph coverUrl={current.albumCoverUrl} size={220} gradientFrom={gradient?.from} gradientTo={gradient?.to} />
          <div className="mt-8 text-center w-full">
            <p className="text-lg font-medium text-primary truncate">{current.title}</p>
            <p className="text-sm text-secondary truncate">{current.artist || "Unknown"}</p>
          </div>
        </div>

        <div className="mb-2 mt-6">
          <WaveformSeekBar
            trackId={current.id}
            progress={currentTime}
            duration={duration}
            onSeek={(v) => { if (audioRef.current) audioRef.current.currentTime = v; }}
          />
        </div>
        <div className="flex justify-between text-xs text-tertiary tabular-nums mb-8">
          <span>{fmt(currentTime)}</span>
          <span>{fmt(duration)}</span>
        </div>

        <div className="flex items-center justify-between mb-4">
          <button onClick={toggleShuffle} className="p-2 -m-2">
            <Shuffle size={19} strokeWidth={1.5} className={shuffleOn ? "text-accent" : "text-secondary"} />
          </button>
          <div className="flex items-center gap-6">
            <button onClick={previous} className="p-2 -m-2">
              <SkipBack size={26} strokeWidth={1.5} className={queue.length > 1 || currentTime > 3 ? "text-primary" : "text-tertiary"} />
            </button>
            <button onClick={toggle} className="w-16 h-16 rounded-full bg-accent text-canvas flex items-center justify-center shrink-0">
              {isPlaying ? <Pause size={24} strokeWidth={2} /> : <Play size={24} strokeWidth={2} className="ml-1" />}
            </button>
            <button onClick={next} className="p-2 -m-2">
              <SkipForward size={26} strokeWidth={1.5} className={queueIndex < queue.length - 1 ? "text-primary" : "text-tertiary"} />
            </button>
          </div>
          <button onClick={cycleRepeatMode} className="p-2 -m-2">
            {repeatMode === "one" ? (
              <Repeat1 size={19} strokeWidth={1.5} className="text-accent" />
            ) : (
              <Repeat size={19} strokeWidth={1.5} className={repeatMode === "all" ? "text-accent" : "text-secondary"} />
            )}
          </button>
        </div>

        {/* Scroll-down affordance */}
        <div className="flex flex-col items-center gap-1 mt-4 text-tertiary">
          <Mic2 size={14} strokeWidth={1.5} />
          <motion.div animate={{ y: [0, 4, 0] }} transition={{ repeat: Infinity, duration: 1.6 }}>
            <ChevronDown size={16} strokeWidth={1.5} />
          </motion.div>
        </div>
      </div>

      {/* Screen 2 — lyrics, revealed by scrolling down */}
      <div className="px-6 pb-16 pt-4 border-t border-border min-h-[50vh]">
        <p className="text-xs uppercase tracking-wide text-tertiary mb-4 text-center">Lyrics</p>
        {lyricsLoading ? (
          <p className="text-secondary text-sm text-center mt-12">Loading...</p>
        ) : lines && lines.length > 0 ? (
          <div style={{ height: "60vh" }}>
            <SyncedLyricsList lines={lines} currentTime={currentTime} variant="fullscreen" />
          </div>
        ) : rawText ? (
          <div className="text-center">
            <p className="text-tertiary text-xs mb-6">Not synced to timing yet — showing plain text.</p>
            <p className="text-primary text-base leading-relaxed whitespace-pre-line">{rawText}</p>
          </div>
        ) : (
          <div className="text-center mt-8">
            <p className="text-secondary text-sm">No lyrics added yet.</p>
          </div>
        )}
      </div>
    </motion.div>
  );

  if (!mounted) return null;

  return createPortal(
    <>
      {collapsed}
      <AnimatePresence>{sheet}</AnimatePresence>
    </>,
    document.body
  );
}
