/**
 * The waterfront (docs/DECISIONS.md, "Docks, marina and boats"): lake lots (the lakeshore bluff and the island) and the wide creeks
 * (a river 10 m across or more) give the place a shore. A dock on it lets the family keep boats, fish deeper water and leave or
 * be reached another way than the road -- and the winter, the raiders and the weather change what the water is worth:
 *
 *  Dock        a 3 x 15 m timber pier on piles (`boat_dock`, two slips) or the marina (`marina`, a T-head pier with six slips, a fuel dock and a
 *              boat shed). The footprint must reach from dry land into the water. Boats are goods in the stockpile: a 12 ft aluminum jon boat
 *              with oars ($1,300, three seats) and a 16 ft skiff with a 25 hp outboard ($9,800, five seats, burns petrol); the slips hold them.
 *  Fishing     with a boat at a dock and fishing gear, a day on the lake brings in fish at three times the creek's rate (the jon boat), the
 *              skiff reaches the deep water (a better catch, 1.6x); in winter with safe ice, ice fishing at the creek's rate.
 *  Ice         the lake or river skims over when the last two weeks' overnight lows average under 20 F and bears people under 10 F
 *              (`lakeIce`). No boat goes out on skim ice or on a freezing bay; ice crushes a boat left in the water at the first hard
 *              freeze unless the dock has a bubbler (the marina does) or the family has hauled them out (the `plant` chore).
 *  Raids       crews with boats come across the water: from the lake side when the shore landing is easier than the land lanes
 *              (an island has only a causeway; a bluff has a cliff face that a dock makes into a stair). A dock is a landing; a
 *              shore with a tower or a wall near it is not. On safe ice nobody needs a boat.
 *  Escape      a boat at the dock carries its seats off the place by water (sim/bugout.ts reads `boatSeats`).
 * Pure (tested).
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { siteLot } from './lotListing';
import { meanLow } from './housing';
import { TOWN_Y } from '../engine/world/terrain/regionalLandscape';
import { groundOf } from './terrainState';

export type WaterBody = 'lake' | 'river' | null;

/** Boats: seats, and the price table's id. */
export const BOATS = {
  jon_boat: { name: 'Jon boat', seats: 3, fish: 3, petrol: false },
  skiff: { name: 'Skiff with outboard', seats: 5, fish: 4.8, petrol: true },
} as const;
export type BoatId = keyof typeof BOATS;
export const BOAT_IDS: readonly BoatId[] = ['jon_boat', 'skiff'];
/** Slips by dock kind. */
export const SLIPS: Record<string, number> = { boat_dock: 2, marina: 6 };
export const DOCK_KINDS = ['boat_dock', 'marina'] as const;
export const isDock = (kind: string): boolean => (DOCK_KINDS as readonly string[]).includes(kind);

/** A river's half-width (world units) at which a creek counts as one: about 11 m across. */
export const RIVER_HALF = 0.9;

/** What kind of water the place has to put a dock in. */
export function waterBody(s: GameState): WaterBody {
  const lot = siteLot(s.site);
  if (lot?.field.lake) return 'lake';
  if (lot?.field.creek && lot.field.creek.halfWidth >= RIVER_HALF) return 'river';
  return null;
}

/** The water level (world y) at a point: the lake plane, or the creek's surface. Null: none. */
export function waterLevelAt(s: GameState, x: number): number | null {
  const lot = siteLot(s.site);
  if (lot?.field.lake) return TOWN_Y + lot.field.lake.y;
  const g = groundOf(s);
  return g?.creek ? g.creek.waterY(x) : null;
}

export type Ice = 'open' | 'skim' | 'ice';
/** The water's winter: mean overnight lows of the last fortnight. */
export function lakeIce(s: GameState, doy = calendarOf(s.clock).doy): Ice {
  let sum = 0;
  for (let d = 0; d < 14; d++) sum += meanLow(s, ((doy - d - 1 + 365) % 365) + 1);
  const avg = sum / 14;
  return avg < 10 ? 'ice' : avg < 20 ? 'skim' : 'open';
}

export const docks = (s: GameState): Structure[] => s.structures.filter(st => isFinished(st) && isDock(st.kind));
/** Slips on the place, and the boats in them (the stockpile's boats, up to the slips). */
export const slipsOf = (s: GameState): number => docks(s).reduce((a, st) => a + SLIPS[st.kind], 0);
export const boatsOwned = (s: GameState): Record<BoatId, number> => ({ jon_boat: Math.max(0, Math.floor(s.stock.jon_boat ?? 0)), skiff: Math.max(0, Math.floor(s.stock.skiff ?? 0)) });
/** Boats that float at a slip: the skiffs first (they are the ones worth keeping), then the jon boats, up to the slips. */
export function boatsAtDock(s: GameState): Record<BoatId, number> {
  const have = boatsOwned(s), slips = slipsOf(s), sk = Math.min(have.skiff, slips);
  return { skiff: sk, jon_boat: Math.min(have.jon_boat, slips - sk) };
}
/** The marina's bubbler keeps the ice off the hulls while it has power (the shed is wired and lit). */
export const hasBubbler = (s: GameState): boolean => docks(s).some(st => st.kind === 'marina' && s.utilities.lit.includes(st.id));

