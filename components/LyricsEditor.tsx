"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Play, Pause, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw, Crosshair, X } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import type { SyncedLine } from "@/lib/lyricsSync";

// Redesigned sync flow, loosely modeled on Musixmatch's line-review UI
// (per-line nudge + a global calibration shift) rather than the old
// tap-along-only flow, which had no way to fix a single mistimed line
// without redoing the entire track from scratch. Three modes now:
//   'idle'    — text editor + Sync/Edit timing buttons
//   'tapping' — live tap-along, unchanged from before, still the fastest
//               way to rough in a whole track for the first time
//   'review'  — per-line editable list: nudge individual lines, re-tap a
//               single line against the live playhead, or shift every
//               line at once via calibration. This is also the entry
//               point when editing an ALREADY-synced track — no need to
//               re-tap the whole thing just to fix one line's timing.
type Mode = "idle" | "tapping" | "review";

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
};

export default function LyricsEditor({
  track,
  initialLyrics,
  initialSynced,
}: {
  track: Track;
  initialLyrics: string;
  initialSynced: SyncedLine[] | null;
}) {
  const { audioRef, play, current, isPlaying, toggle } = usePlayer();
  const [text, setText] = useState(initialLyrics);
  const [mode, setMode] = useState<Mode>("idle");
  const [syncLines, setSyncLines] = useState<string[]>([]);
  const [captured, setCaptured] = useState<SyncedLine[]>([]);
  const [reviewLines, setReviewLines] = useState<SyncedLine[]>([]);
  const [originalReviewLines, setOriginalReviewLines] = useState<SyncedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSynced, setIsSynced] = useState(!!initialSynced && initialSynced.length > 0);

  // Previously this called the parent TrackDetail's `onSaved`, which was
  // built to close the ENTIRE panel after the main "Save changes" button —
  // meaning finishing a sync (or even just saving the text) closed the
  // whole drawer with no warning. Lyrics now confirm locally instead,
  // exactly like the title/artist auto-save fields already do.
  //
  // It still needs to tell the REST of the app, though — LyricsSidebar and
  // LyricsView hold their own separately-fetched copy of lyrics, keyed off
  // track.id only, so they never refetch on their own after an edit here.
  // Without this event, newly saved/synced lyrics only appeared after a
  // full page reload.
  const notifyLyricsUpdated = () => {
    window.dispatchEvent(new CustomEvent("soniq:lyrics-updated", { detail: { trackId: track.id } }));
  };

  const saveText = async () => {
    setSaving(true);
    const res = await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyrics: text }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("Couldn't save the lyrics. Try again.");
      return;
    }
    setSaved(true);
    notifyLyricsUpdated();
    setTimeout(() => setSaved(false), 1500);
  };

  // --- Tap-along (unchanged mechanics, now lands in review instead of saving directly) ---

  const startSync = () => {
    const parsedLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (parsedLines.length === 0) return;
    setSyncLines(parsedLines);
    setCaptured([]);
    setMode("tapping");
    play(track);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const tapLine = () => {
    if (!audioRef.current) return;
    const idx = captured.length;
    if (idx >= syncLines.length) return;
    const newCaptured = [...captured, { time: audioRef.current.currentTime, text: syncLines[idx] }];
    setCaptured(newCaptured);
    if (newCaptured.length === syncLines.length) {
      enterReview(newCaptured);
    }
  };

  // Spacebar as an alternative to clicking the tap button — clicking means
  // moving the mouse to a fixed target under time pressure, which is
  // exactly the "hard to hit the tap at the right moment" problem. A key
  // that's always under your finger removes that.
  useEffect(() => {
    if (mode !== "tapping") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        tapLine();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, captured, syncLines]);

  const cancelSync = () => {
    setMode("idle");
    if (audioRef.current) audioRef.current.pause();
  };

  // --- Review mode: per-line nudge/retap + global calibration shift ---

  const enterReview = (lines: SyncedLine[]) => {
    setReviewLines(lines.map((l) => ({ ...l })));
    setOriginalReviewLines(lines.map((l) => ({ ...l })));
    setMode("review");
  };

  const editExisting = () => {
    if (!initialSynced || initialSynced.length === 0) return;
    enterReview(initialSynced);
  };

  const nudgeLine = (index: number, delta: number) => {
    setReviewLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, time: Math.max(0, l.time + delta) } : l))
    );
  };

  // Re-captures just this one line against wherever the track is playing
  // right now — fixes a single mistimed line without redoing the tap-along
  // for the whole track.
  const retapLine = (index: number) => {
    if (!audioRef.current) return;
    const t = audioRef.current.currentTime;
    setReviewLines((prev) => prev.map((l, i) => (i === index ? { ...l, time: t } : l)));
  };

  // Shifts every line's timestamp by the same amount — for when the whole
  // sync is just consistently early or late, rather than any one line
  // being wrong. Applied cumulatively; "Reset" restores the values from
  // when review mode was entered (either straight from tap-along, or from
  // loading an already-synced track via "Edit timing").
  const shiftAll = (delta: number) => {
    setReviewLines((prev) => prev.map((l) => ({ ...l, time: Math.max(0, l.time + delta) })));
  };

  const resetCalibration = () => {
    setReviewLines(originalReviewLines.map((l) => ({ ...l })));
  };

  const playFromLine = (t: number) => {
    if (current?.id !== track.id) {
      play(track);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.currentTime = t;
          audioRef.current.play().catch(() => {});
        }
      }, 60);
    } else {
      if (audioRef.current) {
        audioRef.current.currentTime = t;
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const saveReview = async () => {
    setSaving(true);
    const res = await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyricsSynced: reviewLines }),
    });
    setSaving(false);
    if (!res.ok) {
      alert("Couldn't save the synced lyrics. Try again.");
      return;
    }
    setIsSynced(true);
    setMode("idle");
    notifyLyricsUpdated();
  };

  const cancelReview = () => {
    setMode("idle");
  };

  // --- Render ---

  if (mode === "tapping") {
    const currentLine = syncLines[captured.length];
    return (
      <div className="border border-border-strong rounded-md p-5 space-y-4">
        <p className="text-xs uppercase tracking-wide text-tertiary">
          Syncing — line {captured.length + 1} of {syncLines.length}
        </p>
        <p className="text-lg text-primary font-medium min-h-[3.5rem] flex items-center">{currentLine}</p>
        <div className="flex items-center gap-3">
          <button
            onClick={tapLine}
            className="flex-1 bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors"
          >
            Tap when this line starts
          </button>
          <button
            onClick={cancelSync}
            className="text-sm text-secondary border border-border rounded-md px-4 py-3 hover:border-border-strong transition-colors"
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-tertiary">
          Play the track and tap the button (or hit Space) in time with each line as it starts.
          You'll get a chance to fine-tune every line afterward — it doesn't have to be perfect on the first pass.
        </p>
      </div>
    );
  }

  if (mode === "review") {
    // Rendered as its own wide overlay rather than inline inside
    // TrackDetail's ~400px sidebar column — a per-line list with a
    // timestamp, four icon buttons, and the line text was genuinely
    // cramped in that width, with most lines truncating. z-[60] to sit
    // above TrackDetail's own modal (z-50).
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          className="w-full max-w-2xl rounded-2xl border border-border bg-elevated p-6 relative max-h-[85vh] flex flex-col"
        >
          <button
            onClick={cancelReview}
            className="absolute top-5 right-5 text-tertiary hover:text-primary transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>

          <div className="flex items-center justify-between flex-wrap gap-3 pr-8 shrink-0">
            <p className="text-sm font-medium text-primary">Review timing</p>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-tertiary mr-1">Shift all:</span>
              <button onClick={() => shiftAll(-1)} title="-1s" className="p-1.5 rounded border border-border hover:border-border-strong transition-colors">
                <ChevronsLeft size={13} strokeWidth={2} />
              </button>
              <button onClick={() => shiftAll(-0.1)} title="-0.1s" className="p-1.5 rounded border border-border hover:border-border-strong transition-colors">
                <ChevronLeft size={13} strokeWidth={2} />
              </button>
              <button onClick={() => shiftAll(0.1)} title="+0.1s" className="p-1.5 rounded border border-border hover:border-border-strong transition-colors">
                <ChevronRight size={13} strokeWidth={2} />
              </button>
              <button onClick={() => shiftAll(1)} title="+1s" className="p-1.5 rounded border border-border hover:border-border-strong transition-colors">
                <ChevronsRight size={13} strokeWidth={2} />
              </button>
              <button onClick={resetCalibration} title="Reset all changes" className="p-1.5 rounded border border-border hover:border-border-strong transition-colors ml-1">
                <RotateCcw size={13} strokeWidth={2} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 mt-4">
            {reviewLines.map((line, i) => (
              <div key={i} className="flex items-center gap-3 text-sm py-1">
                <span className="text-xs text-tertiary tabular-nums w-16 shrink-0">{fmt(line.time)}</span>
                <button onClick={() => nudgeLine(i, -0.1)} title="-0.1s" className="p-1.5 rounded hover:bg-surface transition-colors shrink-0">
                  <ChevronLeft size={14} strokeWidth={2} className="text-tertiary" />
                </button>
                <button onClick={() => nudgeLine(i, 0.1)} title="+0.1s" className="p-1.5 rounded hover:bg-surface transition-colors shrink-0">
                  <ChevronRight size={14} strokeWidth={2} className="text-tertiary" />
                </button>
                <button onClick={() => playFromLine(line.time)} title="Play from here" className="p-1.5 rounded hover:bg-surface transition-colors shrink-0">
                  <Play size={13} strokeWidth={2} className="text-tertiary" />
                </button>
                <button onClick={() => retapLine(i)} title="Set to current playhead position" className="p-1.5 rounded hover:bg-surface transition-colors shrink-0">
                  <Crosshair size={13} strokeWidth={2} className="text-tertiary" />
                </button>
                <span className="text-primary flex-1">{line.text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 pt-4 mt-2 border-t border-border shrink-0">
            <button
              onClick={saveReview}
              disabled={saving}
              className="bg-accent text-canvas text-sm font-medium px-4 py-2 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save timing"}
            </button>
            <button
              onClick={cancelReview}
              className="text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong transition-colors"
            >
              Cancel
            </button>
            {current?.id === track.id && (
              <button
                onClick={toggle}
                className="ml-auto p-2 rounded-full border border-border hover:border-border-strong transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause size={13} strokeWidth={2} /> : <Play size={13} strokeWidth={2} />}
              </button>
            )}
          </div>
          <p className="text-xs text-tertiary pt-3 shrink-0">
            Nudge a line with the arrows, click the crosshair to re-tap it against wherever the track is currently playing, or shift everything at once above if the whole sync is off by a consistent amount.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder="Paste or type the lyrics — one line per line."
        className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none resize-none font-mono"
      />
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={saveText}
          disabled={saving || text === initialLyrics}
          className="text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save text"}
        </button>
        <button
          onClick={startSync}
          disabled={!text.trim()}
          className="flex items-center gap-2 text-sm bg-accent text-canvas rounded-md px-4 py-2 hover:bg-accent-strong transition-colors disabled:opacity-40"
        >
          <Play size={13} strokeWidth={2} />
          {isSynced ? "Re-sync from scratch" : "Sync timing"}
        </button>
        {isSynced && (
          <button
            onClick={editExisting}
            className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors"
          >
            Edit timing
          </button>
        )}
        {isSynced && (
          <span className="text-xs text-tertiary flex items-center gap-1">
            <Check size={12} strokeWidth={2} className="text-accent" />
            Synced
          </span>
        )}
        {saved && <span className="text-xs text-tertiary">Saved</span>}
      </div>
    </div>
  );
}
