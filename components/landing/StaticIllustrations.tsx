import { Bell, Play, GitBranch } from "lucide-react";

// Composed, layered illustrations rather than a single centered icon --
// each uses stacked/offset shapes with the accent color doing one specific
// job (never just "icon tinted orange"), matching the same restraint as
// the rest of the token system.

export function OrganizeIllustration() {
  return (
    <div className="relative h-32 flex items-center justify-center">
      <div className="absolute w-24 h-16 rounded-xl bg-white/[0.04] border border-border rotate-[-6deg] translate-x-3" />
      <div className="absolute w-24 h-16 rounded-xl bg-white/[0.06] border border-border rotate-[3deg] -translate-x-2" />
      <div className="relative w-24 h-16 rounded-xl bg-elevated border border-border-strong flex flex-col justify-center px-3 gap-1.5">
        <div className="h-1.5 w-14 rounded-full bg-accent/70" />
        <div className="h-1.5 w-10 rounded-full bg-white/15" />
        <div className="h-1.5 w-12 rounded-full bg-white/15" />
      </div>
    </div>
  );
}

export function NotificationsIllustration() {
  return (
    <div className="relative h-32 flex items-center justify-center">
      <div className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative w-11 h-11 rounded-full bg-elevated border border-border-strong flex items-center justify-center">
        <Bell size={18} strokeWidth={1.5} className="text-primary" />
      </div>
      <div className="absolute w-4 h-4 rounded-full bg-accent border-2 border-canvas top-9 left-[calc(50%+10px)]" />
      <div className="absolute w-2 h-2 rounded-full bg-white/20 top-6 left-[calc(50%-24px)]" />
      <div className="absolute w-1.5 h-1.5 rounded-full bg-white/15 bottom-8 right-[calc(50%-26px)]" />
    </div>
  );
}

export function AnalyticsIllustration() {
  const bars = [0.3, 0.55, 0.4, 0.85, 0.6];
  return (
    <div className="relative h-32 flex items-end justify-center gap-2 pb-4">
      {bars.map((h, i) => (
        <div
          key={i}
          className="w-4 rounded-full"
          style={{
            height: `${h * 64}px`,
            background: i === 3 ? "var(--accent)" : "rgba(255,255,255,0.1)",
          }}
        />
      ))}
      <Play size={12} strokeWidth={2} className="absolute -top-1 right-[calc(50%-38px)] text-accent-text" />
    </div>
  );
}

export function VaultIllustration() {
  return (
    <div className="relative h-32 flex items-center justify-center gap-3">
      <div className="w-9 h-9 rounded-full border border-border-strong flex items-center justify-center text-[9px] text-tertiary font-medium">
        4/4
      </div>
      <div className="flex items-end gap-[3px] h-10">
        {[0.4, 0.7, 0.5, 0.9, 0.3, 0.6, 0.45, 0.8].map((h, i) => (
          <div key={i} className="w-[3px] rounded-full bg-white/20" style={{ height: `${h * 100}%` }} />
        ))}
      </div>
      <GitBranch size={16} strokeWidth={1.5} className="text-accent" />
    </div>
  );
}
