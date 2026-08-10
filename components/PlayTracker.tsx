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
  const { data: session, status } = useSession();
  const sessionUserId = session?.user && (session.user as any).id;
  // Tracks which track id has already been counted, so we don't re-fire on
  // every timeupdate tick once the threshold's been crossed once.
  const firedRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !current) return;
    if (firedRef.current === current.id) return;

    // Admin cross-user read access (see lib/adminAccess.ts) — current.userId
    // is only ever populated (and only ever differs from the logged-in
    // user's own id) for tracks the admin account is viewing read-only via
    // that feature. Every other track a session can ever have queued is
    // either the user's own upload or their own saved copy, so this check
    // is specific to that one case, not a general "don't log" rule.
    if (current.userId && current.userId !== sessionUserId) return;

    // Short tracks shouldn't need the full 20s to register — cap the
    // threshold at 80% of the track's own duration once it's known.
    const threshold =
      duration > 0 ? Math.min(MIN_LISTEN_SECONDS, duration * 0.8) : MIN_LISTEN_SECONDS;

    if (currentTime < threshold) return;

    firedRef.current = current.id;
    fetch(`/api/tracks/${current.id}/play`, { method: "POST" }).catch(() => {});
  }, [current?.id, current?.userId, currentTime, duration, status, sessionUserId]);

  return null;
}
