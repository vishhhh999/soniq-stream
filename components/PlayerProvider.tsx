"use client";

import { createContext, useContext, useRef, useState, useCallback } from "react";

export type Track = {
  id: string;
  title: string;
  artist?: string | null;
  fileUrl: string;
  durationSec?: number | null;
  bpm?: number | null;
};

type PlayerState = {
  current: Track | null;
  isPlaying: boolean;
  audioRef: React.RefObject<HTMLAudioElement>;
  play: (track: Track) => void;
  toggle: () => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const play = useCallback((track: Track) => {
    if (current?.id !== track.id) {
      setCurrent(track);
      // src swap happens via PlayerBar's effect watching `current`
    }
    setIsPlaying(true);
  }, [current]);

  const toggle = useCallback(() => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  return (
    <PlayerContext.Provider value={{ current, isPlaying, audioRef, play, toggle }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
