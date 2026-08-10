"use client";

import { useEffect, useState } from "react";
import { Loader2, Download, X, AudioLines, Volume2, VolumeX } from "lucide-react";
import { Track } from "../PlayerProvider";
import { useStemsEngine, StemName } from "@/lib/useStemsEngine";

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
  // Only wire up the live-mix engine once a job is actually completed —
  // passing null keeps useStemsEngine fully idle otherwise.
  const stemUrls = job?.status === "completed"
    ? {
        vocals: job.vocalsUrl ?? undefined,
        drums: job.drumsUrl ?? undefined,
        bass: job.bassUrl ?? undefined,
        other: job.otherUrl ?? undefined,
      }
    : null;
  const engine = useStemsEngine(stemUrls);

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

      {engine.error && (
        <div className="mb-3 bg-error/15 border border-error/40 rounded-lg px-3 py-2 text-xs text-error">
          {engine.error}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 flex-1">
        {STEMS.map(({ name, urlField }) => {
          const url = job?.status === "completed" ? job?.[urlField] : null;
          const isMuted = engine.muted[name as StemName];
          return (
            <button
              key={name}
              onClick={() => url && engine.ready && engine.toggleMute(name as StemName)}
              disabled={!url || !engine.ready}
              className={`rounded-xl flex flex-col items-center justify-between py-4 px-2 transition-colors ${
                url ? "bg-canvas hover:bg-canvas/70 cursor-pointer" : "bg-canvas"
              } disabled:cursor-default`}
            >
              <div className="flex-1 flex items-center justify-center text-tertiary">
                {job?.status === "processing" || (url && engine.loading) ? (
                  <Loader2 size={18} strokeWidth={1.5} className="animate-spin" />
                ) : url && engine.ready ? (
                  isMuted ? (
                    <VolumeX size={18} strokeWidth={1.5} className="text-tertiary" />
                  ) : (
                    <Volume2 size={18} strokeWidth={1.5} className="text-accent" />
                  )
                ) : (
                  <AudioLines size={18} strokeWidth={1.5} className={url ? "text-primary" : ""} />
                )}
              </div>
              <p className={`text-xs mt-3 ${isMuted ? "text-tertiary" : "text-secondary"}`}>{name}</p>
              {url ? (
                <a
                  href={url}
                  download
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 text-tertiary hover:text-primary transition-colors"
                  title={`Download ${name}`}
                >
                  <Download size={13} strokeWidth={1.5} />
                </a>
              ) : (
                <span className="mt-2 w-1 h-1 rounded-full bg-tertiary/40" />
              )}
            </button>
          );
        })}
      </div>

      {job?.status === "processing" && (
        <p className="text-xs text-tertiary text-center mt-4">
          Separating stems — this can take a few minutes.
        </p>
      )}
      {job?.status === "completed" && engine.loading && (
        <p className="text-xs text-tertiary text-center mt-4">
          Loading stems for live playback...
        </p>
      )}
      {job?.status === "completed" && engine.ready && (
        <p className="text-xs text-tertiary text-center mt-4">
          Tap a stem to mute or unmute it during playback.
        </p>
      )}
    </div>
  );
}
