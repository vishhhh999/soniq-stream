"use client";

import { useSession } from "next-auth/react";
import AmbientBackground from "./AmbientBackground";
import PlayerBar from "./PlayerBar";

// PlayerBar and AmbientBackground previously rendered unconditionally in the
// root layout — meaning they showed up even on /login and /setup before
// anyone was signed in, which looked broken/confusing (a player bar for a
// library you can't see yet). Gate both behind an actual session.
export default function AuthedPlayerShell() {
  const { status } = useSession();
  if (status !== "authenticated") return null;
  return (
    <>
      <AmbientBackground />
      <PlayerBar />
    </>
  );
}
