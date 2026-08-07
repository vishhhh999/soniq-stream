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
  const triedFallbackRef = useRef(false);

  useEffect(() => {
    if (!audioRef.current || !current) return;
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
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {showLyrics && current && <LyricsView track={current} onClose={() => setShowLyrics(false)} />}

      {brokenTrack && (
        <div className="bg-error/15 border-t border-error/40 px-6 py-2 flex items-center justify-between gap-4">
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
            className="absolute bottom-full right-6 mb-2 w-80 max-h-96 overflow-y-auto bg-elevated border border-border rounded-lg shadow-lg"
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

      <div className="h-20 bg-elevated border-t border-border flex items-center px-6 gap-5">
        <audio ref={audioRef} loop={loopOn} />

        <div className="w-56 min-w-0 flex items-center gap-3 shrink-0">
          <VinylArt
            coverUrl={current?.albumCoverUrl}
            spinning={isPlaying}
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
                <p className="text-sm font-medium text-primary truncate">{current.title}</p>
                <p className="text-xs text-secondary truncate">{current.artist || "Unknown"}</p>
              </motion.div>
            ) : (
              <p className="text-sm text-tertiary">Nothing playing</p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3.5 text-secondary shrink-0">
          <Shuffle
            size={16}
            strokeWidth={1.5}
            onClick={toggleShuffle}
            className={`cursor-pointer transition-colors ${shuffleOn ? "text-primary" : "hover:text-primary"}`}
          />
          <SkipBack
            size={18}
            strokeWidth={1.5}
            onClick={previous}
            className={`transition-colors ${hasQueueContext || currentTime > 3 ? "cursor-pointer hover:text-primary" : "opacity-30"}`}
          />
          <button
            onClick={toggle}
            disabled={!current}
            className="w-9 h-9 rounded-full bg-accent text-canvas flex items-center justify-center disabled:opacity-30 hover:bg-accent-strong transition-colors"
          >
            {isPlaying ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} className="ml-0.5" />}
          </button>
          <SkipForward
            size={18}
            strokeWidth={1.5}
            onClick={next}
            className={`transition-colors ${queueIndex < queue.length - 1 ? "cursor-pointer hover:text-primary" : "opacity-30"}`}
          />
          <Repeat
            size={16}
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

        <span className="text-xs text-tertiary tabular-nums shrink-0 whitespace-nowrap">
          {fmt(currentTime)} / {fmt(duration)}
        </span>

        <button
          onClick={() => setShowLyrics((v) => !v)}
          disabled={!current}
          className={`shrink-0 transition-colors disabled:opacity-30 ${showLyrics ? "text-primary" : "text-secondary hover:text-primary"}`}
          title="Lyrics"
        >
          <Mic2 size={16} strokeWidth={1.5} />
        </button>

        <button
          onClick={() => setShowQueue((v) => !v)}
          className={`shrink-0 transition-colors ${showQueue ? "text-primary" : "text-secondary hover:text-primary"}`}
        >
          <ListMusic size={16} strokeWidth={1.5} />
        </button>

        <div className="flex items-center gap-2 w-24 shrink-0">
          <button onClick={() => setMuted((m) => !m)} className="text-secondary hover:text-primary transition-colors shrink-0">
            <VolIcon size={16} strokeWidth={1.5} />
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
            className="flex-1 accent-[var(--accent)] cursor-pointer"
          />
        </div>

        {(current?.bpm || current?.key) && (
          <span className="text-xs text-tertiary border-l border-border pl-5 tabular-nums shrink-0 whitespace-nowrap">
            {current?.bpm ? `${Math.round(current.bpm)} BPM` : ""}
            {current?.bpm && current?.key ? " · " : ""}
            {current?.key || ""}
          </span>
        )}
      </div>
    </div>
  );
}
