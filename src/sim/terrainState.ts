/**
 * Where the sim gets the lot's ground. The world draws the land from
 * `ParcelTerrain` (a pure function of the seed, the region and the listing's
 * creek and timber), so the sim can build the very same ground without the
 * renderer: the analysis (sim/terrain.ts) and every effect that reads it
 * (sim/terrainFx.ts) work headless, in tests and in the bot playtest.
 * Cached per place. Pure (no three.js).
 */
import { pinSeed } from './lotSeed';
import { ParcelTerrain } from '../game/parcel/parcelTerrain';
import { analyzeTerrain, approachLanes, boreProblem, findBore, siteCandidates, type BoreStats, type Corridor, type GroundSource, type Lane, type SiteCandidate, type Terrain } from './terrain';
import { PERIMETER, runFinished } from './perimeter';
import type { GameState } from './state';
import type { Pt } from './perimeter';

let override: GroundSource | null = null;
/** Tests (and the world, if it ever needs to) can pin the ground. */
export const setGroundOverride = (g: GroundSource | null): void => { override = g; terrains.clear(); liteTerrains.clear(); lanes.clear(); sources.clear(); sites.clear(); bores.clear(); };

const sources = new Map<string, GroundSource>();
const terrains = new Map<string, Terrain>();
const lanes = new Map<string, Lane[]>();

const keyOf = (s: GameState) => `${pinSeed(s.site, s.seed)}|${s.site.region}|${s.site.creek ? 1 : 0}|${s.site.timber}|${JSON.stringify(s.site.lot ?? null)}|${s.site.home.x0},${s.site.home.z0},${s.site.home.x1},${s.site.home.z1}`;

/** The ground of this game's lot (null: none known). */
export function groundOf(s: GameState): GroundSource | null {
  if (override) return override;
  const k = keyOf(s);
  let g = sources.get(k);
  if (!g) {
    const pt = new ParcelTerrain(pinSeed(s.site, s.seed), { creek: s.site.creek, timber: s.site.timber, region: s.site.region, lot: s.site.lot ?? null, home: s.site.home });
    g = { h: (x, z) => pt.natural(x, z).h, creek: pt.creek };
    sources.set(k, g);
  }
  return g;
}

/** The whole lot analysed (heights, slope, high ground, sight, lanes' cost, water). Built once per place; ~0.5 s. */
export function terrainOf(s: GameState): Terrain | null {
  const g = groundOf(s);
  if (!g) return null;
  const k = keyOf(s) + (override ? '|o' : '');
  let t = terrains.get(k);
  if (!t) { t = analyzeTerrain(g, s.site.home, { step: 1 }); terrains.set(k, t); }
  return t;
}

/** The middle of the family's buildings (else of the home block). */
export function campOf(s: GameState): Pt {
  const h = s.site.home;
  const live = s.structures.filter(st => !st.unplaced && !st.kind.startsWith('bunker_') && st.x >= h.x0 && st.x <= h.x1 && st.z >= h.z0 && st.z <= h.z1);
  return live.length ? [live.reduce((a, st) => a + st.x, 0) / live.length, live.reduce((a, st) => a + st.z, 0) / live.length] : [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2];
}

const liteTerrains = new Map<string, Terrain>();
/** Just what the raid lanes read, at step 2 (a quarter of the work): the cost grid and the creek. Built once per place. */
export function laneTerrainOf(s: GameState): Terrain | null {
  const g = groundOf(s);
  if (!g) return null;
  const k = keyOf(s) + (override ? '|o' : '');
  let t = liteTerrains.get(k);
  if (!t) { t = analyzeTerrain(g, s.site.home, { step: 2, lite: true }); liteTerrains.set(k, t); }
  return t;
}
/** The finished, standing tunnel-bridges and slope tunnels: ways a crew can use as easy going over hard ground (`outer` = the end away from the camp). */
export function corridorsOf(s: GameState): Corridor[] {
  const c = campOf(s);
  return s.perimeter.filter(r => PERIMETER[r.kind].vehicleWay && runFinished(r) && r.pts.length > 1).map(r => {
    const a = r.pts[0], b = r.pts[r.pts.length - 1];
    return { id: r.id, pts: r.pts.map(p => [p[0], p[1]] as [number, number]), outer: Math.hypot(a[0] - c[0], a[1] - c[1]) > Math.hypot(b[0] - c[0], b[1] - c[1]) ? a : b };
  });
}

/** The ways a crew could come at the camp, cached by place, camp (rounded to 4 units) and the tunnels standing. */
export function lanesOf(s: GameState): Lane[] {
  const t = laneTerrainOf(s);
  if (!t) return [];
  const cor = corridorsOf(s), c = campOf(s), k = `${keyOf(s)}|${override ? 'o' : ''}|${Math.round(c[0] / 4)}|${Math.round(c[1] / 4)}|${cor.map(x => x.id).join(',')}`;
  let l = lanes.get(k);
  if (!l) { l = approachLanes(t, c, undefined, cor); lanes.set(k, l); }
  return l;
}

const sites = new Map<string, SiteCandidate[]>();
/** What the land suits, best first (cached by place and camp). */
export function sitesOf(s: GameState): SiteCandidate[] {
  const t = terrainOf(s);
  if (!t) return [];
  const c = campOf(s), k = `${keyOf(s)}|${override ? 'o' : ''}|${Math.round(c[0] / 4)}|${Math.round(c[1] / 4)}`;
  let l = sites.get(k);
  if (!l) { l = siteCandidates(t, { lot: s.site.home, camp: c }, lanesOf(s)); sites.set(k, l); }
  return l;
}

const bores = new Map<string, { a: Pt; b: Pt; stats: BoreStats } | null>();
/** The best rock bore the land offers near the camp (sim/terrain.ts `findBore`, on the analysed grid), kept per place and camp. Null: none. */
export function boreOf(s: GameState): { a: Pt; b: Pt; stats: BoreStats } | null {
  const t = terrainOf(s);
  if (!t) return null;
  const c = campOf(s), k = `${keyOf(s)}|${override ? 'o' : ''}|${Math.round(c[0] / 4)}|${Math.round(c[1] / 4)}`;
  if (!bores.has(k)) { if (bores.size > 16) bores.clear(); const g = groundOf(s); bores.set(k, findBore(t.hAt, s.site.home, c, 22, g ? (a, b) => boreProblem(g, a, b) === null : undefined)); }
  return bores.get(k) ?? null;
}

/** The best bore from the low ground within `reach` of `near` to one of `ends` (points on a wall, say), or null: the same search as `boreOf`, not kept. */
export function boreTo(s: GameState, near: Pt, reach: number, ends?: readonly Pt[]): { a: Pt; b: Pt; stats: BoreStats } | null {
  const t = terrainOf(s), g = groundOf(s);
  if (!t) return null;
  return findBore(t.hAt, s.site.home, near, reach, g ? (a, b) => boreProblem(g, a, b) === null : undefined, ends);
}
