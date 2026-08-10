"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/components/PlayerProvider";

// Standard lookahead-scheduler pattern for Web Audio timing accuracy —
// setTimeout/setInterval alone drifts (throttled in background tabs, not
// sample-accurate), so this schedules clicks slightly ahead of when
// they're needed using the AudioContext's own clock, and re-checks on a
// short interval to queue up the next batch.
const LOOKAHEAD_SEC = 0.1;
const SCHEDULE_INTERVAL_MS = 25;

export function useMetronome(bpm: number | null | undefined) {
  const { audioContext, isPlaying } = usePlayer();
  const [on, setOn] = useState(false);
  const [accentDownbeat, setAccentDownbeat] = useState(true);
  const nextClickTimeRef = useRef(0);
  const beatCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scheduleClick = useCallback((time: number, accented: boolean) => {
    const ctx = audioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accented ? 1500 : 1000;
    gain.gain.setValueAtTime(0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.05);
  }, [audioContext]);

  useEffect(() => {
    if (!on || !isPlaying || !bpm || bpm <= 0) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const ctx = audioContext();
    if (!ctx) return;
    const secPerBeat = 60 / bpm;
    nextClickTimeRef.current = ctx.currentTime + 0.1;
    beatCountRef.current = 0;

    timerRef.current = setInterval(() => {
      const now = ctx.currentTime;
      while (nextClickTimeRef.current < now + LOOKAHEAD_SEC) {
        const accented = accentDownbeat && beatCountRef.current % 4 === 0;
        scheduleClick(nextClickTimeRef.current, accented);
        nextClickTimeRef.current += secPerBeat;
        beatCountRef.current += 1;
      }
    }, SCHEDULE_INTERVAL_MS);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [on, isPlaying, bpm, accentDownbeat, audioContext, scheduleClick]);

  return { on, setOn, accentDownbeat, setAccentDownbeat };
}
