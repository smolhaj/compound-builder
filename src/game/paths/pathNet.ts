/**
 * The path network of the place. People walk door to door (the house is the
 * hub): every walk the household makes is routed round whatever is in the
 * way, preferring ground an earlier walk already crossed, so walks merge
 * into shared trunks and branch where they part, the way tracks do. The
 * routes are cut at the junctions into trails; each trail is smoothed once,
 * and is worn by the trips of every walk that uses it over the days those
 * walks have gone on. What is laid is recorded per walk (door to door, the
 * way the player thinks of it) and shows on the trails it uses.
 *
 * Pure given the game and a `blocked` test (the world supplies buildings,
 * creek, trees and walls), so it is tested here without a scene.
 */
import { findCells, routeLength, smoothTrail, ROUTE_CELL, type Pt } from '../../sim/pathRoute';
import {
  HIDDEN_WEAR, LAID_KINDS, canLay, edgeKey, householdOf, pathNodes, pathsOf, surfaceOfWear, tripsBetween, tripsToHub, WEAR_TRIPS,
  type LaidKind, type PathExtras, type PathNode, type PathSurface, type Role,
} from '../../sim/paths';
import type { GameState } from '../../sim/state';
import { KIT } from '../buildkit/kit';

/** World units per metre. */
const M = 1 / 6;
const CELL = ROUTE_CELL;

/** One walk the household makes, door to door. */
export interface NetEdge {
  key: string;
  a: string;
  b: string;
  aName: string;
  bName: string;
  /** The walk laid out end to end (for the pace and the way along the paths). */
  route: Pt[];
  /** The trails it runs along, in order. */
  trails: number[];
  /** Metres of it, and of it not already on a busier walk (what laying it adds). */
  lenM: number;
  uniqueM: number;
  /** Trips a day, and the days both ends have stood. */
  trips: number;
  days: number;
  /** Mean wear 0-1, and what the ground shows when nothing is laid. */
  meanWear: number;
  worn: 'none' | 'desire' | 'dirt';
  /** What is laid on the whole walk (null: nothing) and what shows now. */
  laid: LaidKind | null;
  surface: PathSurface | null;
  can: Record<LaidKind, boolean>;
  hidden: boolean;
}

/** A stretch of ground between two junctions (or a door): one line, one wear. */
export interface Trail {
  id: number;
  pts: Pt[];
  /** Cell keys of its two ends (the shared junctions). */
  endA: number;
  endB: number;
  lenM: number;
  /** Trips x days over every walk on it, and the wear that makes. */
  cum: number;
  wear: number;
  worn: 'none' | 'desire' | 'dirt';
  laid: LaidKind | null;
  surface: PathSurface | null;
  hidden: boolean;
}

export interface PathNetwork {
  nodes: PathNode[];
  edges: NetEdge[];
  trails: Trail[];
  hub: string | null;
}

export interface NetWorld {
  /** Something is in the way (padded: the path keeps off the walls, out of the water, round the trunks). */
  blocked: (x: number, z: number) => boolean;
  /** Extra cost of walking here (slopes, rough ground); 1 = easy. */
  cost?: (x: number, z: number) => number;
  /** What a straight walk cannot cross (buildings, built wall, water, cliff ground), without the trees: for the people's own route finding (walkRoute). */
  hard?: (x: number, z: number) => boolean;
}

interface Skel { sig: string; trails: Array<{ cells: number[]; pts: Pt[]; endA: number; endB: number }>; edgeTrails: Map<string, Array<{ trail: number; fwd: boolean }>> }

/** What is kept between plans: the cells of each walk (found once, until the layout changes) and the trails they cut into. */
export interface NetCache {
  routes: Map<string, Pt[] | null>;
  skel: Skel | null;
}
export const newNetCache = (): NetCache => ({ routes: new Map(), skel: null });

const KIND_NAME: Record<string, string> = { camp: 'the camp', yard: 'the delivery yard', gate: 'the gate', creek: 'the creek' };
const nameOf = (n: PathNode): string => KIND_NAME[n.kind] ?? KIND_NAME[n.id] ?? KIND_NAME[n.role] ?? (KIT[n.kind]?.name ?? n.kind).toLowerCase();

/** The hub: the main house (the finished home that sleeps the most), else the camp, else the first stop. */
export function hubOf(nodes: readonly PathNode[]): PathNode | null {
  const homes = nodes.filter(n => n.role === 'home').sort((p, q) => (KIT[q.kind]?.sleeps ?? 0) - (KIT[p.kind]?.sleeps ?? 0));
  return homes[0] ?? nodes.find(n => n.role === 'camp') ?? nodes[0] ?? null;
}

