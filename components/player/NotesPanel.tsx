"use client";

import { useEffect, useState, useRef } from "react";
import { Track } from "../PlayerProvider";

export default function NotesPanel({ track }: { track: Track }) {
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/tracks/${track.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((full) => { setNotes(full?.notes ?? ""); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [track.id]);

  const onChange = (value: string) => {
    setNotes(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await fetch(`/api/tracks/${track.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: value || null }),
      }).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    }, 500);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <h3 className="text-sm font-medium text-primary">Notes</h3>
        {saved && <span className="text-[11px] text-tertiary">Saved</span>}
      </div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        disabled={!loaded}
        placeholder="Mix notes, context, anything..."
        className="flex-1 w-full bg-canvas rounded-xl p-4 text-sm text-primary placeholder:text-tertiary resize-none outline-none disabled:opacity-50"
      />
    </div>
  );
}
