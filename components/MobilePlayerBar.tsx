"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, ChevronDown,
  ChevronLeft, ListMusic, FileText, Mic2, SlidersHorizontal,
} from "lucide-react";
import { usePlayer } from "./PlayerProvider";
import AlbumArtMorph from "./AlbumArtMorph";
import WaveformSeekBar from "./WaveformSeekBar";
import QueuePanel from "./player/QueuePanel";
import NotesPanel from "./player/NotesPanel";
import LyricsPanel from "./player/LyricsPanel";
import EditPanel from "./player/EditPanel";
import { gradientFromSeed } from "@/lib/gradient";
import { useAmbientPulse } from "@/lib/useAmbientPulse";
import { MODAL_SPRING } from "@/lib/motion";

type ViewKey = "queue" | "notes" | "lyrics" | "edit" | null;

// Full-screen view that fully covers the player (not a floating overlay) —
// matches the reference's own "New Snippet" pattern: back button top-left,
// title centered, nothing of the player visible behind it. Same shared
// panel content as desktop's popovers (QueuePanel/NotesPanel/LyricsPanel/
// EditPanel), just given the full viewport instead of a fixed-width box.
function FullScreenView({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={MODAL_SPRING}
      className="fixed inset-0 bg-canvas z-[80] flex flex-col"
    >
      <div className="flex items-center px-4 pt-6 pb-4 shrink-0">
        <button onClick={onBack} className="text-tertiary p-2 -m-2">
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
        <span className="flex-1 text-center text-xs uppercase tracking-wide text-tertiary -ml-9">{title}</span>
        <div className="w-9" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-6 pb-8">
        {children}
      </div>
    </motion.div>
  );
}

export default function MobilePlayerBar() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle, next, previous,
    queue, queueIndex, shuffleOn, toggleShuffle, repeatMode, cycleRepeatMode,
  } = usePlayer();

  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeView, setActiveView] = useState<ViewKey>(null);
  const expandedPlayButtonRef = useRef<HTMLButtonElement>(null);
  useAmbientPulse(expandedPlayButtonRef);

  useEffect(() => setMounted(true), []);
  // Closing the whole sheet always closes any open full-screen view too,
  // so reopening the player never resumes on Queue/Notes/Lyrics/Edit.
  useEffect(() => { if (!expanded) setActiveView(null); }, [expanded]);

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const gradient = current ? gradientFromSeed(current.id) : null;

  if (!current) return null;

  const collapsed = (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-elevated border-t border-border pb-safe">
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
          className="w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center shrink-0 -mr-1"
        >
          {isPlaying ? <Pause size={17} strokeWidth={2} /> : <Play size={17} strokeWidth={2} className="ml-0.5" />}
        </button>
      </div>
      <div className="h-0.5 bg-border">
        <div className="h-full bg-accent" style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }} />
      </div>
    </div>
  );

  const sheet = expanded && (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      className="fixed inset-0 bg-canvas z-[70] flex flex-col"
    >
      <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
        <button onClick={() => setExpanded(false)} className="text-tertiary p-2 -m-2">
          <ChevronDown size={22} strokeWidth={1.5} />
        </button>
        <span className="text-xs uppercase tracking-wide text-tertiary">Now Playing</span>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col px-6 pb-8 min-h-0">
        <div className="flex-1 flex flex-col items-center justify-center min-h-0">
          <AlbumArtMorph coverUrl={current.albumCoverUrl} size={280} gradientFrom={gradient?.from} gradientTo={gradient?.to} />
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

        <div className="flex items-center justify-between mb-6">
          <button onClick={toggleShuffle} aria-label="Toggle shuffle" className="p-3 -m-3">
            <Shuffle size={19} strokeWidth={1.5} className={shuffleOn ? "text-accent" : "text-secondary"} />
          </button>
          <div className="flex items-center gap-6">
            <button onClick={previous} aria-label="Previous track" className="p-2 -m-2">
              <SkipBack size={26} strokeWidth={1.5} className={queue.length > 1 || currentTime > 3 ? "text-primary" : "text-tertiary"} />
            </button>
            <button ref={expandedPlayButtonRef} onClick={toggle} aria-label="Play or pause" className="w-16 h-16 rounded-full bg-accent text-on-accent flex items-center justify-center shrink-0">
              {isPlaying ? <Pause size={24} strokeWidth={2} /> : <Play size={24} strokeWidth={2} className="ml-1" />}
            </button>
            <button onClick={next} aria-label="Next track" className="p-2 -m-2">
              <SkipForward size={26} strokeWidth={1.5} className={queueIndex < queue.length - 1 ? "text-primary" : "text-tertiary"} />
            </button>
          </div>
          <button onClick={cycleRepeatMode} aria-label="Cycle repeat mode" className="p-3 -m-3">
            {repeatMode === "one" ? (
              <Repeat1 size={19} strokeWidth={1.5} className="text-accent" />
            ) : (
              <Repeat size={19} strokeWidth={1.5} className={repeatMode === "all" ? "text-accent" : "text-secondary"} />
            )}
          </button>
        </div>

        {/* Bottom icon row — Queue/Notes/Lyrics left, Edit right, same
           positions and same shared panel content as desktop's popovers.
           Matches the reference layout directly, per Vish's instruction. */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-5 bg-elevated rounded-full px-4 py-2.5">
            <button onClick={() => setActiveView("queue")} className="text-secondary hover:text-primary transition-colors">
              <ListMusic size={16} strokeWidth={1.5} />
            </button>
            <button onClick={() => setActiveView("notes")} className="text-secondary hover:text-primary transition-colors">
              <FileText size={16} strokeWidth={1.5} />
            </button>
            <button onClick={() => setActiveView("lyrics")} className="text-secondary hover:text-primary transition-colors">
              <Mic2 size={16} strokeWidth={1.5} />
            </button>
          </div>
          <button
            onClick={() => setActiveView("edit")}
            className="flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-full bg-elevated text-secondary hover:text-primary transition-colors"
          >
            <SlidersHorizontal size={14} strokeWidth={1.5} />
            Edit
          </button>
        </div>
      </div>

      <AnimatePresence>
        {activeView === "queue" && (
          <FullScreenView title="Queue" onBack={() => setActiveView(null)}>
            <QueuePanel />
          </FullScreenView>
        )}
        {activeView === "notes" && (
          <FullScreenView title="Notes" onBack={() => setActiveView(null)}>
            <NotesPanel track={current} />
          </FullScreenView>
        )}
        {activeView === "lyrics" && (
          <FullScreenView title="Lyrics" onBack={() => setActiveView(null)}>
            <LyricsPanel track={current} />
          </FullScreenView>
        )}
        {activeView === "edit" && (
          <FullScreenView title="Edit" onBack={() => setActiveView(null)}>
            <EditPanel track={current} />
          </FullScreenView>
        )}
      </AnimatePresence>
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
