"use client";

import { useState } from "react";
import { Play, Check } from "lucide-react";
import { usePlayer, Track } from "./PlayerProvider";
import type { SyncedLine } from "@/lib/lyricsSync";

export default function LyricsEditor({
  track,
  initialLyrics,
  initialSynced,
  onSaved,
}: {
  track: Track;
  initialLyrics: string;
  initialSynced: SyncedLine[] | null;
  onSaved: () => void;
}) {
  const { audioRef, play } = usePlayer();
  const [text, setText] = useState(initialLyrics);
  const [syncing, setSyncing] = useState(false);
  const [syncLines, setSyncLines] = useState<string[]>([]);
  const [captured, setCaptured] = useState<SyncedLine[]>([]);
  const [saving, setSaving] = useState(false);

  const saveText = async () => {
    setSaving(true);
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyrics: text }),
    });
    setSaving(false);
    onSaved();
  };

  const startSync = () => {
    const parsedLines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (parsedLines.length === 0) return;
    setSyncLines(parsedLines);
    setCaptured([]);
    setSyncing(true);
    play(track); // restarts this track from the beginning of the queue context
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const tapLine = () => {
    if (!audioRef.current) return;
    const idx = captured.length;
    if (idx >= syncLines.length) return;
    const newCaptured = [...captured, { time: audioRef.current.currentTime, text: syncLines[idx] }];
    setCaptured(newCaptured);
    if (newCaptured.length === syncLines.length) {
      finishSync(newCaptured);
    }
  };

  const finishSync = async (lines: SyncedLine[]) => {
    setSyncing(false);
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lyricsSynced: lines }),
    });
    onSaved();
  };

  const cancelSync = () => {
    setSyncing(false);
    if (audioRef.current) audioRef.current.pause();
  };

  if (syncing) {
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
          Play the track and tap the button in time with each line as it starts. Finishes automatically after the last line.
        </p>
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
      <div className="flex items-center gap-3">
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
          {initialSynced ? "Re-sync timing" : "Sync timing"}
        </button>
        {initialSynced && (
          <span className="text-xs text-tertiary flex items-center gap-1">
            <Check size={12} strokeWidth={2} className="text-accent" />
            Synced
          </span>
        )}
      </div>
    </div>
  );
}
