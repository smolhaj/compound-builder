/**
 * Corridors as walkable (and drivable) links in the route finding (docs/DECISIONS.md, "Tunnel use"). The ground the people walk is cut into
 * pieces by cliffs, the creek and the walls; a tunnel-bridge or a rock tunnel joins two pieces. `buildReach` labels the pieces (a flood fill of the free
 * ground, the world supplies the `hard` test), and `routeLinked` sends someone through the links when their goal lies in another piece: ordinary
 * route to the portal, along the tunnel (its deck height on each point), ordinary route from the other portal to the goal. Pure (tested with a
 * synthetic world); the world supplies the ordinary route, the corridors and the ground.
 */
import type { Pt } from '../../sim/pathRoute';
import { U_PER_M } from '../../sim/corridors';

/** A route point: x, z; y (deck height, absolute) when it lies in a corridor; door id (see `doorId`) when it is a door. */
export type Wp = readonly [number, number, number?, number?];

export interface Link {
  id: string;
  /** Centre line portal to portal, with the deck height on each point. */
  deck: Array<[number, number, number]>;
  lenU: number;
  /** The free ground just outside each portal. */
  mouth: [Pt, Pt];
  /** Collapsed: no route goes through. */
  blocked?: boolean;
}

/** The waypoint tag of the end of a route that is shut off: a walker goes to the mouth of the fallen tunnel and waits there (the goal is beyond it). */
export const STOP_TAG = 0x3fff;
/** The door waypoint tag: `index * 2 + end + 1`, so 0 means "no door". */
export const doorId = (linkIndex: number, end: 0 | 1): number => linkIndex * 2 + end + 1;
export const doorOf = (tag: number): { link: number; end: 0 | 1 } => ({ link: (tag - 1) >> 1, end: ((tag - 1) & 1) as 0 | 1 });

/** Distance from the portal to the first deck point inside (the door stands a little in), and the mouth's distance outside it, units. */
const DOOR_IN = 0.1, MOUTH_OUT = 0.9, STEP = 2;

/**
 * A corridor's link: its centre line dense every 2 units with deck heights from `deckY(s)` (s along it, units), the mouths outside each portal.
 * `centre` is the run's points (portal first).
 */
export function linkOf(id: string, centre: readonly Pt[], deckY: (s: number, x: number, z: number) => number, blocked = false): Link | null {
  if (centre.length < 2) return null;
  const segs: number[] = [];
  let L = 0;
  for (let i = 1; i < centre.length; i++) { const l = Math.hypot(centre[i][0] - centre[i - 1][0], centre[i][1] - centre[i - 1][1]); segs.push(l); L += l; }
  if (L < 0.5) return null;
  const at = (s: number): { p: Pt; d: Pt } => {
    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      if (s <= acc + segs[i] || i === segs.length - 1) {
        const k = segs[i] > 0 ? Math.min(1, Math.max(0, (s - acc) / segs[i])) : 0, a = centre[i], b = centre[i + 1];
        return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], d: segs[i] > 0 ? [(b[0] - a[0]) / segs[i], (b[1] - a[1]) / segs[i]] : [1, 0] };
      }
      acc += segs[i];
    }
    return { p: centre[0], d: [1, 0] };
  };
  const ss: number[] = [DOOR_IN];
  for (let s = STEP; s < L - STEP * 0.5; s += STEP) ss.push(s);
  ss.push(L - DOOR_IN);
  const deck = ss.map((s): [number, number, number] => { const { p } = at(s); return [p[0], p[1], deckY(s, p[0], p[1])]; });
  const a = at(0), b = at(L);
  const mouth: [Pt, Pt] = [[a.p[0] - a.d[0] * MOUTH_OUT, a.p[1] - a.d[1] * MOUTH_OUT], [b.p[0] + b.d[0] * MOUTH_OUT, b.p[1] + b.d[1] * MOUTH_OUT]];
  return { id, deck, lenU: L, mouth, ...(blocked ? { blocked } : {}) };
}

// ── the pieces of ground ──

export interface Reach {
  /** The piece of ground (x, z) is on (a blocked spot looks round for the nearest free one); -1 off the map or in the middle of nothing. */
  comp: (x: number, z: number) => number;
  /** How many pieces. */
  n: number;
}

/**
 * Label the connected pieces of free ground in a box: cells of `cell` units, free when `hard` is false at the centre, joined to a neighbour when the
 * line between the two centres crosses nothing hard (sampled finer than a wall is thick). `joins` are the narrow ways through (a gate in a wall, a stair up a
 * retaining wall, a man-door), each a pair of points either side of it: a doorway is narrower than a cell, so the flood fill alone would never find it.
 * Pure given `hard`.
 */
