"use client";

import { useState } from "react";
import { Track } from "../PlayerProvider";
import AdjustPanel from "./AdjustPanel";
import StemsPanel from "./StemsPanel";
import EQPanel from "./EQPanel";

const TABS = [
  { key: "adjust", label: "Adjust" },
  { key: "stems", label: "Stems" },
  { key: "eq", label: "EQ" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function EditPanel({ track }: { track: Track }) {
  const [tab, setTab] = useState<TabKey>("adjust");

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 bg-canvas rounded-full p-1 mb-4 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-medium px-4 py-1.5 rounded-full transition-colors ${
              tab === t.key ? "bg-elevated text-primary shadow-sm" : "text-tertiary hover:text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0">
        {tab === "adjust" && <AdjustPanel />}
        {tab === "stems" && <StemsPanel track={track} />}
        {tab === "eq" && <EQPanel />}
      </div>
    </div>
  );
}
