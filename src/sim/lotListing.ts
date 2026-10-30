/**
 * Lots on the market (docs/DECISIONS.md, "Varied lots and elevations"): which
 * archetypes a region offers, how a lot's ground is read for the listing and
 * the sim (cached: the stats walk the whole rect), and a builder for a place
 * on a given lot. Pure.
 */
import { ALT_RANGE, LOT_NAME, lotField, lotStats, profileLine, type LotField, type LotKind, type LotSpec, type LotStats } from './lots';
import { HOME_RECT, sitePrice, RAW, type Acres, type Fact, type Site } from './site';
import type { RegionId } from './regions';
import { listingRoad } from './roadState';
import { planWords } from './roadPlan';

const statsCache = new WeakMap<LotField, LotStats>();
/** The stats of a lot's ground (computed once per field). */
export function lotStatsOf(f: LotField): LotStats {
  let s = statsCache.get(f);
  if (!s) { s = lotStats(f); statsCache.set(f, s); }
  return s;
}

const fieldCache = new Map<string, LotField>();
/** The field and stats of a site's lot (null on the classic ground); cached by the spec and the home rect. */
export function siteLot(site: Pick<Site, 'lot' | 'home'>): { field: LotField; stats: LotStats } | null {
  const spec = site.lot;
  if (!spec) return null;
  const h = site.home, key = `${spec.kind}:${spec.seed}:${spec.relief}:${spec.flip}:${spec.creek ? 1 : 0}:${spec.cutbank ? 1 : 0}:${spec.outlier ? 1 : 0}:${h.x0},${h.z0},${h.x1},${h.z1}`;
  let field = fieldCache.get(key);
  if (!field) { if (fieldCache.size > 64) fieldCache.clear(); field = lotField(spec, h); fieldCache.set(key, field); }
  return { field, stats: lotStatsOf(field) };
}

/**
 * A place on a given lot (QA, tests, and the listings' base): raw land with the lot's water, a middling well, nothing built.
 * `?lot=gorge&relief=9&acres=40&region=mountain_west&seed=3` starts one.
 */
export function makeLotSite(o: { region?: RegionId; kind: LotKind; acres?: Acres; relief?: number; seed?: number; outlier?: boolean; elevM?: number; flip?: 1 | -1; creek?: boolean; cutbank?: boolean }): Site {
  const region = o.region ?? 'mountain_west', acres = o.acres ?? 40;
  const kind = o.kind;
  const lake = kind === 'bluff' || kind === 'island';
  const creek = kind === 'bench' || kind === 'gorge' ? true : kind === 'hillside' ? !!o.creek : false;
  const spec: LotSpec = { kind, seed: o.seed ?? 1, relief: o.relief ?? 8, outlier: !!o.outlier, elevM: o.elevM ?? 2000, flip: o.flip ?? 1, creek: kind === 'hillside' ? creek : undefined, ...(kind === 'hillside' && o.cutbank && !creek ? { cutbank: true } : {}) };
  const base = { region, acres, home: HOME_RECT[acres], creek: creek || lake, spring: kind === 'saddle', gwDepth: 40, gwQuality: 'good' as const, timber: 1, soil: 'thin' as const, miles: 8, improvements: { ...RAW, poleFt: 600, driveFt: 600 }, lot: spec };
  return { id: `${region}-lot-${kind}-${spec.seed}`, name: `Test ${kind} lot`, ...base, price: sitePrice(base) };
}

// ── what the market offers ──

type Water = 'creek' | 'spring' | 'dry' | 'lake';
/** The waters a kind can have, with their odds. */
const KIND_WATER: Record<LotKind, Array<[Water, number]>> = {
  ridge: [['spring', 0.25], ['dry', 0.75]],
  hillside: [['creek', 0.45], ['spring', 0.2], ['dry', 0.35]],
  bench: [['creek', 1]],
  gorge: [['creek', 1]],
  mesa: [['dry', 0.85], ['spring', 0.15]],
  saddle: [['spring', 0.85], ['dry', 0.15]],
  bluff: [['lake', 1]],
  island: [['lake', 1]],
};

interface RegionLots {
  /** Chance a listing in this region is on an archetype (the rest keep the region's ordinary ground). */
  share: number;
  /** Odds of each kind. */
  kinds: Partial<Record<LotKind, number>>;
  /** Relief against the Mountain West's (1). */
  relief: number;
  /** Chance a gorge / mesa / bluff listing is one of the special 150-300 m outliers. */
  outlier: number;
}

/**
 * Which regions list varied ground. The mountain regions get the full set; the lake country gets bluffs and islands at
 * gentle relief; every other region's hills stay gentle, as they were.
 */
