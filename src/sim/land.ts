/**
 * Buying land (GDS §5, decided with the user): the land round the place is
 * real neighbor parcels on the survey grid (40-acre quarter-quarter
 * sections, like the home place), each owned by one of the named neighbor
 * households. Whether they'll sell depends on how they feel about you; old
 * farmers retire and estates come up. Prices follow the land's character at
 * Mountain West rates (dry grazing cheap, timber in between, hay ground
 * dear, creek frontage and water rights at a premium) and spike once the
 * warning signs start. More land: stand-off distance, timber, water, room
 * under the county rules, tunnel routes on your own ground. Pure.
 */
import { mulberry32 } from './rng';
import { log } from './economy';
import { tension } from './disaster';
import { REGIONS } from './regions';
import type { GameState } from './state';

/** The home place: 67 world units square (≈ 400 m, 40 acres). */
export const HOME = 67;
export const ACRES_PER_UNIT2 = 36 / 4046.86;           // 1 unit = 6 m

export type LandKind = 'timber' | 'creek_bottom' | 'hay' | 'grazing';
export const LAND_NAME: Record<LandKind, string> = { timber: 'timber', creek_bottom: 'creek bottom', hay: 'hay ground', grazing: 'dry grazing' };
/** Price against the region's going rate for a 40 (regions.ts), by what the land is. */
export const KIND_FACTOR: Record<LandKind, number> = { grazing: 0.75, timber: 1, hay: 1.15, creek_bottom: 1.4 };
/** $ per acre for this land in this region (smaller pieces dearer per acre). */
export function perAcre(s: GameState, p: Parcel): number {
  const a = acresOf(p.rect), size = a <= 8 ? 3.2 : a <= 25 ? 1.4 : a <= 50 ? 1 : 0.85;
  return REGIONS[s.site.region].perAcre * size * KIND_FACTOR[p.kind] * (p.ring === 2 ? RING2_PRICE : 1);
}

import type { Rect } from './site';
import { pluralize } from './words';
export type { Rect };
export interface Parcel {
  id: string;
  name: string;
  rect: Rect;
  owner: string;           // neighbor id, or 'you'
  kind: LandKind;
  /** Up for sale (estate, retirement, or they'd sell to you). */
  forSale: boolean;
  /** 2 = the second ring out, beyond the neighbors next door (dearer: it is farther from anything and you buy it from strangers). */
  ring?: 2;
  /** What you paid for it (assessed value). */
  paid?: number;
}

export interface LandState {
  parcels: Parcel[];
  /** Kinds measured from the real terrain (the world sets them once it's built). */
  surveyed: boolean;
}

const F = HOME;
/** Survey-grid pieces round the place (east is the county road), by the size of the place. */
function blocksFor(home: Rect): Array<[string, Rect]> {
  const forty = (i: number, j: number): Rect => ({ x0: i * F, z0: j * F, x1: (i + 1) * F, z1: (j + 1) * F });
  // the 80 takes the west forty; the next ring out is one forty further west
  if (home.x0 < 0) return [['the north forty', forty(0, -1)], ['the south forty', forty(0, 1)], ['the northwest forty', forty(-1, -1)], ['the southwest forty', forty(-1, 1)], ['the far west forty', forty(-2, 0)]];
  const out: Array<[string, Rect]> = [];
  // what's left of the home forty (a 20 or a 5)
  if (home.x0 > 0) out.push(['the rest of the forty, west', { x0: 0, z0: 0, x1: home.x0, z1: F }]);
  if (home.z0 > 0) out.push(['the rest of the forty, north', { x0: home.x0, z0: 0, x1: F, z1: home.z0 }]);
  if (home.z1 < F) out.push(['the rest of the forty, south', { x0: home.x0, z0: home.z1, x1: F, z1: F }]);
  out.push(['the west forty', forty(-1, 0)], ['the north forty', forty(0, -1)], ['the south forty', forty(0, 1)]);
  if (home.x0 === 0) out.push(['the northwest forty', forty(-1, -1)], ['the southwest forty', forty(-1, 1)]);
  return out;
}

