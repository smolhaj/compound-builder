/**
 * The covered bridge's deck on a slope (docs/DECISIONS.md, "Bridge on a slope"): it rests `0.5 m` over the ground at each end and pitches between them, so it
 * meets the road at both ends with no gap under it. A deck steeper than `BRIDGE_GRADE` (a heavy vehicle's limit on a timber bridge) lifts its lower end instead.
 * Pure (tested).
 */
export const BRIDGE_GRADE = 0.12;

/** The deck heights at the two ends for ground-plus-clearance heights `ya0`, `yb0` over a span `len`: pitched, and no steeper than `BRIDGE_GRADE`. */
export function deckGrade(ya0: number, yb0: number, len: number): { ya: number; yb: number } {
  const limit = BRIDGE_GRADE * len;
  if (yb0 - ya0 > limit) return { ya: yb0 - limit, yb: yb0 };
  if (ya0 - yb0 > limit) return { ya: ya0, yb: ya0 - limit };
  return { ya: ya0, yb: yb0 };
}
