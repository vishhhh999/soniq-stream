"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/components/PlayerProvider";

export type StemName = "vocals" | "drums" | "bass" | "other";

type StemBuffers = Partial<Record<StemName, AudioBuffer>>;

// Sample-accurate 4-way sync is the hard part the roadmap flagged. Native
// <audio> elements drift against each other over time (each has its own
// independent playback clock) so 4 of them is not good enough. Instead: the
// full mix-down for each stem is fetched and decoded once into an
// AudioBuffer, then played via AudioBufferSourceNode, which schedules
// against the AudioContext's own sample-accurate clock. The tradeoff is a
// decode wait before playback starts (full file must download+decode, no
// streaming) — acceptable for track-length music files, and the only way
// to get real sync rather than "close enough most of the time."
//
// A source node can only be started once — pause/seek/mute-all-then-resume
// requires stopping the old nodes and creating fresh ones at the correct
// offset, which is what restart() below does. This is the standard pattern
// for transport control with AudioBufferSourceNode.
export function useStemsEngine(stemUrls: Partial<Record<StemName, string>> | null) {
  const { audioContext, isPlaying, currentTime, setStemsMuted } = usePlayer();
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<Record<StemName, boolean>>({
    vocals: false, drums: false, bass: false, other: false,
  });

  const buffersRef = useRef<StemBuffers>({});
  const gainsRef = useRef<Partial<Record<StemName, GainNode>>>({});
  const sourcesRef = useRef<Partial<Record<StemName, AudioBufferSourceNode>>>({});
  const startedAtCtxTimeRef = useRef(0); // ctx.currentTime when playback last (re)started
  const startedAtOffsetRef = useRef(0); // track position (sec) that corresponds to the above
  const activeRef = useRef(false);
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const stopSources = useCallback(() => {
    Object.values(sourcesRef.current).forEach((s) => { try { s?.stop(); } catch {} });
    sourcesRef.current = {};
  }, []);

  // (Re)creates and starts a source node per stem at the given offset. Used
  // for the initial start, and every time transport state changes (play,
  // pause via stop, or seek) since a single node can't be repositioned.
  const restart = useCallback((offsetSec: number, playing: boolean) => {
    const ctx = audioContext();
    if (!ctx) return;
    stopSources();
    startedAtOffsetRef.current = offsetSec;
    startedAtCtxTimeRef.current = ctx.currentTime;
    if (!playing) return;
    (Object.keys(buffersRef.current) as StemName[]).forEach((name) => {
      const buffer = buffersRef.current[name];
      const gain = gainsRef.current[name];
      if (!buffer || !gain) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      const safeOffset = Math.max(0, Math.min(offsetSec, buffer.duration));
      src.start(0, safeOffset);
      sourcesRef.current[name] = src;
    });
  }, [audioContext, stopSources]);

  // Load + decode all 4 stems once URLs are available.
  useEffect(() => {
    if (!stemUrls) { setReady(false); return; }
    const ctx = audioContext();
    if (!ctx) { setError("Audio not ready yet — press play once first."); return; }

    let cancelled = false;
    setLoading(true); setError(null); setReady(false);
    buffersRef.current = {};

    const names = Object.keys(stemUrls) as StemName[];
    Promise.all(
      names.map(async (name) => {
        const url = stemUrls[name];
        if (!url) return;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Couldn't fetch ${name} stem.`);
        const arrayBuffer = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
        if (cancelled) return;
        buffersRef.current[name] = decoded;
        const gain = ctx.createGain();
        gain.gain.value = mutedRef.current[name] ? 0 : 1;
        gain.connect(ctx.destination);
        gainsRef.current[name] = gain;
      })
    )
      .then(() => { if (!cancelled) { setReady(true); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message || "Couldn't load stems."); setLoading(false); } });

    return () => {
      cancelled = true;
      stopSources();
      Object.values(gainsRef.current).forEach((g) => { try { g?.disconnect(); } catch {} });
      gainsRef.current = {};
      buffersRef.current = {};
      activeRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemUrls?.vocals, stemUrls?.drums, stemUrls?.bass, stemUrls?.other]);

  // Engages/disengages the live mix: mutes the main track's own output
  // while stems are actively substituting for it, restores it on unmount
  // or when leaving the Stems tab.
  useEffect(() => {
    if (!ready) return;
    activeRef.current = true;
    setStemsMuted(true);
    restart(currentTime, isPlaying);
    return () => {
      activeRef.current = false;
      setStemsMuted(false);
      stopSources();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Mirror the main transport's play/pause into a fresh source start/stop.
  useEffect(() => {
    if (!ready || !activeRef.current) return;
    restart(currentTime, isPlaying);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // Mirror seeks — if the main track's position jumps by more than a small
  // tolerance from where our own clock predicts it should be, resync.
  useEffect(() => {
    if (!ready || !activeRef.current || !isPlaying) return;
    const ctx = audioContext();
    if (!ctx) return;
    const predicted = startedAtOffsetRef.current + (ctx.currentTime - startedAtCtxTimeRef.current);
    if (Math.abs(predicted - currentTime) > 0.35) {
      restart(currentTime, isPlaying);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime]);

  const toggleMute = useCallback((name: StemName) => {
    setMuted((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      const gain = gainsRef.current[name];
      if (gain) gain.gain.value = next[name] ? 0 : 1;
      return next;
    });
  }, []);

  return { loading, ready, error, muted, toggleMute };
}