/** The second ring: the fortys one step farther out, bought at RING2_PRICE x the going rate. Skips any that the first ring already holds. */
export const RING2_PRICE = 1.5;
function ring2Blocks(home: Rect): Array<[string, Rect]> {
  const forty = (i: number, j: number): Rect => ({ x0: i * F, z0: j * F, x1: (i + 1) * F, z1: (j + 1) * F });
  const want: Array<[string, Rect]> = [['the far north forty', forty(0, -2)], ['the far south forty', forty(0, 2)], ['the far northwest forty', forty(-1, -2)], ['the far southwest forty', forty(-1, 2)],
    ['the far west forty', forty(-2, 0)], ['the far west forty, north', forty(-2, -1)], ['the far west forty, south', forty(-2, 1)], ['the farthest west forty', forty(-3, 0)]];
  const have = new Set(blocksFor(home).map(([, r]) => `${r.x0},${r.z0},${r.x1},${r.z1}`));
  return want.filter(([, r]) => !have.has(`${r.x0},${r.z0},${r.x1},${r.z1}`));
}

/** The second ring's parcels, ids continuing after `after` (new games and the v80 to v81 migration). */
export function newRing2(seed: number, neighborIds: string[], home: Rect, after: number): Parcel[] {
  const r = mulberry32(seed * 6151 + 3);
  return ring2Blocks(home).map(([name, rect], k) => ({
    id: `l${after + k + 1}`, name, rect, ring: 2 as const,
    owner: neighborIds[(k + Math.floor(r() * 7)) % Math.max(1, neighborIds.length)] ?? 'n1',
    kind: 'grazing' as LandKind, forSale: false,
  }));
}

/** The neighboring land on the survey grid round the place. */
export function newLand(seed: number, neighborIds: string[], home: Rect = { x0: 0, z0: 0, x1: HOME, z1: HOME }): LandState {
  const r = mulberry32(seed * 2711 + 1);
  const ring1 = blocksFor(home).map(([name, rect], k) => ({
    id: `l${k + 1}`, name,
    rect,
    owner: neighborIds[(k + Math.floor(r() * 7)) % Math.max(1, neighborIds.length)] ?? 'n1',
    kind: 'grazing' as LandKind,
    forSale: false,
  }));
  return { surveyed: false, parcels: [...ring1, ...newRing2(seed, neighborIds, home, ring1.length)] };
}

export const acresOf = (p: Rect) => Math.round((p.x1 - p.x0) * (p.z1 - p.z0) * ACRES_PER_UNIT2);

/** Is (x, z) yours (the home place or land you bought)? */
export function ownsAt(s: GameState, x: number, z: number): boolean {
  const h = s.site.home;
  if (x >= h.x0 && z >= h.z0 && x <= h.x1 && z <= h.z1) return true;
  return s.land.parcels.some(p => p.owner === 'you' && x >= p.rect.x0 && x <= p.rect.x1 && z >= p.rect.z0 && z <= p.rect.z1);
}

/** How far past the land you hold a wall, moat or run may reach (4 units of 6 m = 24 m); the tool clamps to the parcel, this guards a plan sent any other way. */
export const OFF_LOT_SLACK = 4;

/** Distance from (x, z) to the nearest bit of land you hold (0 inside it). */
export function distToOwned(s: GameState, x: number, z: number): number {
  const rects = [s.site.home, ...s.land.parcels.filter(p => p.owner === 'you').map(p => p.rect)];
  let best = Infinity;
  for (const r of rects) best = Math.min(best, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)));
  return best;
}

/** Why a run (wall, moat, fence...) with these points cannot be planned: a point far off the parcel (null = fine). */
export function offLotProblem(s: GameState, pts: ReadonlyArray<readonly [number, number]>): string | null {
  for (const p of pts) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) return 'that line has a point that is not on the map';
    if (distToOwned(s, p[0], p[1]) > OFF_LOT_SLACK) return 'that line runs off your land: keep it on the parcel (or land you have bought)';
  }
  return null;
}

/** Everything you own as one bounding box (planting, the site). */
export function ownedBounds(s: GameState): Rect {
  const b = { ...s.site.home };
  for (const p of s.land.parcels) if (p.owner === 'you') { b.x0 = Math.min(b.x0, p.rect.x0); b.z0 = Math.min(b.z0, p.rect.z0); b.x1 = Math.max(b.x1, p.rect.x1); b.z1 = Math.max(b.z1, p.rect.z1); }
  return b;
}

