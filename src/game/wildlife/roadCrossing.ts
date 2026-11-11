/**
 * Animals on the county road (docs/DECISIONS.md, "Wildlife crossing the county road"): at dawn and dusk a deer, a few elk, a file of turkeys or a
 * herd of pronghorn walk across the road past the gate, and the traffic stops for them. What crosses, how many and how often come from the
 * herds that really live on the place (sim/wildlife `count`), so a place hunted out of deer sees none, and a road with a culvert for them
 * (sim/roadWildlife) still sees them (they use the road where they please; the culvert is what keeps them from being hit). Pure (tested): the
 * renderer supplies the herds, the clock and the road; this plans the day and says how a vehicle yields.
 */
import type { SpeciesId } from '../../sim/wildlife';
import { SPECIES } from '../../sim/wildlife';

/** The kinds that cross a road: the hoofed grazers and the flocks of turkeys (a coyote or a bear keeps to the cover). */
export const ROAD_CROSSERS: ReadonlySet<SpeciesId> = new Set<SpeciesId>(['deer', 'elk', 'moose', 'antelope', 'javelina', 'turkey']);

export interface RoadCross {
  /** Stable for the day: `<day>:<n>`. */
  id: string;
  sp: SpeciesId;
  /** The hour of the day the first animal steps onto the verge. */
  at: number;
  /** Along the road (world z) and which way across: +1 toward +x, -1 toward -x. */
  z: number; dir: 1 | -1;
  /** Animals in the file. */
  n: number;
}

/** The most a day holds, and the chance a day holds one for a place with `DEER_REF` hoofed animals living on it (scaled by how many do). */
export const MAX_PER_DAY = 2, BASE_CHANCE = 0.55, HERD_REF = 8;
/** Where along the road a crossing may be: this far either side of the gate (units; 90 m), and the hours (dawn and dusk). */
export const SPREAD = 15;
export const HOURS: ReadonlyArray<readonly [number, number]> = [[5.2, 7.6], [17.0, 19.8]];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; s = Math.imul(s, 3266489917) >>> 0; return (s >>> 0) / 4294967296; };
}

/** How many of the file a species crosses in (the group size the sim gives it, clamped to what the live herd is). */
function fileOf(sp: SpeciesId, live: number, r: () => number): number {
  const [a, b] = SPECIES[sp].group;
  return Math.max(1, Math.min(live, Math.round(a + r() * (b - a))));
}

/** The crossings of one day, in time order. `herds`: the living animals of each kind on the place (sim/wildlife `count`). Same inputs, same plan. */
export function planRoadCrossings(seed: number, day: number, herds: ReadonlyArray<{ sp: SpeciesId; n: number }>, gateZ: number): RoadCross[] {
  const pool = herds.filter(h => h.n > 0 && ROAD_CROSSERS.has(h.sp));
  if (!pool.length) return [];
  const r = rng(Math.imul(seed + 17, 2654435761) ^ Math.imul(day + 5, 40503));
  const live = pool.reduce((a, h) => a + h.n, 0);
  const chance = Math.min(0.9, BASE_CHANCE * Math.min(1.6, (live + 1) / HERD_REF));
  const out: RoadCross[] = [];
  for (let k = 0; k < MAX_PER_DAY; k++) {
    const window = HOURS[k % HOURS.length];
    if (r() >= chance * (k === 0 ? 0.8 : 0.5)) continue;
    let pick = r() * live, h = pool[0];
    for (const x of pool) { pick -= x.n; if (pick <= 0) { h = x; break; } }
    const at = window[0] + r() * (window[1] - window[0]);
    out.push({ id: `${day}:${k}`, sp: h.sp, at, z: gateZ + (r() * 2 - 1) * SPREAD, dir: r() < 0.5 ? 1 : -1, n: fileOf(h.sp, h.n, r) });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Crossing is for the hour it was planned: after a long fast-forward or a load nothing steps out late (the animal "already crossed"). */
export const stillDue = (c: RoadCross, hour: number): boolean => hour >= c.at && hour < c.at + 0.4;

/**
 * The points an animal walks, `[x, z, y]`, from the verge on one side to well off the road on the other: it approaches, steps onto the edge,
 * crosses the carriageway on a slight slant, steps off and walks away into the verge. `slot` is its place in the file (behind the leader).
 * `xAt` is the road's center line, `yAt` the height there (road surface on the carriageway, the ground off it).
 */
export function crossingDeck(xAt: (z: number) => number, yAt: (x: number, z: number) => number, halfW: number, c: Pick<RoadCross, 'z' | 'dir'>, slot: number): Array<[number, number, number]> {
  const d = c.dir, lag = slot * 0.5;
  const offs = [-(halfW + 0.9 + lag), -(halfW + 0.25), 0, halfW + 0.25, halfW + 1.2, halfW + 4, halfW + 8];
  return offs.map((o, i) => {
    const z = c.z + (i / (offs.length - 1)) * 0.9 * d + slot * 0.18;
    const x = xAt(z) + o * d;
    return [x, z, yAt(x, z)] as [number, number, number];
  });
}

/** Is an animal at lateral offset `lat` from the center line on the carriageway or its shoulder (where a driver sees it as in the way)? */
export const onRoad = (lat: number, halfW: number): boolean => Math.abs(lat) < halfW + 0.45;

/**
 * The speed a vehicle may keep with an animal `ahead` units in front of its nose (negative: already past it): full speed beyond `SEE`, slowing
 * to a stop `HOLD` short of it, and it goes on once the animal is past by `CLEAR`. A driver brakes for a deer, not for a bird on the shoulder.
 */
export const SEE = 3.6, HOLD = 0.7, CLEAR = 0.25;
export function yieldSpeed(ahead: number, speed: number): number {
  if (ahead < -CLEAR) return speed;
  if (ahead <= HOLD) return 0;
  if (ahead >= SEE) return speed;
  const t = (ahead - HOLD) / (SEE - HOLD);
  return speed * t * t * (3 - 2 * t);
}
