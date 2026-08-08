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
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // seconds
  setCrossfade: (enabled: boolean, duration: number) => void;
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

function loadCrossfadeSettings(): { enabled: boolean; duration: number } {
  try {
    const raw = localStorage.getItem("soniq:crossfade");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, duration: 3 };
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  // Two audio elements — A and B alternate roles as primary/crossfade.
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);
  // Which element is currently "primary" (source of truth for UI).
  const activeLetter = useRef<"A" | "B">("A");

  // Stable computed ref that always returns the active audio element.
  // Consumers use audioRef.current just like a normal ref.
  const audioRef = {
    get current(): HTMLAudioElement | null {
      return activeLetter.current === "A" ? audioRefA.current : audioRefB.current;
    },
  } as React.RefObject<HTMLAudioElement>;

  const getActive = () => activeLetter.current === "A" ? audioRefA.current : audioRefB.current;
  const getInactive = () => activeLetter.current === "A" ? audioRefB.current : audioRefA.current;

  const [current, setCurrent] = useState<Track | null>(null);
  const currentRef = useRef<Track | null>(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState<Track[]>([]);
  const queueRef = useRef<Track[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  const [queueIndex, setQueueIndex] = useState(0);
  const queueIndexRef = useRef(0);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  const originalQueueRef = useRef<Track[]>([]);

  // Web Audio graph — both sources go through separate GainNodes into a shared analyser.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const graphInitialized = useRef(false);

  // Crossfade state.
  const crossfadingRef = useRef(false);
  const crossfadeRafRef = useRef<number | null>(null);
  const crossfadeStartedAtRef = useRef<number>(0);
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => loadCrossfadeSettings().enabled);
  const [crossfadeDuration, setCrossfadeDuration] = useState(() => loadCrossfadeSettings().duration);
  const crossfadeEnabledRef = useRef(crossfadeEnabled);
  const crossfadeDurationRef = useRef(crossfadeDuration);
  useEffect(() => { crossfadeEnabledRef.current = crossfadeEnabled; }, [crossfadeEnabled]);
  useEffect(() => { crossfadeDurationRef.current = crossfadeDuration; }, [crossfadeDuration]);

  const setCrossfade = useCallback((enabled: boolean, dur: number) => {
    setCrossfadeEnabled(enabled);
    setCrossfadeDuration(dur);
    try { localStorage.setItem("soniq:crossfade", JSON.stringify({ enabled, duration: dur })); } catch {}
  }, []);

  const ensureAudioGraph = useCallback(() => {
    if (graphInitialized.current) return;
    const elA = audioRefA.current;
    const elB = audioRefB.current;
    if (!elA || !elB) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const srcA = ctx.createMediaElementSource(elA);
      const gA = ctx.createGain();
      gA.gain.value = activeLetter.current === "A" ? 1 : 0;
      srcA.connect(gA);
      gA.connect(analyser);

      const srcB = ctx.createMediaElementSource(elB);
      const gB = ctx.createGain();
      gB.gain.value = activeLetter.current === "B" ? 1 : 0;
      srcB.connect(gB);
      gB.connect(analyser);

      analyser.connect(ctx.destination);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      audioCtxRef.current = ctx;
      gainARef.current = gA;
      gainBRef.current = gB;
      analyserRef.current = analyser;
      graphInitialized.current = true;
    } catch (e) {
      console.warn("Audio analysis unavailable (playback unaffected):", e);
    }
  }, []);

  const getActiveGain = () => activeLetter.current === "A" ? gainARef.current : gainBRef.current;
  const getInactiveGain = () => activeLetter.current === "A" ? gainBRef.current : gainARef.current;

  const cancelCrossfade = useCallback(() => {
    if (crossfadeRafRef.current) cancelAnimationFrame(crossfadeRafRef.current);
    crossfadingRef.current = false;
    const inactive = getInactive();
    if (inactive) { inactive.pause(); inactive.volume = 1; inactive.src = ""; }
    // Reset gains.
    if (gainARef.current) gainARef.current.gain.value = activeLetter.current === "A" ? 1 : 0;
    if (gainBRef.current) gainBRef.current.gain.value = activeLetter.current === "B" ? 1 : 0;
  }, []);

  // Start a crossfade into nextTrack. Called from timeupdate when approaching end.
  const startCrossfade = useCallback((nextTrack: Track) => {
    if (crossfadingRef.current) return;
    const outgoing = getActive();
    const incoming = getInactive();
    if (!outgoing || !incoming) return;

    crossfadingRef.current = true;
    crossfadeStartedAtRef.current = performance.now();
    const fadeDurationMs = crossfadeDurationRef.current * 1000;

    incoming.src = nextTrack.fileUrl;
    incoming.volume = 1; // volume is handled by gain nodes if graph is set up
    incoming.play().catch(() => {});

    // If Web Audio graph is available, use gain nodes for smooth crossfade.
    // Otherwise fall back to element.volume.
    const useGain = !!audioCtxRef.current;
    const outGain = getActiveGain();
    const inGain = getInactiveGain();

    if (useGain && outGain && inGain && audioCtxRef.current) {
      const now = audioCtxRef.current.currentTime;
      outGain.gain.cancelScheduledValues(now);
      inGain.gain.cancelScheduledValues(now);
      outGain.gain.setValueAtTime(outGain.gain.value, now);
      outGain.gain.linearRampToValueAtTime(0, now + crossfadeDurationRef.current);
      inGain.gain.setValueAtTime(0, now);
      inGain.gain.linearRampToValueAtTime(1, now + crossfadeDurationRef.current);
    }

    const animate = () => {
      const elapsed = performance.now() - crossfadeStartedAtRef.current;
      const progress = Math.min(1, elapsed / fadeDurationMs);

      if (!useGain) {
        outgoing.volume = 1 - progress;
        incoming.volume = progress;
      }

      if (progress < 1) {
        crossfadeRafRef.current = requestAnimationFrame(animate);
      } else {
        // Crossfade done — swap active element.
        outgoing.pause();
        outgoing.volume = 1;
        if (useGain && outGain && inGain) {
          outGain.gain.cancelScheduledValues(0);
          inGain.gain.cancelScheduledValues(0);
          outGain.gain.value = 0;
          inGain.gain.value = 1;
        }
        activeLetter.current = activeLetter.current === "A" ? "B" : "A";
        crossfadingRef.current = false;

        const nextIndex = queueIndexRef.current + 1;
        const q = queueRef.current;
        if (nextIndex < q.length) {
          setQueueIndex(nextIndex);
          setCurrent(nextTrack);
          setIsPlaying(true);
        } else if (repeatModeRef.current === "all") {
          setQueueIndex(0);
          setCurrent(q[0]);
          setIsPlaying(true);
        } else {
          setIsPlaying(false);
        }
      }
    };

    crossfadeRafRef.current = requestAnimationFrame(animate);
  }, []);

  const play = useCallback((track: Track) => {
    cancelCrossfade();
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    setQueue([track]);
    originalQueueRef.current = [track];
    setQueueIndex(0);
    if (currentRef.current?.id !== track.id) setCurrent(track);
    setIsPlaying(true);
  }, [ensureAudioGraph, cancelCrossfade]);

  const playQueue = useCallback((tracks: Track[], startIndex: number) => {
    cancelCrossfade();
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    originalQueueRef.current = tracks;
    const ordered = shuffleOn ? shuffleArray(tracks) : tracks;
    setQueue(ordered);
    const idx = shuffleOn ? ordered.findIndex((t) => t.id === tracks[startIndex]?.id) : startIndex;
    setQueueIndex(Math.max(0, idx));
    setCurrent(tracks[startIndex]);
    setIsPlaying(true);
  }, [shuffleOn, ensureAudioGraph, cancelCrossfade]);

  const jumpToQueueIndex = useCallback((i: number) => {
    if (i < 0 || i >= queueRef.current.length) return;
    cancelCrossfade();
    setQueueIndex(i);
    setCurrent(queueRef.current[i]);
    setIsPlaying(true);
  }, [cancelCrossfade]);

  const reorderQueue = useCallback((newOrder: Track[]) => {
    setQueue(newOrder);
    if (currentRef.current) {
      const newIndex = newOrder.findIndex((t) => t.id === currentRef.current!.id);
      if (newIndex !== -1) setQueueIndex(newIndex);
    }
  }, []);

  const next = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const nextIndex = queueIndexRef.current + 1;
    if (nextIndex < queueRef.current.length) {
      jumpToQueueIndex(nextIndex);
    } else if (repeatModeRef.current === "all") {
      jumpToQueueIndex(0);
    }
  }, [jumpToQueueIndex]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  const previous = useCallback(() => {
    if (queueRef.current.length === 0) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    const prevIndex = queueIndexRef.current - 1;
    if (prevIndex >= 0) jumpToQueueIndex(prevIndex);
  }, [jumpToQueueIndex]);

  const toggleShuffle = useCallback(() => {
    setShuffleOn((prev) => {
      const turningOn = !prev;
      if (turningOn) {
        const currentId = currentRef.current?.id;
        const rest = originalQueueRef.current.filter((t) => t.id !== currentId);
        const newQueue = currentRef.current ? [currentRef.current, ...shuffleArray(rest)] : shuffleArray(rest);
        setQueue(newQueue);
        setQueueIndex(0);
      } else {
        setQueue(originalQueueRef.current);
        const idx = originalQueueRef.current.findIndex((t) => t.id === currentRef.current?.id);
        setQueueIndex(Math.max(0, idx));
      }
      return turningOn;
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (audio.paused) { audio.play(); setIsPlaying(true); }
    else { audio.pause(); setIsPlaying(false); }
  }, [ensureAudioGraph]);

  // Auto-advance on track end.
  useEffect(() => {
    const elA = audioRefA.current;
    const elB = audioRefB.current;
    if (!elA || !elB) return;

    const makeEnded = (el: HTMLAudioElement) => () => {
      // Skip if this element isn't the active one (e.g. outgoing during crossfade).
      if (el !== getActive()) return;
      // Skip if a crossfade already handled the track advance.
      if (crossfadingRef.current) return;
      next();
    };

    const onEndedA = makeEnded(elA);
    const onEndedB = makeEnded(elB);
    elA.addEventListener("ended", onEndedA);
    elB.addEventListener("ended", onEndedB);
    return () => {
      elA.removeEventListener("ended", onEndedA);
      elB.removeEventListener("ended", onEndedB);
    };
  }, [next]);

  // Time tracking — only active element updates the shared state.
  useEffect(() => {
    const elA = audioRefA.current;
    const elB = audioRefB.current;
    if (!elA || !elB) return;

    const makeOnTime = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      setCurrentTime(el.currentTime);

      // Crossfade trigger — check if we should start fading to the next track.
      if (
        crossfadeEnabledRef.current &&
        !crossfadingRef.current &&
        repeatModeRef.current !== "one" &&
        el.duration > 0
      ) {
        const remaining = el.duration - el.currentTime;
        const nextIdx = queueIndexRef.current + 1;
        const q = queueRef.current;
        const hasNext = nextIdx < q.length || repeatModeRef.current === "all";
        if (remaining <= crossfadeDurationRef.current && remaining > 0 && hasNext) {
          const nextTrack = q[repeatModeRef.current === "all" && nextIdx >= q.length ? 0 : nextIdx];
          if (nextTrack) startCrossfade(nextTrack);
        }
      }
    };

    const makeOnMeta = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      const real = el.duration || 0;
      setDuration(real);
      const track = currentRef.current;
      if (!track || !real || !Number.isFinite(real)) return;
      if (Math.abs((track.durationSec ?? 0) - real) > 0.5) {
        fetch(`/api/tracks/${track.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec: real }),
        }).catch(() => {});
      }
    };

    const onTimeA = makeOnTime(elA);
    const onTimeB = makeOnTime(elB);
    const onMetaA = makeOnMeta(elA);
    const onMetaB = makeOnMeta(elB);

    elA.addEventListener("timeupdate", onTimeA);
    elA.addEventListener("loadedmetadata", onMetaA);
    elB.addEventListener("timeupdate", onTimeB);
    elB.addEventListener("loadedmetadata", onMetaB);

    return () => {
      elA.removeEventListener("timeupdate", onTimeA);
      elA.removeEventListener("loadedmetadata", onMetaA);
      elB.removeEventListener("timeupdate", onTimeB);
      elB.removeEventListener("loadedmetadata", onMetaB);
    };
  }, [startCrossfade]);

  // Sync src/play/pause to the active audio element when current/isPlaying changes.
  useEffect(() => {
    const audio = getActive();
    if (!audio || !current) return;
    if (audio.src !== current.fileUrl) {
      audio.src = current.fileUrl;
      audio.load();
    }
    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [current?.id, isPlaying]);

  // repeat one: native loop on active element.
  useEffect(() => {
    const audio = getActive();
    if (audio) audio.loop = repeatMode === "one";
  }, [repeatMode, current?.id]);

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
        crossfadeEnabled, crossfadeDuration, setCrossfade,
      }}
    >
      <audio ref={audioRefA} className="hidden" crossOrigin="anonymous" />
      <audio ref={audioRefB} className="hidden" crossOrigin="anonymous" />
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};