/** A cash offer well over the asking price (x1.6) buys land from an owner who would not sell. Not from one you are feuding with. */
export const PREMIUM_OFFER = 1.6;
/** Is this parcel one an owner will sell only for a premium: a neighbor at home, not on bad terms, who has not put it up for sale and does not like you enough to sell at the going rate. */
export function premiumOffer(s: GameState, p: Parcel): boolean {
  const n = s.neighbors.find(x => x.id === p.owner);
  return p.owner !== 'you' && !p.forSale && !!n && n.status === 'home' && n.disposition >= -20 && n.disposition < 30;
}

/** The asking price today. */
export function priceOf(s: GameState, p: Parcel): number {
  const n = s.neighbors.find(x => x.id === p.owner);
  const mood = (!n ? 1 : n.disposition > 50 ? 0.9 : n.disposition < -20 ? 1.35 : 1) * (premiumOffer(s, p) ? PREMIUM_OFFER : 1);
  const panic = 1 + 1.2 * tension(s.disaster, s.clock.t);
  return Math.round(acresOf(p.rect) * perAcre(s, p) * mood * panic / 500) * 500;
}

/** Why it can't be bought now (null = it can). */
export function buyProblem(s: GameState, p: Parcel): string | null {
  if (p.owner === 'you') return 'already yours';
  const n = s.neighbors.find(x => x.id === p.owner);
  // it must share a side with what you own (a corner forty needs the forty beside it first)
  const adjacent = shareEdge(s.site.home, p.rect) || s.land.parcels.some(q => q.owner === 'you' && shareEdge(q.rect, p.rect));
  if (!adjacent) return 'buy the land between first';
  if (s.disaster.kind && s.clock.t >= s.disaster.hitAt && s.disaster.tracks.banks < 0.5) return 'nobody sells land for cash now';
  if (!p.forSale && !(n && n.disposition >= 30) && !premiumOffer(s, p)) return `${n ? n.name[0].toUpperCase() + n.name.slice(1) : 'The owner'} won't sell`;
  if (s.money < priceOf(s, p)) return 'not enough money';
  // (round 4) a judgment lien on the place: no title company will close until it's paid
  if (s.fin.debt?.lien && s.disaster.tracks.banks >= 0.5) return 'there\'s a judgment lien on your land';
  return null;
}

function shareEdge(a: Rect, b: Rect): boolean {
  const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  return (xOverlap > 0 && (a.z1 === b.z0 || b.z1 === a.z0)) || (zOverlap > 0 && (a.x1 === b.x0 || b.x1 === a.x0));
}

export function buyLand(s: GameState, id: string): string | null {
  const p = s.land.parcels.find(x => x.id === id);
  if (!p) return 'no such land';
  const why = buyProblem(s, p);
  if (why) return why;
  const price = priceOf(s, p), seller = s.neighbors.find(x => x.id === p.owner);
  s.money -= price;
  p.owner = 'you'; p.forSale = false; p.paid = price;
  log(s, `Bought ${p.name} (${pluralize(acresOf(p.rect), 'acre')} of ${LAND_NAME[p.kind]}) from ${seller?.name ?? 'the owner'} for $${price.toLocaleString('en-US')}.`);
  return null;
}

/** Once a year or so in peacetime, a parcel comes up: an old farmer retires, an estate is settled. */
export function landMarketDay(s: GameState, day: number): string | null {
  if (s.disaster.kind && s.clock.t >= s.disaster.warnAt) return null;
  const r = mulberry32(s.seed * 389 + day * 13);
  if (r() > 1 / 300) return null;
  const open = s.land.parcels.filter(p => p.owner !== 'you' && !p.forSale && !p.ring);   // (the second ring never comes up by itself: it is bought on a cash offer, and the draw stays as it was)
  if (!open.length) return null;
  const p = open[Math.floor(r() * open.length)];
  p.forSale = true;
  const n = s.neighbors.find(x => x.id === p.owner);
  const why = n?.kind === 'old_farmer' ? 'is retiring' : n?.kind === 'widow' ? 'is moving in with her daughter' : 'needs the money';
  const line = `For sale: ${p.name} — ${n ? n.name[0].toUpperCase() + n.name.slice(1) : 'the owner'} ${why}. ${pluralize(acresOf(p.rect), 'acre')} of ${LAND_NAME[p.kind]}.`;
  log(s, line);
  return line;
}
