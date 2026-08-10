"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
import { triggerFeedback } from "@/lib/feedback";

export type Track = {
  id: string; title: string; artist?: string | null; fileUrl: string;
  durationSec?: number | null; bpm?: number | null; key?: string | null;
  albumId?: string | null; albumCoverUrl?: string | null;
  eqLow?: number | null; eqMid?: number | null; eqHigh?: number | null;
  // Admin cross-user read access only (see lib/adminAccess.ts). userId
  // lets PlayTracker recognize "this isn't my own track" and skip logging
  // a play for it — an admin listening to someone else's track shouldn't
  // inflate that person's play-count insights.
  userId?: string;
  ownerUsername?: string | null;
  isAdminView?: boolean;
};

type PlayerState = {
  current: Track | null; isPlaying: boolean; currentTime: number; duration: number;
  audioRef: React.RefObject<HTMLAudioElement>; queue: Track[]; queueIndex: number; shuffleOn: boolean;
  play: (track: Track) => void; playQueue: (tracks: Track[], startIndex: number) => void;
  toggle: () => void; next: () => void; previous: () => void; toggleShuffle: () => void;
  jumpToQueueIndex: (i: number) => void; reorderQueue: (newOrder: Track[]) => void;
  repeatMode: "off" | "all" | "one"; cycleRepeatMode: () => void;
  getFrequencyData: () => Uint8Array | null;
  // 3-band EQ, dB gain. Applies live to whichever audio element is
  // currently active (both A and B chains carry filters, since crossfade
  // can swap the active element mid-playback — see ensureGraph). Persisted
  // per-track via a debounced PATCH, loaded fresh whenever `current` changes.
  eq: { low: number; mid: number; high: number };
  setEQ: (band: "low" | "mid" | "high", value: number) => void;
  eqBypassed: boolean; setEQBypassed: (v: boolean) => void;
  crossfadeEnabled: boolean; crossfadeDuration: number; setCrossfade: (e: boolean, d: number) => void;
  // The track being crossfaded INTO, set the instant the gain ramp begins
  // and cleared once the swap completes (or is cancelled by a seek). Lets
  // AmbientBackground start transforming its gradient toward the incoming
  // track's colors in lockstep with the audio fade, rather than only
  // finding out a new track is "current" after the swap already happened.
  crossfadingToTrack: Track | null;
  // Set ~30s before a crossfade, the moment audio preloading begins for the
  // next track — lets AmbientBackground start warming its color cache
  // (sampling the album cover, if any) way ahead of time too, so by the
  // time the actual crossfade fires the color is already known and the
  // transition can start instantly instead of guessing-then-correcting.
  preloadingTrack: Track | null;
};

const PlayerContext = createContext<PlayerState | null>(null);

function shuffleArr<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function loadXF() {
  try { const r = localStorage.getItem("soniq:crossfade"); if (r) return JSON.parse(r); } catch {}
  return { enabled: false, duration: 3 };
}