const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const ck = (i: number, j: number): number => i * 100003 + j;
const cellOf = (p: Pt): number => ck(Math.round(p[0] / CELL), Math.round(p[1] / CELL));
const wearFromCum = (cum: number): number => 1 - Math.exp(-Math.max(0, cum) / WEAR_TRIPS);

/** Where a walk meets a stop: its door, or on the camp's circle toward the other end. */
function endOf(n: PathNode, toward: PathNode): Pt {
  if (!n.ring) return [n.ax, n.az];
  const dx = toward.ax - n.x, dz = toward.az - n.z, l = Math.hypot(dx, dz) || 1;
  return [n.x + dx / l * n.ring, n.z + dz / l * n.ring];
}

interface Want { a: PathNode; b: PathNode; trips: number }

/** The walks wanted, busiest first: every stop to the hub, then the pairs the work links (the nearest of each role). */
export function wantedWalks(nodes: readonly PathNode[], game: GameState): Want[] {
  const hub = hubOf(nodes);
  if (!hub) return [];
  const h = householdOf(game), want = new Map<string, Want>();
  const add = (a: PathNode, b: PathNode, trips: number) => {
    if (trips <= 0 || a.id === b.id) return;
    const k = edgeKey(a.id, b.id), w = want.get(k);
    if (w) w.trips += trips; else want.set(k, { a, b, trips });
  };
  for (const n of nodes) if (n.id !== hub.id) add(hub, n, tripsToHub(n.role, h));
  const roles = [...new Set(nodes.map(n => n.role))] as Role[];
  for (const ra of roles) for (const rb of roles) {
    if (ra >= rb) continue;
    const t = tripsBetween(ra, rb, h);
    if (t <= 0) continue;
    for (const a of nodes.filter(n => n.role === ra)) {
      let best: PathNode | null = null, bd = Infinity;
      for (const b of nodes.filter(n => n.role === rb)) { const d = Math.hypot(a.ax - b.ax, a.az - b.az); if (d < bd) { bd = d; best = b; } }
      if (best) add(a, best, t);
    }
  }
  return [...want.values()].sort((p, q) => q.trips - p.trips || (p.a.id + p.b.id).localeCompare(q.a.id + q.b.id));
}

interface Raw { key: string; want: Want; cells: Pt[]; a: Pt; b: Pt }

/** Cut the routes into trails at every junction, dead end and door; smooth each trail once. */
function skeleton(raws: readonly Raw[], world: NetWorld): Skel {
  const adj = new Map<number, Set<number>>(), pos = new Map<number, Pt>(), anchor = new Map<number, Pt>();
  const link = (a: number, b: number) => { (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a); };
  const seqs = raws.map(r => r.cells.map(p => { const k = cellOf(p); if (!pos.has(k)) pos.set(k, p); return k; }));
  raws.forEach((r, i) => {
    const s = seqs[i];
    for (let k = 1; k < s.length; k++) if (s[k] !== s[k - 1]) link(s[k - 1], s[k]);
    if (!anchor.has(s[0])) anchor.set(s[0], r.a);
    if (!anchor.has(s[s.length - 1])) anchor.set(s[s.length - 1], r.b);
  });
  const special = (k: number) => (adj.get(k)?.size ?? 0) !== 2 || anchor.has(k);
  const lk = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const visited = new Set<string>(), info = new Map<string, { trail: number; i: number }>();
  const trails: Skel['trails'] = [];
  for (const [s, nbrs] of [...adj.entries()].sort((p, q) => p[0] - q[0])) {
    if (!special(s)) continue;
    for (const n0 of [...nbrs].sort((p, q) => p - q)) {
      if (visited.has(lk(s, n0))) continue;
      const cells = [s];
      let prev = s, cur = n0;
      visited.add(lk(prev, cur));
      cells.push(cur);
      while (!special(cur)) {
        const next = [...adj.get(cur)!].find(x => x !== prev)!;
        visited.add(lk(cur, next));
        prev = cur; cur = next;
        cells.push(cur);
      }
      const id = trails.length;
      for (let i = 0; i < cells.length - 1; i++) info.set(lk(cells[i], cells[i + 1]), { trail: id, i });
      const ends: [Pt | null, Pt | null] = [anchor.get(cells[0]) ?? null, anchor.get(cells[cells.length - 1]) ?? null];
      const pts = smoothTrail(cells.map(c => pos.get(c)!), { blocked: world.blocked, seed: hash(`${cells[0]}:${cells[cells.length - 1]}`), ends });
      trails.push({ cells, pts, endA: cells[0], endB: cells[cells.length - 1] });
    }
  }
  const edgeTrails = new Map<string, Array<{ trail: number; fwd: boolean }>>();
  raws.forEach((r, i) => {
    const s = seqs[i], out: Array<{ trail: number; fwd: boolean }> = [];
    for (let k = 1; k < s.length; k++) {
      if (s[k] === s[k - 1]) continue;
      const inf = info.get(lk(s[k - 1], s[k]));
      if (!inf) continue;
      const t = trails[inf.trail], fwd = t.cells[inf.i] === s[k - 1];
      const last = out[out.length - 1];
      if (!last || last.trail !== inf.trail) out.push({ trail: inf.trail, fwd });
    }
    edgeTrails.set(r.key, out);
  });
  return { sig: '', trails, edgeTrails };
}

