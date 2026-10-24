/**
 * The land you buy (GDS §10.1, decided with the user: pick the region, say
 * what you're looking for, then choose from the listings; "Savings budget";
 * "5 to 80 acres"). Each listing is randomized within the region: how big,
 * whether the creek runs through it or a quarter mile off on a neighbor's, a
 * spring, how deep and how good the groundwater is, timber, soil, and how
 * far out on the county road. The price follows the region (regions.ts, 2025
 * land values) and the features, and comes out of the family's savings, so
 * cheap land leaves more to build and stock with. Pure.
 */
import { mulberry32 } from './rng';
import { REGION_IDS, REGIONS, SIZE_FACTOR, type RegionId } from './regions';

/** The home square on the survey grid (world units; 67 = a quarter-quarter section, 40 acres). */
export const FORTY = 67;
export interface Rect { x0: number; z0: number; x1: number; z1: number }

export type Acres = 5 | 20 | 40 | 80;
/** Where the place sits on the survey grid. Every size fronts the county road on the east (x = 67). */
export const HOME_RECT: Record<Acres, Rect> = {
  5: { x0: FORTY - 23.7, z0: 21.6, x1: FORTY, z1: 45.3 },     // ≈ 142 m square off the road, mid-forty
  20: { x0: FORTY / 2, z0: 0, x1: FORTY, z1: FORTY },         // the east half
  40: { x0: 0, z0: 0, x1: FORTY, z1: FORTY },
  80: { x0: -FORTY, z0: 0, x1: FORTY, z1: FORTY },            // the home forty and the west forty
};

export type GroundwaterQuality = 'good' | 'hard' | 'iron' | 'arsenic';
export const GW_NAME: Record<GroundwaterQuality, string> = {
  good: 'good water', hard: 'hard water (scale)', iron: 'iron in it (stains, taste)', arsenic: 'arsenic over the limit: needs treatment',
};
export type Soil = 'thin' | 'fair' | 'deep';

export interface Site {
  id: string;
  name: string;
  region: RegionId;
  acres: Acres;
  home: Rect;
  /** The creek runs through the place, or on a neighbor's land about a quarter mile off. */
  creek: boolean;
  /** A spring on the place: a small free flow, year round. */
  spring: boolean;
  /** Depth to water for a well (m). Hand-dug wells reach about 9 m. */
  gwDepth: number;
  gwQuality: GroundwaterQuality;
  /** How much timber, against the usual (0.3 open ground … 1.5 heavy timber). */
  timber: number;
  soil: Soil;
  /** Miles to town on the county road. */
  miles: number;
  price: number;
}

/** The least a listing should leave to build and stock with (the agent flags anything tighter). */
export const MIN_LEFT = 20_000;
/**
 * How the family lives in peacetime (GDS §10.7) and what they have to spend:
 * people who build a compound are roughly the top 10–15 % of households
 * (about $1M+ net worth; the US median is about $190k).
 */
export type Lifestyle = 'weekend' | 'fulltime' | 'independent';
export const LIFESTYLE: Record<Lifestyle, { name: string; blurb: string; budget: number; passive: number; jobs: boolean; ready: boolean }> = {
  weekend: { name: 'Weekend getaway', blurb: 'They keep the town house and both jobs, and come up on weekends and vacations to improve the place a little at a time.', budget: 450_000, passive: 0, jobs: true, ready: false },
  fulltime: { name: 'Full-time, with jobs', blurb: 'They sold the town house and live on the place. Both still work in town on weekdays.', budget: 800_000, passive: 0, jobs: true, ready: true },
  independent: { name: 'Financially independent', blurb: 'No nine-to-five: they live on the place full time on savings and investment income.', budget: 1_400_000, passive: 45_000, jobs: false, ready: true },
};
/** What the family has to spend (the land comes out of it). */
export const SAVINGS = LIFESTYLE.fulltime.budget;
export const affordable = (s: Site, budget = SAVINGS) => s.price <= budget - MIN_LEFT;

