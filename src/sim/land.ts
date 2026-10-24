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
  return REGIONS[s.site.region].perAcre * size * KIND_FACTOR[p.kind];
}

import type { Rect } from './site';
export type { Rect };
export interface Parcel {
  id: string;
  name: string;
  rect: Rect;
  owner: string;           // neighbor id, or 'you'
  kind: LandKind;
  /** Up for sale (estate, retirement, or they'd sell to you). */
  forSale: boolean;
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

/** The neighboring land on the survey grid round the place. */
export function newLand(seed: number, neighborIds: string[], home: Rect = { x0: 0, z0: 0, x1: HOME, z1: HOME }): LandState {
  const r = mulberry32(seed * 2711 + 1);
  return {
    surveyed: false,
    parcels: blocksFor(home).map(([name, rect], k) => ({
      id: `l${k + 1}`, name,
      rect,
      owner: neighborIds[(k + Math.floor(r() * 7)) % Math.max(1, neighborIds.length)] ?? 'n1',
      kind: 'grazing' as LandKind,
      forSale: false,
    })),
  };
}

export const acresOf = (p: Rect) => Math.round((p.x1 - p.x0) * (p.z1 - p.z0) * ACRES_PER_UNIT2);

/** Is (x, z) yours (the home place or land you bought)? */
export function ownsAt(s: GameState, x: number, z: number): boolean {
  const h = s.site.home;
  if (x >= h.x0 && z >= h.z0 && x <= h.x1 && z <= h.z1) return true;
  return s.land.parcels.some(p => p.owner === 'you' && x >= p.rect.x0 && x <= p.rect.x1 && z >= p.rect.z0 && z <= p.rect.z1);
}

/** Everything you own as one bounding box (planting, the site). */
export function ownedBounds(s: GameState): Rect {
  const b = { ...s.site.home };
  for (const p of s.land.parcels) if (p.owner === 'you') { b.x0 = Math.min(b.x0, p.rect.x0); b.z0 = Math.min(b.z0, p.rect.z0); b.x1 = Math.max(b.x1, p.rect.x1); b.z1 = Math.max(b.z1, p.rect.z1); }
  return b;
}

/** The asking price today. */
export function priceOf(s: GameState, p: Parcel): number {
  const n = s.neighbors.find(x => x.id === p.owner);
  const mood = !n ? 1 : n.disposition > 50 ? 0.9 : n.disposition < -20 ? 1.35 : 1;
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
  if (!p.forSale && (!n || n.disposition < 30)) return `${n ? n.name[0].toUpperCase() + n.name.slice(1) : 'The owner'} won't sell`;
  if (s.money < priceOf(s, p)) return 'not enough money';
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
  p.owner = 'you'; p.forSale = false;
  log(s, `Bought ${p.name} (${acresOf(p.rect)} acres of ${LAND_NAME[p.kind]}) from ${seller?.name ?? 'the owner'} for $${price.toLocaleString('en-US')}.`);
  return null;
}

/** Once a year or so in peacetime, a parcel comes up: an old farmer retires, an estate is settled. */
export function landMarketDay(s: GameState, day: number): string | null {
  if (s.disaster.kind && s.clock.t >= s.disaster.warnAt) return null;
  const r = mulberry32(s.seed * 389 + day * 13);
  if (r() > 1 / 300) return null;
  const open = s.land.parcels.filter(p => p.owner !== 'you' && !p.forSale);
  if (!open.length) return null;
  const p = open[Math.floor(r() * open.length)];
  p.forSale = true;
  const n = s.neighbors.find(x => x.id === p.owner);
  const why = n?.kind === 'old_farmer' ? 'is retiring' : n?.kind === 'widow' ? 'is moving in with her daughter' : 'needs the money';
  const line = `For sale: ${p.name} — ${n ? n.name[0].toUpperCase() + n.name.slice(1) : 'the owner'} ${why}. ${acresOf(p.rect)} acres of ${LAND_NAME[p.kind]}.`;
  log(s, line);
  return line;
}