const rankOf = (k: LaidKind | null): number => (k === null ? -1 : LAID_KINDS.indexOf(k));

/** The whole network: nodes, routed walks, trails, wear and what is laid. */
export function planNetwork(game: GameState, ex: PathExtras, world: NetWorld, cache: NetCache = newNetCache()): PathNetwork {
  const nodes = pathNodes(game, ex), hub = hubOf(nodes);
  if (!hub || nodes.length < 2) return { nodes, edges: [], trails: [], hub: hub?.id ?? null };
  const byId = new Map(nodes.map(n => [n.id, n]));
  const laid = pathsOf(game).laid;
  const wants = wantedWalks(nodes, game);
  // a walk laid between two stops stays even when the work no longer links them
  for (const l of laid) {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (a && b && !wants.some(w => edgeKey(w.a.id, w.b.id) === edgeKey(l.a, l.b))) wants.push({ a, b, trips: 0.5 });
  }
  const used = new Set<number>();
  const cost = (x: number, z: number) => (world.cost?.(x, z) ?? 1) * (used.has(cellOf([x, z])) ? 0.35 : 1);
  const raws: Raw[] = [];
  for (const w of wants) {
    const a = endOf(w.a, w.b), b = endOf(w.b, w.a), key = edgeKey(w.a.id, w.b.id);
    let cells = cache.routes.get(key);
    if (cells === undefined) {
      cells = findCells(a, b, { blocked: world.blocked, cost });
      // a walk that has to go round a wall to its gate or a cliff to its stair is farther off its own line than the default search wanders
      if (!cells) cells = findCells(a, b, { blocked: world.blocked, cost, margin: 24 });
      cache.routes.set(key, cells);
    }
    if (!cells || cells.length < 2) continue;
    for (const p of cells) used.add(cellOf(p));
    raws.push({ key, want: w, cells, a, b });
  }
  if (!raws.length) return { nodes, edges: [], trails: [], hub: hub.id };
  const sig = raws.map(r => `${r.key}${r.cells.length}${cellOf(r.cells[Math.floor(r.cells.length / 2)])}`).join('|');
  if (!cache.skel || cache.skel.sig !== sig) { cache.skel = skeleton(raws, world); cache.skel.sig = sig; }
  const sk = cache.skel;
  const trails: Trail[] = sk.trails.map((t, id) => ({
    id, pts: t.pts, endA: t.endA, endB: t.endB, lenM: Math.round(routeLength(t.pts) / M), cum: 0, wear: 0, worn: 'none', laid: null, surface: null, hidden: true,
  }));
  // each walk's trips x the days its two ends have stood wear every trail it runs along
  const edges: NetEdge[] = [];
  const counted = new Set<number>();
  for (const r of raws) {
    const w = r.want, key = r.key, days = Math.max(0, game.clock.t - Math.max(w.a.since, w.b.since));
    const l = laid.find(x => edgeKey(x.a, x.b) === key);
    const hiddenEdge = !!(w.a.hidden || w.b.hidden);
    const ts = sk.edgeTrails.get(key) ?? [];
    let len = 0, fresh = 0;
    const route: Pt[] = [];
    for (const { trail, fwd } of ts) {
      const t = trails[trail];
      t.cum += w.trips * days;
      if (!hiddenEdge) t.hidden = false;
      if (l && rankOf(l.kind) > rankOf(t.laid)) t.laid = l.kind;
      const m = t.lenM;
      len += m;
      if (!counted.has(trail)) { fresh += m; counted.add(trail); }
      const seg = fwd ? t.pts : [...t.pts].reverse();
      route.push(...(route.length ? seg.slice(1) : seg));
    }
    edges.push({
      key, a: w.a.id, b: w.b.id, aName: nameOf(w.a), bName: nameOf(w.b), route, trails: ts.map(x => x.trail), lenM: len, uniqueM: fresh,
      trips: w.trips, days, meanWear: 0, worn: 'none', laid: l?.kind ?? null, surface: null,
      can: Object.fromEntries(LAID_KINDS.map(k => [k, canLay(k, w.a, w.b)])) as Record<LaidKind, boolean>, hidden: hiddenEdge,
    });
  }
  for (const t of trails) {
    t.wear = Math.min(t.hidden ? HIDDEN_WEAR : 1, wearFromCum(t.cum));
    t.worn = surfaceOfWear(t.wear);
    t.surface = t.laid ?? (t.worn === 'none' ? null : t.worn);
  }
  for (const e of edges) {
    const L = e.trails.reduce((a, i) => a + trails[i].lenM, 0) || 1;
    e.meanWear = e.trails.reduce((a, i) => a + trails[i].wear * trails[i].lenM, 0) / L;
    e.worn = surfaceOfWear(Math.max(0, ...e.trails.map(i => trails[i].wear)));
    e.surface = e.laid ?? (e.worn === 'none' ? null : e.worn);
  }
  return { nodes, edges, trails, hub: hub.id };
}

