/**
 * The dome plant in a climate disaster (docs/design/climate_disasters.md sections 1.4, 1.5 and 2.4, owner-approved 2026-11-19, PR 4). Pure and
 * tested (plantClimate.test.ts); nothing here reads GameState. Every number is PROPOSED unless the doc cites a rule of thumb.
 *
 *  COP       the chiller's COP falls with the outside air (3.5 at 95 F, minus 0.035 a degree above); the heat pump's COP falls in the cold (3.0
 *            down to 17 F, linear to 1.0, resistance backup, at minus 30 F).
 *  capacity  an air-cooled chiller gives 100 percent at 95 F and loses 1.2 points a degree F, and it trips at 125 F (rating). The high-ambient
 *            package loses 0.8 points and trips at 140 F (the spec field exists; buying it is PR 9, because it persists a dome field).
 *  yard      transformers derate 0.4 percent a degree F above 104 F; batteries halve for every 15 F above 77 F and hold about half at 0 F.
 *  wear      stress becomes a daily chance that a unit is damaged (an open `plant` repair job): heat above 95 F, load past the rating, cold
 *            below 17 F. A second (N+1) unit cuts each unit's wear to 0.4.
 *  lead      parts take longer to arrive as the `deliveries` track falls (up to 4 times).
 *
 * Deferred (needs the tower marker and a water store, PR 9): cooling towers and evaporative condensers by wet-bulb, ground loops, thermal curtains.
 * The existing evaporative pads rung is limited by wet-bulb here (`evapWbK`).
 *
 * With no climate disaster active none of this applies (live.ts calls it only for the two slow kinds), so every other test is unchanged.
 */
import type { DomeTier } from './tiers';
import { shellFt } from './tiers';
import { domeGeometry } from './geometry';
import { BAND, COOL, GROUND_F, PEAK_SUN, SHELL_U, SOLAR_GAIN, BTU_PER_KWH, type ClimateMode } from './climate';
import type { PlantKind } from './plantUnits';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, Number.isFinite(v) ? v : a));

// ── COP ────────────────────────────────────────────────────────────────────────────────────

/** Chiller COP at 95 F, the fall per degree F above it, and the floor. */
export const COP_COOL_95 = 3.5, COP_COOL_SLOPE = 0.035, COP_COOL_FLOOR = 1.2;
export function copCool(outF: number): number { return Math.max(COP_COOL_FLOOR, COP_COOL_95 - COP_COOL_SLOPE * Math.max(0, outF - 95)); }

/** Heat pump COP: 3.0 down to 17 F, a straight line to 1.0 (resistance backup) at minus 30 F, then 1.0. */
export const COP_HEAT_FULL_F = 17, COP_HEAT_LOCKOUT_F = -30;
export function copHeat(outF: number): number {
  if (outF >= COP_HEAT_FULL_F) return 3;
  if (outF <= COP_HEAT_LOCKOUT_F) return 1;
  return 1 + 2 * (outF - COP_HEAT_LOCKOUT_F) / (COP_HEAT_FULL_F - COP_HEAT_LOCKOUT_F);
}

// ── chiller capacity and trip ──────────────────────────────────────────────────────────────

export type HeatRejection = 'air' | 'high_ambient';
export interface RejectionSpec { /** Capacity points lost per degree F above 95 F (as a share). */ perF: number; /** The outside air at which the unit trips. */ tripF: number; /** Price against a standard unit. */ priceK: number }
export const REJECTION: Record<HeatRejection, RejectionSpec> = { air: { perF: 0.012, tripF: 125, priceK: 1 }, high_ambient: { perF: 0.008, tripF: 140, priceK: 1.4 } };

/** Share of its rating a chiller gives at this outside air (0 at and above the trip point). Never rises with the temperature. */
export function chillerCapacity(outF: number, pkg: HeatRejection = 'air'): number {
  const p = REJECTION[pkg];
  if (outF >= p.tripF) return 0;
  return clamp(1 - p.perF * Math.max(0, outF - 95), 0, 1);
}
export const chillerTripped = (outF: number, pkg: HeatRejection = 'air'): boolean => outF >= REJECTION[pkg].tripF;

/** Share of the evaporative pads' work the wet-bulb allows: all of it under 70 F, none at 80 F (the pads cannot beat the wet-bulb). */
export const evapWbK = (wetBulbF: number): number => clamp((80 - wetBulbF) / 10, 0, 1);

/** Transformers derate 0.4 percent a degree F above 104 F of ambient (floor 0.5). */
export const transformerK = (ambientF: number): number => clamp(1 - 0.004 * Math.max(0, ambientF - 104), 0.5, 1);

/** Battery capacity against its temperature: halves for every 15 F above 77 F; about half at 0 F; never under 0.35. */
export function batteryTempK(f: number): number {
  if (f >= 77) return Math.pow(0.5, (f - 77) / 15);
  return clamp(1 - 0.5 * (77 - f) / 77, 0.35, 1);
}

