"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward, Repeat } from "lucide-react";
import { usePlayer } from "./PlayerProvider";

export default function PlayerBar() {
  const { current, isPlaying, audioRef, toggle } = usePlayer();
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopOn, setLoopOn] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!audioRef.current || !current) return;
    audioRef.current.src = current.fileUrl;
    audioRef.current.play();
  }, [current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

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

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-elevated border-t border-border flex items-center px-6 gap-6 z-50">
      <audio ref={audioRef} loop={loopOn} />

      <div className="w-56 min-w-0">
        {current ? (
          <>
            <p className="text-sm font-medium text-primary truncate">{current.title}</p>
            <p className="text-xs text-secondary truncate">{current.artist || "Unknown"}</p>
          </>
        ) : (
          <p className="text-sm text-tertiary">Nothing playing</p>
        )}
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
          className={`cursor-pointer transition-colors ${loopOn ? "text-accent" : "hover:text-primary"}`}
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

      {current?.bpm && (
        <span className="text-xs text-tertiary border-l border-border pl-6 tabular-nums">
          {Math.round(current.bpm)} BPM
        </span>
      )}
    </div>
  );
}
