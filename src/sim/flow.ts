/**
 * Flow (GDS §3): the walking between where people sleep, eat, work and fetch
 * water and wood costs a little extra labor on the daily duties.
 *
 * Derived from the finished structures' positions (metres), no saved state:
 * each chore duty gets an overhead = extra person-hours per hour of work,
 * 0 within `FREE_M` of the house, +1 % per `PER_PCT_M` beyond, capped at
 * `CAP` (6 %). A compact yard costs nothing. Applied in `addChoreWork`.
 */
import type { GameState } from './state';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import type { Duty } from './daily';

export const FREE_M = 25;
export const PER_PCT_M = 15;
export const CAP = 0.06;

/** What each duty walks to (from the nearest home). Kitchen walks to both legs and averages them. */
export const FLOW_LEGS: Partial<Record<Duty, ReadonlyArray<readonly string[]>>> = {
  water: [['well_hand', 'well_drilled', 'cistern', 'water_tower']],
  wood: [['wood_oven', 'sugar_shack']],
  kitchen: [['root_cellar'], ['garden', 'greenhouse']],
  garden: [['garden', 'greenhouse']],
  livestock: [['chicken_coop', 'barnyard', 'barn', 'sheep_barn']],
};

export const FLOW_NAME: Partial<Record<Duty, string>> = { water: 'water', wood: 'wood', kitchen: 'kitchen', garden: 'garden', livestock: 'animals' };

type Pt = { x: number; z: number };
const d2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** Overhead (0..CAP) for a carry of `m` metres. */
export const carryOverhead = (m: number): number => Math.min(CAP, Math.max(0, (m - FREE_M) / PER_PCT_M / 100));

/** Pure: the per-duty overhead from the finished structures. A duty with no target built has none. */
export function flowFrom(structs: ReadonlyArray<{ kind: string; x: number; z: number }>): Partial<Record<Duty, number>> {
  const homes = structs.filter(st => isHome(st.kind));
  const out: Partial<Record<Duty, number>> = {};
  if (!homes.length) return out;
  for (const duty of Object.keys(FLOW_LEGS) as Duty[]) {
    const overheads: number[] = [];
    for (const kinds of FLOW_LEGS[duty]!) {
      const targets = structs.filter(st => kinds.includes(st.kind));
      if (!targets.length) continue;
      let best = Infinity;
      for (const h of homes) for (const t of targets) best = Math.min(best, d2(h, t));
      overheads.push(carryOverhead(best));
    }
    if (overheads.length) out[duty] = Math.round(overheads.reduce((a, b) => a + b, 0) / overheads.length * 1000) / 1000;
  }
  return out;
}

const CACHE = new WeakMap<GameState, { sig: string; val: Partial<Record<Duty, number>> }>();
export function flowOverhead(s: GameState): Partial<Record<Duty, number>> {
  let n = 0;
  for (const st of s.structures) if (isFinished(st)) n++;
  const sig = `${s.structures.length}:${n}`;
  const c = CACHE.get(s);
  if (c && c.sig === sig) return c.val;
  const val = flowFrom(s.structures.filter(isFinished));
  CACHE.set(s, { sig, val });
  return val;
}

/** The person-hour multiplier for a duty: 1 / (1 + overhead). */
export const flowFactor = (s: GameState, duty: Duty): number => 1 / (1 + (flowOverhead(s)[duty] ?? 0));

/** One short line for the UI: the worst long carries, or null when the yard is compact (>= 1 %). */
export function flowLine(s: GameState): string | null {
  const ov = flowOverhead(s);
  const bad = (Object.keys(ov) as Duty[]).filter(d => (ov[d] ?? 0) >= 0.01).sort((a, b) => ov[b]! - ov[a]!).slice(0, 2);
  if (!bad.length) return null;
  return `Long carries: ${bad.map(d => `+${Math.round(ov[d]! * 100)}% hours on ${FLOW_NAME[d]}`).join(', ')}`;
}
