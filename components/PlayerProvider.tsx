"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";

export type Track = {
  id: string; title: string; artist?: string | null; fileUrl: string;
  durationSec?: number | null; bpm?: number | null; key?: string | null;
  albumId?: string | null; albumCoverUrl?: string | null;
};

type PlayerState = {
  current: Track | null; isPlaying: boolean; currentTime: number; duration: number;
  audioRef: React.RefObject<HTMLAudioElement>; queue: Track[]; queueIndex: number; shuffleOn: boolean;
  play: (track: Track) => void; playQueue: (tracks: Track[], startIndex: number) => void;
  toggle: () => void; next: () => void; previous: () => void; toggleShuffle: () => void;
  jumpToQueueIndex: (i: number) => void; reorderQueue: (newOrder: Track[]) => void;
  repeatMode: "off" | "all" | "one"; cycleRepeatMode: () => void;
  getFrequencyData: () => Uint8Array | null;
  crossfadeEnabled: boolean; crossfadeDuration: number; setCrossfade: (enabled: boolean, duration: number) => void;
};

const PlayerContext = createContext<PlayerState | null>(null);

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function loadXfadeSettings() {
  try { const r = localStorage.getItem("soniq:crossfade"); if (r) return JSON.parse(r); } catch {}
  return { enabled: false, duration: 3 };
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);
  // Which element is "primary" — the one the UI reads from.
  const activeLetter = useRef<"A" | "B">("A");

  const getActive = (): HTMLAudioElement | null =>
    activeLetter.current === "A" ? audioRefA.current : audioRefB.current;
  const getInactive = (): HTMLAudioElement | null =>
    activeLetter.current === "A" ? audioRefB.current : audioRefA.current;

  // Stable computed ref so consumers can do audioRef.current as normal.
  const audioRef = { get current() { return getActive(); } } as React.RefObject<HTMLAudioElement>;

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

  // Web Audio — two gain nodes, one per element, both into a shared analyser.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const graphReady = useRef(false);

  // Crossfade state.
  const crossfadingRef = useRef(false);
  const xfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xfadeRafRef = useRef<number | null>(null);

  const [crossfadeEnabled, setCFEnabled] = useState(() => loadXfadeSettings().enabled);
  const [crossfadeDuration, setCFDuration] = useState(() => loadXfadeSettings().duration);
  const xfadeEnabledRef = useRef(crossfadeEnabled);
  const xfadeDurRef = useRef(crossfadeDuration);
  useEffect(() => { xfadeEnabledRef.current = crossfadeEnabled; }, [crossfadeEnabled]);
  useEffect(() => { xfadeDurRef.current = crossfadeDuration; }, [crossfadeDuration]);

  const setCrossfade = useCallback((enabled: boolean, dur: number) => {
    setCFEnabled(enabled); setCFDuration(dur);
    try { localStorage.setItem("soniq:crossfade", JSON.stringify({ enabled, duration: dur })); } catch {}
  }, []);

  const ensureAudioGraph = useCallback(() => {
    if (graphReady.current) return;
    const elA = audioRefA.current; const elB = audioRefB.current;
    if (!elA || !elB) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser(); analyser.fftSize = 256;
      const srcA = ctx.createMediaElementSource(elA);
      const gA = ctx.createGain(); gA.gain.value = 1;
      srcA.connect(gA); gA.connect(analyser);
      const srcB = ctx.createMediaElementSource(elB);
      const gB = ctx.createGain(); gB.gain.value = 0;
      srcB.connect(gB); gB.connect(analyser);
      analyser.connect(ctx.destination);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      audioCtxRef.current = ctx; gainARef.current = gA; gainBRef.current = gB;
      analyserRef.current = analyser; graphReady.current = true;
    } catch (e) { console.warn("Web Audio unavailable:", e); }
  }, []);

  const getActiveGain = () => activeLetter.current === "A" ? gainARef.current : gainBRef.current;
  const getInactiveGain = () => activeLetter.current === "A" ? gainBRef.current : gainARef.current;

  // Load a track directly onto the active audio element and start playing.
  // This is the canonical way to start a track — no useEffect sync needed.
  const loadAndPlay = useCallback((track: Track) => {
    const audio = getActive();
    if (!audio) return;
    audio.src = track.fileUrl;
    audio.load();
    audio.play().catch(() => {});
    // Ensure gain is at full for the active element.
    const activeGain = getActiveGain();
    if (activeGain) activeGain.gain.value = 1;
    const inactiveGain = getInactiveGain();
    if (inactiveGain) inactiveGain.gain.value = 0;
  }, []);

  const cancelCrossfade = useCallback(() => {
    if (xfadeTimerRef.current) { clearTimeout(xfadeTimerRef.current); xfadeTimerRef.current = null; }
    if (xfadeRafRef.current) { cancelAnimationFrame(xfadeRafRef.current); xfadeRafRef.current = null; }
    const inactive = getInactive();
    if (inactive) { inactive.pause(); inactive.src = ""; inactive.volume = 1; }
    const ctx = audioCtxRef.current;
    const ag = getActiveGain(); const ig = getInactiveGain();
    if (ctx && ag && ig) {
      const now = ctx.currentTime;
      ag.gain.cancelScheduledValues(now); ag.gain.setValueAtTime(1, now);
      ig.gain.cancelScheduledValues(now); ig.gain.setValueAtTime(0, now);
    }
    crossfadingRef.current = false;
  }, []);

  // Called by setTimeout after crossfadeDuration seconds.
  // The INCOMING element has been playing undisturbed for the full fade duration.
  // We just swap state — DO NOT reload the element, it's already at the right position.
  const completeCrossfade = useCallback((nextTrack: Track) => {
    if (!crossfadingRef.current) return;

    // Snap gains clean.
    const ctx = audioCtxRef.current;
    const outGain = getActiveGain(); const inGain = getInactiveGain();
    if (ctx && outGain && inGain) {
      const now = ctx.currentTime;
      outGain.gain.cancelScheduledValues(now); outGain.gain.setValueAtTime(0, now);
      inGain.gain.cancelScheduledValues(now); inGain.gain.setValueAtTime(1, now);
    }

    // Silence + stop the outgoing element.
    const outgoing = getActive();
    if (outgoing) { outgoing.pause(); outgoing.volume = 1; }

    // Swap. Incoming is now primary and continues playing from its current time.
    activeLetter.current = activeLetter.current === "A" ? "B" : "A";
    crossfadingRef.current = false;

    // Update UI state only. Audio is not touched — incoming element is already
    // playing the next track at the correct position.
    const nextIdx = queueIndexRef.current + 1;
    const q = queueRef.current;
    if (nextIdx < q.length) {
      setQueueIndex(nextIdx); setCurrent(nextTrack); setIsPlaying(true);
    } else if (repeatModeRef.current === "all") {
      setQueueIndex(0); setCurrent(q[0]); setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, []);

  const startCrossfade = useCallback((nextTrack: Track) => {
    if (crossfadingRef.current) return;
    const outgoing = getActive(); const incoming = getInactive();
    if (!outgoing || !incoming) return;

    crossfadingRef.current = true;
    const fadeSec = xfadeDurRef.current;
    const fadeMs = fadeSec * 1000;

    // Start the incoming element from the beginning of the next track.
    incoming.src = nextTrack.fileUrl;
    incoming.volume = 1;
    incoming.play().catch(() => {});

    const ctx = audioCtxRef.current;
    const outGain = getActiveGain(); const inGain = getInactiveGain();

    if (ctx && outGain && inGain) {
      // Web Audio path — linear ramps for smooth fade.
      const now = ctx.currentTime;
      outGain.gain.cancelScheduledValues(now);
      outGain.gain.setValueAtTime(outGain.gain.value, now);
      outGain.gain.linearRampToValueAtTime(0, now + fadeSec);
      inGain.gain.cancelScheduledValues(now);
      inGain.gain.setValueAtTime(0, now);
      inGain.gain.linearRampToValueAtTime(1, now + fadeSec);
      // setTimeout is the sole timing driver — no RAF conflict with the ramps.
      xfadeTimerRef.current = setTimeout(() => completeCrossfade(nextTrack), fadeMs);
    } else {
      // Fallback: animate element.volume via RAF.
      const start = performance.now();
      const animate = () => {
        if (!crossfadingRef.current) return;
        const p = Math.min(1, (performance.now() - start) / fadeMs);
        outgoing.volume = 1 - p; incoming.volume = p;
        if (p < 1) xfadeRafRef.current = requestAnimationFrame(animate);
        else completeCrossfade(nextTrack);
      };
      xfadeRafRef.current = requestAnimationFrame(animate);
    }
  }, [completeCrossfade]);

  // ── Public actions ──────────────────────────────────────────────────────
  // Each action directly controls the audio element. There is NO useEffect
  // that syncs current/isPlaying to audio — that pattern was the root cause
  // of track B restarting from 0:00 after a crossfade, because the sync
  // effect couldn't reliably distinguish "crossfade just loaded this track"
  // from "need to reload this track from scratch."

  const play = useCallback((track: Track) => {
    cancelCrossfade(); ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    loadAndPlay(track);
    setQueue([track]); originalQueueRef.current = [track]; setQueueIndex(0);
    setCurrent(track); setIsPlaying(true);
  }, [cancelCrossfade, ensureAudioGraph, loadAndPlay]);

  const playQueue = useCallback((tracks: Track[], startIndex: number) => {
    cancelCrossfade(); ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    originalQueueRef.current = tracks;
    const ordered = shuffleOn ? shuffleArray(tracks) : tracks;
    const idx = shuffleOn ? ordered.findIndex((t) => t.id === tracks[startIndex]?.id) : startIndex;
    const finalIdx = Math.max(0, idx);
    setQueue(ordered); setQueueIndex(finalIdx);
    const track = ordered[finalIdx] ?? tracks[startIndex];
    loadAndPlay(track); setCurrent(track); setIsPlaying(true);
  }, [shuffleOn, cancelCrossfade, ensureAudioGraph, loadAndPlay]);

  const jumpToQueueIndex = useCallback((i: number) => {
    const q = queueRef.current;
    if (i < 0 || i >= q.length) return;
    cancelCrossfade(); ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    loadAndPlay(q[i]); setQueueIndex(i); setCurrent(q[i]); setIsPlaying(true);
  }, [cancelCrossfade, ensureAudioGraph, loadAndPlay]);

  const reorderQueue = useCallback((newOrder: Track[]) => {
    setQueue(newOrder);
    if (currentRef.current) {
      const idx = newOrder.findIndex((t) => t.id === currentRef.current!.id);
      if (idx !== -1) setQueueIndex(idx);
    }
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current; const qi = queueIndexRef.current;
    if (!q.length) return;
    if (qi + 1 < q.length) jumpToQueueIndex(qi + 1);
    else if (repeatModeRef.current === "all") jumpToQueueIndex(0);
  }, [jumpToQueueIndex]);

  const previous = useCallback(() => {
    const audio = getActive();
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
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
    const audio = getActive(); if (!audio) return;
    ensureAudioGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (audio.paused) { audio.play(); setIsPlaying(true); }
    else { audio.pause(); setIsPlaying(false); }
  }, [ensureAudioGraph]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"));
  }, []);

  // ── Event listeners ─────────────────────────────────────────────────────

  // repeat-one: native audio.loop so 'ended' never fires.
  useEffect(() => {
    const audio = getActive();
    if (audio) audio.loop = repeatMode === "one";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode, current?.id]);

  useEffect(() => {
    const elA = audioRefA.current; const elB = audioRefB.current;
    if (!elA || !elB) return;

    const makeEnded = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;   // only active element drives queue
      if (crossfadingRef.current) return; // crossfade already handled advance
      next();
    };

    const makeTimeUpdate = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      const t = el.currentTime;
      setCurrentTime(t);

      if (
        xfadeEnabledRef.current && !crossfadingRef.current && !el.seeking &&
        repeatModeRef.current !== "one" && el.duration > 0 && Number.isFinite(el.duration)
      ) {
        const remaining = el.duration - t;
        const fadeSec = xfadeDurRef.current;
        if (remaining > 0 && remaining <= fadeSec) {
          const nextIdx = queueIndexRef.current + 1;
          const q = queueRef.current;
          const hasNext = nextIdx < q.length || repeatModeRef.current === "all";
          if (hasNext) {
            const ni = repeatModeRef.current === "all" && nextIdx >= q.length ? 0 : nextIdx;
            if (q[ni]) startCrossfade(q[ni]);
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
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec: real }),
        }).catch(() => {});
      }
    };

    // Seeking on the active element cancels an in-flight crossfade so the
    // inactive element doesn't keep playing in the background.
    const makeSeeking = (el: HTMLAudioElement) => () => {
      if (el === getActive() && crossfadingRef.current) cancelCrossfade();
    };

    const endA = makeEnded(elA); const endB = makeEnded(elB);
    const tuA = makeTimeUpdate(elA); const tuB = makeTimeUpdate(elB);
    const metaA = makeMeta(elA); const metaB = makeMeta(elB);
    const skA = makeSeeking(elA); const skB = makeSeeking(elB);

    elA.addEventListener("ended", endA); elB.addEventListener("ended", endB);
    elA.addEventListener("timeupdate", tuA); elB.addEventListener("timeupdate", tuB);
    elA.addEventListener("loadedmetadata", metaA); elB.addEventListener("loadedmetadata", metaB);
    elA.addEventListener("seeking", skA); elB.addEventListener("seeking", skB);
    return () => {
      elA.removeEventListener("ended", endA); elB.removeEventListener("ended", endB);
      elA.removeEventListener("timeupdate", tuA); elB.removeEventListener("timeupdate", tuB);
      elA.removeEventListener("loadedmetadata", metaA); elB.removeEventListener("loadedmetadata", metaB);
      elA.removeEventListener("seeking", skA); elB.removeEventListener("seeking", skB);
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
      repeatMode, cycleRepeatMode, getFrequencyData, crossfadeEnabled, crossfadeDuration, setCrossfade,
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
