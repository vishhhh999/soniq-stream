"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Repeat, Volume2, Volume1, VolumeX } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePlayer } from "./PlayerProvider";
import VinylArt from "./VinylArt";
import { gradientFromSeed } from "@/lib/gradient";

export default function PlayerBar() {
  const { current, isPlaying, audioRef, toggle } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopOn, setLoopOn] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const triedFallbackRef = useRef(false);

  useEffect(() => {
    if (!audioRef.current || !current) return;
    triedFallbackRef.current = false;
    // crossOrigin enables the ambient background's audio analyser, but if
    // the storage bucket doesn't send matching CORS headers, a media element
    // with crossOrigin set will refuse to play at all — not just fail the
    // analyser tap. Try with it first; if the load errors, retry once
    // without it so playback always works even when CORS isn't configured.
    audioRef.current.crossOrigin = "anonymous";
    audioRef.current.src = current.fileUrl;
    audioRef.current.play().catch(() => {});
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onError = () => {
      if (triedFallbackRef.current || !current) return;
      triedFallbackRef.current = true;
      audio.removeAttribute("crossorigin");
      audio.src = current.fileUrl;
      audio.play().catch(() => {});
    };
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);

    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, [current]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barRef.current || !audioRef.current || !duration) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  };

  const fmt = (s: number) => {
    if (!s || Number.isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const gradient = current ? gradientFromSeed(current.id) : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-elevated border-t border-border flex items-center px-6 gap-6 z-50">
      <audio ref={audioRef} loop={loopOn} />

      <div className="w-64 min-w-0 flex items-center gap-3">
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

      <div className="flex items-center gap-4 text-secondary">
        <SkipBack size={18} strokeWidth={1.5} className="cursor-pointer hover:text-primary transition-colors" />
        <button
          onClick={toggle}
          disabled={!current}
          className="w-9 h-9 rounded-full bg-accent text-canvas flex items-center justify-center disabled:opacity-30 hover:bg-accent-strong transition-colors"
        >
          {isPlaying ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} className="ml-0.5" />}
        </button>
        <SkipForward size={18} strokeWidth={1.5} className="cursor-pointer hover:text-primary transition-colors" />
        <Repeat
          size={16}
          strokeWidth={1.5}
          onClick={() => setLoopOn((v) => !v)}
          className={`cursor-pointer transition-colors ${loopOn ? "text-primary" : "hover:text-primary"}`}
        />
      </div>

      <span className="text-xs text-tertiary tabular-nums w-10">{fmt(progress)}</span>
      <div ref={barRef} onClick={seek} className="flex-1 h-1 bg-border rounded-full cursor-pointer relative group">
        <div
          className="h-full bg-accent rounded-full"
          style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
        />
      </div>
      <span className="text-xs text-tertiary tabular-nums w-10">{fmt(duration)}</span>

      <div className="flex items-center gap-2 w-28 shrink-0">
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
        <span className="text-xs text-tertiary border-l border-border pl-6 tabular-nums shrink-0 whitespace-nowrap">
          {current?.bpm ? `${Math.round(current.bpm)} BPM` : ""}
          {current?.bpm && current?.key ? " · " : ""}
          {current?.key || ""}
        </span>
      )}
    </div>
  );
}
