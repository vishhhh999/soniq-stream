"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, ListMusic, Volume2, Volume1, VolumeX, X, Mic2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { usePlayer } from "./PlayerProvider";
import InteractiveVinyl from "./InteractiveVinyl";
import WaveformSeekBar from "./WaveformSeekBar";
import LyricsView from "./LyricsView";
import SortableQueueItem from "./SortableQueueItem";
import { gradientFromSeed } from "@/lib/gradient";
import { useAmbientPulse } from "@/lib/useAmbientPulse";

export default function PlayerBar() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle, next, previous,
    queue, queueIndex, shuffleOn, toggleShuffle, jumpToQueueIndex, reorderQueue,
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
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const lastTrackIdRef = useRef<string | null>(null);
  const queueSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const playButtonRef = useRef<HTMLButtonElement>(null);
  useAmbientPulse(playButtonRef); // glow breathes with the ambient beat pulse

  const handleQueueDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = queue.map((t, i) => `${t.id}-${i}`);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderQueue(arrayMove(queue, oldIndex, newIndex));
  };

  // NOTE: audio loading/playing is fully owned by PlayerProvider now (play(),
  // playQueue(), jumpToQueueIndex(), and crossfade completion all load+play
  // directly on the audio element at the moment of the action). A manual
  // "load on current change" effect used to live here — it duplicated that
  // work and, worse, fired again after crossfade swapped the active element,
  // reloading the just-crossfaded track from 0:00 and causing the replay/
  // pause-gap bug. Do not reintroduce it.
  useEffect(() => {
    setBrokenTrack(null);
  }, [current?.id]);

  // The sidebar's expand button (LyricsSidebar, on the main library pages)
  // dispatches this same event so both it and the mic button open the one
  // fullscreen view — no separate code path for "expand from sidebar."
  useEffect(() => {
    const onExpand = () => setShowLyrics(true);
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

  // Re-applies whenever volume/muted change, AND whenever the current track
  // changes — a crossfade swaps in the OTHER underlying <audio> element,
  // which PlayerProvider always resets to .volume = 1 for the ramp/fallback
  // math (see startCrossfade/completeCrossfade). Without `current?.id` here,
  // the volume slider silently stopped applying after the first crossfade —
  // audio would jump back to 100% and stay there until the user touched the
  // slider again.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
    // Persisted so volume/mute survive a reload — previously these reset
    // to 100%/unmuted every time, unlike theme/crossfade/haptics which
    // all correctly persist.
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
      {showLyrics && current && <LyricsView track={current} onClose={() => setShowLyrics(false)} />}

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

      <AnimatePresence>
        {showQueue && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="absolute bottom-full right-0 mb-2 w-80 max-h-96 overflow-y-auto bg-elevated border border-border rounded-lg shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-elevated">
              <span className="text-xs uppercase tracking-wide text-tertiary">Queue</span>
              <button onClick={() => setShowQueue(false)} className="text-tertiary hover:text-primary">
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
            {queue.length === 0 ? (
              <p className="text-sm text-tertiary px-4 py-6 text-center">Nothing queued.</p>
            ) : (
              <DndContext sensors={queueSensors} collisionDetection={closestCenter} onDragEnd={handleQueueDragEnd}>
                <SortableContext items={queue.map((t, i) => `${t.id}-${i}`)} strategy={verticalListSortingStrategy}>
                  {queue.map((t, i) => (
                    <SortableQueueItem key={`${t.id}-${i}`} track={t} index={i} isCurrent={i === queueIndex} onSelect={() => jumpToQueueIndex(i)} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating rounded pill, not edge-to-edge — bounded width with real
         padding so nothing (the volume slider especially) has a chance to
         clip past the container edge the way it did in the full-width bar. */}
      <div className="h-16 bg-elevated/95 backdrop-blur border border-border rounded-full flex items-center px-5 gap-4 shadow-xl">
        <div className="w-44 min-w-0 flex items-center gap-2.5 shrink-0">
          <InteractiveVinyl
            coverUrl={current?.albumCoverUrl}
            size={40}
            gradientFrom={gradient?.from}
            gradientTo={gradient?.to}
          />
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                <p className="text-xs font-medium text-primary truncate">{current.title}</p>
                <p className="text-[11px] text-secondary truncate">{current.artist || "Unknown"}</p>
              </motion.div>
            ) : (
              <p className="text-xs text-tertiary">Nothing playing</p>
            )}
          </AnimatePresence>
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

        <button
          onClick={() => setShowLyrics((v) => !v)}
          disabled={!current}
          className={`shrink-0 transition-colors disabled:opacity-30 ${showLyrics ? "text-primary" : "text-secondary hover:text-primary"}`}
          title="Lyrics"
        >
          <Mic2 size={14} strokeWidth={1.5} />
        </button>

        <button
          onClick={() => setShowQueue((v) => !v)}
          className={`shrink-0 transition-colors ${showQueue ? "text-primary" : "text-secondary hover:text-primary"}`}
        >
          <ListMusic size={14} strokeWidth={1.5} />
        </button>

        {/* Volume as a popover, not an always-visible inline slider — the
           inline slider had no reliably bounded width and would clip past
           the (previously edge-to-edge) bar's edge. A popover has its own
           contained box, so it can never spill outside the player. */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowVolume((v) => !v)}
            className="text-secondary hover:text-primary transition-colors"
          >
            <VolIcon size={14} strokeWidth={1.5} />
          </button>
          <AnimatePresence>
            {showVolume && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="absolute bottom-full right-0 mb-2 bg-elevated border border-border rounded-lg shadow-xl p-3 w-32"
              >
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
