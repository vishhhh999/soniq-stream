"use client";

import { useEffect, useState } from "react";
import { Loader2, Download, X, AudioLines } from "lucide-react";
import { Track } from "../PlayerProvider";

const STEMS: { name: string; urlField: "vocalsUrl" | "drumsUrl" | "bassUrl" | "otherUrl" }[] = [
  { name: "vocals", urlField: "vocalsUrl" },
  { name: "drums", urlField: "drumsUrl" },
  { name: "bass", urlField: "bassUrl" },
  { name: "other", urlField: "otherUrl" },
];

export default function StemsPanel({ track }: { track: Track }) {
  const [job, setJob] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/tracks/${track.id}/stems`)
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((d) => { if (!cancelled) { setJob(d?.job ?? null); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [track.id]);

  // Same status-keyed polling pattern as TrackDetail — a fresh interval
  // spins up every time a job goes back to "processing", so re-running
  // extraction after a finished/failed job doesn't leave the UI stuck.
  useEffect(() => {
    if (job?.status !== "processing") return;
    let cancelled = false;
    const interval = setInterval(() => {
      fetch(`/api/tracks/${track.id}/stems`)
        .then((r) => (r.ok ? r.json().catch(() => null) : null))
        .then((d) => { if (!cancelled) setJob(d?.job ?? null); })
        .catch(() => {});
    }, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [track.id, job?.status]);

  const extract = async () => {
    setExtracting(true); setError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/stems`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Couldn't start stem extraction (${res.status}).`);
      setJob(data.job);
    } catch (e: any) {
      setError(e.message || "Couldn't start stem extraction.");
    }
    setExtracting(false);
  };

  const cancel = async () => {
    setError(null);
    try {
      const res = await fetch(`/api/tracks/${track.id}/stems`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Couldn't cancel.");
      setJob((j: any) => (j ? { ...j, status: "failed", errorMessage: "Cancelled." } : j));
    } catch (e: any) {
      setError(e.message || "Couldn't cancel.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-1 pb-4">
        <div>
          <h3 className="text-sm font-medium text-primary">Stems</h3>
          <p className="text-xs text-tertiary mt-0.5">Split your track into stems</p>
        </div>
        {loaded && (!job || job.status === "failed" || job.status === "expired") && (
          <button
            onClick={extract}
            disabled={extracting}
            className="text-[11px] uppercase tracking-wide px-4 py-2 rounded-full bg-accent text-on-accent hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {extracting ? "Starting..." : "Generate"}
          </button>
        )}
        {job?.status === "processing" && (
          <button
            onClick={cancel}
            className="text-[11px] uppercase tracking-wide px-3 py-1.5 rounded-full bg-canvas text-tertiary hover:text-error transition-colors flex items-center gap-1.5"
          >
            <X size={12} strokeWidth={2} /> Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 bg-error/15 border border-error/40 rounded-lg px-3 py-2 text-xs text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 flex-1">
        {STEMS.map(({ name, urlField }) => {
          const url = job?.status === "completed" ? job?.[urlField] : null;
          return (
            <div
              key={name}
              className="rounded-xl bg-canvas flex flex-col items-center justify-between py-4 px-2"
            >
              <div className="flex-1 flex items-center justify-center text-tertiary">
                {job?.status === "processing" ? (
                  <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
                ) : (
                  <AudioLines size={18} strokeWidth={1.5} className={url ? "text-primary" : ""} />
                )}
              </div>
              <p className="text-xs text-secondary mt-3">{name}</p>
              {url ? (
                <a
                  href={url}
                  download
                  className="mt-2 text-tertiary hover:text-primary transition-colors"
                  title={`Download ${name}`}
                >
                  <Download size={13} strokeWidth={1.5} />
                </a>
              ) : (
                <span className="mt-2 w-1 h-1 rounded-full bg-tertiary/40" />
              )}
            </div>
          );
        })}
      </div>

      {job?.status === "processing" && (
        <p className="text-xs text-tertiary text-center mt-4">
          Separating stems — this can take a few minutes.
        </p>
      )}
      {job?.status === "completed" && (
        <p className="text-xs text-tertiary text-center mt-4">
          Ready — download individually above. Live solo/mute during playback is coming soon.
        </p>
      )}
    </div>
  );
}