export const REGION_LOTS: Partial<Record<RegionId, RegionLots>> = {
  mountain_west: { share: 0.9, kinds: { ridge: 1, hillside: 2.2, bench: 1.6, gorge: 1, mesa: 0.8, saddle: 0.8, bluff: 0.7, island: 0.4 }, relief: 1, outlier: 0.1 },
  appalachia: { share: 0.8, kinds: { ridge: 1.5, hillside: 2.5, bench: 1.5, gorge: 1, saddle: 0.7, bluff: 0.3 }, relief: 0.8, outlier: 0.04 },
  pnw: { share: 0.55, kinds: { ridge: 1.2, hillside: 2.4, bench: 1.2, gorge: 0.8, saddle: 0.5, bluff: 0.6, island: 0.4 }, relief: 0.85, outlier: 0.04 },
  north_woods: { share: 0.3, kinds: { bluff: 1, island: 1 }, relief: 0.4, outlier: 0 },
};

export const hasLots = (region: RegionId): boolean => !!REGION_LOTS[region];

/** Acres of the lot's shortest side relative to 40 acres: smaller places have less room to fall. */
const reliefScale = (acres: Acres): number => { const h = HOME_RECT[acres]; return 0.62 + 0.38 * Math.min(h.x1 - h.x0, h.z1 - h.z0) / 67; };

export interface LotRoll { spec: LotSpec; creek: boolean; spring: boolean; lake: boolean }

/**
 * Roll a lot for a listing: its kind (only kinds that can have the water the buyer asked for), the water, the relief
 * (4.2-9.7 units, 25-58 m, scaled by the region and the lot's size; 26-50 units, 150-300 m, for an outlier) and the altitude. `r` is a random stream of its own, so rolling lots
 * never moves the rolls the rest of the listing uses. Returns null for a listing that keeps the region's ordinary ground.
 */
