/**
 * Lots (docs/DECISIONS.md, "Varied lots and elevations"): how a lot's ground is read
 * for the listing and the sim (cached: the stats walk the whole rect), and a builder
 * for a place on a given lot. Pure.
 */
import { lotField, lotStats, type LotField, type LotKind, type LotSpec, type LotStats } from './lots';
import { HOME_RECT, sitePrice, RAW, type Acres, type Site } from './site';
import type { RegionId } from './regions';

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
  const h = site.home, key = `${spec.kind}:${spec.seed}:${spec.relief}:${spec.flip}:${spec.creek ? 1 : 0}:${spec.outlier ? 1 : 0}:${h.x0},${h.z0},${h.x1},${h.z1}`;
  let field = fieldCache.get(key);
  if (!field) { if (fieldCache.size > 64) fieldCache.clear(); field = lotField(spec, h); fieldCache.set(key, field); }
  return { field, stats: lotStatsOf(field) };
}

/**
 * A place on a given lot (QA, tests, and the listings' base): raw land with the lot's water, a middling well, nothing built.
 * `?lot=gorge&relief=9&acres=40&region=mountain_west&seed=3` starts one.
 */
export function makeLotSite(o: { region?: RegionId; kind: LotKind; acres?: Acres; relief?: number; seed?: number; outlier?: boolean; elevM?: number; flip?: 1 | -1; creek?: boolean }): Site {
  const region = o.region ?? 'mountain_west', acres = o.acres ?? 40;
  const kind = o.kind;
  const lake = kind === 'bluff' || kind === 'island';
  const creek = kind === 'bench' || kind === 'gorge' ? true : kind === 'hillside' ? !!o.creek : false;
  const spec: LotSpec = { kind, seed: o.seed ?? 1, relief: o.relief ?? 8, outlier: !!o.outlier, elevM: o.elevM ?? 2000, flip: o.flip ?? 1, creek: kind === 'hillside' ? creek : undefined };
  const base = { region, acres, home: HOME_RECT[acres], creek: creek || lake, spring: kind === 'saddle', gwDepth: 40, gwQuality: 'good' as const, timber: 1, soil: 'thin' as const, miles: 8, improvements: { ...RAW, poleFt: 600, driveFt: 600 }, lot: spec };
  return { id: `${region}-lot-${kind}-${spec.seed}`, name: `Test ${kind} lot`, ...base, price: sitePrice(base) };
}
