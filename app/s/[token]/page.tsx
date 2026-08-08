"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Download, Library, Check, MoreHorizontal, Shuffle } from "lucide-react";
import { useSession } from "next-auth/react";
import VinylArt from "@/components/VinylArt";
import { gradientFromSeed } from "@/lib/gradient";

type Track = {
  id: string;
  title: string;
  artist?: string | null;
  fileUrl: string;
  durationSec?: number | null;
  coverUrl?: string | null;
};

type ShareData =
  | { type: "track"; track: Track; allowDownload: boolean }
  | { type: "album"; album: { id: string; name: string; coverUrl?: string | null }; tracks: Track[]; allowDownload: boolean };

type Phase = "wrapped" | "unwrapping" | "revealed";

function fmt(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function totalDuration(tracks: Track[]) {
  const total = tracks.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  if (!total) return "";
  const m = Math.floor(total / 60);
  return `${m} min`;
}

// 3D tilt card — tracks cursor and applies perspective rotateX/Y.
function TiltCard({ children, size }: { children: React.ReactNode; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: -dy * 12, y: dx * 12 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ x: 0, y: 0 }); }}
      style={{
        width: size,
        height: size,
        perspective: "800px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: hovered
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.03)`
            : "rotateX(0deg) rotateY(0deg) scale(1)",
          transition: hovered ? "transform 80ms linear" : "transform 400ms ease",
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Cellophane wrap overlay — diagonal light streaks + red tag.
function CellophaneOverlay({ size, onClick }: { size: number; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.35, ease: "easeIn" }}
      className="absolute inset-0 rounded-full flex items-center justify-center"
      style={{ zIndex: 10 }}
      onClick={onClick}
    >
      {/* Cellophane streaks */}
      <div
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{ pointerEvents: "none" }}
      >
        <div
          style={{
            position: "absolute",
            inset: "-50%",
            background: `repeating-linear-gradient(
              62deg,
              transparent 0px,
              transparent 28px,
              rgba(255,255,255,0.06) 28px,
              rgba(255,255,255,0.06) 32px,
              transparent 32px,
              transparent 54px,
              rgba(255,255,255,0.10) 54px,
              rgba(255,255,255,0.10) 56px
            )`,
          }}
        />
        {/* Main specular streak */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(
              128deg,
              transparent 20%,
              rgba(255,255,255,0.13) 38%,
              rgba(255,255,255,0.22) 44%,
              rgba(255,255,255,0.13) 50%,
              transparent 68%
            )`,
          }}
        />
      </div>

      {/* Red tag */}
      <div
        style={{
          position: "absolute",
          bottom: size * 0.08,
          right: size * 0.08,
          zIndex: 20,
        }}
      >
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
          style={{
            background: "#d32f2f",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ fontSize: 10 }}>▶</span>
          click to open
        </div>
      </div>
    </motion.div>
  );
}

