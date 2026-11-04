/**
 * The vehicle yard (docs/DECISIONS.md, "Vehicle yard beyond the court"): a fenced gravel lot for the fleet that stands OUTSIDE the compound's walls, past the
 * motor court. Its six bays are the equipment yard's bay machinery (sim/farm.ts `YARD_KINDS`), so trucks park here when the garages are full. Pure (tested).
 *
 *  Exposed   what stands in it is not behind the wall: a raid can take it whether or not the line holds. A crew that finds it drives off (or burns) what it can,
 *            the chance cut by a fenced lot with locked hitches (0.6), yard floodlights on power (0.85) and a tower or a post within `WATCH_REACH` that sees the lot (0.7).
 *  Lure      a crew of `LURE_MIN` or more sends part of itself for the vehicles (a third at most): fewer men at the wall, so the house is easier to hold, at the price of
 *            the trucks. A yard with nothing running in it draws nobody.
 *  Loss      each vehicle in the yard is driven off (70 %) or burned out (30 %, condition 0: stripped for parts, never driven again).
 */
import type { GameState, Structure } from './state';
import { isFinished } from './construction';
import { insideRing, yardRings } from './compounds';
import { towerPosts } from './towers';
import { fleetOf, type Vehicle } from './vehicles';
import { parkingPlan, syncParking } from './parking';
import { mulberry32 } from './rng';
import { dayIndex } from './state';
import { VEHICLES } from './vehicles';

export const VEHICLE_YARD = 'vehicle_yard';
export const YARD_RULES = {
  /** Per vehicle in an unguarded lot: a crew of looters / an organized crew. */
  TAKE: { looters: 0.4, organized: 0.6 },
  FENCED: 0.6, LIT: 0.85, WATCHED: 0.7,
  /** A raid the house repelled: the lot still lost this share of the chance (the crew was busy at the wall). */
  HELD_SHARE: 0.5,
  /** A tower or post within this many world units sees the lot. */
  WATCH_REACH: 12,
  LURE_MIN: 5, LURE_PER_VEHICLE: 0.12, LURE_MAX: 0.34,
  TORCH: 0.3,
} as const;

export const vehicleYards = (s: GameState): Structure[] => s.structures.filter(st => st.kind === VEHICLE_YARD && isFinished(st) && !st.unplaced);

/** Is the lot outside every closed wall ring round the compound (and so not behind a wall)? */
export function yardOutside(s: GameState, st: Pick<Structure, 'x' | 'z'>): boolean {
  return !yardRings(s).some(r => insideRing(r.pts, st.x, st.z));
}

/** The vehicles standing in a yard's bays. */
export function standingIn(s: GameState, yardId: string): Vehicle[] {
  const plan = parkingPlan(s), vs = fleetOf(s);
  return plan.parked.filter(p => p.yard?.yard === yardId).map(p => vs.find(v => v.id === p.vehicle)).filter((v): v is Vehicle => !!v);
}

const runningV = (v: Vehicle): boolean => v.condition > 0 && !v.away && !v.fried && VEHICLES[v.kind].tankL >= 0;

/** What lowers a raid's chance at one lot: 1 for nothing, less with the fence (always), lights and a watch. */
export function yardCover(s: GameState, st: Structure): { k: number; lit: boolean; watched: boolean } {
  const lit = s.utilities.lit.includes(st.id);
  const watched = towerPosts(s).some(tp => Math.hypot(tp.st.x - st.x, tp.st.z - st.z) <= YARD_RULES.WATCH_REACH);
  return { k: YARD_RULES.FENCED * (lit ? YARD_RULES.LIT : 1) * (watched ? YARD_RULES.WATCHED : 1), lit, watched };
}

/** Vehicles an outside lot exposes to a raid, with the lot each stands in. */
export function exposed(s: GameState): Array<{ v: Vehicle; yard: Structure }> {
  const out: Array<{ v: Vehicle; yard: Structure }> = [];
  for (const y of vehicleYards(s)) if (yardOutside(s, y)) for (const v of standingIn(s, y.id)) if (!v.away) out.push({ v, yard: y });
  return out;
}

/** Raiders of a crew that peel off for the yard's vehicles (0 for a small crew or an empty lot); never more than a third, never the whole crew. */
export function lureOf(s: GameState, crew: number): number {
  if (crew < YARD_RULES.LURE_MIN) return 0;
  const n = exposed(s).filter(e => runningV(e.v)).length;
  if (!n) return 0;
  return Math.min(Math.floor(crew * YARD_RULES.LURE_MAX), Math.round(crew * Math.min(YARD_RULES.LURE_MAX, YARD_RULES.LURE_PER_VEHICLE * n)), crew - 2);
}

/** After a raid: each vehicle in an outside lot is driven off or burned out. Returns the report lines. Deterministic in the seed and the day. */
export function raidYardLosses(s: GameState, result: 'repelled' | 'fled' | 'breached' | 'overrun', organized: boolean, seed = 0): string[] {
  const ex = exposed(s);
  if (!ex.length) return [];
  const held = result === 'repelled' || result === 'fled';
  const vs = fleetOf(s);
  const lines: string[] = [];
  for (const { v, yard } of ex) {
    const cover = yardCover(s, yard).k;
    const p = (organized ? YARD_RULES.TAKE.organized : YARD_RULES.TAKE.looters) * cover * (held ? YARD_RULES.HELD_SHARE : 1);
    const r = mulberry32(s.seed * 7919 + dayIndex(s.clock.t) * 31 + seed * 17 + (Number(v.id.slice(1)) || 0) * 13);
    if (r() >= p) continue;
    const name = VEHICLES[v.kind].name.toLowerCase();
    if (r() < YARD_RULES.TORCH) { v.condition = 0; lines.push(`They burned out the ${name} in the vehicle yard.`); }
    else { vs.splice(vs.indexOf(v), 1); lines.push(`They drove off the ${name} from the vehicle yard.`); }
  }
  if (lines.length) syncParking(s);
  return lines;
}

/** Plain words for the Defense tab. */
export function yardLines(s: GameState): string[] {
  return vehicleYards(s).map(y => {
    const out = yardOutside(s, y), c = yardCover(s, y), n = standingIn(s, y.id).length;
    return out
      ? `Vehicle yard: ${n} vehicle${n === 1 ? '' : 's'} outside the walls. A raid can take them (${c.lit ? 'lit' : 'dark'}, ${c.watched ? 'a tower sees it' : 'no one watching it'}); it also draws part of a crew away from the house.`
      : `Vehicle yard inside the walls: it holds the trucks like an equipment yard; nothing is exposed.`;
  });
}
