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
  getFrequencyData: () => Uint8Array | null;
};

const PlayerContext = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Web Audio graph is created lazily, on first play — must happen inside a
  // user-gesture call stack (browser autoplay policy) or AudioContext starts
  // suspended and analyser data stays silent forever. Once created, the
  // <audio> element is permanently tied to this graph (browsers don't allow
  // disconnecting a MediaElementSourceNode), so this only ever runs once.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  const ensureAudioGraph = useCallback(() => {
    if (audioCtxRef.current || !audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      // Most likely cause: the audio file is cross-origin (R2) without CORS
      // headers permitting it, which taints the media element for Web Audio.
      // Playback still works fine either way — only the ambient visualizer
      // loses real reactivity and falls back to idle motion.
      console.warn("Audio analysis unavailable (playback unaffected):", e);
    }
  }, []);

  const play = useCallback((track: Track) => {
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (current?.id !== track.id) {
      setCurrent(track);
    }
    setIsPlaying(true);
  }, [current, ensureAudioGraph]);

  const toggle = useCallback(() => {
    if (!audioRef.current) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (audioRef.current.paused) {
      audioRef.current.play();
      setIsPlaying(true);
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [ensureAudioGraph]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
    return dataArrayRef.current;
  }, []);

  return (
    <PlayerContext.Provider value={{ current, isPlaying, audioRef, play, toggle, getFrequencyData }}>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
