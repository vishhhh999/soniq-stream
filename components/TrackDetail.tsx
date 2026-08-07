"use client";

import { useEffect, useRef, useState } from "react";
import { X, Link2, Check } from "lucide-react";
import type { Track } from "./PlayerProvider";

export default function TrackDetail({ track, onClose, onSaved }: { track: Track; onClose: () => void; onSaved: () => void }) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [bpm, setBpm] = useState(track.bpm ?? "");
  const [key, setKey] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let ws: any;
    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      const RegionsPlugin = (await import("wavesurfer.js/dist/plugins/regions.js")).default;
      if (!waveformRef.current) return;

      const regions = RegionsPlugin.create();
      ws = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "var(--border-strong)",
        progressColor: "var(--accent)",
        cursorColor: "var(--accent)",
        height: 72,
        barWidth: 2,
        barGap: 2,
        barRadius: 2,
        url: track.fileUrl,
        plugins: [regions],
      });

      ws.on("decode", () => {
        // default trim region spans the full track — drag handles to set in/out points
        regions.addRegion({
          start: 0,
          end: ws.getDuration(),
          color: "rgba(200, 185, 154, 0.15)",
          drag: true,
          resize: true,
        });
      });

      wsRef.current = ws;
    })();

    return () => ws?.destroy();
  }, [track.fileUrl]);

  const saveTrim = async () => {
    const region = wsRef.current?.plugins?.[0]?.getRegions?.()?.[0];
    await fetch(`/api/tracks/${track.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bpm: bpm === "" ? null : Number(bpm),
        key: key || null,
        trimStart: region?.start ?? null,
        trimEnd: region?.end ?? null,
      }),
    });
    onSaved();
  };

  const createShare = async () => {
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: track.id, expiresInDays: 30 }),
    });
    const link = await res.json();
    const url = `${window.location.origin}/s/${link.token}`;
    setShareUrl(url);
  };

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-elevated border-l border-border z-40 flex flex-col">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-md font-medium text-primary truncate">{track.title}</h3>
          <p className="text-sm text-secondary truncate">{track.artist || "Unknown artist"}</p>
        </div>
        <button onClick={onClose} className="text-tertiary hover:text-primary transition-colors shrink-0 ml-4">
          <X size={18} strokeWidth={1.5} />
        </button>
      </div>

      <div className="p-6 space-y-8 overflow-y-auto flex-1">
        <div>
          <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Trim / loop region</label>
          <div ref={waveformRef} className="waveform-container" />
          <p className="text-xs text-tertiary mt-2">Drag the handles on the waveform to set in/out points, then save.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">BPM (estimated)</label>
            <input
              value={bpm}
              onChange={(e) => setBpm(e.target.value === "" ? "" : Number(e.target.value))}
              type="number"
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
              placeholder="—"
            />
            {track.bpm != null && <p className="text-xs text-tertiary mt-1">Auto-detected — correct if off.</p>}
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-tertiary mb-2 block">Key</label>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-primary focus:border-border-strong outline-none"
              placeholder="e.g. A minor"
            />
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <label className="text-xs uppercase tracking-wide text-tertiary mb-3 block">Share</label>
          {!shareUrl ? (
            <button
              onClick={createShare}
              className="flex items-center gap-2 text-sm text-secondary border border-border rounded-md px-4 py-2 hover:border-border-strong hover:text-primary transition-colors"
            >
              <Link2 size={14} strokeWidth={1.5} />
              Generate share link
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input readOnly value={shareUrl} className="flex-1 bg-surface border border-border rounded-md px-3 py-2 text-xs text-secondary" />
              <button onClick={copy} className="w-9 h-9 flex items-center justify-center rounded-md border border-border hover:border-border-strong shrink-0">
                {copied ? <Check size={14} className="text-accent" /> : <Link2 size={14} className="text-secondary" />}
              </button>
            </div>
          )}
          <p className="text-xs text-tertiary mt-2">Link expires in 30 days. No account needed to listen.</p>
        </div>
      </div>

      <div className="p-6 border-t border-border">
        <button onClick={saveTrim} className="w-full bg-accent text-canvas text-sm font-medium py-2.5 rounded-md hover:bg-accent-strong transition-colors">
          Save changes
        </button>
      </div>
    </div>
  );
}
