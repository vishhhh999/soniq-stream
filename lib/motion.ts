// One shared spring for modal/panel enter-exit motion, used everywhere a
// component pops in with { opacity, scale, y } — matches the same "one
// house curve everywhere" principle already applied to CSS transitions
// (see tailwind.config.ts transitionTimingFunction). Before this, 18
// components each defined their own inline spring, and 6 of them had
// already independently converged on the exact same values without
// anyone intending it as a shared constant — this makes that explicit
// instead of leaving 12 near-but-not-quite-identical variants around it.
//
// Two callers intentionally do NOT use this: SyncedLyricsList's line-
// scroll spring (100/20, deliberately softer for continuous scroll, not
// a discrete pop-in) and the ambient ombre system (not spring-based at
// all). Both are a different kind of motion, not an inconsistency to fix.
export const MODAL_SPRING = { type: "spring" as const, stiffness: 300, damping: 28 };
