"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function freqToNote(freq: number) {
  const noteNum = 12 * (Math.log(freq / 440) / Math.log(2));
  const rounded = Math.round(noteNum) + 69; // MIDI note number, A4 = 69
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  const exactFreq = 440 * Math.pow(2, (rounded - 69) / 12);
  const cents = Math.round(1200 * Math.log2(freq / exactFreq));
  return { name: `${name}${octave}`, cents };
}

// Autocorrelation-based pitch detection (ACF2+), the standard approach for
// browser-side tuners — an FFT bin approach doesn't have enough frequency
// resolution at low notes without a huge FFT size, autocorrelation on the
// raw time-domain buffer does much better for this specific use case.
function autoCorrelate(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // too quiet, likely silence/noise

  let r1 = 0, r2 = SIZE - 1;
  const threshold = 0.2;
  for (let i = 0; i < SIZE / 2; i++) { if (Math.abs(buf[i]) < threshold) { r1 = i; break; } }
  for (let i = 1; i < SIZE / 2; i++) { if (Math.abs(buf[SIZE - i]) < threshold) { r2 = SIZE - i; break; } }
  const trimmed = buf.slice(r1, r2);
  const n = trimmed.length;

  const c = new Array(n).fill(0);
  for (let lag = 0; lag < n; lag++) {
    for (let i = 0; i < n - lag; i++) c[lag] += trimmed[i] * trimmed[i + lag];
  }
  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxVal = -1, maxPos = -1;
  for (let i = d; i < n; i++) { if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; } }
  if (maxPos <= 0) return null;

  // Parabolic interpolation around the peak for sub-sample precision.
  const x1 = c[maxPos - 1] ?? c[maxPos];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1] ?? c[maxPos];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const shift = a ? -b / (2 * a) : 0;
  const period = maxPos + shift;
  return period > 0 ? sampleRate / period : null;
}

export function useTuner() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ name: string; cents: number; freq: number } | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null; streamRef.current = null;
    setActive(false); setNote(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, ctx.sampleRate);
        setNote(freq ? { ...freqToNote(freq), freq } : null);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      ctxRef.current = ctx; streamRef.current = stream;
      setActive(true);
    } catch (e: any) {
      setError(e?.message || "Couldn't access the microphone.");
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { active, error, note, start, stop };
}
