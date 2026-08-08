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
  crossfadeDuration: number;
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

function loadCrossfadeSettings() {
  try { const r = localStorage.getItem("soniq:crossfade"); if (r) return JSON.parse(r); } catch {}
  return { enabled: false, duration: 3 };
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);

  // Which element is "primary" — source of truth for UI (time, seek, etc.)
  const activeLetter = useRef<"A" | "B">("A");
  // Track which audio URL is loaded on each element — compared by ID, not URL
  // string, to avoid browser URL-resolution differences causing false mismatches.
  const loadedIdA = useRef<string | null>(null);
  const loadedIdB = useRef<string | null>(null);

  const getActive = (): HTMLAudioElement | null =>
    activeLetter.current === "A" ? audioRefA.current : audioRefB.current;
  const getInactive = (): HTMLAudioElement | null =>
    activeLetter.current === "A" ? audioRefB.current : audioRefA.current;
  const getLoadedId = () =>
    activeLetter.current === "A" ? loadedIdA.current : loadedIdB.current;
  const setLoadedId = (id: string) => {
    if (activeLetter.current === "A") loadedIdA.current = id;
    else loadedIdB.current = id;
  };
  const setInactiveLoadedId = (id: string) => {
    if (activeLetter.current === "A") loadedIdB.current = id;
    else loadedIdA.current = id;
  };

  // Stable computed ref — consumers do audioRef.current as normal.
  const audioRef = {
    get current(): HTMLAudioElement | null { return getActive(); },
  } as React.RefObject<HTMLAudioElement>;

  const [current, setCurrent] = useState<Track | null>(null);
  const currentRef = useRef<Track | null>(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

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

  // Web Audio graph — both elements route through their own GainNodes into
  // a shared analyser. Crossfade animates the gains.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const graphReady = useRef(false);

  // Crossfade bookkeeping.
  const crossfadingRef = useRef(false);
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crossfadeRafRef = useRef<number | null>(null); // only used when Web Audio unavailable
  // Brief hold-off after a crossfade completes so the sync effect doesn't
  // reload the just-swapped-in element.
  const holdOffRef = useRef(false);

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
    if (graphReady.current) return;
    const elA = audioRefA.current;
    const elB = audioRefB.current;
    if (!elA || !elB) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      const srcA = ctx.createMediaElementSource(elA);
      const gA = ctx.createGain(); gA.gain.value = 1; // A starts as active
      srcA.connect(gA); gA.connect(analyser);

      const srcB = ctx.createMediaElementSource(elB);
      const gB = ctx.createGain(); gB.gain.value = 0;
      srcB.connect(gB); gB.connect(analyser);

      analyser.connect(ctx.destination);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      audioCtxRef.current = ctx;
      gainARef.current = gA;
      gainBRef.current = gB;
      analyserRef.current = analyser;
      graphReady.current = true;
    } catch (e) {
      console.warn("Web Audio unavailable (playback unaffected):", e);
    }
  }, []);

  const getActiveGain = () => activeLetter.current === "A" ? gainARef.current : gainBRef.current;
  const getInactiveGain = () => activeLetter.current === "A" ? gainBRef.current : gainARef.current;

  // Cancel any in-flight crossfade cleanly.
  const cancelCrossfade = useCallback(() => {
    if (crossfadeTimerRef.current) { clearTimeout(crossfadeTimerRef.current); crossfadeTimerRef.current = null; }
    if (crossfadeRafRef.current) { cancelAnimationFrame(crossfadeRafRef.current); crossfadeRafRef.current = null; }

    // Stop the inactive element and clear its loaded-id so the next crossfade
    // knows it needs to load a fresh src.
    const inactive = getInactive();
    if (inactive) { inactive.pause(); inactive.volume = 1; }
    if (activeLetter.current === "A") loadedIdB.current = null;
    else loadedIdA.current = null;

    // Snap gains back: active=1, inactive=0.
    const ctx = audioCtxRef.current;
    const activeGain = getActiveGain();
    const inactiveGain = getInactiveGain();
    if (ctx && activeGain && inactiveGain) {
      const now = ctx.currentTime;
      activeGain.gain.cancelScheduledValues(now);
      activeGain.gain.setValueAtTime(1, now);
      inactiveGain.gain.cancelScheduledValues(now);
      inactiveGain.gain.setValueAtTime(0, now);
    }

    crossfadingRef.current = false;
  }, []);

  // Called by setTimeout after crossfadeDuration seconds.
  const completeCrossfade = useCallback((nextTrack: Track) => {
    if (!crossfadingRef.current) return; // was cancelled

    // Ensure final gains are clean before swap.
    const ctx = audioCtxRef.current;
    const outGain = getActiveGain();
    const inGain = getInactiveGain();
    if (ctx && outGain && inGain) {
      const now = ctx.currentTime;
      outGain.gain.cancelScheduledValues(now);
      outGain.gain.setValueAtTime(0, now);
      inGain.gain.cancelScheduledValues(now);
      inGain.gain.setValueAtTime(1, now);
    }

    // Stop the outgoing element, reset it for next use.
    const outgoing = getActive();
    if (outgoing) { outgoing.pause(); outgoing.volume = 1; }

    // Swap which element is primary.
    activeLetter.current = activeLetter.current === "A" ? "B" : "A";

    crossfadingRef.current = false;
    // Brief hold-off so the sync effect doesn't reload the now-active element.
    holdOffRef.current = true;
    setTimeout(() => { holdOffRef.current = false; }, 300);

    // Advance queue state.
    const nextIdx = queueIndexRef.current + 1;
    const q = queueRef.current;
    if (nextIdx < q.length) {
      setQueueIndex(nextIdx);
      setCurrent(nextTrack);
      setIsPlaying(true);
    } else if (repeatModeRef.current === "all") {
      setQueueIndex(0);
      setCurrent(q[0]);
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, []);

  const startCrossfade = useCallback((nextTrack: Track) => {
    if (crossfadingRef.current) return;
    const outgoing = getActive();
    const incoming = getInactive();
    if (!outgoing || !incoming) return;

    crossfadingRef.current = true;
    const fadeSec = crossfadeDurationRef.current;
    const fadeMs = fadeSec * 1000;

    // Load the next track onto the inactive element.
    incoming.src = nextTrack.fileUrl;
    incoming.volume = 1;
    incoming.play().catch(() => {});
    setInactiveLoadedId(nextTrack.id);

    const ctx = audioCtxRef.current;
    const outGain = getActiveGain();
    const inGain = getInactiveGain();

    if (ctx && outGain && inGain) {
      // Web Audio path — schedule linear ramps.
      // Use ctx.currentTime, NOT a float like 0, for cancelScheduledValues
      // so we only cancel future events, not mess with values already applied.
      const now = ctx.currentTime;
      outGain.gain.cancelScheduledValues(now);
      outGain.gain.setValueAtTime(outGain.gain.value, now);
      outGain.gain.linearRampToValueAtTime(0, now + fadeSec);
      inGain.gain.cancelScheduledValues(now);
      inGain.gain.setValueAtTime(0, now);
      inGain.gain.linearRampToValueAtTime(1, now + fadeSec);
      // setTimeout drives completion — single timing source, no RAF conflict.
      crossfadeTimerRef.current = setTimeout(() => completeCrossfade(nextTrack), fadeMs);
    } else {
      // Fallback: element.volume animation via RAF.
      const start = performance.now();
      const animate = () => {
        if (!crossfadingRef.current) return;
        const p = Math.min(1, (performance.now() - start) / fadeMs);
        outgoing.volume = 1 - p;
        incoming.volume = p;
        if (p < 1) {
          crossfadeRafRef.current = requestAnimationFrame(animate);
        } else {
          completeCrossfade(nextTrack);
        }
      };
      crossfadeRafRef.current = requestAnimationFrame(animate);
    }
  }, [completeCrossfade]);

  // Normal single-track play — clears queue context.
  const play = useCallback((track: Track) => {
    cancelCrossfade();
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    setQueue([track]);
    originalQueueRef.current = [track];
    setQueueIndex(0);
    setCurrent(track);
    setIsPlaying(true);
  }, [cancelCrossfade, ensureAudioGraph]);

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
  }, [shuffleOn, cancelCrossfade, ensureAudioGraph]);

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
      const idx = newOrder.findIndex((t) => t.id === currentRef.current!.id);
      if (idx !== -1) setQueueIndex(idx);
    }
  }, []);

  const next = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < queueRef.current.length) jumpToQueueIndex(nextIdx);
    else if (repeatModeRef.current === "all") jumpToQueueIndex(0);
  }, [jumpToQueueIndex]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  const previous = useCallback(() => {
    if (!queueRef.current.length) return;
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    if (queueIndexRef.current > 0) jumpToQueueIndex(queueIndexRef.current - 1);
  }, [jumpToQueueIndex]);

  const toggleShuffle = useCallback(() => {
    setShuffleOn((prev) => {
      const on = !prev;
      if (on) {
        const id = currentRef.current?.id;
        const rest = shuffleArray(originalQueueRef.current.filter((t) => t.id !== id));
        const q = currentRef.current ? [currentRef.current, ...rest] : rest;
        setQueue(q); setQueueIndex(0);
      } else {
        setQueue(originalQueueRef.current);
        const idx = originalQueueRef.current.findIndex((t) => t.id === currentRef.current?.id);
        setQueueIndex(Math.max(0, idx));
      }
      return on;
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = getActive();
    if (!audio) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (audio.paused) { audio.play(); setIsPlaying(true); }
    else { audio.pause(); setIsPlaying(false); }
  }, [ensureAudioGraph]);

  // Sync active audio element to current track + play state.
  // Skipped during crossfade (crossfade manages its own element lifecycle)
  // and during the brief hold-off after crossfade completes (to avoid
  // reloading the just-swapped-in element because of a stale ID comparison).
  useEffect(() => {
    if (crossfadingRef.current || holdOffRef.current) return;
    const audio = getActive();
    if (!audio || !current) return;

    if (getLoadedId() !== current.id) {
      // New track — load it.
      audio.src = current.fileUrl;
      audio.load();
      setLoadedId(current.id);
    }

    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, isPlaying]);

  // Repeat-one: use native audio.loop so 'ended' never fires.
  useEffect(() => {
    const audio = getActive();
    if (audio) audio.loop = repeatMode === "one";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode, current?.id]);

  // Events: ended, timeupdate, loadedmetadata, seeking — on both elements.
  useEffect(() => {
    const elA = audioRefA.current;
    const elB = audioRefB.current;
    if (!elA || !elB) return;

    const makeEnded = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;        // only active element drives state
      if (crossfadingRef.current) return;   // crossfade already handled the advance
      next();
    };

    const makeTimeUpdate = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      const t = el.currentTime;
      setCurrentTime(t);

      // Crossfade trigger — when close enough to the end.
      if (
        crossfadeEnabledRef.current &&
        !crossfadingRef.current &&
        !el.seeking &&
        repeatModeRef.current !== "one" &&
        el.duration > 0 &&
        Number.isFinite(el.duration)
      ) {
        const remaining = el.duration - t;
        const fadeSec = crossfadeDurationRef.current;
        if (remaining > 0 && remaining <= fadeSec) {
          const nextIdx = queueIndexRef.current + 1;
          const q = queueRef.current;
          const hasNext = nextIdx < q.length || repeatModeRef.current === "all";
          if (hasNext) {
            const nextTrack = q[repeatModeRef.current === "all" && nextIdx >= q.length ? 0 : nextIdx];
            if (nextTrack) startCrossfade(nextTrack);
          }
        }
      }
    };

    const makeMeta = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      const real = el.duration;
      setDuration(Number.isFinite(real) ? real : 0);
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

    // Seeking on the active element: cancel any in-progress crossfade so the
    // inactive element stops playing and gains reset. The timeupdate after the
    // seek will re-trigger a crossfade if the new position is close enough to the end.
    const makeSeeking = (el: HTMLAudioElement) => () => {
      if (el === getActive() && crossfadingRef.current) cancelCrossfade();
    };

    const endA = makeEnded(elA), endB = makeEnded(elB);
    const tuA = makeTimeUpdate(elA), tuB = makeTimeUpdate(elB);
    const metaA = makeMeta(elA), metaB = makeMeta(elB);
    const seekA = makeSeeking(elA), seekB = makeSeeking(elB);

    elA.addEventListener("ended", endA);
    elB.addEventListener("ended", endB);
    elA.addEventListener("timeupdate", tuA);
    elB.addEventListener("timeupdate", tuB);
    elA.addEventListener("loadedmetadata", metaA);
    elB.addEventListener("loadedmetadata", metaB);
    elA.addEventListener("seeking", seekA);
    elB.addEventListener("seeking", seekB);

    return () => {
      elA.removeEventListener("ended", endA);
      elB.removeEventListener("ended", endB);
      elA.removeEventListener("timeupdate", tuA);
      elB.removeEventListener("timeupdate", tuB);
      elA.removeEventListener("loadedmetadata", metaA);
      elB.removeEventListener("loadedmetadata", metaB);
      elA.removeEventListener("seeking", seekA);
      elB.removeEventListener("seeking", seekB);
    };
  }, [next, startCrossfade, cancelCrossfade]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
    return dataArrayRef.current;
  }, []);

  return (
    <PlayerContext.Provider value={{
      current, isPlaying, currentTime, duration, audioRef, queue, queueIndex, shuffleOn,
      play, playQueue, toggle, next, previous, toggleShuffle, jumpToQueueIndex, reorderQueue,
      repeatMode, cycleRepeatMode, getFrequencyData,
      crossfadeEnabled, crossfadeDuration, setCrossfade,
    }}>
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