// ── the rating ─────────────────────────────────────────────────────────────────────────────

/** The chiller is sized for the whole heat gain of a 100 F design day with the sun overhead, with this much margin (PROPOSED). */
export const DESIGN_F = 100, DESIGN_MARGIN = 1.3;
/** Btu an hour the dome's chiller plant is rated for (0 for a dome with no plant). The vents, screens and pads are free rungs ahead of it. */
export function chillerRatedBtu(tier: DomeTier, cells: number, mode: ClimateMode): number {
  if (tier === 'earthen') return 0;
  const g = domeGeometry(tier, shellFt(tier, cells)), earth = tier === 'geodesic' ? 0.12 : 0;
  const ref = DESIGN_F * (1 - earth) + GROUND_F * earth, hold = BAND[mode][1] - COOL.HOLD_UNDER;
  const gain = PEAK_SUN * g.footprintSf * SOLAR_GAIN[tier] + SHELL_U[tier] * g.surfaceSf * (ref - hold);
  return Math.max(0, gain) * DESIGN_MARGIN;
}
export const btuToKw = (b: number): number => b / BTU_PER_KWH;

// ── wear ───────────────────────────────────────────────────────────────────────────────────

/** The base daily chance that a chiller at its rating is damaged (0.02 percent), tripling for every 10 F above 95 F: about 0.5 percent a day at 125 F. */
export const WEAR_BASE = 0.0002;
/** What a second (N+1) unit does to each unit's wear (the doc's 0.4). */
export const SPARE_WEAR_K = 0.4;
export type WearCause = 'heat' | 'load' | 'cold';
export interface Wear { /** Chance a day (before the difficulty's failure scale). */ p: number; cause: WearCause }
export interface WearIn { kind: PlantKind; outF: number; /** Heat the plant must shed or add against what its units can do now, 0 (idle) to 1.5 (over the rating). */ load: number; /** A second unit of its kind stands. */ spare: boolean; pkg?: HeatRejection }

/**
 * The daily chance one unit is damaged by the weather, and what to call it. Chillers: heat, load and cold; the substation: ambient heat and load;
 * a scrubber house wears 1.5 times faster hot (its media clogs); the rest are left to their own rules. Monotone: a hotter day, a harder-worked unit
 * and a colder night never lower it (property tests), and a spare only ever lowers it.
 */
export function plantWear(w: WearIn): Wear {
  const spare = w.spare ? SPARE_WEAR_K : 1, load = clamp(w.load, 0, 1.5), push = 0.5 + load;   // 0.5 idle, 2 at 150 percent
  const shift = w.pkg === 'high_ambient' ? REJECTION.high_ambient.tripF - REJECTION.air.tripF : 0;
  const hotF = w.outF - shift, heat = hotF > 95 ? WEAR_BASE * Math.pow(3, (hotF - 95) / 10) : 0, cold = w.outF < COP_HEAT_FULL_F ? WEAR_BASE * Math.pow(3, (COP_HEAT_FULL_F - w.outF) / 15) : 0;
  const over = Math.max(0, load - 1);
  switch (w.kind) {
    case 'chiller': {
      const base = Math.max(heat, cold), p = Math.min(0.08, (base * push + 0.004 * over) * spare);
      return { p, cause: over > 0 && 0.004 * over > base * push * 0.5 ? 'load' : cold > heat ? 'cold' : 'heat' };
    }
    case 'substation': {
      const amb = w.outF > 104 ? 0.0001 + 0.0019 * clamp((w.outF - 104) / 21, 0, 1.5) : 0;
      const p = Math.min(0.05, (amb * (0.6 + 0.4 * push) + 0.002 * over) * spare);
      return { p, cause: over > 0 && 0.002 * over > amb ? 'load' : 'heat' };
    }
    case 'air': return { p: Math.min(0.02, heat * 0.2 * spare), cause: 'heat' };
    default: return { p: 0, cause: 'heat' };
  }
}

// ── repair lead ────────────────────────────────────────────────────────────────────────────

/** Parts take longer as the deliveries track falls: 1 over the track (so a halved track doubles it), never more than 4 times. */
export function leadStretch(deliveries: number): number { return clamp(1 / Math.max(0.01, clamp(deliveries, 0, 1)), 1, 4); }

// ── tier ordering helper ───────────────────────────────────────────────────────────────────

/** The words for the chiller's state, for the card ("Chiller at 71 percent: outside is 124 F. Rated to trip at 125."). */
export function chillerLine(outF: number, pkg: HeatRejection = 'air'): string | null {
  const p = REJECTION[pkg], cap = chillerCapacity(outF, pkg);
  if (outF >= p.tripF) return `Chiller tripped: outside is ${Math.round(outF)} F. Rated to trip at ${p.tripF}; it is off until the air cools.`;
  if (cap < 0.999) return `Chiller at ${Math.round(cap * 100)} percent: outside is ${Math.round(outF)} F. Rated to trip at ${p.tripF}.`;
  return null;
}
