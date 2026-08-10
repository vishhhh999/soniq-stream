"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle,
  ListMusic, Volume2, Volume1, VolumeX, FileText, Mic2, SlidersHorizontal,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import InteractiveVinyl from "./InteractiveVinyl";
import WaveformSeekBar from "./WaveformSeekBar";
import PlayerPopover from "./player/PlayerPopover";
import QueuePanel from "./player/QueuePanel";
import NotesPanel from "./player/NotesPanel";
import LyricsPanel from "./player/LyricsPanel";
import EditPanel from "./player/EditPanel";
import { gradientFromSeed } from "@/lib/gradient";
import { useAmbientPulse } from "@/lib/useAmbientPulse";

type PopoverKey = "queue" | "notes" | "lyrics" | "edit" | "volume" | null;

export default function PlayerBar() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle, next, previous,
    queue, queueIndex, shuffleOn, toggleShuffle,
    repeatMode, cycleRepeatMode,
  } = usePlayer();
  const [volume, setVolume] = useState(() => {
    if (typeof window === "undefined") return 1;
    try {
      const stored = window.localStorage.getItem("soniq:volume");
      return stored !== null ? Math.max(0, Math.min(1, Number(stored))) : 1;
    } catch { return 1; }
  });
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return window.localStorage.getItem("soniq:muted") === "true"; } catch { return false; }
  });
  const [brokenTrack, setBrokenTrack] = useState<{ id: string; title: string } | null>(null);
  // Single source of truth for which popover is open, instead of five
  // separate booleans — makes "only one open at a time" free (setting one
  // implicitly closes the others) rather than something each toggle had to
  // remember to do itself.
  const [openPopover, setOpenPopover] = useState<PopoverKey>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  useAmbientPulse(playButtonRef); // glow breathes with the ambient beat pulse

  const queueBtnRef = useRef<HTMLButtonElement>(null);
  const notesBtnRef = useRef<HTMLButtonElement>(null);
  const lyricsBtnRef = useRef<HTMLButtonElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const volumeBtnRef = useRef<HTMLButtonElement>(null);

  const toggleOpen = (key: Exclude<PopoverKey, null>) =>
    setOpenPopover((cur) => (cur === key ? null : key));

  useEffect(() => {
    setBrokenTrack(null);
  }, [current?.id]);

  // The sidebar's expand button (LyricsSidebar, on the main library pages)
  // dispatches this same event the mic icon used to open a fullscreen
  // LyricsView for — now it opens the same Lyrics popover the mic icon
  // opens, so there's still exactly one lyrics UI, not two.
  useEffect(() => {
    const onExpand = () => setOpenPopover("lyrics");
    window.addEventListener("soniq:expand-lyrics", onExpand);
    return () => window.removeEventListener("soniq:expand-lyrics", onExpand);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      if (!current) return;
      setBrokenTrack({ id: current.id, title: current.title });
    };
    audio.addEventListener("error", onError);
    return () => audio.removeEventListener("error", onError);
  }, [current]);

  const removeBrokenTrack = async () => {
    if (!brokenTrack) return;
    await fetch(`/api/tracks/${brokenTrack.id}`, { method: "DELETE" });
    setBrokenTrack(null);
    window.dispatchEvent(new CustomEvent("soniq:track-deleted"));
  };

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    try {
      window.localStorage.setItem("soniq:volume", String(volume));
      window.localStorage.setItem("soniq:muted", String(muted));
    } catch {}
  }, [volume, muted, current?.id]);

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const gradient = current ? gradientFromSeed(current.id) : null;
  const hasQueueContext = queue.length > 1;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[min(900px,calc(100vw-2rem))]">
      {brokenTrack && (
        <div className="mb-2 bg-error/15 border border-error/40 rounded-lg px-4 py-2 flex items-center justify-between gap-4">
          <span className="text-xs text-error">
            Couldn&apos;t load &ldquo;{brokenTrack.title}&rdquo; — the file may have been deleted from storage.
          </span>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={removeBrokenTrack} className="text-xs text-error underline hover:no-underline">
              Remove from library
            </button>
            <button onClick={() => setBrokenTrack(null)} className="text-xs text-secondary hover:text-primary">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Floating rounded pill, not edge-to-edge — bounded width with real
         padding so nothing (the volume slider especially) has a chance to
         clip past the container edge the way it did in the full-width bar. */}
      <div className="h-16 bg-elevated/95 backdrop-blur border border-border rounded-full flex items-center px-5 gap-4 shadow-xl relative">
        <div className="w-44 min-w-0 flex items-center gap-2.5 shrink-0">
          <InteractiveVinyl
            coverUrl={current?.albumCoverUrl}
            size={40}
            gradientFrom={gradient?.from}
            gradientTo={gradient?.to}
          />
          {current ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary truncate">{current.title}</p>
              <p className="text-[11px] text-secondary truncate">{current.artist || "Unknown"}</p>
            </div>
          ) : (
            <p className="text-xs text-tertiary">Nothing playing</p>
          )}
        </div>

        <div className="flex items-center gap-2.5 text-secondary shrink-0">
          <Shuffle
            size={14}
            strokeWidth={1.5}
            onClick={toggleShuffle}
            className={`cursor-pointer transition-colors ${shuffleOn ? "text-primary" : "hover:text-primary"}`}
          />
          <SkipBack
            size={16}
            strokeWidth={1.5}
            onClick={previous}
            className={`transition-colors ${hasQueueContext || currentTime > 3 ? "cursor-pointer hover:text-primary" : "opacity-30"}`}
          />
          <button
            ref={playButtonRef}
            onClick={toggle}
            disabled={!current}
            className="w-8 h-8 rounded-full bg-accent text-on-accent flex items-center justify-center disabled:opacity-30 hover:bg-accent-strong transition-colors shrink-0"
          >
            {isPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} className="ml-0.5" />}
          </button>
          <SkipForward
            size={16}
            strokeWidth={1.5}
            onClick={next}
            className={`transition-colors ${queueIndex < queue.length - 1 ? "cursor-pointer hover:text-primary" : "opacity-30"}`}
          />
          {repeatMode === "one" ? (
            <Repeat1
              size={14}
              strokeWidth={1.5}
              onClick={cycleRepeatMode}
              className="cursor-pointer text-primary transition-colors"
            />
          ) : (
            <Repeat
              size={14}
              strokeWidth={1.5}
              onClick={cycleRepeatMode}
              className={`cursor-pointer transition-colors ${repeatMode === "all" ? "text-primary" : "hover:text-primary"}`}
            />
          )}
        </div>

        {current ? (
          <WaveformSeekBar
            trackId={current.id}
            progress={currentTime}
            duration={duration}
            onSeek={(v) => {
              if (audioRef.current) audioRef.current.currentTime = v;
            }}
          />
        ) : (
          <div className="flex-1" />
        )}

        <span className="text-[11px] text-tertiary tabular-nums shrink-0 whitespace-nowrap">
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        {/* Left icon group: Queue, Notes, Lyrics */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="relative">
            <button
              ref={queueBtnRef}
              onClick={() => toggleOpen("queue")}
              className={`transition-colors ${openPopover === "queue" ? "text-primary" : "text-secondary hover:text-primary"}`}
              title="Queue"
            >
              <ListMusic size={14} strokeWidth={1.5} />
            </button>
            <AnimatePresence>
              {openPopover === "queue" && (
                <PlayerPopover onClose={() => setOpenPopover(null)} anchorRefs={[queueBtnRef]} width="w-80">
                  <QueuePanel />
                </PlayerPopover>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <button
              ref={notesBtnRef}
              onClick={() => toggleOpen("notes")}
              disabled={!current}
              className={`transition-colors disabled:opacity-30 ${openPopover === "notes" ? "text-primary" : "text-secondary hover:text-primary"}`}
              title="Notes"
            >
              <FileText size={14} strokeWidth={1.5} />
            </button>
            <AnimatePresence>
              {openPopover === "notes" && current && (
                <PlayerPopover onClose={() => setOpenPopover(null)} anchorRefs={[notesBtnRef]} width="w-80">
                  <NotesPanel track={current} />
                </PlayerPopover>
              )}
            </AnimatePresence>
          </div>

          <div className="relative">
            <button
              ref={lyricsBtnRef}
              onClick={() => toggleOpen("lyrics")}
              disabled={!current}
              className={`transition-colors disabled:opacity-30 ${openPopover === "lyrics" ? "text-primary" : "text-secondary hover:text-primary"}`}
              title="Lyrics"
            >
              <Mic2 size={14} strokeWidth={1.5} />
            </button>
            <AnimatePresence>
              {openPopover === "lyrics" && current && (
                <PlayerPopover onClose={() => setOpenPopover(null)} anchorRefs={[lyricsBtnRef]} width="w-96">
                  <LyricsPanel track={current} />
                </PlayerPopover>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Volume popover — same click-outside pattern as the icon group above.
           Previously this had its own local isolated useState toggle with no
           outside-click handling at all, so it only closed if you clicked its
           own button again. */}
        <div className="relative shrink-0">
          <button
            ref={volumeBtnRef}
            onClick={() => toggleOpen("volume")}
            className={`transition-colors ${openPopover === "volume" ? "text-primary" : "text-secondary hover:text-primary"}`}
          >
            <VolIcon size={14} strokeWidth={1.5} />
          </button>
          <AnimatePresence>
            {openPopover === "volume" && (
              <PlayerPopover onClose={() => setOpenPopover(null)} anchorRefs={[volumeBtnRef]} width="w-32">
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
                  className="w-full accent-[var(--accent)] cursor-pointer"
                />
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="text-[11px] text-tertiary hover:text-primary mt-1"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
              </PlayerPopover>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Edit — opens the Adjust/Stems/EQ tabbed sheet */}
        <div className="relative shrink-0">
          <button
            ref={editBtnRef}
            onClick={() => toggleOpen("edit")}
            disabled={!current}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-colors disabled:opacity-30 ${
              openPopover === "edit" ? "bg-accent text-on-accent" : "bg-canvas text-secondary hover:text-primary"
            }`}
          >
            <SlidersHorizontal size={13} strokeWidth={1.5} />
            Edit
          </button>
          <AnimatePresence>
            {openPopover === "edit" && current && (
              <PlayerPopover onClose={() => setOpenPopover(null)} anchorRefs={[editBtnRef]} width="w-[420px]" align="right">
                <EditPanel track={current} />
              </PlayerPopover>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
