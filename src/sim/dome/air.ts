/**
 * Lockdown air (docs/DOME_COMPOUND.md 7.1, owner decision 3). With the vents shut (fallout, ash, plague) CO2 is the clock: people make it, the
 * shell leaks a little, plants and scrubbers take it back. A bigger dome has more air, so a longer clock. Advanced filtering is a paid upgrade;
 * a full closed ecology is a very expensive late option that makes the dome habitable for good. Pure (tested).
 */
import type { DomeTier } from './tiers';
import { TIER, shellFt } from './tiers';
import { domeGeometry } from './geometry';

export const OUTSIDE_PPM = 420;
/** The workplace limit (alarm), the old shelter ceiling (2 percent, hard), and where oxygen starts to hurt. */
export const LIMIT_PPM = { alarm: 5000, hard: 20000 };
export const O2 = { normal: 20.9, impaired: 17, danger: 14 };
/** Cu ft an hour one resting person adds (CO2) and uses (O2). */
export const CO2_CF_PER_PERSON_HR = 0.9, O2_CF_PER_PERSON_HR = 1.8;

/** Air changes a day through the shell with the vents shut: a fresh, tight shell and the airlock vestibules. */
export const LEAK_PER_DAY: Record<DomeTier, number> = { earthen: 0.4, geodesic: 0.05, glass: 0.04, arcology: 0.01 };

export type Filtering = 'none' | 'scrubber' | 'advanced' | 'closed';
export const FILTERING: readonly Filtering[] = ['none', 'scrubber', 'advanced', 'closed'];
/** Share of the people's CO2 each level takes back (powered), and share of their oxygen it makes up. */
export const SCRUB: Record<Filtering, { co2: number; o2: number }> = { none: { co2: 0, o2: 0 }, scrubber: { co2: 0.75, o2: 0 }, advanced: { co2: 0.97, o2: 0.45 }, closed: { co2: 1, o2: 1 } };
/** Person-equivalents of CO2 one garden bed under the dome offsets (a flat offset per bed), up to this many beds. */
export const BED_OFFSET = 0.4, BED_CAP = 12;

export interface Air { co2ppm: number; o2pct: number }
export const freshAir = (): Air => ({ co2ppm: OUTSIDE_PPM, o2pct: O2.normal });

export interface AirCtx { tier: DomeTier; cells: number; people: number; filtering: Filtering; powered: boolean; beds: number; /** Seal health 0..1: a worn seal leaks more. */ seals?: number; /** Share 0..1 of the fitted scrubbing the plant still does (a damaged or lost scrubber house, sim/dome/plantUnits.ts). */ scrubK?: number }

function rates(c: AirCtx): { V: number; k: number; co2Cf: number; o2Cf: number } {
  const V = domeGeometry(c.tier, shellFt(c.tier, c.cells)).volumeCf, sk = Math.max(0, Math.min(1, c.scrubK ?? 1)), f0 = c.powered ? SCRUB[c.filtering] : SCRUB.none, f = { co2: f0.co2 * sk, o2: f0.o2 * sk };
  const plants = Math.min(BED_CAP, Math.max(0, c.beds)) * BED_OFFSET;
  const net = Math.max(0, c.people - plants);
  const k = LEAK_PER_DAY[c.tier] / 24 * (2 - Math.max(0, Math.min(1, c.seals ?? 1)));
  return { V, k, co2Cf: net * CO2_CF_PER_PERSON_HR * (1 - f.co2), o2Cf: c.people * O2_CF_PER_PERSON_HR * (1 - f.o2) };
}

/** Advance sealed air by `hours`: CO2 relaxes toward an equilibrium (exact solution of dC/dt = P/V - k (C - outside)); O2 falls linearly less the leak's top-up. */
export function sealedAir(a: Air, c: AirCtx, hours: number): Air {
  const { V, k, co2Cf, o2Cf } = rates(c);
  const p = co2Cf / V * 1e6;      // ppm per hour
  const co2 = k > 1e-9 ? OUTSIDE_PPM + p / k + (a.co2ppm - OUTSIDE_PPM - p / k) * Math.exp(-k * hours) : a.co2ppm + p * hours;
  const dO = o2Cf / V * 100;      // percentage points per hour
  const o2 = k > 1e-9 ? O2.normal - dO / k + (a.o2pct - O2.normal + dO / k) * Math.exp(-k * hours) : a.o2pct - dO * hours;
  return { co2ppm: Math.max(OUTSIDE_PPM, co2), o2pct: Math.max(0, Math.min(O2.normal, o2)) };
}

export interface Clock { hoursToAlarm: number; hoursToHard: number; hoursToO2: number; /** The shortest of the three. */ hours: number; limit: 'co2' | 'o2' | 'none' }
/** Hours until the air is bad, from now, if nothing changes (Infinity when the loop closes). Found by stepping the exact solution. */
export function lockdownClock(a: Air, c: AirCtx, cap = 24 * 365): Clock {
  const first = (ok: (x: Air) => boolean): number => {
    if (!ok(a)) return 0;
    let lo = 0, hi = 1;
    while (hi < cap && ok(sealedAir(a, c, hi))) { lo = hi; hi *= 2; }
    if (hi >= cap && ok(sealedAir(a, c, cap))) return Infinity;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ok(sealedAir(a, c, m))) lo = m; else hi = m; }
    return hi;
  };
  const hoursToAlarm = first(x => x.co2ppm < LIMIT_PPM.alarm), hoursToHard = first(x => x.co2ppm < LIMIT_PPM.hard), hoursToO2 = first(x => x.o2pct > O2.impaired);
  const hours = Math.min(hoursToAlarm, hoursToO2);
  return { hoursToAlarm, hoursToHard, hoursToO2, hours, limit: hours === Infinity ? 'none' : hoursToAlarm <= hoursToO2 ? 'co2' : 'o2' };
}

/** What the paid upgrades cost (2025 dollars): scales with the air to be cleaned. */
export const advancedFilterUsd = (tier: DomeTier, cells = TIER[tier].cells): number => Math.round((60_000 + domeGeometry(tier, shellFt(tier, cells)).volumeCf * 0.9) / 1000) * 1000;
export const scrubberUsd = (tier: DomeTier, cells = TIER[tier].cells): number => Math.round((15_000 + domeGeometry(tier, shellFt(tier, cells)).volumeCf * 0.12) / 1000) * 1000;
/** The closed ecology: algae and plant loops, soil beds, sensors, a second power plant. Very expensive on purpose. */
export const closedEcologyUsd = (tier: DomeTier, cells = TIER[tier].cells): number => Math.round((2_000_000 + 1500 * domeGeometry(tier, shellFt(tier, cells)).footprintSf) / 10000) * 10000;