// How many seconds before end to start preloading the next track.
// Preload-only (no play) — browser buffers the file, so startCrossfade's
// incoming.play() is instant with no gap.
const PRELOAD_AHEAD_SEC = 30;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRefA = useRef<HTMLAudioElement>(null);
  const audioRefB = useRef<HTMLAudioElement>(null);
  const activeLetter = useRef<"A" | "B">("A");

  const getActive  = (): HTMLAudioElement | null => activeLetter.current === "A" ? audioRefA.current : audioRefB.current;
  const getInactive = (): HTMLAudioElement | null => activeLetter.current === "A" ? audioRefB.current : audioRefA.current;
  const audioRef = { get current() { return getActive(); } } as React.RefObject<HTMLAudioElement>;

  // Which track ID is preloaded on the inactive element (src set, load() called, NOT playing).
  const preloadedTrackId = useRef<string | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const currentRef = useRef<Track | null>(null);
  useEffect(() => { currentRef.current = current; }, [current]);

  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingSnapshotRef = useRef(false);
  useEffect(() => { isPlayingSnapshotRef.current = isPlaying; }, [isPlaying]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const [queue, setQueue] = useState<Track[]>([]);
  const queueRef = useRef<Track[]>([]);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const [queueIndex, setQueueIndex] = useState(0);
  const queueIndexRef = useRef(0);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);

  const [shuffleOn, setShuffleOn] = useState(false);
  const originalQueueRef = useRef<Track[]>([]);

  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("off");
  const repeatModeRef = useRef<"off" | "all" | "one">("off");
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);

  // Web Audio — two gain nodes into a shared analyser.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainARef = useRef<GainNode | null>(null);
  const gainBRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const graphReady = useRef(false);

  // EQ — one 3-filter chain per element (source -> low -> mid -> high -> gain),
  // built once in ensureGraph alongside everything else. Both chains always
  // carry the same gain values (see applyEQToChains) so a crossfade swap
  // never has to re-apply EQ — whichever element becomes active already has
  // the right filter state.
  const eqLowARef = useRef<BiquadFilterNode | null>(null);
  const eqMidARef = useRef<BiquadFilterNode | null>(null);
  const eqHighARef = useRef<BiquadFilterNode | null>(null);
  const eqLowBRef = useRef<BiquadFilterNode | null>(null);
  const eqMidBRef = useRef<BiquadFilterNode | null>(null);
  const eqHighBRef = useRef<BiquadFilterNode | null>(null);
  const [eq, setEqState] = useState({ low: 0, mid: 0, high: 0 });
  const eqRef = useRef(eq);
  useEffect(() => { eqRef.current = eq; }, [eq]);
  const [eqBypassed, setEQBypassedState] = useState(false);
  const eqSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyEQToChains = useCallback((values: { low: number; mid: number; high: number }) => {
    const nodes = [eqLowARef.current, eqLowBRef.current];
    const midNodes = [eqMidARef.current, eqMidBRef.current];
    const highNodes = [eqHighARef.current, eqHighBRef.current];
    nodes.forEach((n) => { if (n) n.gain.value = values.low; });
    midNodes.forEach((n) => { if (n) n.gain.value = values.mid; });
    highNodes.forEach((n) => { if (n) n.gain.value = values.high; });
  }, []);

  const crossfadingRef = useRef(false);
  const [crossfadingToTrack, setCrossfadingToTrack] = useState<Track | null>(null);
  const [preloadingTrack, setPreloadingTrack] = useState<Track | null>(null);
  const xfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xfadeRafRef = useRef<number | null>(null);

  const [crossfadeEnabled, setCFE] = useState(() => loadXF().enabled);
  const [crossfadeDuration, setCFD] = useState(() => loadXF().duration);
  const xfadeOn = useRef(crossfadeEnabled);
  const xfadeDur = useRef(crossfadeDuration);
  useEffect(() => { xfadeOn.current = crossfadeEnabled; }, [crossfadeEnabled]);
  useEffect(() => { xfadeDur.current = crossfadeDuration; }, [crossfadeDuration]);

  const setCrossfade = useCallback((e: boolean, d: number) => {
    setCFE(e); setCFD(d);
    try { localStorage.setItem("soniq:crossfade", JSON.stringify({ enabled: e, duration: d })); } catch {}
  }, []);

  const ensureGraph = useCallback(() => {
    if (graphReady.current) return;
    const elA = audioRefA.current; const elB = audioRefB.current;
    if (!elA || !elB) return;
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const an = ctx.createAnalyser(); an.fftSize = 256;

      const makeEQChain = (source: MediaElementAudioSourceNode) => {
        const low = ctx.createBiquadFilter(); low.type = "lowshelf"; low.frequency.value = 320;
        const mid = ctx.createBiquadFilter(); mid.type = "peaking"; mid.frequency.value = 1000; mid.Q.value = 0.9;
        const high = ctx.createBiquadFilter(); high.type = "highshelf"; high.frequency.value = 3200;
        source.connect(low); low.connect(mid); mid.connect(high);
        return { low, mid, high, output: high as AudioNode };
      };

      const sA = ctx.createMediaElementSource(elA); const gA = ctx.createGain(); gA.gain.value = 1;
      const chainA = makeEQChain(sA); chainA.output.connect(gA); gA.connect(an);
      const sB = ctx.createMediaElementSource(elB); const gB = ctx.createGain(); gB.gain.value = 0;
      const chainB = makeEQChain(sB); chainB.output.connect(gB); gB.connect(an);
      an.connect(ctx.destination);

      eqLowARef.current = chainA.low; eqMidARef.current = chainA.mid; eqHighARef.current = chainA.high;
      eqLowBRef.current = chainB.low; eqMidBRef.current = chainB.mid; eqHighBRef.current = chainB.high;

      dataArrayRef.current = new Uint8Array(an.frequencyBinCount);
      audioCtxRef.current = ctx; gainARef.current = gA; gainBRef.current = gB; analyserRef.current = an;
      graphReady.current = true;
      // Apply whatever EQ state is already pending (e.g. a track played
      // before the user gesture that unlocks AudioContext had a chance to run).
      applyEQToChains(eqBypassed ? { low: 0, mid: 0, high: 0 } : eqRef.current);
    } catch (e) { console.warn("Web Audio unavailable:", e); }
  }, []);

  const activeGain   = () => activeLetter.current === "A" ? gainARef.current : gainBRef.current;
  const inactiveGain = () => activeLetter.current === "A" ? gainBRef.current : gainARef.current;

  // Preload the next track onto the inactive element WITHOUT playing it.
  // The browser buffers the file so that incoming.play() in startCrossfade is instant.
  const preloadNextTrack = useCallback((nextTrack: Track) => {
    const incoming = getInactive();
    if (!incoming) return;
    if (preloadedTrackId.current === nextTrack.id) return; // already preloaded
    const ig = inactiveGain();
    if (ig) ig.gain.value = 0; // keep silent just in case
    incoming.src = nextTrack.fileUrl;
    (incoming as any).preload = "auto";
    incoming.load(); // buffer without playing
    preloadedTrackId.current = nextTrack.id;
    setPreloadingTrack(nextTrack);
  }, []);

  // Direct load + play on active element — used by all public actions.
  const loadAndPlay = useCallback((track: Track) => {
    const audio = getActive();
    if (!audio) return;
    audio.src = track.fileUrl;
    audio.load();
    audio.play().catch(() => {});
    const ag = activeGain(); if (ag) ag.gain.value = 1;
    const ig = inactiveGain(); if (ig) ig.gain.value = 0;
    preloadedTrackId.current = null; // inactive is now free
  }, []);

  const cancelCrossfade = useCallback(() => {
    if (xfadeTimerRef.current) { clearTimeout(xfadeTimerRef.current); xfadeTimerRef.current = null; }
    if (xfadeRafRef.current) { cancelAnimationFrame(xfadeRafRef.current); xfadeRafRef.current = null; }
    const inactive = getInactive();
    if (inactive) { inactive.pause(); inactive.src = ""; inactive.volume = 1; }
    preloadedTrackId.current = null;
    const ctx = audioCtxRef.current;
    const ag = activeGain(); const ig = inactiveGain();
    if (ctx && ag && ig) {
      const now = ctx.currentTime;
      ag.gain.cancelScheduledValues(now); ag.gain.setValueAtTime(1, now);
      ig.gain.cancelScheduledValues(now); ig.gain.setValueAtTime(0, now);
    }
    crossfadingRef.current = false;
    setCrossfadingToTrack(null);
    setPreloadingTrack(null);
  }, []);

  const completeCrossfade = useCallback((nextTrack: Track) => {
    if (!crossfadingRef.current) return;
    // Snap gains to final state.
    const ctx = audioCtxRef.current;
    const og = activeGain(); const ig = inactiveGain();
    if (ctx && og && ig) {
      const now = ctx.currentTime;
      og.gain.cancelScheduledValues(now); og.gain.setValueAtTime(0, now);
      ig.gain.cancelScheduledValues(now); ig.gain.setValueAtTime(1, now);
    }
    // Stop outgoing.
    const outgoing = getActive();
    if (outgoing) { outgoing.pause(); outgoing.volume = 1; }
    // Grab incoming's duration before the swap — its own "loadedmetadata"
    // already fired back during preloadNextTrack, while it was still the
    // inactive element, so makeMeta's `el !== getActive()` guard dropped it.
    // Without this, `duration` state stays stuck on the outgoing track's
    // value after the swap, while currentTime keeps climbing on the new
    // track — that's the "2:51 / 2:35" display bug.
    const incoming = getInactive();
    if (incoming && Number.isFinite(incoming.duration) && incoming.duration > 0) {
      setDuration(incoming.duration);
    }
    // Swap — incoming is now active and continues playing undisturbed.
    activeLetter.current = activeLetter.current === "A" ? "B" : "A";
    preloadedTrackId.current = null;
    crossfadingRef.current = false;
    setCrossfadingToTrack(null);
    setPreloadingTrack(null);
    // Update UI state only — do NOT touch audio.
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
    setCrossfadingToTrack(nextTrack);
    const fadeSec = xfadeDur.current;
    const fadeMs = fadeSec * 1000;

    // If not preloaded or wrong track, set src now (may have tiny gap if network is slow).
    if (preloadedTrackId.current !== nextTrack.id) {
      incoming.src = nextTrack.fileUrl;
      incoming.load();
    }
    incoming.volume = 1;
    incoming.play().catch(() => {}); // instant if preloaded, near-instant otherwise

    const ctx = audioCtxRef.current;
    const og = activeGain(); const ig = inactiveGain();
    if (ctx && og && ig) {
      const now = ctx.currentTime;
      og.gain.cancelScheduledValues(now); og.gain.setValueAtTime(og.gain.value, now);
      og.gain.linearRampToValueAtTime(0, now + fadeSec);
      ig.gain.cancelScheduledValues(now); ig.gain.setValueAtTime(0, now);
      ig.gain.linearRampToValueAtTime(1, now + fadeSec);
      xfadeTimerRef.current = setTimeout(() => completeCrossfade(nextTrack), fadeMs);
    } else {
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

  // ── Public actions — each directly controls audio, no sync effect needed ──

  const play = useCallback((track: Track) => {
    cancelCrossfade(); ensureGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    loadAndPlay(track);
    setQueue([track]); originalQueueRef.current = [track]; setQueueIndex(0);
    setCurrent(track); setIsPlaying(true);
  }, [cancelCrossfade, ensureGraph, loadAndPlay]);

  const playQueue = useCallback((tracks: Track[], startIndex: number) => {
    cancelCrossfade(); ensureGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    originalQueueRef.current = tracks;
    const ordered = shuffleOn ? shuffleArr(tracks) : tracks;
    const idx = Math.max(0, shuffleOn ? ordered.findIndex(t => t.id === tracks[startIndex]?.id) : startIndex);
    setQueue(ordered); setQueueIndex(idx);
    const track = ordered[idx] ?? tracks[startIndex];
    loadAndPlay(track); setCurrent(track); setIsPlaying(true);
  }, [shuffleOn, cancelCrossfade, ensureGraph, loadAndPlay]);

  const jumpToQueueIndex = useCallback((i: number) => {
    const q = queueRef.current;
    if (i < 0 || i >= q.length) return;
    cancelCrossfade(); ensureGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    loadAndPlay(q[i]); setQueueIndex(i); setCurrent(q[i]); setIsPlaying(true);
  }, [cancelCrossfade, ensureGraph, loadAndPlay]);

  const reorderQueue = useCallback((newOrder: Track[]) => {
    setQueue(newOrder);
    if (currentRef.current) {
      const idx = newOrder.findIndex(t => t.id === currentRef.current!.id);
      if (idx !== -1) setQueueIndex(idx);
    }
  }, []);

  const next = useCallback(() => {
    const q = queueRef.current; const qi = queueIndexRef.current;
    if (!q.length) return;
    if (qi + 1 < q.length) { jumpToQueueIndex(qi + 1); triggerFeedback("skip"); }
    else if (repeatModeRef.current === "all") { jumpToQueueIndex(0); triggerFeedback("skip"); }
  }, [jumpToQueueIndex]);

  const previous = useCallback(() => {
    const audio = getActive();
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (queueIndexRef.current > 0) { jumpToQueueIndex(queueIndexRef.current - 1); triggerFeedback("skip"); }
  }, [jumpToQueueIndex]);

  const toggleShuffle = useCallback(() => {
    setShuffleOn(prev => {
      const on = !prev;
      if (on) {
        const id = currentRef.current?.id;
        const rest = shuffleArr(originalQueueRef.current.filter(t => t.id !== id));
        const q = currentRef.current ? [currentRef.current, ...rest] : rest;
        setQueue(q); setQueueIndex(0);
      } else {
        setQueue(originalQueueRef.current);
        const idx = originalQueueRef.current.findIndex(t => t.id === currentRef.current?.id);
        setQueueIndex(Math.max(0, idx));
      }
      return on;
    });
  }, []);

  const toggle = useCallback(() => {
    const audio = getActive(); if (!audio) return;
    ensureGraph();
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume();
    if (audio.paused) { audio.play(); setIsPlaying(true); triggerFeedback("play"); }
    else { audio.pause(); setIsPlaying(false); triggerFeedback("pause"); }
  }, [ensureGraph]);

  const cycleRepeatMode = useCallback(() => {
    setRepeatMode(m => m === "off" ? "all" : m === "all" ? "one" : "off");
  }, []);

  // repeat-one
  useEffect(() => {
    const audio = getActive();
    if (audio) audio.loop = repeatMode === "one";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatMode, current?.id]);

  // ── Event listeners ──
  useEffect(() => {
    const elA = audioRefA.current; const elB = audioRefB.current;
    if (!elA || !elB) return;

    const makeEnded = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      if (crossfadingRef.current) return;
      next();
    };

    const makeTimeUpdate = (el: HTMLAudioElement) => () => {
      if (el !== getActive()) return;
      const t = el.currentTime;
      setCurrentTime(t);

      if (xfadeOn.current && !el.seeking && repeatModeRef.current !== "one" &&
          el.duration > 0 && Number.isFinite(el.duration)) {
        const remaining = el.duration - t;
        const q = queueRef.current;
        const nextIdx = queueIndexRef.current + 1;
        const hasNext = nextIdx < q.length || repeatModeRef.current === "all";
        if (hasNext && remaining > 0) {
          const ni = repeatModeRef.current === "all" && nextIdx >= q.length ? 0 : nextIdx;
          const nextTrack = q[ni];
          if (nextTrack) {
            // Preload the next track well in advance (silent, no play).
            if (!crossfadingRef.current && remaining <= PRELOAD_AHEAD_SEC) {
              preloadNextTrack(nextTrack);
            }
            // Start the gain ramp at the crossfade window.
            if (!crossfadingRef.current && remaining <= xfadeDur.current) {
              startCrossfade(nextTrack);
            }
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

    // Cancel crossfade (and discard preload) when user seeks.
    const makeSeeking = (el: HTMLAudioElement) => () => {
      if (el === getActive()) cancelCrossfade();
    };

    const endA = makeEnded(elA); const endB = makeEnded(elB);
    const tuA = makeTimeUpdate(elA); const tuB = makeTimeUpdate(elB);
    const mA = makeMeta(elA); const mB = makeMeta(elB);
    const skA = makeSeeking(elA); const skB = makeSeeking(elB);

    elA.addEventListener("ended", endA); elB.addEventListener("ended", endB);
    elA.addEventListener("timeupdate", tuA); elB.addEventListener("timeupdate", tuB);
    elA.addEventListener("loadedmetadata", mA); elB.addEventListener("loadedmetadata", mB);
    elA.addEventListener("seeking", skA); elB.addEventListener("seeking", skB);
    return () => {
      elA.removeEventListener("ended", endA); elB.removeEventListener("ended", endB);
      elA.removeEventListener("timeupdate", tuA); elB.removeEventListener("timeupdate", tuB);
      elA.removeEventListener("loadedmetadata", mA); elB.removeEventListener("loadedmetadata", mB);
      elA.removeEventListener("seeking", skA); elB.removeEventListener("seeking", skB);
    };
  }, [next, preloadNextTrack, startCrossfade, cancelCrossfade]);

  // ── Media Session API ───────────────────────────────────────────────────
  // Without this, iOS/Android treat the tab as a generic page, not an audio
  // session — the lock screen/dynamic island/notification shows the page
  // title ("SONIQ") instead of the track, no album art, and critically the
  // OS is more aggressive about suspending audio when the app is backgrounded
  // because it doesn't recognize this as active media playback.
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!current) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist || "Unknown artist",
      album: "SONIQ",
      artwork: current.albumCoverUrl
        ? [
            { src: current.albumCoverUrl, sizes: "96x96", type: "image/png" },
            { src: current.albumCoverUrl, sizes: "256x256", type: "image/png" },
            { src: current.albumCoverUrl, sizes: "512x512", type: "image/png" },
          ]
        : [],
    });
  }, [current?.id, current?.albumCoverUrl]);

  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Action handlers — lets lock-screen/notification controls drive the same
  // toggle/next/previous the in-app UI uses, and seeking from there too.
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => toggle());
    ms.setActionHandler("pause", () => toggle());
    ms.setActionHandler("nexttrack", () => next());
    ms.setActionHandler("previoustrack", () => previous());
    ms.setActionHandler("seekto", (details) => {
      const audio = getActive();
      if (audio && details.seekTime !== undefined) audio.currentTime = details.seekTime;
    });
    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("nexttrack", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("seekto", null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggle, next, previous]);

  // Keep the lock-screen scrubber position in sync.
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;
    if (!duration || !Number.isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(currentTime, duration),
      });
    } catch { /* setPositionState can throw if duration/position are inconsistent mid-crossfade */ }
  }, [currentTime, duration]);

  // ── Background playback ─────────────────────────────────────────────────
  // Mobile Safari (and some Android browsers) suspend the AudioContext when
  // the tab/PWA is backgrounded to save power. The <audio> element itself
  // keeps "playing" internally, but since it's routed through Web Audio
  // (createMediaElementSource → gain → destination) for crossfade/analysis,
  // a suspended context means silence even though isPlaying stays true.
  // Resuming on visibilitychange (and pageshow, for the PWA-relaunch case)
  // restores sound the instant the app is foregrounded again.
  useEffect(() => {
    const resume = () => {
      const ctx = audioCtxRef.current;
      if (ctx?.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      // Defensive: some mobile browsers pause the <audio> element itself
      // (not just the Web Audio context) on backgrounding. If we think
      // we should be playing, nudge it directly too.
      const audio = getActive();
      if (audio && audio.paused && isPlayingSnapshotRef.current) {
        audio.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("focus", resume);

    // Keep-alive: iOS in particular can re-suspend the context shortly after
    // a single resume() while the tab is backgrounded. Poll every couple of
    // seconds and resume again if needed — cheap, and it's the difference
    // between "silent after 10s in background" and "keeps playing."
    const keepAlive = setInterval(() => {
      if (document.visibilityState === "hidden") resume();
    }, 2000);

    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("focus", resume);
      clearInterval(keepAlive);
    };
  }, []);

  // Loads the current track's saved EQ whenever it changes, and applies it
  // (or silence, if bypassed) to both filter chains immediately.
  useEffect(() => {
    const next = {
      low: current?.eqLow ?? 0,
      mid: current?.eqMid ?? 0,
      high: current?.eqHigh ?? 0,
    };
    setEqState(next);
    applyEQToChains(eqBypassed ? { low: 0, mid: 0, high: 0 } : next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const setEQ = useCallback((band: "low" | "mid" | "high", value: number) => {
    setEqState((prev) => {
      const next = { ...prev, [band]: value };
      if (!eqBypassed) applyEQToChains(next);
      // Debounced persist — same shape as saveField elsewhere (title/notes
      // etc), avoid firing a PATCH on every drag-frame of the slider.
      if (eqSaveTimer.current) clearTimeout(eqSaveTimer.current);
      const trackId = currentRef.current?.id;
      if (trackId) {
        eqSaveTimer.current = setTimeout(() => {
          fetch(`/api/tracks/${trackId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eqLow: next.low, eqMid: next.mid, eqHigh: next.high }),
          }).catch(() => {});
        }, 400);
      }
      return next;
    });
  }, [eqBypassed, applyEQToChains]);

  const setEQBypassed = useCallback((v: boolean) => {
    setEQBypassedState(v);
    applyEQToChains(v ? { low: 0, mid: 0, high: 0 } : eqRef.current);
  }, [applyEQToChains]);

  const getFrequencyData = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current) return null;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
    return dataArrayRef.current;
  }, []);

  return (
    <PlayerContext.Provider value={{
      current, isPlaying, currentTime, duration, audioRef, queue, queueIndex, shuffleOn,
      play, playQueue, toggle, next, previous, toggleShuffle, jumpToQueueIndex, reorderQueue,
      repeatMode, cycleRepeatMode, getFrequencyData, eq, setEQ, eqBypassed, setEQBypassed,
      crossfadeEnabled, crossfadeDuration, setCrossfade,
      crossfadingToTrack, preloadingTrack,
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
