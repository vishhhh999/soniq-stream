"use client";

// SettingsModal is mounted in exactly one place (AuthedPlayerShell, in the
// root layout) so it's available on every authenticated route -- Library,
// album pages, embed, anywhere. Everything else that wants to open it
// (nav button, upgrade CTAs buried in other modals) goes through this
// instead of prop-drilling a callback through every render tree that might
// want to trigger it. Plain window CustomEvent, no library needed for
// something this small.
const EVENT = "soniq:open-settings";

export type SettingsSection = "billing" | undefined;

export function openSettings(section?: SettingsSection) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { section } }));
}

export function onOpenSettings(cb: (section?: SettingsSection) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail?.section);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