export function sitePrice(s: Omit<Site, 'price' | 'id' | 'name'>): number {
  const r = REGIONS[s.region];
  let k = 1;
  if (s.creek) k *= 1.35;
  if (s.spring) k *= 1.12;
  k *= s.gwDepth < 12 ? 1.1 : s.gwDepth > 100 ? 0.85 : 1;
  k *= s.gwQuality === 'arsenic' ? 0.8 : s.gwQuality === 'iron' ? 0.93 : 1;
  k *= s.timber > 1.1 ? 1.08 : s.timber < 0.5 ? 0.95 : 1;
  k *= s.soil === 'deep' ? 1.1 : s.soil === 'thin' ? 0.9 : 1;
  k *= 1 + 0.2 * Math.max(0, 1 - s.miles / 20);       // close to town costs more
  return Math.round(s.acres * r.perAcre * SIZE_FACTOR[s.acres] * k / 500) * 500;
}

/** The place as it always was before listings (old saves, tests): 40 acres in the Mountain West, the creek through it. */
export const CLASSIC: Site = {
  id: 'classic', name: 'The old place', region: 'mountain_west', acres: 40, home: HOME_RECT[40], creek: true, spring: false,
  gwDepth: 8, gwQuality: 'good', timber: 1, soil: 'fair', miles: 12, price: 0,
};

/** County roads the listings sit on (each listing is named for its road, so no two read alike). */
const ROADS = ['Cedar Creek', 'Old Mill', 'Haskell', 'Stony Point', 'Bear Hollow', 'Quarry', 'Sawtooth', 'Miller', 'Juniper Flat', 'Coyote Ridge', 'Schoolhouse', 'Pine Bench', 'Dutchman', 'Elk Draw', 'Lone Tree', 'Spring Gulch', 'Badger', 'Two Mile', 'Cottonwood', 'Hatchery'];
const KIND: Record<Acres, string[]> = { 5: ['lot', 'parcel'], 20: ['twenty', 'parcel'], 40: ['forty', 'quarter-quarter'], 80: ['eighty', 'half quarter'] };

/** What the family is looking for (the filters on the listings). */
export interface LandWish {
  acres: Acres | 'any';
  water: 'creek' | 'spring' | 'dry' | 'any';
  timber: 'open' | 'some' | 'heavy' | 'any';
  town: 'near' | 'far' | 'any';
}
export const ANY_WISH: LandWish = { acres: 'any', water: 'any', timber: 'any', town: 'any' };

/**
 * Listings for this seed, region and wish: six parcels. With no size asked
 * for, the first four are one of each size; with no water asked for, at
 * least one has the creek and one is dry. Prices follow the region and the
 * features; some may be over budget (the card says so).
 */
export function listings(seed: number, region: RegionId = 'mountain_west', wish: LandWish = ANY_WISH, n = 6, budget = SAVINGS): Site[] {
  const R = REGIONS[region];
  const r = mulberry32(seed * 977 + 13 + REGION_IDS.indexOf(region) * 7919);
  const sizes: Acres[] = [5, 20, 40, 80];
  const creekAt = Math.floor(r() * 4), dryAt = (creekAt + 1 + Math.floor(r() * 3)) % 4;
  const out: Site[] = [];
  for (let k = 0; k < n; k++) {
    const acres: Acres = wish.acres !== 'any' ? wish.acres : k < 4 ? sizes[k] : sizes[Math.floor(r() * 4)];
    const roll = r();
    const creek = wish.water === 'creek' ? true : wish.water === 'spring' || wish.water === 'dry' ? false
      : k === creekAt ? true : k === dryAt ? false : roll < R.creekOdds;
    const spring = wish.water === 'spring' ? true : wish.water === 'dry' ? false : !creek && r() < R.springOdds;
    const [g0, g1] = R.gwDepth;
    const gwDepth = Math.round(creek || spring ? g0 + (g1 - g0) * 0.35 * r() : g0 + (g1 - g0) * r());
    const q = r(), b = R.gwBad;
    const gwQuality: GroundwaterQuality = q < b.arsenic ? 'arsenic' : q < b.arsenic + b.iron ? 'iron' : q < b.arsenic + b.iron + b.hard ? 'hard' : 'good';
    const [t0, t1] = R.timber;
    const tw = wish.timber === 'open' ? [t0, Math.min(t1, 0.5)] : wish.timber === 'heavy' ? [Math.max(t0, 1.15), Math.max(t1, 1.3)] : wish.timber === 'some' ? [Math.max(t0, 0.5), Math.min(t1, 1.1)] : [t0, t1];
    const timber = Math.round((tw[0] + (tw[1] - tw[0]) * r()) * 10) / 10;
    const s = r();
    const soil: Soil = s < R.soil.thin ? 'thin' : s > 1 - R.soil.deep ? 'deep' : 'fair';
    const m = r();
    const miles = Math.round(wish.town === 'near' ? 2 + m * 8 : wish.town === 'far' ? 15 + m * 20 : acres === 5 ? 3 + m * 8 : 6 + m * 22);
    const base = { region, acres, home: HOME_RECT[acres], creek, spring, gwDepth, gwQuality, timber, soil, miles };
    out.push({ id: `${region}-${k}`, name: `${ROADS[Math.floor(r() * ROADS.length)]} Road ${KIND[acres][Math.floor(r() * 2)]}`, ...base, price: sitePrice(base) });
  }
  // nothing in budget on an open search: the agent finds something that is (small, dry, way out)
  if (wish.acres === 'any' && !out.some(l => affordable(l, budget))) {
    const last = out[n - 1];
    const cheap = { ...last, acres: 5 as Acres, home: HOME_RECT[5], creek: false, spring: false, timber: Math.min(last.timber, 0.6), miles: 24, name: 'Two Mile Road lot' };
    out[n - 1] = { ...cheap, price: sitePrice(cheap) };
  }
  return out;
}

