"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, LogIn, Play, Pause, Shuffle, Download } from "lucide-react";
import VinylArt from "@/components/VinylArt";
import { gradientFromSeed } from "@/lib/gradient";
import { useDeviceTilt } from "@/lib/useDeviceTilt";

type Phase = "wrapped" | "unwrapping" | "revealed";

type InviteTrack = {
  id: string;
  title: string;
  artist?: string | null;
  fileUrl: string;
  durationSec?: number | null;
};

function fmt(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

// Same 3D tilt interaction as the /s/[token] share page — mouse-hover on
// desktop, phone gyroscope on touch devices.
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
  const tiltActive = isTouchDevice || hovered;

  return (
    <div
      ref={ref}
      onMouseMove={isTouchDevice ? undefined : onMove}
      onMouseEnter={isTouchDevice ? undefined : () => setHovered(true)}
      onMouseLeave={isTouchDevice ? undefined : () => { setHovered(false); setMouseTilt({ x: 0, y: 0 }); }}
      onTouchStart={isTouchDevice && needsPermission ? () => requestPermission() : undefined}
      style={{ width: size, height: size, perspective: "800px" }}
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

// Cellophane wrap overlay — diagonal light streaks + red tag. Identical to
// the share page's version, kept in sync so both flows feel like the same
// physical object.
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
      <div className="absolute inset-0 rounded-full overflow-hidden" style={{ pointerEvents: "none" }}>
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

      <div style={{ position: "absolute", bottom: size * 0.08, right: size * 0.08, zIndex: 20 }}>
        <div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
          style={{ background: "#d32f2f", boxShadow: "0 2px 8px rgba(0,0,0,0.4)", whiteSpace: "nowrap" }}
        >
          <span style={{ fontSize: 10 }}>▶</span>
          click to open
        </div>
      </div>
    </motion.div>
  );
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const [phase, setPhase] = useState<Phase>("wrapped");
  const [spinning, setSpinning] = useState(false);

  // Playback — anonymous listeners can play the album without an account,
  // same as the /s/[token] share page. Only "Accept invite" (which saves
  // the album into the viewer's own library) needs sign-in.
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tracksList: InviteTrack[] = info?.tracks ?? [];

  useEffect(() => {
    fetch(`/api/invite/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invite link is invalid or has expired.");
        return r.json();
      })
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [params.token]);

  // Sync audio src when the track changes.
  useEffect(() => {
    if (!tracksList[currentTrackIndex]) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    audio.src = tracksList[currentTrackIndex].fileUrl;
    audio.onended = () => {
      if (currentTrackIndex < tracksList.length - 1) {
        setCurrentTrackIndex((i) => i + 1);
        setPlaying(true);
      } else {
        setPlaying(false);
      }
    };
    if (playing) audio.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackIndex, tracksList.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.play().catch(() => {});
    else audio.pause();
  }, [playing]);

  const toggle = (index?: number) => {
    if (index !== undefined && index !== currentTrackIndex) {
      setCurrentTrackIndex(index);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const shuffle = () => {
    const randomIndex = Math.floor(Math.random() * tracksList.length);
    setCurrentTrackIndex(randomIndex);
    setPlaying(true);
  };

  const handleUnwrap = () => {
    if (phase !== "wrapped") return;
    setPhase("unwrapping");
    // Cellophane exits first, then the vinyl spins and fades before the
    // full invite details reveal underneath — same beat as the share page.
    setTimeout(() => {
      setSpinning(true);
      setTimeout(() => setPhase("revealed"), 700);
    }, 350);
  };

  const accept = async () => {
    if (status !== "authenticated") {
      router.push(`/login?next=/invite/${params.token}`);
      return;
    }
    setJoining(true);
    const res = await fetch(`/api/invite/${params.token}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Failed to join.");
      setJoining(false);
      return;
    }
    setJoined(true);
    setTimeout(() => router.push(`/album/${data.albumId}`), 1200);
  };

  const { from: gradFrom, to: gradTo } = gradientFromSeed(info?.album?.id ?? "default");
  const VINYL_SIZE = 200;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-6 py-16">
      {error ? (
        <p className="text-secondary text-sm">{error}</p>
      ) : !info ? (
        <div className="w-6 h-6 border-2 border-border border-t-accent rounded-full animate-spin" />
      ) : joined ? (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
            <Check size={18} strokeWidth={2} className="text-canvas" />
          </div>
          <p className="text-primary text-sm font-medium">Added to your library. Redirecting...</p>
        </div>
      ) : (
        <>
          {/* ── Wrapped / unwrapping phase ── */}
          {phase !== "revealed" && (
            <div className="flex flex-col items-center gap-8">
              <TiltCard size={VINYL_SIZE}>
                <div className="relative" style={{ width: VINYL_SIZE, height: VINYL_SIZE }}>
                  <motion.div
                    animate={
                      phase === "unwrapping" && spinning
                        ? { opacity: 0, scale: 0.7, rotate: 720 }
                        : { opacity: 1, scale: 1, rotate: 0 }
                    }
                    transition={{ duration: 0.65, ease: "easeIn" }}
                  >
                    <VinylArt
                      coverUrl={info.album.coverUrl}
                      spinning={spinning}
                      size={VINYL_SIZE}
                      gradientFrom={gradFrom}
                      gradientTo={gradTo}
                    />
                  </motion.div>

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
                  {info.album.name}
                </motion.p>
              )}
            </div>
          )}

          {/* ── Revealed phase — invite details + accept button ── */}
          <AnimatePresence>
            {phase === "revealed" && (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
                className="flex flex-col items-center gap-8 w-full max-w-sm"
              >
                <TiltCard size={VINYL_SIZE}>
                  <VinylArt
                    coverUrl={info.album.coverUrl}
                    spinning={playing}
                    size={VINYL_SIZE}
                    gradientFrom={gradFrom}
                    gradientTo={gradTo}
                  />
                </TiltCard>

                <div className="text-center">
                  <p className="text-xs uppercase tracking-wide text-tertiary mb-2">You're invited</p>
                  <h1 className="text-2xl font-display font-bold text-primary tracking-tight break-words">
                    {info.album.name}
                  </h1>
                  <p className="text-secondary text-sm mt-1">
                    {info.trackCount} track{info.trackCount === 1 ? "" : "s"}
                    {info.owner.username && <> · from <span className="text-primary">@{info.owner.username}</span></>}
                  </p>
                  {info.usesLeft !== null && (
                    <p className="text-xs text-tertiary mt-1">
                      {info.usesLeft} invite{info.usesLeft === 1 ? "" : "s"} remaining
                    </p>
                  )}
                </div>

                {/* Playback — no sign-in required, matches /s/[token] */}
                {tracksList.length > 0 && (
                  <div className="flex items-center gap-3 flex-wrap justify-center">
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

                    {tracksList.length > 1 && (
                      <button
                        onClick={shuffle}
                        className="w-10 h-10 rounded-full border border-border text-secondary flex items-center justify-center hover:border-border-strong hover:text-primary transition-colors shrink-0"
                      >
                        <Shuffle size={15} strokeWidth={1.5} />
                      </button>
                    )}

                    {info.allowDownload && tracksList.length > 0 && (
                      <a
                        href={`/api/invite/${params.token}/download`}
                        className="flex items-center gap-2 text-sm text-tertiary hover:text-secondary transition-colors"
                      >
                        <Download size={14} strokeWidth={1.5} />
                      </a>
                    )}
                  </div>
                )}

                {/* Track list */}
                {tracksList.length > 1 && (
                  <div className="w-full space-y-0.5">
                    {tracksList.map((t, i) => (
                      <button
                        key={t.id}
                        onClick={() => toggle(i)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors group ${
                          i === currentTrackIndex && playing ? "bg-surface" : "hover:bg-surface"
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
                          {t.artist && <span className="text-xs text-secondary truncate block">{t.artist}</span>}
                        </span>
                        <span className="text-xs text-tertiary tabular-nums shrink-0">{fmt(t.durationSec)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Accept invite — this is the only thing that actually requires sign-in */}
                {status === "unauthenticated" ? (
                  <button
                    onClick={accept}
                    className="w-full flex items-center justify-center gap-2 bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors"
                  >
                    <LogIn size={15} strokeWidth={1.5} />
                    Sign in to add to your library
                  </button>
                ) : (
                  <button
                    onClick={accept}
                    disabled={joining}
                    className="w-full bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors disabled:opacity-50"
                  >
                    {joining ? "Adding to library..." : "Accept invite"}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </main>
  );
}
