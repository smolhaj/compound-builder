/**
 * The oasis contrast grade (pure numbers; WorldScene draws them). Inside a held compound the world is warm; outside the walls, and toward
 * the horizon, it goes cold, ashy and dark as the collapse rises. Everything is a smooth function of three smooth inputs, so nothing pops:
 *
 *   collapse   0-1  how far the world has fallen (homeSafety.collapseProgress)
 *   safety     0-1  the shared home safety level (homeSafety.level): dims on a breach, recovers on repair
 *   inside     0-1  where the camera is (compoundRegion.insideness)
 *
 * `presence` is the collapse's own strength: it is 0 before the warning so disaster-free peacetime is untouched.
 * `warm` is how oasis-like the spot is (inside, safe); `ruin` is how ruined it reads (outside, or inside but unsafe).
 */
export interface OasisInput { collapse: number; safety: number; inside: number }
export interface OasisFactors {
  /** Collapse strength with a soft onset (0 in peacetime). */
  presence: number;
  warm: number;
  ruin: number;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function oasisFactors(i: OasisInput): OasisFactors {
  const presence = smooth(0.03, 0.45, i.collapse);
  const held = clamp01(i.inside) * clamp01(i.safety);
  return { presence, warm: presence * held, ruin: presence * (1 - held) };
}

export type RGB = [number, number, number];
/** Amber of a lit, held place; the cold ash of the outside; the glow of far fires. */
export const WARM_CAST: RGB = [1.07, 0.975, 0.84];
export const RUIN_CAST: RGB = [0.93, 0.965, 1.0];
export const FIRE_HAZE: RGB = [0.30, 0.125, 0.055];
export const GOLD_HAZE: RGB = [0.95, 0.66, 0.36];

/** What the grade pass adds, on top of the season and the collapse's own look. */
export interface GradeDelta {
  /** Multiplier on the collapse's own cast (its saturation and contrast are eased by `relief`). */
  relief: number;
  cast: RGB;
  satMul: number;
  satAdd: number;
  contrastAdd: number;
  warmAdd: number;
  warmThresholdAdd: number;
  /** Multiplier on the cool shadow tint strength; shadow softness on the sun's shadow. */
  shadowTint: number;
  sunShadow: number;
  /** Fog and sky haze: how far the fog colour is pulled toward the fire haze (outside, dusk and night) and toward gold (inside), and how much it darkens. */
  fogFire: number;
  fogGold: number;
  fogDark: number;
  fogDensityMul: number;
  /** Fires on the horizon (added to the skyline fire strength and the sky glow), 0-1. */
  horizonFire: number;
}

const lerp3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul3 = (a: RGB, b: RGB): RGB => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];

/** `night` and `golden` are the day phase weights (0-1). */
export function gradeDelta(f: OasisFactors, night: number, golden: number): GradeDelta {
  const { warm, ruin, presence } = f;
  const dusk = clamp01(0.35 * golden + night);   // fire reads at dusk and in the dark
  const cast = mul3(lerp3([1, 1, 1], WARM_CAST, 0.85 * warm), lerp3([1, 1, 1], RUIN_CAST, 0.8 * ruin));
  const dark = 1 - 0.10 * ruin;
  return {
    relief: 0.55 * warm,
    cast: [cast[0] * dark, cast[1] * dark, cast[2] * dark],
    satMul: 1 - 0.30 * ruin,
    satAdd: 0.06 * warm,
    contrastAdd: 0.05 * ruin - 0.05 * warm,
    warmAdd: 0.22 * warm,
    warmThresholdAdd: -0.12 * warm + 0.1 * ruin,
    shadowTint: 1 - 0.6 * warm + 0.5 * ruin,
    sunShadow: 1 - 0.28 * warm,
    fogFire: presence * (0.25 + 0.55 * dusk) * (0.7 + 0.3 * ruin),
    fogGold: 0.14 * warm,
    fogDark: 0.32 * presence * (0.6 + 0.4 * dusk) * (0.5 + 0.5 * ruin),
    fogDensityMul: 1 + 0.45 * presence * (0.4 + 0.6 * ruin),
    horizonFire: presence * clamp01(dusk * 1.1),
  };
}

/** Move a value toward a target at a bounded rate (per second): the grade follows the camera and the safety level without a step. */
export function follow(cur: number, target: number, dt: number, tau: number): number {
  return cur + (target - cur) * (1 - Math.exp(-Math.max(0, dt) / tau));
}
