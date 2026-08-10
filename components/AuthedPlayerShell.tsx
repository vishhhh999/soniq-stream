"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AmbientBackground from "./AmbientBackground";
import PlayerBar from "./PlayerBar";
import MobilePlayerBar from "./MobilePlayerBar";
import SettingsModal from "./SettingsModal";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useAmbientBackdropTint } from "@/lib/useAmbientPulse";
import { onOpenSettings, SettingsSection } from "@/lib/settingsBus";

// PlayerBar and AmbientBackground previously rendered unconditionally in the
// root layout — meaning they showed up even on /login and /setup before
// anyone was signed in, which looked broken/confusing (a player bar for a
// library you can't see yet). Gate both behind an actual session.
//
// Desktop and mobile get genuinely different player components, not one
// component with responsive classes — the interaction models are too
// different (hover states, a floating pill vs. a full-width mini-bar that
// expands to a sheet) to share a single implementation cleanly.
//
// SettingsModal is mounted here too (not per-page) so it's reachable from
// every authenticated route via the settingsBus, including flows like the
// snippet export's premium upgrade CTA that live outside LibraryHome's own
// component tree (e.g. the standalone album page).
export default function AuthedPlayerShell() {
  const { status } = useSession();
  const isMobile = useIsMobile();
  useAmbientBackdropTint();
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);

  useEffect(() => onOpenSettings((section) => setSettingsSection(section ?? undefined)), []);

  if (status !== "authenticated") return null;
  return (
    <>
      <AmbientBackground />
      {isMobile ? <MobilePlayerBar /> : <PlayerBar />}
      {settingsSection !== null && (
        <SettingsModal onClose={() => setSettingsSection(null)} initialSection={settingsSection} />
      )}
    </>
  );
}
