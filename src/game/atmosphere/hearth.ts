/**
 * The warmth of the lit interiors (pure). `warmth` is the smoothed `homeSafety` level (it falls in about a second when the
 * compound is threatened and climbs back over about 25 s, so rooms relight gradually): lamps dim and the fire sinks.
 * Decor never changes with it; only light does.
 */
/** Lamps and window glow: dimmed, never out by this alone. */
export const lampScale = (warmth: number): number => 0.3 + 0.7 * clamp01(warmth);
/** The fire sinks faster than the lamps dim: low and red before it is out. */
export const fireScale = (warmth: number): number => clamp01(warmth) ** 2;

/**
 * How hard the stove and hearth burn: with the dark and the cold, with an evening minimum, times the fire scale.
 * `night` 0–1 (how dark), `cold` 0–1 (season / weather).
 */
export function fireLevel(night: number, cold: number, warmth: number): number {
  const need = Math.max(0.15 + 0.65 * clamp01(night), clamp01(cold) * 0.9);
  return clamp01(need) * fireScale(warmth);
}

/** Which of three colour temperatures a room's window and lamp take (stable per building). */
export function roomVariant(id: string): 0 | 1 | 2 {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 3) as 0 | 1 | 2;
}

/** A flame's flicker: two incommensurate sines, 0.78–1.0, and flatter when the fire is low. */
export function flicker(time: number, seed = 0): number {
  const f = 0.89 + 0.07 * Math.sin(time * 9.1 + seed) + 0.04 * Math.sin(time * 23.7 + seed * 2.3);
  return f;
}

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
