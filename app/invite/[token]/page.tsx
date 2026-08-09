"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Check, LogIn } from "lucide-react";
import VinylArt from "@/components/VinylArt";
import { gradientFromSeed } from "@/lib/gradient";

// Same 3D tilt interaction as the /s/[token] share page — tracks cursor
// position and applies perspective rotateX/Y so the vinyl feels physical.
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
      style={{ width: size, height: size, perspective: "800px" }}
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

export default function InvitePage({ params }: { params: { token: string } }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    fetch(`/api/invite/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invite link is invalid or has expired.");
        return r.json();
      })
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [params.token]);

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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-8 w-full max-w-sm"
        >
          <TiltCard size={VINYL_SIZE}>
            <VinylArt
              coverUrl={info.album.coverUrl}
              spinning={false}
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

          {status === "unauthenticated" ? (
            <button
              onClick={accept}
              className="w-full flex items-center justify-center gap-2 bg-accent text-canvas text-sm font-medium py-3 rounded-md hover:bg-accent-strong transition-colors"
            >
              <LogIn size={15} strokeWidth={1.5} />
              Sign in to accept invite
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
    </main>
  );
}
