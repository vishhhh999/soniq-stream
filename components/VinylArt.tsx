"use client";

type VinylArtProps = {
  coverUrl?: string | null;
  spinning: boolean;
  size?: number;
  gradientFrom?: string;
  gradientTo?: string;
  // When provided, overrides the CSS spin animation with a manual rotation
  // (degrees) — used while a drag-to-scrub gesture is in progress, so the
  // disc tracks the pointer instead of spinning on its own timer.
  rotationOverride?: number;
};

export default function VinylArt({ coverUrl, spinning, size = 48, gradientFrom, gradientTo, rotationOverride }: VinylArtProps) {
  const labelSize = size * 0.42;
  return (
    <div
      className={`relative shrink-0 rounded-full ${spinning && rotationOverride === undefined ? "vinyl-spinning" : ""}`}
      style={{
        width: size,
        height: size,
        transform: rotationOverride !== undefined ? `rotate(${rotationOverride}deg)` : undefined,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" className="absolute inset-0">
        <circle cx="50" cy="50" r="49" fill="#0a0a0a" />
        <circle cx="50" cy="50" r="49" fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
        {[42, 35, 28, 24].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="#1c1c1c" strokeWidth="0.6" />
        ))}
        <circle
          cx="50"
          cy="50"
          r="20"
          fill={coverUrl ? "transparent" : `url(#grad-${gradientFrom?.slice(1) || "default"})`}
        />
        {!coverUrl && (
          <defs>
            <linearGradient id={`grad-${gradientFrom?.slice(1) || "default"}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientFrom || "#888"} />
              <stop offset="100%" stopColor={gradientTo || "#444"} />
            </linearGradient>
          </defs>
        )}
        <circle cx="50" cy="50" r="3" fill="#0a0a0a" />
      </svg>
      {coverUrl && (
        <div
          className="absolute rounded-full overflow-hidden"
          style={{
            width: labelSize,
            height: labelSize,
            top: (size - labelSize) / 2,
            left: (size - labelSize) / 2,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}
