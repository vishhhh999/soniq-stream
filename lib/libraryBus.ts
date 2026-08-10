"use client";

// Same plain window CustomEvent pattern as settingsBus.ts. Needed because
// saving a trim to the library (AdjustPanel) goes through the upload
// pipeline directly -- there's no shared data layer or cache that
// LibraryHome/album page would naturally revalidate. Without this, a saved
// trim exists for real in the DB and R2 but doesn't show up in whatever
// view is currently open until navigation or a reload.
const EVENT = "soniq:track-created";

export function notifyTrackCreated() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onTrackCreated(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