export function rollLot(r: () => number, region: RegionId, acres: Acres, water: 'creek' | 'spring' | 'dry' | 'any', seed: number): LotRoll | null {
  const R = REGION_LOTS[region];
  if (!R) return null;
  const take = r() < R.share, pickRoll = r(), waterRoll = r(), reliefRoll = r(), outlierRoll = r(), altRoll = r(), flip = r() < 0.2 ? -1 : 1, spare = r();
  if (!take) return null;
  const want = (w: Water) => water === 'any' || (water === 'creek' ? w === 'creek' || w === 'lake' : w === water);
  // kinds that can have the water asked for
  const opts = (Object.entries(R.kinds) as Array<[LotKind, number]>)
    .filter(([k]) => !(k === 'mesa' && acres === 5))
    .map(([k, wt]) => [k, wt * KIND_WATER[k].filter(([w]) => want(w)).reduce((a, [, p]) => a + p, 0)] as [LotKind, number])
    .filter(([, wt]) => wt > 0);
  if (!opts.length) return null;
  const total = opts.reduce((a, [, wt]) => a + wt, 0);
  let t = pickRoll * total, kind = opts[0][0];
  for (const [k, wt] of opts) { if (t < wt) { kind = k; break; } t -= wt; }
  // the water this kind has, within what was asked
  const choices = KIND_WATER[kind].filter(([w]) => want(w));
  const ct = choices.reduce((a, [, p]) => a + p, 0);
  let u = waterRoll * ct, w = choices[0][0];
  for (const [ww, p] of choices) { if (u < p) { w = ww; break; } u -= p; }
  // (an outlier needs the room for its cliffs: not on the small lots)
  const outlier = (kind === 'gorge' || kind === 'mesa' || kind === 'bluff') && acres >= 40 && R.outlier > 0 && outlierRoll < R.outlier;
  let relief = outlier ? 26 + 24 * reliefRoll : (4.2 + 5.5 * reliefRoll) * R.relief * reliefScale(acres);
  if (region === 'north_woods') relief = 2.5 + 2 * reliefRoll;
  const [a0, a1] = ALT_RANGE[region] ?? [300, 500];
  const bias = kind === 'ridge' || kind === 'mesa' || kind === 'saddle' ? 0.2 : kind === 'bench' || kind === 'gorge' || kind === 'island' ? -0.15 : 0;
  const elevM = Math.round((a0 + (a1 - a0) * clamp01(altRoll * 0.7 + 0.15 + bias)) / 10) * 10;
  const spec: LotSpec = {
    kind, seed: Math.floor(spare * 1e6) + seed % 1000, relief: Math.round(relief * 10) / 10, outlier, elevM, flip: kind === 'hillside' && w === 'creek' ? 1 : kind === 'hillside' || kind === 'bench' || kind === 'ridge' ? flip : 1,
    creek: kind === 'hillside' ? w === 'creek' : undefined,
  };
  // one in eight dry hillsides is a special listing cut into the slope (a rock face over a level shelf); a hash of the seed, so the rolls above never move
  if (kind === 'hillside' && w !== 'creek' && (spec.seed * 0.6180339887) % 1 < 0.125) spec.cutbank = true;
  // (a hillside with a creek always falls toward the road: the creek would run uphill from it otherwise)
  return { spec, creek: w === 'creek' || w === 'lake', spring: w === 'spring', lake: w === 'lake' };
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** How deep the well goes, against the region's usual: ridges and mesas are dry heights, benches and gorges sit on the water. */
/** The length of drive a lot needs, ft: the straight run from the county road to the best pad (sim/slope.ts lengthens it for switchbacks). */
export function lotDriveFt(site: Pick<Site, 'lot' | 'home'>): number | null {
  const lot = siteLot(site);
  return lot ? Math.max(150, Math.round(lot.stats.accessM * 3.281 / 10) * 10) : null;
}

export const GW_FACTOR: Record<LotKind, number> = { ridge: 2.0, hillside: 1.3, bench: 0.6, gorge: 0.5, mesa: 2.2, saddle: 1.4, bluff: 0.9, island: 0.3 };

/**
 * What the ground does to the price: flat pads and an easy road raise it, a lake raises it, extreme relief lowers it.
 * Multiplies the region's per-acre price (sim/site.ts sitePrice).
 */
export function lotPriceFactor(site: Pick<Site, 'lot' | 'home'> & Partial<Pick<Site, 'creek' | 'spring'>>): number {
  const lot = siteLot(site);
  if (!lot) return 1;
  const { stats: st } = lot, spec = site.lot!;
  let k = 0.55 + 0.55 * Math.min(1, st.padFrac / 0.4);
  const g = st.accessMaxPct;
  k *= g <= 6 ? 1.06 : g <= 10 ? 1 : g <= 16 ? 0.9 : g <= 25 ? 0.78 : 0.6;
  k *= { ridge: 1.05, hillside: 0.95, bench: 1.1, gorge: 0.85, mesa: 1, saddle: 0.9, bluff: 1.1, island: 1.3 }[spec.kind];
  if (spec.outlier) k *= spec.kind === 'mesa' ? 0.5 : 0.7;   // (a butte has no ramp: priced as all but unbuildable)
  // dry heights (no creek, no spring on a ridge, mesa or saddle): the water is a deep well away, and the card says so
  if ((spec.kind === 'ridge' || spec.kind === 'mesa' || spec.kind === 'saddle') && site.creek === false && site.spring === false) k *= 0.9;
  return Math.round(k * 100) / 100;
}

// ── the listing card ──

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const M_TO_FT = 3.281;
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
const acresOfM2 = (m2: number) => Math.round(m2 / 4047 * 10) / 10;

/** Which way the main fall faces, in words (a pad's sun and wind read from it). */
export function aspectWord(aspect: number): string {
  const a = ((aspect % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), i = Math.round(a / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

/**
 * The rows of the listing card's terrain block: what the ground is like, in plain words. Numbers come from the lot's
 * own ground (sim/lots.ts lotStats); the sim's costs and climate read the same numbers (sim/slope.ts).
 */
export function terrainFacts(site: Pick<Site, 'lot' | 'home'> & Partial<Pick<Site, 'region' | 'creek' | 'timber'>>): Fact[] {
  const lot = siteLot(site);
  if (!lot) return [];
  const { stats: s } = lot, spec = site.lot!;
  const out: Fact[] = [];
  out.push({ label: 'Ground', value: `${LOT_NAME[spec.kind]}${spec.outlier ? ', extreme relief' : ''}, ${n0(spec.elevM)} m (${n0(spec.elevM * M_TO_FT)} ft)` });
  out.push({ label: 'Relief', value: `${n0(s.dropM)} m from low to high · slopes avg ${Math.round(s.meanSlopePct)} %, steepest ${n0(s.maxSlopePct)} %`, tone: s.dropM > 140 ? 'bad' : undefined });
  if (spec.cutbank) out.push({ label: 'Rock face', value: 'Rock face above the pad: a cutbank over a level shelf: a compound can be notched into it, and a crew on foot needs ladders to cross it', tone: 'good' });
  const flat = Math.round(s.padFrac * 100);
  out.push({ label: 'Flat ground', value: `${flat} % buildable${s.padM2 > 0 ? ` · best pad ${acresOfM2(s.padM2)} acre${acresOfM2(s.padM2) === 1 ? '' : 's'}` : ''}`, tone: flat >= 30 ? 'good' : flat < 12 ? 'bad' : undefined });
  // the road in is the planned one (sim/roadPlan.ts): where it winds, switchbacks, bridges and bores
  const rp = listingRoad({ region: site.region ?? 'mountain_west', creek: site.creek ?? false, timber: site.timber ?? 1, home: site.home, lot: site.lot }), words = planWords(rp);
  out.push({ label: 'Road in', value: `${words[0]}${words.length > 1 ? ': ' + words.slice(1).filter(w => !/cattle guard|^\d* ?culverts?$|^a culvert$/.test(w)).join(', ') : ''}`.replace(/: $/, ''), tone: rp.engineer || rp.hairpins.length >= 3 || rp.structures.some(x => x.kind === 'bridge' || x.kind === 'bridge1' || x.kind === 'tunnel') ? 'bad' : rp.maxGradePct <= 8 && !rp.hairpins.length ? 'good' : undefined });
  out.push({ label: 'Road cost', value: `about $${Math.round(rp.usd / 1000).toLocaleString('en-US')}k to put in, ${rp.days} days`, tone: rp.usd > 150_000 ? 'bad' : rp.usd < 30_000 ? 'good' : undefined });
  out.push({ label: 'Sun', value: s.sun >= 1.08 ? `Faces ${aspectWord(s.aspect)}: warm, good for solar and gardens` : s.sun <= 0.93 ? `Faces ${aspectWord(s.aspect)}: cool, slow to thaw` : 'Even sun', tone: s.sun >= 1.08 ? 'good' : s.sun <= 0.93 ? 'bad' : undefined });
  const head = s.reservoirM;
  out.push({ label: 'Water head', value: head >= 7 ? `A bench ${n0(head)} m above the camp: a tank there feeds the house by gravity` : head > 0 ? `Highest bench is ${n0(head)} m above the camp: pump it` : 'Nothing above the camp: pump everything', tone: head >= 7 ? 'good' : undefined });
  if (s.creekDropM >= 3) out.push({ label: 'Creek', value: `Falls ${n0(s.creekDropM)} m across the place: room for a micro-hydro`, tone: 'good' });
  out.push({ label: 'High ground', value: s.standM >= 5 ? `The pad stands ${n0(s.standM)} m above the land round it: it sees far` : s.standM <= -5 ? `The pad sits ${n0(-s.standM)} m down in a bowl: easy to be seen into` : 'Neither high nor low', tone: s.standM >= 5 ? 'good' : s.standM <= -5 ? 'bad' : undefined });
  out.push({ label: 'Approaches', value: s.lanesOpen <= 2 ? `Only ${s.lanesOpen} of 8 ways in on foot are open, easiest from the ${COMPASS[s.easiestLane]}: a natural choke` : `${s.lanesOpen} of 8 ways in on foot are open, easiest from the ${COMPASS[s.easiestLane]}`, tone: s.lanesOpen <= 3 ? 'good' : s.lanesOpen >= 7 ? 'bad' : undefined });
  if (s.floodFrac > 0.04) out.push({ label: 'Floods', value: `${Math.round(s.floodFrac * 100)} % of the place is creek floor that floods in storms`, tone: 'bad' });
  if (spec.kind === 'island') out.push({ label: 'Access', value: 'Reached by a causeway: one way on, one way out', tone: undefined });
  return out;
}

/** The cross-section for the chart: heights (m above the lowest point on the line), water, the pad and the road end. */
export interface ProfileChart { pts: Array<{ d: number; yM: number; wet: boolean }>; lengthM: number; minM: number; maxM: number; padAt: number; waterM: number | null; axis: 'W-E' | 'S-N'; roadEnd: boolean }

export function profileChart(site: Pick<Site, 'lot' | 'home'>, n = 60): ProfileChart | null {
  const lot = siteLot(site);
  if (!lot) return null;
  const { field: f, stats: s } = lot, r = site.home, kind = site.lot!.kind;
  const we = profileLine(f, [r.x0, s.pad[1]], [r.x1, s.pad[1]], n), sn = profileLine(f, [s.pad[0], r.z0], [s.pad[0], r.z1], n);
  const range = (p: typeof we) => Math.max(...p.map(q => q.yM)) - Math.min(...p.map(q => q.yM));
  const across = kind === 'bench' || kind === 'gorge' ? true : kind === 'hillside' || kind === 'mesa' || kind === 'bluff' || kind === 'island' ? false : range(sn) > range(we);
  const pts = across ? sn : we, lo = Math.min(...pts.map(q => q.yM)), hi = Math.max(...pts.map(q => q.yM));
  const L = pts[pts.length - 1].d;
  const padAt = across ? (s.pad[1] - r.z0) * 6 : (s.pad[0] - r.x0) * 6;
  return { pts: pts.map(q => ({ ...q, yM: q.yM - lo })), lengthM: L, minM: 0, maxM: hi - lo, padAt, waterM: f.lake ? (f.lake.y * 6 - lo) : null, axis: across ? 'S-N' : 'W-E', roadEnd: !across };
}
