"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, ListMusic, Volume2, Volume1, VolumeX, X, Mic2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import VinylArt from "./VinylArt";
import WaveformSeekBar from "./WaveformSeekBar";
import LyricsView from "./LyricsView";
import { gradientFromSeed } from "@/lib/gradient";

export default function PlayerBar() {
  const {
    current, isPlaying, currentTime, duration, audioRef, toggle, next, previous,
    queue, queueIndex, shuffleOn, toggleShuffle, jumpToQueueIndex,
  } = usePlayer();
  const [loopOn, setLoopOn] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brokenTrack, setBrokenTrack] = useState<{ id: string; title: string } | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const triedFallbackRef = useRef(false);
  const lastTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!audioRef.current || !current) return;
    // Previously this effect ran on ANY change to the `current` object
    // reference, even if it was the same track — e.g. after navigating to
    // an album page, which refetches track data and can produce a new
    // object for the same track. That reset audio.src and force-restarted
    // playback from 0, reading exactly as "opening an album stops
    // playback." Now it only resets when the actual track id changes.
    if (lastTrackIdRef.current === current.id) return;
    lastTrackIdRef.current = current.id;
    triedFallbackRef.current = false;
    setBrokenTrack(null);
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.src = current.fileUrl;
    audioRef.current.play().catch(() => {});
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onError = () => {
      if (!current) return;
      if (!triedFallbackRef.current) {
        triedFallbackRef.current = true;
        audio.removeAttribute("crossorigin");
        audio.src = current.fileUrl;
        audio.play().catch(() => {});
        return;
      }
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
              queue.map((t, i) => (
                <button
                  key={`${t.id}-${i}`}
                  onClick={() => jumpToQueueIndex(i)}
                  className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-surface transition-colors ${
                    i === queueIndex ? "bg-surface" : ""
                  }`}
                >
                  <span className="text-xs text-tertiary tabular-nums w-5 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${i === queueIndex ? "text-primary font-medium" : "text-primary"}`}>{t.title}</p>
                    <p className="text-xs text-secondary truncate">{t.artist || "Unknown"}</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating rounded pill, not edge-to-edge — bounded width with real
         padding so nothing (the volume slider especially) has a chance to
         clip past the container edge the way it did in the full-width bar. */}
      <div className="h-16 bg-elevated/95 backdrop-blur border border-border rounded-full flex items-center px-5 gap-4 shadow-xl">
        <div className="w-44 min-w-0 flex items-center gap-2.5 shrink-0">
          <VinylArt
            coverUrl={current?.albumCoverUrl}
            spinning={isPlaying}
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
            onClick={toggle}
            disabled={!current}
            className="w-8 h-8 rounded-full bg-accent text-canvas flex items-center justify-center disabled:opacity-30 hover:bg-accent-strong transition-colors shrink-0"
          >
            {isPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} className="ml-0.5" />}
          </button>
          <SkipForward
            size={16}
            strokeWidth={1.5}
            onClick={next}
            className={`transition-colors ${queueIndex < queue.length - 1 ? "cursor-pointer hover:text-primary" : "opacity-30"}`}
          />
          <Repeat
            size={14}
            strokeWidth={1.5}
            onClick={() => setLoopOn((v) => !v)}
            className={`cursor-pointer transition-colors ${loopOn ? "text-primary" : "hover:text-primary"}`}
          />
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