/** One point on a trail (for lookups). */
interface Sample { x: number; z: number; surface: PathSurface }

/**
 * A lookup of what is underfoot at a point: the surface of the nearest bit
 * of path within its half width, or null off the paths. Cells of 0.5.
 */
export function surfaceIndex(net: Pick<PathNetwork, 'trails'>, width: (s: PathSurface) => number): (x: number, z: number) => PathSurface | null {
  const grid = new Map<number, Sample[]>(), G = 0.5, key = (i: number, j: number) => i * 100003 + j;
  for (const t of net.trails) {
    if (!t.surface) continue;
    for (const p of t.pts) {
      const k = key(Math.floor(p[0] / G), Math.floor(p[1] / G)), list = grid.get(k) ?? grid.set(k, []).get(k)!;
      list.push({ x: p[0], z: p[1], surface: t.surface });
    }
  }
  return (x, z) => {
    const ci = Math.floor(x / G), cj = Math.floor(z / G);
    let best: Sample | null = null, bd = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      for (const s of grid.get(key(i, j)) ?? []) {
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
    }
    // a little more than half the width: the points are 0.2 apart, so between two of them is still on the path
    return best && bd <= width(best.surface) * 0.6 + 0.04 ? best.surface : null;
  };
}

// ── Walking along the paths ──

/** A vertex graph of the trails (consecutive points; trails that share a junction meet there). */
export interface WalkGraph { pts: Pt[]; adj: Array<Array<[number, number]>>; grid: Map<number, number[]> }

const WG = 0.6;
const gk = (i: number, j: number): number => i * 100003 + j;

export function walkGraph(net: Pick<PathNetwork, 'trails'>): WalkGraph {
  const pts: Pt[] = [], adj: Array<Array<[number, number]>> = [], grid = new Map<number, number[]>(), joint = new Map<number, number>();
  const link = (a: number, b: number) => { const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]); adj[a].push([b, d]); adj[b].push([a, d]); };
  for (const t of net.trails) {
    if (!t.surface) continue;
    let prev = -1;
    t.pts.forEach((p, i) => {
      const end = i === 0 ? t.endA : i === t.pts.length - 1 ? t.endB : -1;
      let id = end !== -1 ? joint.get(end) ?? -1 : -1;
      if (id === -1) {
        id = pts.length;
        pts.push(p); adj.push([]);
        const ci = Math.floor(p[0] / WG), cj = Math.floor(p[1] / WG);
        (grid.get(gk(ci, cj)) ?? grid.set(gk(ci, cj), []).get(gk(ci, cj))!).push(id);
        if (end !== -1) joint.set(end, id);
      }
      if (prev >= 0 && prev !== id) link(prev, id);
      prev = id;
    });
  }
  return { pts, adj, grid };
}