/** Seats off the place by water: the boats at the dock, if the water is open. */
export function boatSeats(s: GameState): number {
  if (lakeIce(s) !== 'open') return 0;
  const b = boatsAtDock(s);
  return b.jon_boat * BOATS.jon_boat.seats + b.skiff * BOATS.skiff.seats;
}

/** Fish brought in on a day on the water, as a multiple of the creek rate (0: none). */
export function boatFishK(s: GameState): number {
  const ice = lakeIce(s), b = boatsAtDock(s);
  if (!docks(s).length || !waterBody(s)) return 0;
  if (ice === 'ice') return 1;               // ice fishing through a hole, at the creek's rate
  if (ice === 'skim') return 0;
  return Math.max(b.skiff ? BOATS.skiff.fish : 0, b.jon_boat ? BOATS.jon_boat.fish : 0);
}

/** Why a dock cannot go here, from where its ends fall (null: it can). */
export type DockProblem = 'no_water' | 'not_shore';
export function dockProblem(s: GameState): DockProblem | null {
  return waterBody(s) ? null : 'no_water';
}

/** The first hard freeze of the autumn: the day the lake skims over for the year (the chore is checked then). */
export function freezeDay(s: GameState): boolean {
  const doy = calendarOf(s.clock).doy;
  if (doy < 240) return false;
  return lakeIce(s, doy) !== 'open' && lakeIce(s, doy - 1) === 'open';
}

/** The first hard freeze takes a boat left in the water unless the dock has a bubbler or the family has hauled them out (the `plant` chore). Returns the log lines. */
export function freezeDayBoats(s: GameState, rnd: number, plantLevel: number): string[] {
  if (!freezeDay(s) || !docks(s).length) return [];
  const have = boatsAtDock(s), n = have.jon_boat + have.skiff;
  if (!n || hasBubbler(s)) return [];
  // hauled out: the dock chore was kept up (backlog under 50)
  if (plantLevel < 50) return n ? ['The lake skimmed over: the boats were already hauled up on the bank and turned over.'] : [];
  if (rnd >= 0.5) return ['The lake skimmed over round the boats, but the ice was thin and held off the hulls. They need hauling out before the next freeze.'];
  const boat: BoatId = have.jon_boat ? 'jon_boat' : 'skiff';
  s.stock[boat] = Math.max(0, (s.stock[boat] ?? 0) - 1);
  return [`The first hard freeze caught a boat in the water: the ice crushed the ${BOATS[boat].name.toLowerCase()}. Haul them out before the lake skims over, or put a bubbler on the dock (the marina has one).`];
}

// ── raids by water ──

/** The direction (radians, 0 = east) from the camp to the nearest open water, with its distance (units), or null. Eight bearings, out to 18 units. */
export function waterBearing(s: GameState, camp: [number, number]): { ang: number; dist: number } | null {
  const lot = siteLot(s.site);
  if (!lot?.field.lake) return null;
  const g = groundOf(s);
  if (!g) return null;
  const ly = TOWN_Y + lot.field.lake.y;
  let best: { ang: number; dist: number } | null = null;
  for (let q = 0; q < 16; q++) {
    const a = q * Math.PI / 8;
    for (let d = 1; d <= 18; d += 0.5) {
      const x = camp[0] + Math.cos(a) * d, z = camp[1] + Math.sin(a) * d;
      if (g.h(x, z) < ly + 0.02) { if (!best || d < best.dist) best = { ang: a, dist: d }; break; }
    }
  }
  return best;
}

/**
 * Cost of the crossing for a crew with boats, on the same scale as the land lanes (terrain.ts: level ground 1 a cell, a cliff 30): the paddle across,
 * and the landing: a dock is a stair (1), a plain shore a scramble (6), a bluff's face a cliff (30). Guarded shore (a tower within 6 units) adds.
 */
export function waterLaneCost(dist: number, landing: 'dock' | 'shore' | 'cliff', guarded: boolean): number {
  const land = landing === 'dock' ? 1 : landing === 'shore' ? 6 : 30;
  return dist * 2.2 + land * (guarded ? 1.5 : 1);
}
