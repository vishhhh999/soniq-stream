export default function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      className={className}
      aria-label="SONIQ"
    >
      {/* Broken ring — roughly 270° of a circle, not a full one. Reads as
         an abstracted vinyl record without becoming a literal turntable
         icon, and avoids the "generic target/donut" look a full ring with
         concentric grooves falls into at small sizes. The gap is filled
         by the solid dot below, echoing the record's spindle while also
         reading as a simple, distinct mark on its own — legible even at
         16px favicon scale, which concentric grooves are not. */}
      <path
        d="M 50 8 A 42 42 0 1 1 8 50"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="8" cy="50" r="9" fill="currentColor" />
    </svg>
  );
}
