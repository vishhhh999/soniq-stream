"use client";

import { Sparkles, SparklesIcon } from "lucide-react";
import { useAmbient } from "./AmbientProvider";

export default function AmbientToggle() {
  const { enabled, toggle } = useAmbient();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle ambient background"
      title={enabled ? "Ambient mode: on" : "Ambient mode: off"}
      className={`w-8 h-8 flex items-center justify-center rounded-full border transition-colors ${
        enabled ? "border-accent text-accent" : "border-border text-secondary hover:text-primary hover:border-border-strong"
      }`}
    >
      <Sparkles size={14} strokeWidth={1.5} />
    </button>
  );
}
