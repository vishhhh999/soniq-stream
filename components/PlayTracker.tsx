"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "./PlayerProvider";
import { useSession } from "next-auth/react";

// Previously fired the instant a track was requested (current.id changed),
// so a track that 404'd, got skipped a second in, or crossfaded away from
// before it really started still counted as a "play" and could still
// trigger an owner notification for share-page listens. Insights is a core
// feature of the app — an inflated number there is a real bug, not a nice-
// to-have. Now requires actual elapsed playback before counting, matching
// the general shape of how streaming services define a "play" (commonly
// ~30s; using a shorter 20s here since this app is explicitly for
// work-in-progress demos, which are often under a minute).
const MIN_LISTEN_SECONDS = 20;

export default function PlayTracker() {
  const { current, currentTime, duration } = usePlayer();
  const { status } = useSession();
  // Tracks which track id has already been counted, so we don't re-fire on
  // every timeupdate tick once the threshold's been crossed once.
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !current) return;
    if (firedRef.current === current.id) return;

    // Short tracks shouldn't need the full 20s to register — cap the
    // threshold at 80% of the track's own duration once it's known.
    const threshold =
      duration > 0 ? Math.min(MIN_LISTEN_SECONDS, duration * 0.8) : MIN_LISTEN_SECONDS;

    if (currentTime < threshold) return;

    firedRef.current = current.id;
    fetch(`/api/tracks/${current.id}/play`, { method: "POST" }).catch(() => {});
  }, [current?.id, currentTime, duration, status]);

  return null;
}
