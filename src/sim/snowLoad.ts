/**
 * Snow on roofs and dome shells (docs/design/climate_disasters.md sections 2.2 and 2.4, PR 5). Pure and tested (snowLoad.test.ts).
 *
 *  ground    the region's ground load by year comes from `slowClimate.iceGroundPsf` (psf).
 *  roof      an unheated roof carries about 0.7 of the ground load; the capacity table, verdict and shoveling hours are the ash tables
 *            (`ashfall.ts`: `ROOF_CAP`, `roofRatio`, `roofVerdict`, `shovelHours`); a braced roof carries 1.35 times.
 *  dome      the shell carries 0.7 x ground x a shape factor (geodesic 0.8, glass 0.7, arcology 0.6, earthen 1.0) x (1 minus 0.85 x the share of the
 *            climate plant that is running), so a heated shell sheds its snow. `protection.breaches(tier, { snowPsf }, health)` decides failure.
 *  vents     the roof vents ice shut below minus 10 F with the plant dark (30 percent of days, a fixed die per dome and day).
 * Deferred: snow drifts across the yard passage (the raid reach rule in plantStrike has no crew-access analog; not trivial).
 */
import { ROOF_CAP, density, roofRatio, roofSqft, roofVerdict, shovelHours, type RoofVerdict } from './ashfall';
import { SHELL, breaches } from './dome/protection';
import type { DomeTier } from './dome/tiers';

/** An unheated roof carries about this share of the ground load (code factor for a cold roof). */
export const ROOF_SNOW_SHARE = 0.7;
/** Inches of settled snow per psf (a psf is about 0.8 inch of settled snow). */
export const SNOW_IN_PER_PSF = 0.8;
/** How the shell's shape holds snow: a steep dome sheds, a flat one keeps it. */
export const DOME_SHAPE: Record<DomeTier, number> = { geodesic: 0.8, glass: 0.7, arcology: 0.6, earthen: 1.0 };
/** A running plant sheds up to this share of the load (the heat flux melts the snow). */
export const SHED_SHARE = 0.85;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));

/** Snow on a building roof (psf) after what the family shoveled off (`shoveledAtPsf` is the ground load at the last shoveling). */
export const roofSnowPsf = (groundPsf: number, shoveledAtPsf = 0): number => Math.max(0, groundPsf - Math.max(0, shoveledAtPsf)) * ROOF_SNOW_SHARE;
export interface RoofLoad { psf: number; cap: number; ratio: number; inches: number; verdict: (u: number) => RoofVerdict }
/** One roof's load against its capacity, or null for a kind with no roof load. */
export function roofLoad(kind: string, groundPsf: number, o: { shoveledAtPsf?: number; braced?: boolean } = {}): RoofLoad | null {
  const cap = ROOF_CAP[kind];
  if (cap === undefined) return null;
  const psf = roofSnowPsf(groundPsf, o.shoveledAtPsf ?? 0);
  const ratio = roofRatio(psf / density(false), cap, false, !!o.braced);
  return { psf, cap, ratio, inches: psf * SNOW_IN_PER_PSF, verdict: (u: number) => roofVerdict(ratio, u) };
}
/** Person-hours to shovel a roof clear. */
export const shovelRoofHours = (kind: string, psf: number): number => shovelHours(kind, psf * SNOW_IN_PER_PSF);
export const roofAreaSqft = roofSqft;

/** Snow on a dome shell (psf). `climateShare` is the share (0..1) of the climate plant that is running (0 when dark). Never falls as the ground load rises. */
export function domeSnowPsf(tier: DomeTier, groundPsf: number, climateShare: number): number {
  return Math.max(0, groundPsf) * ROOF_SNOW_SHARE * DOME_SHAPE[tier] * (1 - SHED_SHARE * clamp(climateShare, 0, 1));
}
export interface ShellSnow { psf: number; rating: number; ratio: number; breach: boolean }
/** The shell's snow against what it is rated for at its health (panels whole). */
export function shellSnow(tier: DomeTier, groundPsf: number, climateShare: number, health = 1): ShellSnow {
  const psf = domeSnowPsf(tier, groundPsf, climateShare), f = clamp(health, 0.2, 1), rating = shellRating(tier) * f;
  return { psf, rating, ratio: rating > 0 ? psf / rating : 0, breach: breaches(tier, { snowPsf: psf }, health).includes('snow') };
}
export const shellRating = (tier: DomeTier): number => SHELL[tier].snow;

/** Panels a snow breach takes off the shell in one day: more the further past the rating (never over a third of the shell). */
export function panelsLost(shellPanels: number, ratio: number): number {
  if (ratio <= 1) return 0;
  return Math.max(1, Math.min(Math.ceil(shellPanels / 3), Math.ceil(shellPanels * 0.03 * (ratio - 0.5))));
}
/** Chance a day that an overloaded shell loses panels: 20 percent just over the rating, up to 70 percent at 1.8 times it. */
export const breachChance = (ratio: number): number => ratio <= 1 ? 0 : clamp(0.2 + 0.625 * (ratio - 1), 0.2, 0.7);

/** Cold below which the roof vent hatches ice shut with the plant dark, and the share of days they are stuck. */
export const VENT_ICE_F = -10, VENT_ICE_P = 0.3;
export const ventsIced = (outF: number, powered: boolean, die: number): boolean => outF < VENT_ICE_F && !powered && die < VENT_ICE_P;
