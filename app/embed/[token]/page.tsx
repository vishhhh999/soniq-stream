"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { Play, Pause, SkipBack, SkipForward, Download } from "lucide-react";
import { waveformBars } from "@/lib/waveformBars";
import { gradientFromSeed } from "@/lib/gradient";

type EmbedTrack = {
  id: string;
  title: string;
  artist: string | null;
  fileUrl: string;
  durationSec: number | null;
  albumCoverUrl?: string | null;
};

// Standalone embeddable player — deliberately NOT using PlayerProvider,
// AuthedPlayerShell, or any part of the authenticated app shell. This
// route is meant to be dropped into an <iframe> on someone else's site by
// a visitor who has never logged into SONIQ and never will for this
// purpose, so it has its own minimal audio element and its own tiny
// self-contained UI rather than depending on app-wide context providers.
//
// Reuses GET /api/share/[token] rather than a new endpoint — that route
// already enforces the real permission surface (shareLinks.active check,
// expiry, allowDownload) via the exact same logic the /s/[token] page
// uses. There is no separate "make this embeddable" flag: anything
// embeddable here is exactly and only what's already shareable via an
// active link. Revoking a share link (TrackDetail's Share row) kills the
// embed too, automatically, since both read the same active flag.
export default function EmbedPage() {
  const params = useParams();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [tracks, setTracks] = useState<EmbedTrack[]>([]);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "expired" : "not found");
        return r.json();
      })
      .then((d) => {
        setAllowDownload(!!d.allowDownload);
        if (d.album) {
          setTracks(
            (d.tracks || []).map((t: any) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              fileUrl: t.fileUrl,
              durationSec: t.durationSec,
              albumCoverUrl: d.album.coverUrl,
            }))
          );
        } else if (d.track) {
          setTracks([
            {
              id: d.track.id,
              title: d.track.title,
              artist: d.track.artist,
              fileUrl: d.track.fileUrl,
              durationSec: d.track.durationSec,
              albumCoverUrl: d.track.albumCoverUrl ?? null,
            },
          ]);
        }
        setOwnerUsername(d.owner?.username ?? null);
      })
      .catch((e) => setError(e.message === "expired" ? "This link has expired." : "This link isn't available."))
      .finally(() => setLoading(false));
  }, [token]);

  const active = tracks[activeIndex];
  const bars = useMemo(() => (active ? waveformBars(active.id, 40) : []), [active?.id]);
  const gradient = useMemo(() => (active ? gradientFromSeed(active.id) : { from: "#888", to: "#444" }), [active?.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !active) return;
    audio.src = active.fileUrl;
    audio.load();
    setCurrentTime(0);
    setDuration(active.durationSec || 0);
    if (isPlaying) audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const skip = (dir: 1 | -1) => {
    if (tracks.length < 2) return;
    const next = (activeIndex + dir + tracks.length) % tracks.length;
    setActiveIndex(next);
  };

  const seek = (t: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (loading) {
    return (
      <div className="w-full h-full min-h-[120px] flex items-center justify-center bg-[#161616]">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !active) {
    return (
      <div className="w-full h-full min-h-[120px] flex items-center justify-center bg-[#161616] px-4">
        <p className="text-sm text-white/50 text-center">{error || "This link isn't available."}</p>
      </div>
    );
  }

  const playedRatio = duration ? Math.min(1, currentTime / duration) : 0;

  return (
    <div className="w-full h-full bg-[#161616] text-white px-4 py-3 flex flex-col gap-3 font-sans select-none">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || active.durationSec || 0)}
        onEnded={() => (tracks.length > 1 ? skip(1) : setIsPlaying(false))}
      />

      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-md shrink-0 overflow-hidden"
          style={{
            background: active.albumCoverUrl
              ? undefined
              : `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
          }}
        >
          {active.albumCoverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={active.albumCoverUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{active.title}</p>
          <p className="text-xs text-white/50 truncate">{active.artist || ownerUsername || "Unknown artist"}</p>
        </div>
        {allowDownload && (
          <a
            href={active.fileUrl}
            download
            className="text-white/40 hover:text-white/80 transition-colors shrink-0"
            title="Download"
          >
            <Download size={15} strokeWidth={1.5} />
          </a>
        )}
      </div>

      <div className="flex items-center gap-2">
        {tracks.length > 1 && (
          <button onClick={() => skip(-1)} aria-label="Previous track" className="text-white/50 hover:text-white transition-colors shrink-0">
            <SkipBack size={14} strokeWidth={1.5} />
          </button>
        )}
        <button
          onClick={toggle}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#e8650a" }}
        >
          {isPlaying ? <Pause size={12} strokeWidth={2} className="text-white" /> : <Play size={12} strokeWidth={2} className="text-white ml-0.5" />}
        </button>
        {tracks.length > 1 && (
          <button onClick={() => skip(1)} aria-label="Next track" className="text-white/50 hover:text-white transition-colors shrink-0">
            <SkipForward size={14} strokeWidth={1.5} />
          </button>
        )}

        <div className="relative flex-1 h-4 flex items-center group ml-1">
          <div className="flex items-center gap-[2px] w-full h-full justify-between">
            {bars.map((h, i) => {
              const pos = bars.length > 1 ? i / (bars.length - 1) : 0;
              return (
                <div
                  key={i}
                  className="rounded-[1px] shrink-0"
                  style={{
                    width: "2px",
                    height: `${h * 100}%`,
                    backgroundColor: pos <= playedRatio ? "#ffffff" : "rgba(255,255,255,0.25)",
                  }}
                />
              );
            })}
          </div>
          <div
            className="absolute top-0 bottom-0 w-[2px] pointer-events-none rounded-full"
            style={{ left: `${playedRatio * 100}%`, backgroundColor: "#e8650a" }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek"
            disabled={!duration}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <span className="text-[10px] text-white/40 tabular-nums shrink-0 w-16 text-right">
          {fmt(currentTime)} / {fmt(duration)}
        </span>
      </div>

      {tracks.length > 1 && (
        <div className="max-h-16 overflow-y-auto no-scrollbar -mx-1">
          {tracks.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveIndex(i)}
              className={`w-full text-left px-1 py-1 text-xs rounded flex items-center justify-between transition-colors ${
                i === activeIndex ? "text-white bg-white/10" : "text-white/50 hover:text-white/80"
              }`}
            >
              <span className="truncate">{t.title}</span>
              <span className="shrink-0 ml-2 tabular-nums text-white/30">{fmt(t.durationSec || 0)}</span>
            </button>
          ))}
        </div>
      )}

      <a
        href="https://www.soniq.lol"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-end gap-1 text-[10px] text-white/30 hover:text-white/50 transition-colors"
      >
        via SONIQ
      </a>
    </div>
  );
}
