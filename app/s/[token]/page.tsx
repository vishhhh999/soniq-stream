"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Pause, Download, Library, Check, Shuffle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useIsMobile } from "@/lib/useMediaQuery";
import VinylArt from "@/components/VinylArt";
import { gradientFromSeed } from "@/lib/gradient";
import { useDeviceTilt } from "@/lib/useDeviceTilt";

type Track = {
  id: string;
  title: string;
  artist?: string | null;
  fileUrl: string;
  durationSec?: number | null;
  coverUrl?: string | null;
};

type Owner = { username: string | null; avatarUrl: string | null };

type ShareData =
  | { type: "track"; track: Track; allowDownload: boolean; owner: Owner }
  | { type: "album"; album: { id: string; name: string; coverUrl?: string | null }; tracks: Track[]; allowDownload: boolean; owner: Owner };

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

// 3D tilt card — mouse-hover perspective tilt on desktop, phone gyroscope
// tilt on touch devices (there's no hover to drive it there).
function TiltCard({ children, size }: { children: React.ReactNode; size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mouseTilt, setMouseTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const { tilt: gyroTilt, isTouchDevice, needsPermission, requestPermission } = useDeviceTilt();

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setMouseTilt({ x: -dy * 12, y: dx * 12 });
  };

  const tilt = isTouchDevice ? gyroTilt : mouseTilt;
  // Gyro tilt is "always on" once permission is granted — no hover state
  // to gate it behind. Mouse tilt only applies while actively hovering.
  const tiltActive = isTouchDevice || hovered;

  return (
    <div
      ref={ref}
      onMouseMove={isTouchDevice ? undefined : onMove}
      onMouseEnter={isTouchDevice ? undefined : () => setHovered(true)}
      onMouseLeave={isTouchDevice ? undefined : () => { setHovered(false); setMouseTilt({ x: 0, y: 0 }); }}
      onTouchStart={isTouchDevice && needsPermission ? () => requestPermission() : undefined}
      style={{ width: size, height: size, perspective: "800px", cursor: "pointer" }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: tiltActive
            ? `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${!isTouchDevice && hovered ? 1.03 : 1})`
            : "rotateX(0deg) rotateY(0deg) scale(1)",
          transition: isTouchDevice ? "transform 150ms linear" : hovered ? "transform 80ms linear" : "transform 400ms ease",
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
      className="absolute inset-0 rounded-full flex items-center justify-center cursor-pointer"
      style={{ zIndex: 10 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label="Unwrap"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
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


// Small avatar + "Shared by @username" row shown on the revealed share page.
function SharedByBadge({ owner, gradFrom, gradTo }: { owner: Owner; gradFrom: string; gradTo: string }) {
  if (!owner.username && !owner.avatarUrl) return null;
  const label = owner.username?.[0]?.toUpperCase() ?? '?';
  return (
    <div className="flex items-center gap-2 mb-4">
      <div
        className="w-6 h-6 rounded-full overflow-hidden shrink-0"
        style={{ background: owner.avatarUrl ? undefined : `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
      >
        {owner.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={owner.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white">{label}</span>
        )}
      </div>
      <span className="text-xs text-tertiary">
        Shared by{' '}
        {owner.username ? <span className="text-secondary">@{owner.username}</span> : 'someone'}
      </span>
    </div>
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
  // Tracks which track id has already crossed the minimum-listen threshold
  // and been counted, so the timeupdate handler doesn't re-fire every tick.
  const playFiredRef = useRef<string | null>(null);

  const tracks: Track[] = data
    ? data.type === "track"
      ? [data.track]
      : data.tracks
    : [];

  const owner: Owner = data ? (data as any).owner ?? { username: null, avatarUrl: null } : { username: null, avatarUrl: null };

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

  const isMobile = useIsMobile();
  // Fixed 280px overflowed narrow phones (px-6 page padding + 280px vinyl
  // exceeds a 320-375px viewport). Scale it down on mobile so it always
  // fits with room to spare.
  const VINYL_SIZE = isMobile ? 220 : 280;

  // Load share data.
  useEffect(() => {
    fetch(`/api/share/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 410 ? "This link has expired." : "Link not found.");
        return r.json();
      })
      .then((d) => {
        const owner: Owner = { username: d.owner?.username ?? null, avatarUrl: d.owner?.avatarUrl ?? null };
        if (d.track) {
          setData({ type: "track", track: d.track, allowDownload: d.allowDownload, owner });
        } else if (d.album) {
          setData({ type: "album", album: d.album, tracks: d.tracks ?? [], allowDownload: d.allowDownload, owner });
        } else {
          // Response was 200 but had neither shape — surface it instead of
          // leaving the page blank forever with no feedback.
          setError(d.error || "This link doesn't point to anything anymore.");
        }
      })
      .catch((e) => setError(e.message || "Couldn't load this link. Check your connection and try again."));
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
    playFiredRef.current = null; // new track — eligible to count again once it's actually played
    audio.onended = () => {
      if (currentTrackIndex < tracks.length - 1) {
        setCurrentTrackIndex((i) => i + 1);
        setPlaying(true);
      } else {
        setPlaying(false);
      }
    };
    // Previously fired the play-count POST the instant playback started —
    // so a track that got skipped a second in, or never actually loaded,
    // still counted as a play and could still notify the owner. Now
    // requires real elapsed playback (same threshold as the in-app
    // PlayTracker) before counting.
    const MIN_LISTEN_SECONDS = 20;
    const onTimeUpdate = () => {
      const track = tracks[currentTrackIndex];
      if (!track || playFiredRef.current === track.id) return;
      const threshold =
        audio.duration > 0 && Number.isFinite(audio.duration)
          ? Math.min(MIN_LISTEN_SECONDS, audio.duration * 0.8)
          : MIN_LISTEN_SECONDS;
      if (audio.currentTime < threshold) return;
      playFiredRef.current = track.id;
      fetch(`/api/share/${params.token}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    if (playing) audio.play().catch(() => {});
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [currentTrackIndex, tracks.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.play().catch(() => {});
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

  if (!data) {
    // Was rendering nothing here before — on a slow connection or cold
    // serverless start this looked exactly like "the page isn't loading."
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-5 sm:px-6 py-12 sm:py-16 gap-0 overflow-x-hidden">

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
              className="text-tertiary text-sm text-center max-w-[90vw] px-2 truncate"
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
              <TiltCard size={isMobile ? 160 : 200}>
                <VinylArt
                  coverUrl={coverUrl}
                  spinning={playing}
                  size={isMobile ? 160 : 200}
                  gradientFrom={gradFrom}
                  gradientTo={gradTo}
                />
              </TiltCard>
            </div>

            {/* Metadata + controls */}
            <div className="flex-1 min-w-0">
              <SharedByBadge owner={owner} gradFrom={gradFrom} gradTo={gradTo} />
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
                  className="w-11 h-11 rounded-full bg-accent text-on-accent flex items-center justify-center hover:bg-accent-strong transition-colors shrink-0"
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
                    aria-label="Shuffle and play"
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

                {/* Download — requires sign-in now (was fully anonymous
                    before, which wasn't safe: anyone with the link could
                    pull the raw file with no identity behind it). Playback
                    above stays anonymous. */}
                {data.allowDownload && userId && (
                  <a
                    href={`/api/share/${params.token}/download`}
                    className="flex items-center gap-2 text-sm text-tertiary hover:text-secondary transition-colors"
                  >
                    <Download size={14} strokeWidth={1.5} />
                  </a>
                )}
                {data.allowDownload && !userId && (
                  <a
                    href={`/login?next=/s/${params.token}`}
                    className="flex items-center gap-2 text-xs text-tertiary hover:text-secondary transition-colors"
                  >
                    <Download size={14} strokeWidth={1.5} />
                    Sign in to download
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
