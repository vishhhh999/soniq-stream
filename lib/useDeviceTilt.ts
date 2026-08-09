"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Drives the same rotateX/rotateY tilt effect as mouse-hover, but from the
// phone's gyroscope instead — there's no hover on touch devices, so without
// this the 3D tilt just never happens on mobile.
//
// iOS 13+ requires an explicit permission prompt triggered by a user
// gesture (DeviceOrientationEvent.requestPermission()) before orientation
// events fire at all — Android and older iOS don't need this and start
// listening immediately.
//
// Tilt is relative to wherever the phone happens to be held when it starts
// listening (captured as a baseline on the first reading), not absolute
// pitch/roll — holding the phone naturally tilted doesn't skew the art,
// only moving away from that starting position does.
export function useDeviceTilt(maxTilt = 14) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const baseline = useRef<{ beta: number; gamma: number } | null>(null);
  const listenerAttached = useRef(false);

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0;   // front-back tilt
    const gamma = e.gamma ?? 0; // left-right tilt
    if (!baseline.current) {
      baseline.current = { beta, gamma };
      return;
    }
    const dBeta = beta - baseline.current.beta;
    const dGamma = gamma - baseline.current.gamma;
    const x = Math.max(-maxTilt, Math.min(maxTilt, dBeta * 0.6));
    const y = Math.max(-maxTilt, Math.min(maxTilt, dGamma * 0.6));
    setTilt({ x: -x, y });
  }, [maxTilt]);

  const enable = useCallback(() => {
    if (listenerAttached.current) return;
    listenerAttached.current = true;
    window.addEventListener("deviceorientation", handleOrientation);
  }, [handleOrientation]);

  const requestPermission = useCallback(async () => {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          setNeedsPermission(false);
          enable();
        }
      } catch { /* user declined or API unavailable — falls back to static art */ }
    }
  }, [enable]);

  useEffect(() => {
    const touch = window.matchMedia("(hover: none)").matches;
    setIsTouchDevice(touch);
    if (!touch) return;

    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      setNeedsPermission(true); // iOS 13+ — wait for a tap
    } else if (typeof window.DeviceOrientationEvent !== "undefined") {
      enable(); // Android / older iOS — no permission needed
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation);
      listenerAttached.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { tilt, isTouchDevice, needsPermission, requestPermission };
}
