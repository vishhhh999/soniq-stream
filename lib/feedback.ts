"use client";

// Small, deliberate feedback layer — sound on desktop, haptics on mobile,
// both off by default and both gated by the SAME single toggle (Settings
// > Sound & haptics), per the explicit ask: "a little, not a lot," not a
// separate on/off per platform. Wired to only a few real moments (play/
// pause, skip, upload complete, link copied) — NOT every hover or click,
// matching the same restraint principle the ambient/motion system uses.
//
// Sound is synthesized via Web Audio (short sine/triangle blips), not
// audio file assets — keeps this dependency-free and avoids shipping
// several tiny mp3/wav files for something this small.

const STORAGE_KEY = "soniq-feedback-enabled";

export function isFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "true"; // off by default — must be explicitly turned on
}

export function setFeedbackEnabled(enabled: boolean) {
  window.localStorage.setItem(STORAGE_KEY, String(enabled));
}

// Lazily created and reused — creating a new AudioContext per call is
// wasteful and some browsers cap how many can exist at once.
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  // Browsers suspend a newly-created context until a user gesture — every
  // call site here is already inside a click handler, so this resumes
  // silently and immediately rather than requiring a separate unlock step.
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Plays a short, quiet tone. Kept deliberately subtle — a UI cue, not a
// notification sound — short duration, low gain, gentle exponential decay
// so it never clicks/pops at the end.
function playTone(freq: number, durationMs: number, gain: number) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.value = gain;
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000);
}

type FeedbackKind = "play" | "pause" | "skip" | "success" | "tap";

const TONES: Record<FeedbackKind, { freq: number; duration: number; gain: number }> = {
  play: { freq: 660, duration: 90, gain: 0.05 },
  pause: { freq: 440, duration: 90, gain: 0.05 },
  skip: { freq: 520, duration: 60, gain: 0.04 },
  success: { freq: 880, duration: 120, gain: 0.05 },
  tap: { freq: 500, duration: 40, gain: 0.03 },
};

// Short, distinct vibration patterns per kind — all brief (under 40ms per
// pulse), matching "a little, not a lot." navigator.vibrate silently
// no-ops on unsupported browsers/iOS Safari, no feature-detection needed
// beyond the existence check itself.
const HAPTIC_PATTERNS: Record<FeedbackKind, number | number[]> = {
  play: 15,
  pause: 15,
  skip: [10, 30, 10],
  success: 20,
  tap: 8,
};

// Call this from any interaction moment worth marking — respects the
// settings toggle and dispatches to sound (desktop) or vibration (mobile)
// automatically based on touch support, so call sites don't need to know
// or care which platform they're running on.
export function triggerFeedback(kind: FeedbackKind) {
  if (!isFeedbackEnabled()) return;
  const isTouchDevice = typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  if (isTouchDevice) {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(HAPTIC_PATTERNS[kind]);
    }
  } else {
    const t = TONES[kind];
    playTone(t.freq, t.duration, t.gain);
  }
}