export interface Fact { label: string; value: string; tone?: 'good' | 'bad' }
/** The listing card's rows. */
export function siteFacts(s: Site): Fact[] {
  return [
    { label: 'Water', value: s.creek ? 'Creek runs through' : s.spring ? 'Spring, no creek' : 'Dry (creek on the neighbor\'s)', tone: s.creek || s.spring ? 'good' : 'bad' },
    { label: 'Well', value: `${s.gwDepth} m${s.gwDepth <= 9 ? ' (hand-dug OK)' : ''}`, tone: s.gwDepth <= 20 ? 'good' : s.gwDepth > 90 ? 'bad' : undefined },
    { label: 'Groundwater', value: GW_SHORT[s.gwQuality], tone: s.gwQuality === 'good' ? 'good' : s.gwQuality === 'arsenic' ? 'bad' : undefined },
    { label: 'Timber', value: s.timber > 1.1 ? 'Heavy' : s.timber < 0.5 ? 'Open ground' : 'Some' },
    { label: 'Soil', value: s.soil === 'deep' ? 'Deep' : s.soil === 'thin' ? 'Thin, rocky' : 'Fair', tone: s.soil === 'deep' ? 'good' : s.soil === 'thin' ? 'bad' : undefined },
    { label: 'Town', value: `${s.miles} mi` },
  ];
}
const GW_SHORT: Record<GroundwaterQuality, string> = { good: 'Good', hard: 'Hard', iron: 'Iron', arsenic: 'Arsenic: treat it' };

/** Land beyond the home forty that comes with the place (the 80's west forty), for planting and pins. */
export function homeOutsideForty(s: Site): Rect[] {
  const h = s.home;
  return h.x0 < 0 ? [{ x0: h.x0, z0: h.z0, x1: 0, z1: h.z1 }] : [];
}

/** Why a piece can't go on this land (null = it can): a hand-dug well needs water within about 9 m. */
export function siteProblem(s: Site, kind: string): string | null {
  if (kind === 'well_hand' && s.gwDepth > 9) return `Water is ${s.gwDepth} m down here: too deep to dig by hand (drill a well)`;
  return null;
}

/** What the driller charges past the usual 60 m bore ($/m, about $45 a foot). */
export const DRILL_PER_M = 150;
export const drillExtra = (s: Site) => Math.max(0, s.gwDepth - 60) * DRILL_PER_M;

/** Crop yield by soil. */
export const SOIL_YIELD: Record<Soil, number> = { thin: 0.75, fair: 1, deep: 1.2 };
/** A spring's flow (L a day, carried: no pressure without a pump). */
export const SPRING_LPD = 1200;
