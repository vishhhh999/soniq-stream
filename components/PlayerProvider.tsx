"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";

export type Track = {
  id: string;
  title: string;
  artist?: string | null;
  fileUrl: string;
  durationSec?: number | null;
  bpm?: number | null;
  key?: string | null;
  albumId?: string | null;
  albumCoverUrl?: string | null;
};

type PlayerState = {
  current: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  audioRef: React.RefObject<HTMLAudioElement>;
  queue: Track[];
  queueIndex: number;
  shuffleOn: boolean;
  play: (track: Track) => void;
  playQueue: (tracks: Track[], startIndex: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  toggleShuffle: () => void;
  jumpToQueueIndex: (i: number) => void;
  reorderQueue: (newOrder: Track[]) => void;
  repeatMode: "off" | "all" | "one";
  cycleRepeatMode: () => void;
  getFrequencyData: () => Uint8Array | null;
};

const PlayerContext = createContext<PlayerState | null>(null);

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  // Mirrors `current` for use inside stable-listener effects below, so
  // those effects don't need `current` in their dependency array (which
  // would mean detaching/reattaching the audio element's listeners on
  // every single track change).
  const currentRef = useRef<Track | null>(null);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const originalQueueRef = useRef<Track[]>([]); // unshuffled order, so toggling shuffle off restores it

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
      console.warn("Audio analysis unavailable (playback unaffected):", e);
    }
  }, []);

  // Single-track play — no queue context (e.g. clicking a track outside any
  // list). Clears any existing queue so skip buttons correctly do nothing.
  const play = useCallback((track: Track) => {
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    setQueue([track]);
    originalQueueRef.current = [track];
    setQueueIndex(0);
    if (current?.id !== track.id) setCurrent(track);
    setIsPlaying(true);
  }, [current, ensureAudioGraph]);

  // Play from a list with context (album view, library list) — skip
  // forward/back and auto-advance-on-end navigate within this list.
  const playQueue = useCallback((tracks: Track[], startIndex: number) => {
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    originalQueueRef.current = tracks;
    const ordered = shuffleOn ? shuffleArray(tracks) : tracks;
    setQueue(ordered);
    const idx = shuffleOn ? ordered.findIndex((t) => t.id === tracks[startIndex]?.id) : startIndex;
    setQueueIndex(Math.max(0, idx));
    setCurrent(tracks[startIndex]);
    setIsPlaying(true);
  }, [shuffleOn, ensureAudioGraph]);

  const jumpToQueueIndex = useCallback((i: number) => {
    if (i < 0 || i >= queue.length) return;
    setQueueIndex(i);
    setCurrent(queue[i]);
    setIsPlaying(true);
  }, [queue]);

  // Drag-reorder within the queue — a runtime/session concept, doesn't
  // persist to the database like album track order does. The currently
  // playing track's index is re-derived by id after reordering, so
  // skip-forward/back stay correct relative to its new position.
  const reorderQueue = useCallback((newOrder: Track[]) => {
    setQueue(newOrder);
    if (current) {
      const newIndex = newOrder.findIndex((t) => t.id === current.id);
      if (newIndex !== -1) setQueueIndex(newIndex);
    }
  }, [current]);

  const next = useCallback(() => {
    if (queue.length === 0) return;
    const nextIndex = queueIndex + 1;
    if (nextIndex < queue.length) {
      jumpToQueueIndex(nextIndex);
    } else if (repeatMode === "all") {
      // End of queue with "repeat all" on — loop back to the start,
      // unlike the plain skip-forward button, which stays disabled at
      // the boundary rather than surprising you with a jump to track 1.
      jumpToQueueIndex(0);
    }
    // "off" and "one": stop at the end. "one" never actually reaches this
    // path in practice — native `audio.loop` (set below) handles repeating
    // the current track directly and the 'ended' event that triggers
    // next() never fires while loop=true.
  }, [queue, queueIndex, jumpToQueueIndex, repeatMode]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  const previous = useCallback(() => {
    if (queue.length === 0) return;
    // Standard behavior: if more than ~3s into the track, restart it instead
    // of going to the previous track — matches every mainstream player.
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prevIndex = queueIndex - 1;
    if (prevIndex >= 0) jumpToQueueIndex(prevIndex);
  }, [queue, queueIndex, jumpToQueueIndex]);

  const toggleShuffle = useCallback(() => {
    setShuffleOn((prev) => {
      const turningOn = !prev;
      if (turningOn) {
        const currentId = current?.id;
        const rest = originalQueueRef.current.filter((t) => t.id !== currentId);
        const shuffledRest = shuffleArray(rest);
        const newQueue = current ? [current, ...shuffledRest] : shuffledRest;
        setQueue(newQueue);
        setQueueIndex(0);
      } else {
        setQueue(originalQueueRef.current);
        const idx = originalQueueRef.current.findIndex((t) => t.id === current?.id);
        setQueueIndex(Math.max(0, idx));
      }
      return turningOn;
    });
  }, [current]);

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

  // Auto-advance when a track ends, if there's a next one in the queue.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => next();
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [next]);

  // Centralized time tracking — was previously duplicated in PlayerBar's own
  // local state, which meant no other component (like a lyrics view) could
  // read playback position without re-wiring its own listener.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      const real = audio.duration || 0;
      setDuration(real);
      const track = currentRef.current;
      if (!track || !real || !Number.isFinite(real)) return;
      const stored = track.durationSec ?? 0;
      // Only patch when meaningfully different — avoids a write on every
      // single play for tracks that already have a correct stored value,
      // and avoids false triggers from floating-point rounding.
      if (Math.abs(stored - real) > 0.5) {
        fetch(`/api/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec: real }),
        }).catch(() => {
          // best-effort — the player itself already has the right value
          // for this session regardless of whether the save succeeds
        });
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  // Native audio.loop handles "repeat one" directly — the browser loops
  // the current track without ever firing 'ended', so next()'s own logic
  // never has to think about the "one" case at all.
  useEffect(() => {
    if (audioRef.current) audioRef.current.loop = repeatMode === "one";
  }, [repeatMode]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
    return dataArrayRef.current;
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        current, isPlaying, currentTime, duration, audioRef, queue, queueIndex, shuffleOn,
        play, playQueue, toggle, next, previous, toggleShuffle, jumpToQueueIndex, reorderQueue,
        repeatMode, cycleRepeatMode,
        getFrequencyData,
      }}
    >
      {/* Always rendered here, not inside PlayerBar — PlayerBar is
         auth-gated and mounts asynchronously after the session check
         resolves, which meant this ref didn't exist yet when the
         time-tracking effect above first ran, and (with an empty
         dependency array) never got a second chance to attach. */}
      <audio
  ref={audioRef}
  className="hidden"
  crossOrigin="anonymous"
/>
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