export default function SharePage({ params }: { params: { token: string } }) {
  const { data: session } = useSession();
  const userId = session?.user && (session.user as any).id;

  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("wrapped");
  const [spinning, setSpinning] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const tracks: Track[] = data
    ? data.type === "track"
      ? [data.track]
      : data.tracks
    : [];

  const coverUrl =
    data?.type === "album"
      ? data.album.coverUrl
      : data?.type === "track"
      ? (data.track as any).coverUrl ?? null
      : null;

  const title = data?.type === "album" ? data.album.name : data?.type === "track" ? data.track.title : "";
  const subtitle =
    data?.type === "album"
      ? `${tracks.length} track${tracks.length === 1 ? "" : "s"} · ${totalDuration(tracks)}`
      : data?.type === "track"
      ? data.track.artist || "Unknown artist"
      : "";

  const { from: gradFrom, to: gradTo } = gradientFromSeed(
    data?.type === "album" ? data.album.id : data?.type === "track" ? data.track.id : "default"
  );

  const VINYL_SIZE = 280;

  // Load share data.
  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "This link has expired." : "Link not found.");
        return r.json();
      })
      .then((d) => {
        if (d.track) setData({ type: "track", track: d.track, allowDownload: d.allowDownload });
        else if (d.album) setData({ type: "album", album: d.album, tracks: d.tracks, allowDownload: d.allowDownload });
      })
      .catch((e) => setError(e.message));
  }, [params.token]);

  // Create a content_follow row when a logged-in user views someone else's share.
  useEffect(() => {
    if (!data || !userId) return;
    fetch(`/api/share/${params.token}/follow`, { method: "POST" }).catch(() => {});
  }, [data, userId]);

  // Sync audio src when track changes.
  useEffect(() => {
    if (!tracks[currentTrackIndex]) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = tracks[currentTrackIndex].fileUrl;
    audio.onended = () => {
      if (currentTrackIndex < tracks.length - 1) {
        setCurrentTrackIndex((i) => i + 1);
        setPlaying(true);
      } else {
        setPlaying(false);
      }
    };
    if (playing) audio.play().catch(() => {});
  }, [currentTrackIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => {});
      // Record play event.
      fetch(`/api/share/${params.token}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: tracks[currentTrackIndex]?.id }),
      }).catch(() => {});
    } else {
      audio.pause();
    }
  }, [playing]);

  const handleUnwrap = () => {
    if (phase !== "wrapped") return;
    setPhase("unwrapping");
    // After cellophane exits, spin + fade the vinyl, then reveal.
    setTimeout(() => {
      setSpinning(true);
      setTimeout(() => setPhase("revealed"), 700);
    }, 350);
  };

  const toggle = (index?: number) => {
    if (index !== undefined && index !== currentTrackIndex) {
      setCurrentTrackIndex(index);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const shuffle = () => {
    const randomIndex = Math.floor(Math.random() * tracks.length);
    setCurrentTrackIndex(randomIndex);
    setPlaying(true);
  };

  const saveToLibrary = async () => {
    if (!userId) {
      window.location.href = `/login?next=/s/${params.token}`;
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/share/${params.token}/save`, { method: "POST" });
    if (res.ok) {
      setSaved(true);
    }
    setSaving(false);
  };

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-secondary text-base">{error}</p>
      </main>
    );
  }

  if (!data) return null;

  const currentTrack = tracks[currentTrackIndex];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-6 py-16 gap-0">

      {/* ── Wrapped / unwrapping phase ── */}
      {phase !== "revealed" && (
        <div className="flex flex-col items-center gap-8">
          <TiltCard size={VINYL_SIZE}>
            <div className="relative" style={{ width: VINYL_SIZE, height: VINYL_SIZE }}>
              {/* Vinyl */}
              <motion.div
                animate={
                  phase === "unwrapping" && spinning
                    ? { opacity: 0, scale: 0.7, rotate: 720 }
                    : { opacity: 1, scale: 1, rotate: 0 }
                }
                transition={{ duration: 0.65, ease: "easeIn" }}
              >
                <VinylArt
                  coverUrl={coverUrl}
                  spinning={spinning}
                  size={VINYL_SIZE}
                  gradientFrom={gradFrom}
                  gradientTo={gradTo}
                />
              </motion.div>

              {/* Cellophane */}
              <AnimatePresence>
                {phase === "wrapped" && (
                  <CellophaneOverlay size={VINYL_SIZE} onClick={handleUnwrap} />
                )}
              </AnimatePresence>
            </div>
          </TiltCard>

          {phase === "wrapped" && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-tertiary text-sm"
            >
              {title}
            </motion.p>
          )}
        </div>
      )}

      {/* ── Revealed phase ── */}
      <AnimatePresence>
        {phase === "revealed" && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="w-full max-w-lg flex flex-col sm:flex-row gap-8 sm:gap-10 items-start"
          >
            {/* Cover / vinyl */}
            <div className="shrink-0 self-center sm:self-start">
              <TiltCard size={200}>
                <VinylArt
                  coverUrl={coverUrl}
                  spinning={playing}
                  size={200}
                  gradientFrom={gradFrom}
                  gradientTo={gradTo}
                />
              </TiltCard>
            </div>

            {/* Metadata + controls */}
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wide text-tertiary mb-2">
                {data.type === "album" ? "Shared album" : "Shared track"}
              </p>
              <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-1 break-words">
                {title}
              </h1>
              <p className="text-secondary text-sm mb-6">{subtitle}</p>

              {/* Playback controls */}
              <div className="flex items-center gap-3 mb-8 flex-wrap">
                <button
                  onClick={() => toggle()}
                  className="w-11 h-11 rounded-full bg-accent text-canvas flex items-center justify-center hover:bg-accent-strong transition-colors shrink-0"
                >
                  {playing ? (
                    <Pause size={18} strokeWidth={2} />
                  ) : (
                    <Play size={18} strokeWidth={2} className="ml-0.5" />
                  )}
                </button>

                {tracks.length > 1 && (
                  <button
                    onClick={shuffle}
                    className="w-10 h-10 rounded-full border border-border text-secondary flex items-center justify-center hover:border-border-strong hover:text-primary transition-colors shrink-0"
                  >
                    <Shuffle size={15} strokeWidth={1.5} />
                  </button>
                )}

                {/* Save to library */}
                <button
                  onClick={saveToLibrary}
                  disabled={saving || saved}
                  className="flex items-center gap-2 text-sm border border-border rounded-full px-4 py-2 text-secondary hover:border-border-strong hover:text-primary transition-colors disabled:opacity-60"
                >
                  {saved ? (
                    <><Check size={14} strokeWidth={2} className="text-accent" /> Saved</>
                  ) : saving ? (
                    "Saving..."
                  ) : (
                    <><Library size={14} strokeWidth={1.5} /> Save to library</>
                  )}
                </button>

                {data.allowDownload && currentTrack && (
                  <a
                    href={currentTrack.fileUrl}
                    download
                    className="flex items-center gap-2 text-sm text-tertiary hover:text-secondary transition-colors"
                  >
                    <Download size={14} strokeWidth={1.5} />
                  </a>
                )}
              </div>

              {/* Track list (album shares) */}
              {tracks.length > 1 && (
                <div className="space-y-0.5">
                  {tracks.map((t, i) => (
                    <button
                      key={t.id}
                      onClick={() => toggle(i)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors group ${
                        i === currentTrackIndex && playing
                          ? "bg-surface"
                          : "hover:bg-surface"
                      }`}
                    >
                      <span className="text-xs text-tertiary w-4 tabular-nums text-right shrink-0">
                        {i === currentTrackIndex && playing ? (
                          <span className="text-accent">▶</span>
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`text-sm truncate block ${i === currentTrackIndex ? "text-primary font-medium" : "text-primary"}`}>
                          {t.title}
                        </span>
                        {t.artist && (
                          <span className="text-xs text-secondary truncate block">{t.artist}</span>
                        )}
                      </span>
                      <span className="text-xs text-tertiary tabular-nums shrink-0">{fmt(t.durationSec)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
