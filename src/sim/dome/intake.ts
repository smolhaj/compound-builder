/**
 * The arcology's filtered emergency intakes (owner decision 2026-11-21, docs/DECISIONS.md): when the sealed air goes bad (CO2 or oxygen past the fail-safe) the other domes open
 * their vents on their own, which ends the lockdown and lets fallout, smoke and ash in. The arcology has no open vents: it draws emergency air through sealed, filtered,
 * lock-style intakes, so the lockdown stays on, no dust gets in and people cannot suffocate. The air is pulled toward fresh by `INTAKE.PULL` per hour of cycling, and the filter
 * media pays for it (`WEAR_PER_DAY` extra a day while the intake runs, more with dust outside). Heat is not an intake case: it stays the plant's problem. Pure (tested in intake.test.ts).
 */
import type { DomeTier } from './tiers';
import { freshAir } from './air';

export const INTAKE = {
  /** Share of the gap to fresh air closed each hour while the intake cycles (PROPOSED). */
  PULL: 0.5,
  /** Extra filter-media wear a day while it runs (PROPOSED: roughly a quarter of the sealed wear again). */
  WEAR_PER_DAY: 0.06,
} as const;

/** Does this tier draw emergency air through filtered intakes (and so never open its vents)? */
export const hasFilteredIntake = (tier: DomeTier): boolean => tier === 'arcology';

/** The air after `hrs` hours of the intake cycling. Pulled toward fresh air; never worse than it was. */
export function intakeAir(air: { co2ppm: number; o2pct: number }, hrs: number): { co2ppm: number; o2pct: number } {
  const f = freshAir(), k = 1 - (1 - INTAKE.PULL) ** Math.max(0, hrs);
  return { co2ppm: Math.min(air.co2ppm, air.co2ppm + (f.co2ppm - air.co2ppm) * k), o2pct: Math.max(air.o2pct, air.o2pct + (f.o2pct - air.o2pct) * k) };
}

/**
 * Where the arcology's sealed intake stacks stand on its skirt: three, spread round the shell from the vehicle port, each slid to the nearest angle that clears every
 * entrance (`entranceAngles`) and leaves `room` of footprint beyond the shell (`half` is the footprint's half-width, `r` the shell radius, both in world units).
 */
export function intakeAngles(port: number, entranceAngles: readonly number[], r: number, half: number, room = 0.4): number[] {
  const clear = (a: number): boolean => entranceAngles.every(e => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) > 0.55);
  const slack = (a: number): number => half / Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))) - r;
  const out: number[] = [];
  for (const k of [2.2, Math.PI, -2.2]) for (const d of [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.8, -0.8]) { const a = port + k + d; if (clear(a) && slack(a) >= room) { out.push(a); break; } }
  return out;
}
