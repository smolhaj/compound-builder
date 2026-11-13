/**
 * Where the animals of the place are (docs/DECISIONS.md, "Wildlife, livestock and trucks use the route network"). The sim keeps only head counts
 * (`stock.goat`, `.cow`, ...) and the buildings; this draws them from that: by day they are turned out into the paddock in front of the barn, coop or
 * barnyard that houses them; at night, in the cold rain and when the place is raided they go in. A raid sends them to the innermost shelter, the one
 * inside the most rings (sim/rings.ts), not the one that is nearest. Pure (tested): the caller hands in the homes with their ring depth.
 */
import type { Pt } from '../../sim/pathRoute';

export type StockKind = 'goat' | 'sheep' | 'cow' | 'steer' | 'pig' | 'rabbit' | 'hen';
export const STOCK_KINDS: readonly StockKind[] = ['cow', 'steer', 'goat', 'sheep', 'pig', 'rabbit', 'hen'];

/** Most of one kind drawn at once (a herd of forty sheep is eight on the screen; the instance buffers are small). */
export const DRAW_CAP = 8;

/** A building that houses animals: where its door is and how many rings stand round it (0: outside the line). */
export interface Home { id: string; kind: string; x: number; z: number; rot: number; w: number; d: number; depth: number }

/** The buildings that house a kind, best first. */
export function housesFor(kind: StockKind): readonly string[] {
  switch (kind) {
    case 'hen': return ['chicken_coop'];
    case 'sheep': return ['sheep_barn', 'barn', 'barnyard'];
    case 'pig': case 'rabbit': return ['barnyard', 'barn'];
    default: return ['barn', 'barnyard', 'sheep_barn'];
  }
}

/** The animals to draw, by kind: head counts capped for the screen (hens: a dozen a coop, eight drawn). */
export function drawnHerd(stock: Readonly<Record<string, number>>, coops: number): Array<{ id: string; kind: StockKind }> {
  const out: Array<{ id: string; kind: StockKind }> = [];
  for (const kind of STOCK_KINDS) {
    const head = kind === 'hen' ? coops * 12 : Math.floor(stock[kind] ?? 0) + (kind === 'pig' ? Math.floor(stock.sow ?? 0) + Math.floor(stock.boar ?? 0) : 0);
    const n = Math.min(DRAW_CAP, Math.max(0, head));
    for (let i = 0; i < n; i++) out.push({ id: `${kind}${i}`, kind });
  }
  return out;
}

/** Where the door is (local +z is the front of every building) and the way out from it. */
export function doorOf(h: Home): { x: number; z: number; ux: number; uz: number } {
  const r = h.rot * Math.PI / 2, ux = Math.sin(r), uz = Math.cos(r), half = h.d / 2 + 0.12;
  return { x: h.x + ux * half, z: h.z + uz * half, ux, uz };
}

const hash = (s: string, k: number): number => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };

/**
 * The home an animal sleeps in. Normally the first kind of building that houses it, the animals shared out over the ones there are by animal; when
 * raided, the innermost (most rings round it), ties the one nearest the house. null: it has no roof (it sleeps out by the camp).
 */
export function shelterOf(kind: StockKind, id: string, homes: readonly Home[], raided: boolean, house: Pt, noWay: ReadonlySet<string> = new Set()): Home | null {
  const pref = housesFor(kind);
  let pool = homes.filter(h => pref.includes(h.kind));
  if (!pool.length) return null;
  // (a home there is no way to, across the creek or behind a wall, is passed over for the next best; when none is left the first is kept and the animal waits)
  const reachable = pool.filter(h => !noWay.has(h.id));
  if (reachable.length) pool = reachable;
  if (raided) {
    const deepest = Math.max(...pool.map(h => h.depth));
    pool = pool.filter(h => h.depth === deepest).sort((a, b) => Math.hypot(a.x - house[0], a.z - house[1]) - Math.hypot(b.x - house[0], b.z - house[1]));
    return pool[Math.floor(hash(id, 3) * Math.min(2, pool.length))] ?? pool[0];
  }
  const best = Math.min(...pool.map(h => pref.indexOf(h.kind)));
  pool = pool.filter(h => pref.indexOf(h.kind) === best).sort((a, b) => a.id.localeCompare(b.id));
  return pool[Math.floor(hash(id, 3) * pool.length)] ?? pool[0];
}

export interface AnimalGoal {
  x: number; z: number;
  /** Goes into the building (hidden once there). */
  inside: boolean;
  /** The home it heads for (null: none). */
  home: string | null;
  /** Hurrying (a raid). */
  panic: boolean;
}

/** In the cold rain, or at night, or on the alarm, they are shut in. */
export interface HerdCtx { hour: number; raided: boolean; storm: boolean; house: Pt; clock: number }

export function animalGoal(a: { id: string; kind: StockKind }, homes: readonly Home[], c: HerdCtx, noWay: ReadonlySet<string> = new Set(), free?: (x: number, z: number) => boolean): AnimalGoal {
  // dusk and dawn are staggered by animal (some go in at 19.5, the last about 20.8; out between 6.2 and 7), so they file through the door, not all at once
  const night = c.hour >= 19.5 + hash(a.id, 13) * 1.3 || c.hour < 6.2 + hash(a.id, 14) * 0.8;
  const home = shelterOf(a.kind, a.id, homes, c.raided, c.house, noWay);
  if (!home) {
    // no roof: lying up by the camp
    return { x: c.house[0] + (hash(a.id, 1) - 0.5) * 1.6, z: c.house[1] + 1.4 + hash(a.id, 2) * 0.8, inside: false, home: null, panic: c.raided };
  }
  const door = doorOf(home);
  if (c.raided || night || c.storm) {
    // in through the door one by one: each aims for its own spot across the doorway, so they file in instead of piling at one point
    const across = (hash(a.id, 12) - 0.5) * 0.5, px = -door.uz, pz = door.ux;
    return { x: door.x + px * across, z: door.z + pz * across, inside: true, home: home.id, panic: c.raided };
  }
  // turned out: a spot in the paddock in front of the door, moving on every few game hours
  const k0 = Math.floor(c.clock / 0.12 + hash(a.id, 4) * 40);
  // (a paddock wide enough for the herd to graze apart: about 5 m deep for the big animals, a coop yard for the hens)
  const small = a.kind === 'hen' || a.kind === 'rabbit', px = -door.uz, pz = door.ux;      // across the front
  // (a spot in another building, the creek or the road is passed over for the next: the herd never has a goal it cannot stand on)
  for (let t = 0; t < PADDOCK_TRIES; t++) {
    const k = k0 + t * 17, along = (hash(a.id + k, 5) - 0.5) * (home.w + (small ? 1.6 : 4.5)), out = 0.35 + hash(a.id + k, 6) * (small ? 0.6 : 3.2);
    const x = door.x + door.ux * out + px * along, z = door.z + door.uz * out + pz * along;
    if (!free || free(x, z)) return { x, z, inside: false, home: home.id, panic: false };
  }
  // nowhere free in the paddock: at the door
  return { x: door.x + door.ux * 0.3, z: door.z + door.uz * 0.3, inside: false, home: home.id, panic: false };
}

/** Spots tried in the paddock before the animal stands at the door. */
export const PADDOCK_TRIES = 8;

/** Is the crew at the gate one that means harm (the animals are driven in), as against a trader, a neighbour or refugees? */
export function hostileAtGate(enc: { kind: string; armed: boolean } | null | undefined): boolean {
  return !!enc && enc.armed && ['looters', 'gang', 'horde', 'break_in', 'tunnelers', 'militia', 'ransom'].includes(enc.kind);
}
