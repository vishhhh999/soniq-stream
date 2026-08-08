"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "./PlayerProvider";
import { useSession } from "next-auth/react";

// Renders nothing — purely fires POST /api/tracks/[id]/play when the
// current track changes. The endpoint is debounced server-side (60s),
// so scrubbing or rapid track switches don't inflate counts.
export default function PlayTracker() {
  const { current } = usePlayer();
  const { status } = useSession();
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !current) return;
    // Only fire once per track-id switch — the server handles the 60s
    // debounce for the same track being replayed.
    if (firedRef.current === current.id) return;
    firedRef.current = current.id;

    fetch(`/api/tracks/${current.id}/play`, { method: "POST" }).catch(() => {});
  }, [current?.id, status]);

  return null;
}
