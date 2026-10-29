/**
 * The road of a place, derived (never saved): the world's own ground, camp and
 * county road, run through the planner (sim/roadPlan.ts). Cached per place so
 * the quote, the winter closure, the raid lanes and the world's mesh all read
 * one plan. Like sim/terrainState.ts this builds the very ground the world
 * draws (`ParcelTerrain`), headless.
 */
import { ParcelTerrain, PARCEL_SIZE } from '../game/parcel/parcelTerrain';
import { pickCamp } from '../game/parcel/campSpot';
import { countyRoad, ROAD_W } from '../game/region/countyRoad';
import { mulberry32 } from './rng';
import { planRoad, type RoadGround, type RoadPlan } from './roadPlan';
import type { Site } from './site';
import type { GameState } from './state';

type SiteKey = Pick<Site, 'region' | 'home' | 'lot' | 'creek' | 'timber'>;

const parcels = new Map<string, ParcelTerrain>();
const plans = new Map<string, RoadPlan>();

const keyOf = (site: SiteKey, seed: number) => `${seed}|${site.region}|${site.creek ? 1 : 0}|${site.timber}|${JSON.stringify(site.lot ?? null)}|${site.home.x0},${site.home.z0},${site.home.x1},${site.home.z1}`;

/** The seed a listing's road is planned with before there is a game: the lot's own (its ground does not depend on the game's), else a fixed one. */
export const listingSeed = (site: Pick<Site, 'lot'>): number => site.lot?.seed ?? 1;

/** The place's parcel terrain (cached). */
export function parcelFor(site: SiteKey, seed: number): ParcelTerrain {
  const k = keyOf(site, seed);
  let p = parcels.get(k);
  if (!p) {
    if (parcels.size > 12) parcels.clear();
    p = new ParcelTerrain(seed, { creek: site.creek, timber: site.timber, region: site.region, lot: site.lot ?? null, home: site.home });
    parcels.set(k, p);
  }
  return p;
}

/** Everything the planner reads of the ground. */
export function roadGroundOf(p: ParcelTerrain): RoadGround {
  const lot = p.lot;
  // a dry wash (desert) is crossed like a creek: a dip
  const creek = p.wash
    ? { zAt: p.wash, waterY: (x: number) => p.natural(x, p.wash!(x)).h - 0.02, halfWidth: 1.0 }
    : p.creek;
  return {
    h: (x, z) => p.natural(x, z).h,
    sample: (x, z) => { const n = p.natural(x, z); return { h: n.h, forest: n.forest }; },
    creek,
    lakeY: p.lakeY,
    rock: lot ? (x, z) => lot.rock(x, z) : undefined,
    cover: (x, z) => p.natural(x, z).forest,
  };
}

/** Plan the road of a place: from the county road, through a gate on the east line, to the yard beside the camp. */
export function roadPlanFor(site: SiteKey, seed: number, parcel?: ParcelTerrain): RoadPlan {
  const k = keyOf(site, seed);
  let plan = plans.get(k);
  if (plan) return plan;
  const p = parcel ?? parcelFor(site, seed), h = site.home;
  const camp = pickCamp(p, h);
  const yard: [number, number] = [camp.x + 2.2, camp.z + 1.2];
  const county = countyRoad(site.region, seed);
  const fx = Math.min(h.x1, PARCEL_SIZE);
  // where the entrance is by habit (a field gate, the easement): seeded, or at the start of the causeway to an island
  const zLo = Math.max(4, h.z0 + 3), zHi = Math.min(PARCEL_SIZE - 4, h.z1 - 3), r = mulberry32(seed * 40503 + 11);
  let zc = zLo + (zHi - zLo) * (0.15 + 0.7 * r());
  const cw = p.lot?.causeway;
  if (cw) { let bx = -Infinity; for (const q of cw.pts) if (q[0] > bx) { bx = q[0]; zc = q[1]; } }
  const half = 8;
  plan = planRoad({
    region: site.region, seed, ground: roadGroundOf(p),
    rect: { x0: h.x0, z0: h.z0, x1: fx, z1: h.z1 },
    frontage: { x: fx, zMin: zLo, zMax: zHi, band: [zc - half, zc + half] },
    county: county.x, roadHalf: ROAD_W / 2, yard,
  });
  if (plans.size > 24) plans.clear();
  plans.set(k, plan);
  return plan;
}

/** The road of this game's place. */
export const roadPlanOf = (s: Pick<GameState, 'site' | 'seed'>): RoadPlan => roadPlanFor(s.site, s.seed);

/** The road of a listing (before there is a game): planned on the lot's own ground, so it matches the ground the family will see. */
export const listingRoad = (site: SiteKey): RoadPlan => roadPlanFor(site, listingSeed(site));

/** Tests and QA. */
export function clearRoadCaches(): void { parcels.clear(); plans.clear(); }