export function buildReach(box: { x0: number; z0: number; x1: number; z1: number }, hard: (x: number, z: number) => boolean, cell = 0.6, joins: ReadonlyArray<readonly [Pt, Pt]> = []): Reach {
  const nx = Math.max(1, Math.ceil((box.x1 - box.x0) / cell)), nz = Math.max(1, Math.ceil((box.z1 - box.z0) / cell));
  const cx = (i: number) => box.x0 + (i + 0.5) * cell, cz = (j: number) => box.z0 + (j + 0.5) * cell;
  const free = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) free[j * nx + i] = hard(cx(i), cz(j)) ? 0 : 1;
  const parent = new Int32Array(nx * nz).map((_, k) => k);
  const find = (k: number): number => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const clear = (x0: number, z0: number, x1: number, z1: number): boolean => {
    for (const t of [0.25, 0.5, 0.75]) if (hard(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false;
    return true;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (!free[k]) continue;
    if (i + 1 < nx && free[k + 1] && clear(cx(i), cz(j), cx(i + 1), cz(j))) join(k, k + 1);
    if (j + 1 < nz && free[k + nx] && clear(cx(i), cz(j), cx(i), cz(j + 1))) join(k, k + nx);
  }
  const nearFree = (p: Pt): number => {
    const i = Math.floor((p[0] - box.x0) / cell), j = Math.floor((p[1] - box.z0) / cell);
    let best = -1, bd = Infinity;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || !free[jj * nx + ii]) continue;
      const d = Math.hypot(cx(ii) - p[0], cz(jj) - p[1]);
      if (d < bd) { bd = d; best = jj * nx + ii; }
    }
    return bd <= cell * 2.5 ? best : -1;
  };
  for (const [p, q] of joins) { const a = nearFree(p), b = nearFree(q); if (a >= 0 && b >= 0) join(a, b); }
  const ids = new Map<number, number>();
  const label = new Int32Array(nx * nz).fill(-1);
  for (let k = 0; k < nx * nz; k++) if (free[k]) { const r = find(k); if (!ids.has(r)) ids.set(r, ids.size); label[k] = ids.get(r)!; }
  const comp = (x: number, z: number): number => {
    const i = Math.floor((x - box.x0) / cell), j = Math.floor((z - box.z0) / cell);
    for (let r = 0; r <= 4; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const l = label[jj * nx + ii];
        if (l < 0) continue;
        const d = Math.hypot(cx(ii) - x, cz(jj) - z);
        if (d < bd) { bd = d; best = l; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  return { comp, n: ids.size };
}

// ── routing through links ──

interface Hop { link: number; from: 0 | 1 }

/** The links to take to get from piece `a` to piece `b` (fewest hops, up to 3), or null. */
export function hopsBetween(links: readonly Link[], ends: ReadonlyArray<[number, number]>, a: number, b: number): Hop[] | null {
  if (a === b) return [];
  const prev = new Map<number, { from: number; hop: Hop }>();
  let frontier = [a];
  const seen = new Set([a]);
  for (let depth = 0; depth < 3 && frontier.length; depth++) {
    const next: number[] = [];
    for (const c of frontier) {
      links.forEach((l, i) => {
        if (l.blocked) return;
        for (const e of [0, 1] as const) {
          if (ends[i][e] !== c) continue;
          const other = ends[i][1 - e as 0 | 1];
          if (other < 0 || seen.has(other)) continue;
          seen.add(other);
          prev.set(other, { from: c, hop: { link: i, from: e } });
          next.push(other);
        }
      });
    }
    if (seen.has(b)) break;
    frontier = next;
  }
  if (!prev.has(b)) return null;
  const out: Hop[] = [];
  for (let c = b; c !== a;) { const p = prev.get(c)!; out.push(p.hop); c = p.from; }
  return out.reverse();
}

export interface LinkWorld {
  reach: Reach;
  links: readonly Link[];
  /** The ordinary route a -> b on one piece of ground (the intermediate points, the end included or not). */
  ordinary: (a: Pt, b: Pt) => readonly Wp[];
}

/**
 * The points to pass through to go from `from` to `to`, going through corridors when the goal is on another piece of ground; `null` when no corridor
 * is needed (the ordinary route does it) or none leads there. A corridor's points carry their deck height; its two door points carry the door tag.
 */
export function routeLinked(from: Pt, to: Pt, w: LinkWorld): Wp[] | null {
  if (!w.links.length) return null;
  const ca = w.reach.comp(from[0], from[1]), cb = w.reach.comp(to[0], to[1]);
  if (ca < 0 || cb < 0 || ca === cb) return null;
  const ends = w.links.map((l): [number, number] => [w.reach.comp(l.mouth[0][0], l.mouth[0][1]), w.reach.comp(l.mouth[1][0], l.mouth[1][1])]);
  const hops = hopsBetween(w.links, ends, ca, cb);
  if (!hops) {
    // no way through, but there would be were a fallen tunnel clear: go to its mouth and wait for the contractor (the goal is on the other side of the rock)
    const open = hopsBetween(w.links.map(l => ({ ...l, blocked: false })), ends, ca, cb);
    if (!open?.length) return null;
    const l = w.links[open[0].link], near = l.mouth[open[0].from];
    return [...w.ordinary(from, near), [near[0], near[1], undefined, STOP_TAG]];
  }
  if (!hops.length) return null;
  const out: Wp[] = [];
  let cur: Pt = from;
  for (const h of hops) {
    const l = w.links[h.link], near = l.mouth[h.from], far = l.mouth[1 - h.from as 0 | 1];
    for (const p of w.ordinary(cur, near)) out.push(p);
    const seq = h.from === 0 ? l.deck : [...l.deck].reverse();
    out.push([near[0], near[1], seq[0][2]]);       // (at the deck's height from the mouth: the climb from the ground to the floor is spread over the approach, not one step)
    seq.forEach((p, k) => out.push([p[0], p[1], p[2], k === 0 ? doorId(h.link, h.from) : k === seq.length - 1 ? doorId(h.link, (1 - h.from) as 0 | 1) : undefined]));
    out.push([far[0], far[1], seq[seq.length - 1][2]]);
    cur = far;
  }
  for (const p of w.ordinary(cur, to)) out.push(p);
  out.push([to[0], to[1]]);
  return out;
}

/** Length of a route, units (the 2D distance along its points from `from`). */
export function lengthOf(from: Pt, route: readonly Wp[]): number {
  let L = 0, px = from[0], pz = from[1];
  for (const p of route) { L += Math.hypot(p[0] - px, p[1] - pz); px = p[0]; pz = p[1]; }
  return L;
}

/** Game seconds a walker takes along a route (units to metres at the walking pace). */
export const walkTime = (units: number, mps = 1.35): number => units / U_PER_M / mps;
