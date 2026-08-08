"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Music2, Check, LogIn } from "lucide-react";
import { gradientFromSeed } from "@/lib/gradient";

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

  return (
    <main className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <h1 className="text-2xl font-display font-bold text-primary tracking-tight mb-8">SONIQ</h1>

        {error ? (
          <p className="text-secondary text-sm">{error}</p>
        ) : !info ? (
          <p className="text-tertiary text-sm">Loading...</p>
        ) : joined ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
              <Check size={18} strokeWidth={2} className="text-canvas" />
            </div>
            <p className="text-primary text-sm font-medium">Added to your library. Redirecting...</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4 mb-8">
              {info.album.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.album.coverUrl} alt="" className="w-16 h-16 rounded-md object-cover shrink-0" />
              ) : (
                <div
                  className="w-16 h-16 rounded-md shrink-0 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
                >
                  <Music2 size={24} strokeWidth={1.5} className="text-white/60" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-bold text-primary font-display truncate">{info.album.name}</p>
                <p className="text-secondary text-sm mt-0.5">
                  {info.trackCount} track{info.trackCount === 1 ? "" : "s"}
                  {info.owner.username && <> · from <span className="text-primary">@{info.owner.username}</span></>}
                </p>
                {info.usesLeft !== null && (
                  <p className="text-xs text-tertiary mt-1">{info.usesLeft} invite{info.usesLeft === 1 ? "" : "s"} remaining</p>
                )}
              </div>
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
          </>
        )}
      </motion.div>
    </main>
  );
}