function nearestVertex(g: WalkGraph, x: number, z: number, reach: number): number {
  const ci = Math.floor(x / WG), cj = Math.floor(z / WG), r = Math.ceil(reach / WG);
  let best = -1, bd = reach;
  for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) for (const o of g.grid.get(gk(i, j)) ?? []) {
    const d = Math.hypot(g.pts[o][0] - x, g.pts[o][1] - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/**
 * The points to walk through to go from (fx, fz) to (tx, tz) along the paths, or [] to go straight: only when
 * both ends are within reach of a path and the way along it is not much longer than the direct one.
 */
export function routeVia(g: WalkGraph, fx: number, fz: number, tx: number, tz: number, reach = 1.4, detour = 1.3): Pt[] {
  if (!g.pts.length) return [];
  const direct = Math.hypot(tx - fx, tz - fz);
  if (direct < 1) return [];
  const s = nearestVertex(g, fx, fz, reach), e = nearestVertex(g, tx, tz, reach);
  if (s < 0 || e < 0) return [];
  const dist = new Float32Array(g.pts.length).fill(Infinity), from = new Int32Array(g.pts.length).fill(-1), done = new Uint8Array(g.pts.length);
  dist[s] = 0;
  const open = [s];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[bi]]) bi = i;
    const k = open.splice(bi, 1)[0];
    if (done[k]) continue;
    done[k] = 1;
    if (k === e) break;
    for (const [n, d] of g.adj[k]) if (!done[n] && dist[k] + d < dist[n]) { dist[n] = dist[k] + d; from[n] = k; open.push(n); }
  }
  if (!Number.isFinite(dist[e])) return [];
  const total = Math.hypot(g.pts[s][0] - fx, g.pts[s][1] - fz) + dist[e] + Math.hypot(g.pts[e][0] - tx, g.pts[e][1] - tz);
  if (dist[e] < 0.6 || total > direct * detour + 0.4) return [];
  const out: Pt[] = [];
  for (let k = e; k !== -1; k = from[k]) out.push(g.pts[k]);
  out.reverse();
  // every few points is plenty to follow
  return out.filter((_, i) => i % 3 === 0 || i === out.length - 1);
}

// ── What the menu sees ──

export interface PathSummaryEdge {
  key: string; a: string; b: string; aName: string; bName: string;
  lenM: number; uniqueM: number; trips: number; wear: number; worn: NetEdge['worn']; laid: LaidKind | null; can: NetEdge['can']; hidden: boolean;
  /** The trails it runs along (indexes into `PathSummary.trails`). */
  trailIds: number[];
}
export interface PathSummary {
  edges: PathSummaryEdge[];
  /** Each trail's length (metres) and what is laid on it. */
  trails: Array<{ m: number; laid: LaidKind | null }>;
  key: string;
}

export function summarize(net: Pick<PathNetwork, 'edges' | 'trails'>): PathSummary {
  const edges = net.edges.map(e => ({
    key: e.key, a: e.a, b: e.b, aName: e.aName, bName: e.bName, lenM: e.lenM, uniqueM: e.uniqueM, trips: Math.round(e.trips * 10) / 10,
    wear: Math.round(e.meanWear * 100) / 100, worn: e.worn, laid: e.laid, can: e.can, hidden: e.hidden, trailIds: e.trails,
  }));
  const trails = net.trails.map(t => ({ m: t.lenM, laid: t.laid }));
  return { edges, trails, key: edges.map(e => `${e.key}:${e.laid ?? e.worn}:${Math.round(e.wear * 10)}`).join('|') + '#' + trails.map(t => t.laid ?? '-').join('') };
}

/**
 * What laying `kind` on these walks adds, walk by walk: the metres of trail not already laid with this kind or a better one, each trail
 * counted once (the first walk on it pays for it), so a shared trunk is bought once however many walks are laid on it.
 */
export function layShares(sum: Pick<PathSummary, 'trails'>, edges: ReadonlyArray<Pick<PathSummaryEdge, 'a' | 'b' | 'trailIds'>>, kind: LaidKind): Array<{ a: string; b: string; lenM: number }> {
  const claimed = new Set<number>(), rank = (k: LaidKind | null) => (k === null ? -1 : LAID_KINDS.indexOf(k));
  return edges.map(e => {
    let m = 0;
    for (const i of e.trailIds) {
      if (claimed.has(i)) continue;
      claimed.add(i);
      const t = sum.trails[i];
      if (t && rank(t.laid) < rank(kind)) m += t.m;
    }
    return { a: e.a, b: e.b, lenM: m };
  });
}

/** The walks worth laying: busy (a trip or two a day at least) or already a visible track; never to a hidden hatch. */
export function worthLaying(e: PathSummaryEdge, kind: LaidKind): boolean {
  return !e.hidden && e.can[kind] && (e.trips >= 1.5 || e.worn !== 'none') && e.laid !== kind;
}
