/**
 * Sanitation (GDS §10.5: "the outhouse-to-well distance and disease"). A
 * privy, a manure yard or a failing septic field fouls a well nearby; the
 * household drinks from its best well, so one clean well is enough. A
 * drilled, cased well reaches below the seepage (a sixth of the risk); a
 * hand-dug one takes it all. A filter, a filtration shed or boiling takes the
 * rest away. The result feeds the dysentery roll in sim/medical.ts and a
 * Most-pressing line in sim/guidance.ts. Pure.
 */
import { isFinished } from './construction';
import type { GameState, Structure } from './state';

/** 1 world unit is about 6 m. */
export const M_PER_UNIT = 6;
/** Regulations and the old rule of thumb: a privy 100 ft (30 m) from a well. */
export const SAFE_M = 30;
/** Inside this the well is simply a funnel for the privy. */
export const FOUL_M = 12;

/** What fouls a well, and how much (1 = a privy). */
const SOURCE_WEIGHT: Record<string, number> = { outhouse: 1, chicken_coop: 0.35, barn: 0.4, sheep_barn: 0.4, equipment_yard: 0.15 };
/** How exposed each kind of well is. */
const WELL_EXPOSURE: Record<string, number> = { well_hand: 1, well_drilled: 0.17 };

export interface WellRisk { well: Structure; source: Structure | null; metres: number; risk: number }

const metres = (a: Structure, b: Structure) => Math.hypot(a.x - b.x, a.z - b.z) * M_PER_UNIT;

/** Closeness 0 (at or past the safe distance) to 1 (inside the foul distance). */
export function closeness(m: number): number {
  return Math.max(0, Math.min(1, (SAFE_M - m) / (SAFE_M - FOUL_M)));
}

/** Each finished well with the worst thing near it. */
export function wellRisks(s: GameState): WellRisk[] {
  const sources = s.structures.filter(x => SOURCE_WEIGHT[x.kind] !== undefined && !x.unplaced);
  const out: WellRisk[] = [];
  for (const well of s.structures) {
    if (WELL_EXPOSURE[well.kind] === undefined || well.unplaced || !isFinished(well)) continue;
    let worst: WellRisk = { well, source: null, metres: Infinity, risk: 0 };
    for (const src of sources) {
      const m = metres(well, src);
      const risk = closeness(m) * SOURCE_WEIGHT[src.kind] * WELL_EXPOSURE[well.kind];
      if (risk > worst.risk) worst = { well, source: src, metres: m, risk };
    }
    out.push(worst);
  }
  return out;
}

/** Is the water treated before it is drunk (filter, filtration shed, or fuel to boil it)? */
export function treated(s: GameState): boolean {
  return s.stock.water_filter >= 0.01 || s.structures.some(x => x.kind === 'filtration_shed' && x.stage >= 5) || s.stock.firewood >= 0.05;
}

/** 0–1: how likely the water the family actually drinks is fouled. The best well wins; no wells, no seepage to speak of. */
export function wellFouling(s: GameState): number {
  const r = wellRisks(s);
  if (!r.length) return 0;
  return Math.min(...r.map(x => x.risk));
}

/** Daily chance of a dysentery case from seepage (before the difficulty scaling in medical.ts). */
export const SEEPAGE_DAILY = 0.005;
export function seepageChance(s: GameState): number {
  return SEEPAGE_DAILY * wellFouling(s) * (treated(s) ? 0.12 : 1);
}

/** A well worth warning about (the worst), or null. */
export function worstWell(s: GameState): WellRisk | null {
  const r = wellRisks(s).filter(x => x.risk >= 0.3 && x.source);
  if (!r.length || wellFouling(s) < 0.3) return null;
  return r.sort((a, b) => b.risk - a.risk)[0];
}

export const sanitationLine = (w: WellRisk): string =>
  `the ${w.well.kind.replace(/_/g, ' ')} is only ${Math.round(w.metres)} m from the ${w.source!.kind.replace(/_/g, ' ')} (keep ${SAFE_M} m): seepage makes people sick`;
