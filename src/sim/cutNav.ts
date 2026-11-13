/**
 * The cutscene's movement rule: every person goes only through real openings (doors, gates, breaches), never through a wall, a closed door,
 * furniture or another building. Pure.
 *
 * The battle renderer walks a unit in a straight line toward the last point it was sent to (game/battle/BattleRenderer.ts `_moveUnits`), so a
 * timeline that sends a man across a wall draws him walking through it. This module has the two halves of the fix:
 *
 *   walkBattle   replays a battle's `move` / `cover` / `flee` events with the renderer's own kinematics (run speed, walk speed, the slow of a
 *                wound, a fall, a lay-down). With `route` on, every leg that the straight line would take through something solid is replaced
 *                by a chain of legs through the openings (a grid search, string-pulled); with it off, nothing changes.
 *   findClips    samples every unit's position on every step of that replay and reports each place a step crosses something solid.
 *                The tests run it over whole scenes (night raid, day raid, invasion) and fail on any clip.
 *
 * The world is a `NavWorld`: a static solid test (the game passes `HomesteadWorld.walkBlocked`, which already knows the walls, doors, furniture,
 * buildings, trees and water), plus two timed layers the cutscene itself makes: `barriers` (a closed door: solid until someone opens it, with a
 * visible kick / shot / charge) and `carves` (a breach: the wall is open from the moment it falls).
 */
import type { Battle, BattleEvent } from './battleTypes';

export interface Rect { x0: number; z0: number; x1: number; z1: number }
/** A closed door (or any shut opening): nobody passes before `openAt` (seconds of the scene). */
export interface Barrier extends Rect { id: string; openAt: number; /** Shut from here (default: from the start). */ from?: number }
/** A wall opened by the story (a breach, a gate swung wide): the rectangle is free from `from` on, whatever the static world says. */
export interface Carve extends Rect { from: number }
export interface NavWorld {
  /** Is the point solid (a body of the usual radius cannot stand there)? Static. */
  solid: (x: number, z: number) => boolean;
  barriers: Barrier[];
  carves: Carve[];
  /** Static openings the caller knows (a gate in the yard wall): a spot on each side. The router joins each pair; nothing else is assumed about them. */
  portals?: Array<[Pt, Pt]>;
}

/** A timed opening counts as open a tenth of a second after its moment (the frame the door swings, the dust of the breach): nobody steps through on the exact tick. */
const SLACK = 0.1;
const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
/** Is the point blocked at time t? */
export function blockedAt(w: NavWorld, x: number, z: number, t: number): boolean {
  for (const b of w.barriers) if (t < b.openAt + SLACK && t >= (b.from ?? -1) && inRect(b, x, z)) return true;
  if (!w.solid(x, z)) return false;
  for (const c of w.carves) if (t >= c.from + SLACK && inRect(c, x, z)) return false;
  return true;
}

// the renderer's speeds (BattleRenderer.ts)
export const RUN = 1.1, WALK = 0.8, FLEE = 1.6, WOUND_SLOW = 0.6;
const STEP = 0.05, SUB = 0.04;
/** People keep this far apart at rest (a body is about 0.05 wide). */
const SEP = 0.09;

export interface Pt { x: number; z: number }
export interface Clip { unit: string; t: number; from: Pt; to: Pt }

interface K { topAt?: number; id: string; x: number; z: number; tx: number; tz: number; speed: number; wound: number; dead: boolean; frozen: boolean; carriedBy?: string; y: number; ty: number; queue: Array<{ x: number; z: number; kind: 'move' | 'cover' | 'hide'; walk?: boolean; how?: string; ty?: number } | { flee: BattleEvent }> ; fleeing: boolean; moved: boolean; heldFor?: object; settleAt?: number; lastKind?: string; /** The foot of the ladder he is up (he goes back down it before going anywhere else). */ foot?: Pt; /** Where he is finally going (the end of the chain of legs). */ dest?: Pt }

/** How long a raider stays on the top rungs of a ladder (battle seconds) before he comes back down. */
const TOP_HOLD = 0.5;

export interface WalkOpts {
  /** Rewrite legs through openings. */
  route: boolean;
  /** Where "away" is for a flee (the renderer runs a fleeing unit 60 units from the scene center; routed, they leave by an opening to a point this far out). */
  center?: Pt;
  /** Defenders who go down on a knee a moment after they stop in the middle of the fight (ids, and the stretch of the scene it applies to). */
  settle?: { ids: ReadonlySet<string>; from: number; to: number };
  /** Called after every step for every unit that moved: previous and new position. */
  onStep?: (id: string, t: number, a: Pt, b: Pt, y: number) => void;
}
export interface WalkResult { events: BattleEvent[]; units: Battle['units']; /** Legs that had no way through (left straight). */ unrouted: number; /** Which ones (for the tests' messages). */ lost: Array<{ unit: string; t: number; from: Pt; to: Pt }>; /** Units that started inside something solid (moved to the nearest free spot when routing). */ nudged: string[] }

// ─── search ──────────────────────────────────────────────────────────────

// ─── what the scene's static world has taught the router ────────────────────
//
// Two caches live as long as the static solid test does (a world's `solid` function; the game makes a new one whenever a structure or a wall run changes, so they
// are rebuilt exactly when the compound changes, and shared by every scene of one cutscene):
//   the lattice  - whether a spot is solid, asked once per cell of a fixed lattice instead of once per search (a scene's 100+ searches overlap almost completely, and
//                  in the game each answer walks the stream, the buildings, the wall runs and the trees);
//   the opening graph - the corners and openings (gates, breaches, doorways) that earlier legs were routed through, joined where a leg ran from one to the next. A new
//                  leg first tries to ride that graph (a few straight, verified runs between known openings) and only floods a search grid when the graph has no good way.
// Timed doors and breaches are never stored: a graph path is re-checked at the clock it will be walked, and a shut door sends the leg back to the search.

/** Cell sizes the search grids use (a grid is aligned to its own cell size so scenes' searches share lattice answers). */
const LEVELS = Array.from({ length: 24 }, (_, k) => 0.05 * Math.pow(1.12, k));
const PAGE = 32;
interface Graph { nodes: Pt[]; adj: number[][]; byCell: Map<number, number[]>; sees: Map<number, boolean>; /** Edges through a known opening (checked at the clock of use, inside the search). */ portal: Set<number> }
interface StaticCache { pages: Map<number, Uint8Array>; lookups: number; misses: number }
const GRAPHS = new WeakMap<NavWorld, Graph>();
const STATIC = new WeakMap<object, StaticCache>();
const cacheOf = (w: NavWorld): StaticCache => {
  const key = w.solid as unknown as object;
  let c = STATIC.get(key);
  if (!c) { c = { pages: new Map(), lookups: 0, misses: 0 }; STATIC.set(key, c); }
  return c;
};
/** Is the lattice cell (li, lj) of cell size `cell` (level `lv`) solid? 0 unknown, 1 open, 2 solid in the page. */
function latticeSolid(w: NavWorld, c: StaticCache, lv: number, cell: number, li: number, lj: number, ph = 0): boolean {
  const off = ph * 0.5, pi = Math.floor(li / PAGE), pj = Math.floor(lj / PAGE), key = ((lv * 2 + ph) * 4096 + (pi & 4095)) * 4096 + (pj & 4095);
  let page = c.pages.get(key);
  if (!page) { page = new Uint8Array(PAGE * PAGE); c.pages.set(key, page); }
  const k = (lj - pj * PAGE) * PAGE + (li - pi * PAGE);
  c.lookups++;
  let v = page[k];
  if (v === 0) { c.misses++; v = w.solid((li + 0.5 + off) * cell, (lj + 0.5 + off) * cell) ? 2 : 1; page[k] = v; }
  return v === 2;
}

/** How far outside an opening its two landing spots lie, beyond the opening's own half depth. */
const LANDING = 0.2;
/**
 * The scene's opening graph, made once per world (a scene) and grown by every routed leg: seeded with the two landing spots on either side of each opening that is
 * known up front - every timed door and breach, and the static gates the caller names - and each pair joined (the way through is checked at the clock it is used).
 */
function graphOf(w: NavWorld): Graph {
  let G = GRAPHS.get(w);
  if (G) return G;
  G = { nodes: [], adj: [], byCell: new Map(), sees: new Map(), portal: new Set() };
  GRAPHS.set(w, G);
  const pair = (p: Pt, q: Pt) => {
    if (blockedAtStatic(w, p) || blockedAtStatic(w, q)) return;
    const i = nodeAt(G!, p), j = nodeAt(G!, q);
    if (i >= 0 && j >= 0 && i !== j) { G!.adj[i].push(j); G!.adj[j].push(i); G!.portal.add(i < j ? i * 4096 + j : j * 4096 + i); }
  };
  for (const r of [...w.barriers, ...w.carves]) {
    const hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    if (Math.abs(hx - hz) < 0.02) continue;   // (a square patch is a climbed spot, not a doorway with a direction)
    if (hx < hz) pair({ x: cx - hx - LANDING, z: cz }, { x: cx + hx + LANDING, z: cz }); else pair({ x: cx, z: cz - hz - LANDING }, { x: cx, z: cz + hz + LANDING });
  }
  for (const [p, q] of w.portals ?? []) pair(p, q);
  return G;
}
const blockedAtStatic = (w: NavWorld, p: Pt) => w.solid(p.x, p.z);

/** Graph node spacing: two nodes closer than this are one. */
const NODE_MERGE = 0.06, NODE_CAP = 900, NODE_CELL = 1;
const cellKey = (x: number, z: number) => Math.floor(x / NODE_CELL) * 100003 + Math.floor(z / NODE_CELL);
function nodeAt(G: Graph, p: Pt): number {
  const cx = Math.floor(p.x / NODE_CELL), cz = Math.floor(p.z / NODE_CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = G.byCell.get((cx + i) * 100003 + cz + j);
    if (a) for (const n of a) if (Math.hypot(G.nodes[n].x - p.x, G.nodes[n].z - p.z) < NODE_MERGE) return n;
  }
  if (G.nodes.length >= NODE_CAP) return -1;
  const n = G.nodes.length;
  G.nodes.push({ x: p.x, z: p.z }); G.adj.push([]);
  const k = cellKey(p.x, p.z), a = G.byCell.get(k);
  if (a) a.push(n); else G.byCell.set(k, [n]);
  return n;
}
/** Remember a routed path: its points are nodes, and each run between two of them an edge. */
function learnPath(w: NavWorld, a: Pt, path: readonly Pt[]): void {
  const G = graphOf(w);
  let prev = nodeAt(G, a);
  for (const p of path) {
    const n = nodeAt(G, p);
    if (prev >= 0 && n >= 0 && n !== prev) { if (!G.adj[prev].includes(n)) G.adj[prev].push(n); if (!G.adj[n].includes(prev)) G.adj[n].push(prev); }
    prev = n;
  }
}
/** The nodes within `r` of p that p can walk to in a clear line at time t, nearest first (at most `max`). */
function visibleNodes(w: NavWorld, G: Graph, p: Pt, t: number, speed: number, r: number, max: number, toward: boolean, other: Pt): number[] {
  const cand: Array<{ n: number; d: number }> = [];
  const cx = Math.floor(p.x / NODE_CELL), cz = Math.floor(p.z / NODE_CELL), reach = Math.ceil(r / NODE_CELL);
  for (let i = -reach; i <= reach; i++) for (let j = -reach; j <= reach; j++) {
    const a = G.byCell.get((cx + i) * 100003 + cz + j);
    if (a) for (const n of a) { const d = Math.hypot(G.nodes[n].x - p.x, G.nodes[n].z - p.z); if (d <= r) cand.push({ n, d }); }
  }
  // (nearest first, but a node that lies back the way he came is worth less than one toward the goal)
  cand.sort((u, v) => (u.d + (toward ? 0 : 0) + 0.3 * Math.hypot(G.nodes[u.n].x - other.x, G.nodes[u.n].z - other.z)) - (v.d + 0.3 * Math.hypot(G.nodes[v.n].x - other.x, G.nodes[v.n].z - other.z)));
  const out: number[] = [];
  let tries = 0;
  for (const c of cand) {
    if (out.length >= max || tries >= max * 2) break;
    const q = G.nodes[c.n];
    if (!staticSees2(w, cacheOf(w), p, q)) continue;   // (the cached lattice rules out the walled-off ones for almost nothing; the real line decides the rest)
    tries++;
    if (toward ? lineClear(w, p, q, t, speed) : lineClear(w, q, p, t, speed)) out.push(c.n);
  }
  return out;
}

/** How far (in node cells, one unit each) two nodes may be and still be tested for sight of each other. */
const VIS_R = 6;
/** Can the static ground (no doors, no breaches) be crossed in a straight line between two nodes? Memoised for the life of the cache. */
function staticSees(w: NavWorld, c: StaticCache, G: Graph, i: number, j: number): boolean {
  const key = i < j ? i * 4096 + j : j * 4096 + i, hit = G.sees.get(key);
  if (hit !== undefined) return hit;
  const p = G.nodes[i], q = G.nodes[j], d = Math.hypot(q.x - p.x, q.z - p.z), n = Math.max(1, Math.ceil(d / SUB));
  let ok = true;
  for (let k = 1; k <= n && ok; k++) { const f = k / n; if (latticeSolid(w, c, 0, LEVELS[0], Math.floor((p.x + (q.x - p.x) * f) / LEVELS[0]), Math.floor((p.z + (q.z - p.z) * f) / LEVELS[0]))) ok = false; }
  G.sees.set(key, ok);
  return ok;
}

/** Can the static ground be crossed in a straight line from a to b (lattice answers)? */
function staticSees2(w: NavWorld, c: StaticCache, a: Pt, b: Pt): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / SUB)), L0 = LEVELS[0];
  for (let k = 1; k <= n; k++) { const f = k / n; if (latticeSolid(w, c, 0, L0, Math.floor((a.x + (b.x - a.x) * f) / L0), Math.floor((a.z + (b.z - a.z) * f) / L0))) return false; }
  return true;
}

/** The longest a graph path may be against the straight line before the search grid is trusted to do better. */
const GRAPH_RATIO = 1.5, GRAPH_SLACK = 1.2, GRAPH_MIN = 1.2;
/** A path from a to b along the opening graph (a few verified runs), or null. */
function graphPath(w: NavWorld, a: Pt, b: Pt, t: number, speed: number): Pt[] | null {
  const SC = cacheOf(w), G = graphOf(w);
  if (G.nodes.length < 2) return null;
  const direct = Math.hypot(b.x - a.x, b.z - a.z);
  if (direct < GRAPH_MIN) return null;
  const R = 14;
  const from = visibleNodes(w, G, a, t, speed, R, 5, true, b);
  if (!from.length) return null;
  const to = visibleNodes(w, G, b, t, speed, R, 5, false, a);
  if (!to.length) return null;
  const goal = new Map(to.map(n => [n, Math.hypot(G.nodes[n].x - b.x, G.nodes[n].z - b.z)]));
  const dist = new Map<number, number>(), prev = new Map<number, number>(), done = new Set<number>();
  // (a small Dijkstra over at most a few hundred nodes: a linear scan for the next node is cheaper than a heap here)
  const open = new Set<number>();
  for (const n of from) { dist.set(n, Math.hypot(G.nodes[n].x - a.x, G.nodes[n].z - a.z)); open.add(n); }
  let best = -1, bestCost = Infinity;
  // (a wall between the two ends makes a long way round the only way: then the way is not judged against the straight line)
  const walled = !staticSees2(w, SC, a, b);
  const limit = walled ? 8 * direct + 90 : GRAPH_RATIO * direct + GRAPH_SLACK;
  while (open.size) {
    let cur = -1, cd = Infinity;
    for (const n of open) { const d = dist.get(n)!; if (d < cd) { cd = d; cur = n; } }
    if (cd >= bestCost || cd > limit) break;
    open.delete(cur); done.add(cur);
    if (goal.has(cur) && cd + goal.get(cur)! < bestCost) { bestCost = cd + goal.get(cur)!; best = cur; }
    const around: number[] = [...G.adj[cur]];
    // (and the nodes it can see on the static ground: two openings in view of each other need no search between them)
    { const p0 = G.nodes[cur], cx = Math.floor(p0.x / NODE_CELL), cz = Math.floor(p0.z / NODE_CELL);
      for (let i = -VIS_R; i <= VIS_R; i++) for (let j = -VIS_R; j <= VIS_R; j++) { const arr = G.byCell.get((cx + i) * 100003 + cz + j); if (arr) for (const m of arr) if (m !== cur && !done.has(m) && !G.adj[cur].includes(m) && Math.hypot(G.nodes[m].x - p0.x, G.nodes[m].z - p0.z) <= VIS_R && staticSees(w, SC, G, cur, m)) around.push(m); } }
    for (const m of around) {
      if (done.has(m)) continue;
      const nd = cd + Math.hypot(G.nodes[m].x - G.nodes[cur].x, G.nodes[m].z - G.nodes[cur].z);
      // (an opening that is shut when he would get there is no way yet: the timed layers decide, here, for the openings the graph was seeded with)
      if (G.portal.has(cur < m ? cur * 4096 + m : m * 4096 + cur) && !lineClear(w, G.nodes[cur], G.nodes[m], t + cd / speed, speed)) continue;
      if (nd < (dist.get(m) ?? Infinity)) { dist.set(m, nd); prev.set(m, cur); open.add(m); }
    }
  }
  if (best < 0 || bestCost > limit) return null;
  const chain: Pt[] = [];
  for (let n: number | undefined = best; n !== undefined; n = prev.get(n)) chain.push(G.nodes[n]);
  chain.reverse();
  const raw = [a, ...chain, b];
  const out = pullString(w, raw, t, speed);
  // (every run must be clear at the clock it will be walked: a door shut since the nodes were learned sends the leg to the search)
  if (!checkLegs(w, a, out, t, speed)) return null;
  return out;
}

/** String-pull: from each anchor, the farthest point with a clear line. `raw[0]` is the start. */
function pullString(w: NavWorld, raw: readonly Pt[], t: number, speed: number): Pt[] {
  const out: Pt[] = [];
  let anchor = raw[0], tt = t, k = 0;
  while (k < raw.length - 1) {
    let far = k + 1;
    for (let m = raw.length - 1; m > k + 1; m--) if (lineClear(w, anchor, raw[m], tt, speed)) { far = m; break; }
    out.push(raw[far]);
    tt += Math.hypot(raw[far].x - anchor.x, raw[far].z - anchor.z) / speed;
    anchor = raw[far]; k = far;
  }
  return out;
}
/** Is every run of the pulled path clear at the time it is walked? */
function checkLegs(w: NavWorld, a: Pt, out: readonly Pt[], t: number, speed: number): boolean {
  let p = a, tl = t;
  for (const q of out) { if (!lineClear(w, p, q, tl, speed)) return false; tl += Math.hypot(q.x - p.x, q.z - p.z) / speed; p = q; }
  return true;
}


function lineClear(w: NavWorld, a: Pt, b: Pt, t0: number, speed: number): boolean {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / SUB));
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    if (blockedAt(w, a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f, t0 + d * f / speed)) return false;
  }
  return true;
}

/** The nearest free point to (x, z) within `r`, or null. */
export function nearestFree(w: NavWorld, x: number, z: number, t: number, r = 1.2): Pt | null {
  if (!blockedAt(w, x, z, t)) return { x, z };
  for (let ring = 1; ring * 0.04 <= r; ring++) {
    const rr = ring * 0.04;
    for (let k = 0; k < 8 + ring * 4; k++) {
      const a = (k / (8 + ring * 4)) * Math.PI * 2, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      if (!blockedAt(w, px, pz, t)) return { x: px, z: pz };
    }
  }
  return null;
}


/** How many corner rescues a leg may try before it is given up (each failed try floods a whole search box). */
const RESCUES = 14;

/** A path from a to b through the open ground at time t, as waypoints (b last), or null. */
export function findPath(w: NavWorld, a: Pt, b: Pt, t: number, speed = RUN): Pt[] | null {
  const r = findPathCore(w, a, b, t, speed, true);
  if (r) return r;
  // a start or a goal pressed into a corner: step to a nearby open spot (a clear line away) and search from there. Each failed try floods a whole search box,
  // and a goal with no way to it fails them all: after RESCUES tries the leg is given up (the caller waits for a door, or leaves it straight).
  // (a leg with no way through - a wall with no gap yet - fails from every point beside its ends too, and each try floods a whole search box: one scene lost a minute to
  // 24 near-identical tries; so the tries are capped.)
  let tries = 0;
  for (const d of [0.08, 0.15, 0.25, 0.4]) for (let k = 0; k < 8; k++) {
    const dx = Math.cos(k * 0.785) * d, dz = Math.sin(k * 0.785) * d;
    const a2 = { x: a.x + dx, z: a.z + dz };
    if (!blockedAt(w, a2.x, a2.z, t) && lineClear(w, a, a2, t, speed)) { if (tries++ >= RESCUES) return null; const r2 = findPathCore(w, a2, b, t, speed); if (r2) return [a2, ...r2]; }
    const b2 = { x: b.x + dx, z: b.z + dz };
    if (!blockedAt(w, b2.x, b2.z, t) && lineClear(w, b2, b, t, speed)) { if (tries++ >= RESCUES) return null; const r2 = findPathCore(w, a, b2, t, speed); if (r2) return [...r2, b]; }
  }
  return null;
}

/** Counters for the QA harness (scripts/cutLeakCheck.mjs): how many searches a scene's routing makes and how big they are. */
export const navStats: { cores: number; graph: number; direct: number; grids: number; expanded: number; fails: number; skipped: number; ms: number; pad: Record<number, { tries: number; ok: number; expanded: number }> } = { cores: 0, graph: 0, direct: 0, grids: 0, expanded: 0, fails: 0, skipped: 0, ms: 0, pad: { 3: { tries: 0, ok: 0, expanded: 0 }, 8: { tries: 0, ok: 0, expanded: 0 }, 24: { tries: 0, ok: 0, expanded: 0 } } };

/**
 * What the routing of one scene has learned (per world): which search boxes pay off, and which (start, goal) pairs have no way through in the present state of the
 * doors and breaches. In the slow scenes 90 % of the small-box searches failed and each failure floods its whole box (59 M cell expansions in one scene).
 */
interface Region { key: number; lv: number; ph: number; li0: number; lj0: number; nx: number; nz: number; closed: Uint8Array; x0: number; z0: number; x1: number; z1: number }
interface Learned { pad: Record<number, { tries: number; ok: number }>; failed: Set<string>; /** Grids that a search flooded to the end without reaching its goal (the biggest box only): what they reached is one piece of ground, and a leg from inside it to a spot outside it has no way either. */ regions: Region[] }
const LEARNED = new WeakMap<NavWorld, Learned>();
const learnedOf = (w: NavWorld): Learned => { let l = LEARNED.get(w); if (!l) { l = { pad: { 3: { tries: 0, ok: 0 }, 8: { tries: 0, ok: 0 } }, failed: new Set(), regions: [] }; LEARNED.set(w, l); } return l; };
/**
 * The state of the timed doors and breaches at time t, as a number: the same value means the same openings AND the same coming changes. A search that fails
 * only because a door is about to be shut (or a breach not yet through) while the unit is still walking must not poison the same pair of points for the moment
 * the way is open: the state hash alone is the same before a door's first closing and after its opening, so the next transition is part of it.
 */
function openingsAt(w: NavWorld, t: number): number {
  let h = 17, next = Infinity;
  const note = (x: number) => { if (x > t && x < next) next = x; };
  w.barriers.forEach((b, i) => { if (t < b.openAt + SLACK && t >= (b.from ?? -1)) h = (Math.imul(h, 31) + i + 1) | 0; note(b.from ?? -1); note(b.openAt + SLACK); });
  w.carves.forEach((c, i) => { if (t >= c.from + SLACK) h = (Math.imul(h, 37) + i + 7) | 0; note(c.from + SLACK); });
  return next === Infinity ? h : (Math.imul(h, 41) + Math.round(next * 100)) | 0;
}

/** Does a flooded region put a and b on different sides: a in the piece of ground it reached, b open ground it did not (or the other way round)? */
function regionSplits(w: NavWorld, c: StaticCache, r: Region, a: Pt, b: Pt): boolean {
  const cell = LEVELS[r.lv];
  const off = r.ph * 0.5;
  const ci = (p: Pt) => { const i = Math.floor(p.x / cell - off) - r.li0, j = Math.floor(p.z / cell - off) - r.lj0; return i < 0 || j < 0 || i >= r.nx || j >= r.nz ? -1 : j * r.nx + i; };
  const ia = ci(a), ib = ci(b);
  if (ia < 0 || ib < 0 || r.closed[ia] === r.closed[ib]) return false;
  // (a spot in solid ground has its own rules - the search nudges it to open ground - so only open cells decide)
  const open = (p: Pt) => !latticeSolid(w, c, r.lv, cell, Math.floor(p.x / cell - off), Math.floor(p.z / cell - off), r.ph);
  return open(a) && open(b);
}

/** How far a new search box may stick out past a flooded one and still be answered by it (a way out through that sliver and back in is not a thing). */
const REGION_TOL = 2.5;

/** A leg this short is inside a building or a yard corner: only the smallest search box has cells fine enough to find an interior doorway (about 0.07 wide for a body), so it is never retired. */
const LOCAL_LEG = 4;

function findPathCore(w: NavWorld, a: Pt, b: Pt, t: number, speed: number, graph = false): Pt[] | null {
  navStats.cores++;
  if (lineClear(w, a, b, t, speed)) { navStats.direct++; return [b]; }
  const L = learnedOf(w), key = `${Math.round(a.x / 0.03)},${Math.round(a.z / 0.03)}>${Math.round(b.x / 0.03)},${Math.round(b.z / 0.03)}@${openingsAt(w, t)}`;
  if (L.failed.has(key)) { navStats.skipped++; return null; }
  const open0 = openingsAt(w, t);
  // (a leg that can ride the openings earlier legs went through needs no grid at all)
  const viaGraph = graph ? graphPath(w, a, b, t, speed) : null;
  if (viaGraph) { navStats.graph++; return viaGraph; }
  const SC = cacheOf(w);
  // (two passes: the grid on the shared lattice first; then, only when that finds no way, the grid hung on the leg's own corner, as it always was - a gap of a hand's
  // width between a partition and a table is found by a grid with a cell centre in it, and which grid has one is luck of the origin)
  for (const ph of [0, 1]) for (const pad of ph === 0 ? [3, 8, 24] : [3, 8]) {
    // a small box that has almost never found a way in this scene is not tried again: the doorway, wall or creek it keeps running into makes the big box the one that works
    const ps = L.pad[pad];
    if (ps && ps.tries >= 16 && ps.ok / ps.tries < 0.2 && !(pad === 3 && Math.hypot(b.x - a.x, b.z - a.z) < LOCAL_LEG)) continue;
    // (the grid sits on a fixed lattice of a few cell sizes, so one search's answers about the ground serve the next: see `latticeSolid`)
    const want = Math.max(0.05, (Math.max(Math.max(a.x, b.x) - Math.min(a.x, b.x), Math.max(a.z, b.z) - Math.min(a.z, b.z)) + 2 * pad) / 300);
    // (rounded DOWN to the next level: a cell is never coarser than the search asked for, so a narrow doorway is never lost to the lattice)
    let lv = 0; while (lv + 1 < LEVELS.length && LEVELS[lv + 1] <= want + 1e-9) lv++;
    const cell = LEVELS[lv];
    const off = ph * 0.5;
    const li0 = Math.floor((Math.min(a.x, b.x) - pad) / cell - off), lj0 = Math.floor((Math.min(a.z, b.z) - pad) / cell - off);
    const x0 = (li0 + off) * cell, z0 = (lj0 + off) * cell;
    const x1 = Math.max(a.x, b.x) + pad, z1 = Math.max(a.z, b.z) + pad;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    // (a search whose box lies inside one that an earlier search flooded to the end, from a spot in the same piece of ground to one outside it, fails the same way: skip the flood)
    if (L.regions.some(r => r.key === open0 && r.lv === lv && r.ph === ph && Math.min(a.x, b.x) - pad >= r.x0 - REGION_TOL && Math.max(a.x, b.x) + pad <= r.x1 + REGION_TOL && Math.min(a.z, b.z) - pad >= r.z0 - REGION_TOL && Math.max(a.z, b.z) + pad <= r.z1 + REGION_TOL && regionSplits(w, SC, r, a, b))) { navStats.skipped++; continue; }
    const cx = (i: number) => x0 + (i + 0.5) * cell, cz = (j: number) => z0 + (j + 0.5) * cell;
    const idx = (i: number, j: number) => j * nx + i;
    const gi = (v: number) => Math.min(nx - 1, Math.max(0, Math.floor((v - x0) / cell)));
    const gj = (v: number) => Math.min(nz - 1, Math.max(0, Math.floor((v - z0) / cell)));
    let si = gi(a.x), sj = gj(a.z), ti = gi(b.x), tj = gj(b.z);
    let s = idx(si, sj), goal = idx(ti, tj);
    const g = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    // (a binary heap in two flat arrays: a search pushes millions of entries, and a pair object per push was most of its time)
    const hf: number[] = [], hn: number[] = [];
    const push = (f: number, n: number) => { let i = hf.length; hf.push(f); hn.push(n); while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hf[i] = hf[p]; hn[i] = hn[p]; i = p; } hf[i] = f; hn[i] = n; };
    const pop = (): number => {
      const top = hn[0], lf = hf.pop()!, ln = hn.pop()!, len = hf.length;
      if (len) { let i = 0; for (;;) { const l = 2 * i + 1; if (l >= len) break; const r = l + 1, m = r < len && hf[r] < hf[l] ? r : l; if (hf[m] >= lf) break; hf[i] = hf[m]; hn[i] = hn[m]; i = m; } hf[i] = lf; hn[i] = ln; }
      return top;
    };
    const memo = new Uint8Array(nx * nz);   // 0 unknown, 1 open, 2 solid
    // (only the doors and breaches that touch this box can matter to a cell in it)
    const hits = (r: Rect) => r.x1 >= x0 && r.x0 <= x1 && r.z1 >= z0 && r.z0 <= z1;
    const bars = w.barriers.filter(hits), cars = w.carves.filter(hits);
    const free = (i: number, j: number, te: number) => {
      // (the start and goal cells are always allowed: the caller has already put both on open ground)
      const n = idx(i, j);
      if (n === s || n === goal) return true;
      // static solidity is cached; barriers and carves are timed
      let st = memo[n];
      if (st === 0) { st = latticeSolid(w, SC, lv, cell, li0 + i, lj0 + j, ph) ? 2 : 1; memo[n] = st; }
      if (bars.length) for (const bar of bars) if (te < bar.openAt + SLACK && te >= (bar.from ?? -1) && inRect(bar, cx(i), cz(j))) return false;
      if (st === 1) return true;
      if (cars.length) for (const c of cars) if (te >= c.from + SLACK && inRect(c, cx(i), cz(j))) return true;
      return false;
    };
    // (a start or goal tight against a corner can sit in a grid cell whose neighbours are all solid: snap it to the nearest open cell with a clear straight line)
    const snapped: { a: Pt | null; b: Pt | null } = { a: null, b: null };
    const snap = (p: Pt, i0: number, j0: number): { i: number; j: number; p: Pt } | null => {
      const open = (i: number, j: number) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; const st2 = latticeSolid(w, SC, lv, cell, li0 + i, lj0 + j, ph); return !st2 || w.carves.some(c => t >= c.from + SLACK && inRect(c, cx(i), cz(j))); };
      for (let r = 0; r <= 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (!open(i, j)) continue;
        // it must have an open neighbour (not itself a pocket) and a clear line from the point
        let nb = 0; for (let dj2 = -1; dj2 <= 1; dj2++) for (let di2 = -1; di2 <= 1; di2++) if ((di2 || dj2) && open(i + di2, j + dj2)) nb++;
        if (nb < 3) continue;
        const q = { x: cx(i), z: cz(j) };
        if (lineClear(w, p, q, t, speed)) return { i, j, p: q };
      }
      return null;
    };
    const stuck = (i: number, j: number) => { let n = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < nx && nj < nz && free(ni, nj, t)) n++; } return n < 3; };
    if (stuck(si, sj) || !lineClear(w, a, { x: cx(si), z: cz(sj) }, t, speed)) { const q = snap(a, si, sj); if (q) { si = q.i; sj = q.j; snapped.a = q.p; } }
    if (stuck(ti, tj) || !lineClear(w, { x: cx(ti), z: cz(tj) }, b, t, speed)) { const q = snap(b, ti, tj); if (q) { ti = q.i; tj = q.j; snapped.b = q.p; } }
    s = idx(si, sj); goal = idx(ti, tj);
    // (a start or a goal shut into a small pocket - a pen, a closet, the lee of a fence - has no way out, and finding that out by flooding the whole grid took minutes in
    // some scenes: look round each end first, and give up on this box when one is boxed in. A 4-connected flood reaches everything the 8-connected search could.)
    const pocket = (c: number, other: number): boolean => {
      const seen = new Set<number>([c]), q = [c];
      for (let h = 0; h < q.length; h++) {
        const n = q[h]; if (n === other) return false;
        const ci = n % nx, cj = (n - ci) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
          const m = idx(ni, nj);
          if (seen.has(m) || !free(ni, nj, t)) continue;
          seen.add(m); q.push(m);
          if (seen.size > (pad === 24 ? 8000 : 700)) return false;
        }
      }
      return true;
    };
    if (pocket(s, goal) || pocket(goal, s)) continue;
    g.fill(Infinity); hf.length = 0; hn.length = 0; g[s] = 0; push(Math.hypot(cx(ti) - cx(si), cz(tj) - cz(sj)), s);
    let found = false;
    navStats.grids++; const exp0 = navStats.expanded; navStats.pad[pad].tries++; if (L.pad[pad]) L.pad[pad].tries++;
    const nfree = [false, false, false, false, false, false, false, false];
    const DI = [-1, 0, 1, -1, 1, -1, 0, 1], DJ = [-1, -1, -1, 0, 0, 1, 1, 1];
    while (hf.length) {
      const n = pop();
      if (closed[n]) continue;
      closed[n] = 1;
      navStats.expanded++;
      if (n === goal) { found = true; break; }
      const ci = n % nx, cj = (n - ci) / nx, te = t + g[n] * cell / speed;
      // (each neighbour is tested once; the two straight neighbours of a diagonal are the same tests)
      for (let k = 0; k < 8; k++) { const ni = ci + DI[k], nj = cj + DJ[k]; nfree[k] = ni >= 0 && nj >= 0 && ni < nx && nj < nz && free(ni, nj, te); }
      for (let k = 0; k < 8; k++) {
        if (!nfree[k]) continue;
        const di = DI[k], dj = DJ[k], ni = ci + di, nj = cj + dj, m = idx(ni, nj);
        if (closed[m]) continue;
        // no cutting a corner: the two straight neighbours must be open (k: 0 1 2 / 3 . 4 / 5 6 7)
        if (di && dj && (!nfree[dj < 0 ? 1 : 6] || !nfree[di < 0 ? 3 : 4])) continue;
        const ng = g[n] + (di && dj ? 1.4142 : 1);
        if (ng < g[m]) { g[m] = ng; from[m] = n; { const hx = (ti - ni) * cell, hz = (tj - nj) * cell; push(ng + Math.sqrt(hx * hx + hz * hz), m); } }
      }
    }
    navStats.pad[pad].expanded += navStats.expanded - exp0;
    if (!found) {
      // a flood that ran out of ground in the biggest box: remember what it reached (the goal's side of the wall is not in it)
            if (!snapped.a && !snapped.b) { L.regions.push({ key: open0, lv, ph, li0, lj0, nx, nz, closed, x0, z0, x1: x0 + nx * cell, z1: z0 + nz * cell }); if (L.regions.length > 24) L.regions.shift(); }
      continue;
    }
    navStats.pad[pad].ok++; if (L.pad[pad]) L.pad[pad].ok++;
    const raw: Pt[] = [];
    for (let n = goal; n >= 0; n = from[n]) raw.push({ x: cx(n % nx), z: cz(Math.floor(n / nx)) });
    raw.reverse();
    raw[0] = snapped.a ?? a; raw[raw.length - 1] = snapped.b ?? b;
    if (snapped.a) raw.unshift(a);
    if (snapped.b) raw.push(b);
    const out = pullString(w, raw, t, speed);
    // (a pulled leg must itself be clear; a coarse grid can pinch a doorway, so one leg that is not is refused and the next pad tried)
    const ok = checkLegs(w, a, out, t, speed);
    if (ok) { learnPath(w, a, out); return out; }
  }
  L.failed.add(key);
  return null;
}

/** Is the leg shut right now by something timed that will open (a door that is barred, a breach not yet through)? Judged on the timed layers alone: a leg that grazes a jamb is not "shut". */
const shutNow = (w: NavWorld, a: Pt, b: Pt, t: number, speed: number): boolean => {
  if (!w.barriers.length && !w.carves.length) return false;
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.01));
  for (let i = 0; i <= n; i++) {
    const f = i / n, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, te = t + d * f / speed;
    for (const bar of w.barriers) if (te < bar.openAt + SLACK && te >= (bar.from ?? -1) && inRect(bar, x, z)) return true;
    if (w.solid(x, z)) for (const c of w.carves) if (te < c.from + SLACK && inRect(c, x, z) && !w.carves.some(c2 => te >= c2.from + SLACK && inRect(c2, x, z))) return true;
  }
  return false;
};

/**
 * A leg that crosses a door or a breach is cut just before it, so the unit is made to check, when it gets there, that the way is open then (a wounded man is
 * slower than the plan, and the door may have been shut behind the family in the meantime).
 */
function splitAtTimed(w: NavWorld, from: Pt, path: Pt[]): Pt[] {
  const timed: Rect[] = [...w.barriers, ...w.carves];
  if (!timed.length) return path;
  const out: Pt[] = [];
  let a = from;
  for (const b of path) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.02));
    let prev = a, cut = false;
    for (let i = 1; i <= n && !cut; i++) {
      const q = { x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n };
      if (!timed.some(r => inRect(r, prev.x, prev.z)) && timed.some(r => inRect(r, q.x, q.z)) && Math.hypot(prev.x - a.x, prev.z - a.z) > 0.03) { out.push({ x: prev.x, z: prev.z }); cut = true; }
      prev = q;
    }
    out.push(b); a = b;
  }
  return out;
}

// ─── the replay ──────────────────────────────────────────────────────────

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Replay a battle with the renderer's kinematics; optionally rewrite every leg that would cross something solid. */
export function walkBattle(b: Battle, w: NavWorld, o: WalkOpts): WalkResult {
  const center = o.center ?? (() => {
    const home = b.units.filter(u => u.side === 'home' && !u.bystander);
    const src = home.length ? home : b.units;
    return { x: src.reduce((s, u) => s + u.x, 0) / Math.max(1, src.length), z: src.reduce((s, u) => s + u.z, 0) / Math.max(1, src.length) };
  })();
  const ks = new Map<string, K>();
  const nudged: string[] = [];
  const units = b.units.map(u => {
    if (u.machine) return u;
    let { x, z } = u;
    if (o.route && blockedAt(w, x, z, 0)) { const f = nearestFree(w, x, z, 0, 2.5); if (f) { x = r2(f.x); z = r2(f.z); nudged.push(u.id); } }
    ks.set(u.id, { id: u.id, x, z, y: u.y ?? 0, ty: u.y ?? 0, tx: x, tz: z, speed: RUN, wound: 0, dead: false, frozen: false, queue: [], fleeing: false, moved: false });
    return x === u.x && z === u.z ? u : { ...u, x, z };
  });
  const out: BattleEvent[] = [];
  let unrouted = 0;
  const lost: WalkResult['lost'] = [];
  const events = b.events;
  let cur = 0;
  const end = b.duration + 1;
  const side = new Map(b.units.map(u => [u.id, u.side]));

  /** Send a unit toward (x, z): straight when that is clear, else through the openings. */
  const lifts: Array<{ e: Extract<BattleEvent, { kind: 'lift' | 'hostage' }>; v: K; c: K; until: number }> = [];
  const pending: Array<{ at: number; k: K; x: number; z: number; kind: 'move' | 'cover' | 'hide'; walk?: boolean; y?: number; how?: string }> = [];
  const issue = (k: K, t: number, x: number, z: number, kind: 'move' | 'cover' | 'hide', walk: boolean | undefined, y?: number, how?: string, vias?: Pt[]) => {
    k.queue = []; k.heldFor = undefined; k.settleAt = undefined; k.lastKind = kind; k.ty = kind === 'move' ? (y ?? 0) : 0;
    if (!o.route) { k.tx = x; k.tz = z; if (walk) k.speed = WALK; out.push({ t: r2(t), kind, unit: k.id, x, z, ...(walk ? { walk: true } : {}), ...(y ? { y } : {}), ...(how ? { how } : {}) } as BattleEvent); return; }
    if (walk) k.speed = WALK;
    const speed = k.speed * (k.wound > 0.5 ? WOUND_SLOW : 1);
    let goal: Pt = { x, z };
    const free = nearestFree(w, x, z, t + 0.1, 1.0);
    if (free) goal = free;
    // two people never stand in the same spot: a goal within a hand of someone else's is moved to the nearest open spot beside it
    const taken = (p: Pt) => { for (const o2 of ks.values()) { if (o2 === k || o2.dead || o2.carriedBy) continue; const d2 = o2.dest ?? { x: o2.tx, z: o2.tz }; if (Math.hypot(d2.x - p.x, d2.z - p.z) < SEP || (o2.queue.length === 0 && Math.hypot(o2.x - p.x, o2.z - p.z) < SEP)) return true; } return false; };
    k.dest = goal;
    if (!(y && y > 0.05) && taken(goal)) {
      outer: for (let ring = 1; ring <= 8; ring++) for (let j = 0; j < 8 + ring * 3; j++) {
        const a = (j / (8 + ring * 3)) * Math.PI * 2, c = { x: goal.x + Math.cos(a) * ring * 0.05, z: goal.z + Math.sin(a) * ring * 0.05 };
        if (!blockedAt(w, c.x, c.z, t + 0.1) && !taken(c)) { goal = c; break outer; }
      }
    }
    k.dest = goal;
    const here = { x: k.x, z: k.z };
    let path: Pt[] | null;
    if (vias && vias.length) {
      // up or down a ladder: to its foot first (and down the one he is on before that), then on (the height rides on the last leg only)
      let cur = here, acc: Pt[] | null = [];
      for (const v0 of [...vias, goal]) {
        const v = v0 === goal ? goal : nearestFree(w, v0.x, v0.z, t + 0.1, 0.6) ?? v0;
        const seg: Pt[] | null = acc ? findPath(w, cur, v, t, speed) : null;
        if (!seg) { acc = null; break; }
        acc = [...acc!, ...seg]; cur = seg[seg.length - 1];
      }
      path = acc ? acc.map(p => ({ x: r2(p.x), z: r2(p.z) })) : null;
    } else path = findPath(w, here, goal, t, speed)?.map(p => ({ x: r2(p.x), z: r2(p.z) })) ?? null;
    // a climb rides on the LAST leg only: if routing dropped the ladder's foot (it lies within a hand of the top), put it back, or the unit would rise as he walks along the ground
    if (path && path.length && y && y > 0.05 && vias && vias.length) {
      const foot = vias[vias.length - 1], last = path[path.length - 1], prev = path.length > 1 ? path[path.length - 2] : here;
      if (Math.hypot(last.x - prev.x, last.z - prev.z) > 1 && Math.hypot(foot.x - last.x, foot.z - last.z) < 0.8) path = [...path.slice(0, -1), { x: r2(foot.x), z: r2(foot.z) }, last];
    }
    if (path) path = splitAtTimed(w, here, path);
    if (!path) {
      // shut doors in the way: wait where he stands until the first one that gives a way opens, then go
      const opens = [...new Set(w.barriers.map(b2 => b2.openAt).filter(a => a > t))].sort((p, q) => p - q);
      for (const at of opens) {
        if (!findPath(w, here, goal, at + 0.25, speed)) continue;
        k.tx = k.x; k.tz = k.z;
        out.push({ t: r2(t), kind: 'move', unit: k.id, x: r2(k.x), z: r2(k.z) });
        const h = { at: at + 0.25, k, x, z, kind, walk, y, how };
        k.heldFor = h; pending.push(h);
        return;
      }
    }
    if (!path) { unrouted++; lost.push({ unit: k.id, t: r2(t), from: { x: r2(k.x), z: r2(k.z) }, to: { x: r2(goal.x), z: r2(goal.z) } }); k.tx = goal.x; k.tz = goal.z; out.push({ t: r2(t), kind, unit: k.id, x: r2(goal.x), z: r2(goal.z), ...(walk ? { walk: true } : {}), ...(y ? { y } : {}), ...(how ? { how } : {}) } as BattleEvent); return; }
    // (a first leg that the clock says is shut right now - a breach not yet open - waits where the unit stands, and goes when it clears)
    if (shutNow(w, here, path[0], t, speed)) {
      k.tx = k.x; k.tz = k.z;
      out.push({ t: r2(t), kind: 'move', unit: k.id, x: r2(k.x), z: r2(k.z) });
      k.queue = path.map((p, i) => ({ x: p.x, z: p.z, kind: i === path.length - 1 ? kind : 'move' as const, walk, how: i === path.length - 1 ? how : undefined, ty: i === path.length - 1 && kind === 'move' ? y ?? 0 : 0 }));
      return;
    }
    path.forEach((p, i) => {
      const last = i === path.length - 1;
      if (i === 0) { k.tx = p.x; k.tz = p.z; k.ty = last && kind === 'move' ? y ?? 0 : 0; out.push({ t: r2(t), kind: last ? kind : 'move', unit: k.id, x: r2(p.x), z: r2(p.z), ...(walk ? { walk: true } : {}), ...(last && y ? { y } : {}), ...(last && how ? { how } : {}) } as BattleEvent); }
      else k.queue.push({ x: p.x, z: p.z, kind: last ? kind : 'move', walk, how: last ? how : undefined, ty: last && kind === 'move' ? y ?? 0 : 0 });
    });
  };

  for (let i = 0, t = 0; t <= end; i++, t = i * STEP) {
    // legs held at a shut door go now that it is open (unless the unit has been sent somewhere else since)
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p.at > t) continue;
      pending.splice(i, 1);
      if (!p.k.dead && !p.k.frozen && !p.k.carriedBy && p.k.heldFor === p) { p.k.heldFor = undefined; issue(p.k, p.at, p.x, p.z, p.kind, p.walk, p.y, p.how); }
    }
    while (cur < events.length && events[cur].t <= t + 1e-6) {
      const e = events[cur++];
      const k = 'unit' in e ? ks.get((e as { unit: string }).unit) : undefined;
      switch (e.kind) {
        case 'move': case 'cover': case 'hide': {
          if (!k || k.dead || k.frozen) { out.push(e); break; }
          if (k.carriedBy) { out.push(e); break; }
          let x = e.x, z = e.z;
          if ('near' in e && e.near) { const o2 = ks.get(e.near.unit); if (o2) { x = o2.x + Math.cos(e.near.a) * e.near.r; z = o2.z + Math.sin(e.near.a) * e.near.r; } }
          k.fleeing = false;
          const own = e.kind === 'move' ? e.via : undefined;
          const vias: Pt[] = [];
          if (k.foot && k.y > 0.04) vias.push(k.foot);   // (up a ladder: down it first)
          if (own) vias.push({ x: r2(own.x), z: r2(own.z) });
          if (own) k.foot = { x: r2(own.x), z: r2(own.z) };
          else if (!(e.kind === 'move' && (e.y ?? 0) > 0.05) && k.y <= 0.04) k.foot = undefined;
          issue(k, e.t, x, z, e.kind, 'walk' in e ? e.walk : undefined, e.kind === 'move' ? e.y : undefined, e.kind === 'hide' ? e.how : undefined, vias);
          break;
        }
        case 'flee': case 'taken': {
          if (!k || k.dead) { out.push(e); break; }
          if (!o.route) { out.push(e); const dx = k.x - center.x, dz = k.z - center.z, d = Math.hypot(dx, dz) || 1; k.tx = k.x + dx / d * 60; k.tz = k.z + dz / d * 60; k.speed = FLEE; k.fleeing = true; break; }
          // out through an opening to a point well beyond the walls, then the usual run away
          const dx = k.x - center.x, dz = k.z - center.z, d = Math.hypot(dx, dz) || 1;
          const goal = nearestFree(w, k.x + dx / d * 40, k.z + dz / d * 40, e.t, 6) ?? { x: k.x, z: k.z };
          let path: Pt[] | null;
          if (k.foot && k.y > 0.04) {
            const p1 = findPath(w, { x: k.x, z: k.z }, k.foot, e.t, RUN), p2 = p1 ? findPath(w, p1[p1.length - 1], goal, e.t, RUN) : null;
            path = p1 && p2 ? [...p1, ...p2].map(p => ({ x: r2(p.x), z: r2(p.z) })) : null;
          } else path = findPath(w, { x: k.x, z: k.z }, goal, e.t, RUN)?.map(p => ({ x: r2(p.x), z: r2(p.z) })) ?? null;
          if (!path || path.length === 1 && Math.hypot(path[0].x - k.x, path[0].z - k.z) < 0.5) { if (!path) unrouted++; out.push(e); k.tx = k.x + dx / d * 60; k.tz = k.z + dz / d * 60; k.speed = FLEE; k.fleeing = true; break; }
          k.queue = path.slice(1).map(p => ({ x: p.x, z: p.z, kind: 'move' as const }));
          k.queue.push({ flee: e });
          k.tx = path[0].x; k.tz = path[0].z;
          out.push({ t: r2(e.t), kind: 'move', unit: k.id, x: r2(path[0].x), z: r2(path[0].z) });
          break;
        }
        case 'death': if (k) { k.dead = true; k.queue = []; k.y = 0; } out.push(e); break;
        case 'lay': case 'surrender': if (k) { k.tx = k.x; k.tz = k.z; k.queue = []; if (e.kind === 'lay') k.frozen = true; } out.push(e); break;
        case 'hostage': {
          const c = ks.get(e.by), v = ks.get(e.unit);
          if (!v || !c) { out.push(e); break; }
          // (the captor walks to the captive first; being led off snaps nobody through a wall)
          if (o.route && Math.hypot(c.x - v.x, c.z - v.z) > 0.2) { issue(c, e.t, v.x + 0.07, v.z, 'move', undefined); lifts.push({ e, v, c, until: e.t + 9 }); break; }
          v.carriedBy = e.by; v.queue = []; out.push(e); break;
        }
        case 'freeze': if (k) { k.tx = k.x; k.tz = k.z; k.queue = []; } out.push(e); break;
        case 'lift': {
          const c = ks.get(e.by), v = ks.get(e.unit);
          if (!v || !c) { out.push(e); break; }
          // (lifting snaps the casualty into the carrier's arms: the carrier walks to them first, through the openings, and the lift waits for that)
          if (o.route && Math.hypot(c.x - v.x, c.z - v.z) > 0.2) { issue(c, e.t, v.x + 0.07, v.z, 'move', undefined); lifts.push({ e, v, c, until: e.t + 9 }); break; }
          v.carriedBy = e.by; out.push(e); break;
        }
        case 'lower': { const v = ks.get(e.unit); if (v?.carriedBy) { const c = ks.get(v.carriedBy); if (c) { v.x = v.tx = c.x; v.z = v.tz = c.z; } v.carriedBy = undefined; } out.push(e); break; }
        case 'aid': {
          // the helper goes to the patient unless already beside them or told they are in place (the renderer's rule)
          const pt = ks.get(e.unit), by = ks.get(e.by);
          if (o.route) {
            if (by && pt && by !== pt && !by.dead && !by.carriedBy && !e.still && Math.hypot(by.x - pt.x, by.z - pt.z) > 0.16) issue(by, e.t, pt.x + 0.08, pt.z, 'cover', undefined);
            out.push({ ...e, still: true });
          } else {
            if (by && pt && by !== pt && !by.dead && !by.carriedBy && !e.still && Math.hypot(by.x - pt.x, by.z - pt.z) > 0.16) { by.tx = pt.x + 0.08; by.tz = pt.z; by.queue = []; }
            out.push(e);
          }
          break;
        }
        case 'wound': if (k && !e.stopped) k.wound = Math.min(1, k.wound + Math.max(0.3, e.sev)); out.push(e); break;
        default: out.push(e);
      }
    }
    for (let i2 = lifts.length - 1; i2 >= 0; i2--) {
      const L = lifts[i2];
      if (L.v.dead || L.c.dead || t > L.until) { lifts.splice(i2, 1); continue; }
      if (Math.hypot(L.c.x - L.v.x, L.c.z - L.v.z) <= 0.2) { lifts.splice(i2, 1); L.v.carriedBy = L.e.by; out.push({ ...L.e, t: r2(t) }); }
    }
    for (const k of ks.values()) {
      if (k.dead || k.frozen) continue;
      const a = { x: k.x, z: k.z }, ya = k.y;
      if (k.carriedBy) {
        const c = ks.get(k.carriedBy);
        if (c) { k.x = c.x; k.z = c.z; k.tx = k.x; k.tz = k.z; }
      } else {
        let dx = k.tx - k.x, dz = k.tz - k.z, d = Math.hypot(dx, dz);
        // (the next leg waits while something timed - a door, a breach - still shuts it)
        if (d <= 0.02 && k.queue.length && o.route && !('flee' in k.queue[0]) && shutNow(w, { x: k.x, z: k.z }, k.queue[0] as Pt, t, k.speed * (k.wound > 0.5 ? WOUND_SLOW : 1))) {
          // hold
        } else if (d <= 0.02 && k.queue.length && o.route && Math.abs(k.y - k.ty) > 0.02) {
          // (he is still coming down the last rung: the next leg waits until his feet are on the ground)
        } else if (d <= 0.02 && k.queue.length) {
          const nx = k.queue.shift()!;
          if ('flee' in nx) { out.push({ ...nx.flee, t: r2(t) }); const fx = k.x - center.x, fz = k.z - center.z, fd = Math.hypot(fx, fz) || 1; k.tx = k.x + fx / fd * 60; k.tz = k.z + fz / fd * 60; k.speed = FLEE; k.fleeing = true; }
          else { k.tx = nx.x; k.tz = nx.z; k.ty = nx.ty ?? 0; if (nx.walk) k.speed = WALK; out.push({ t: r2(t), kind: nx.kind, unit: k.id, x: r2(nx.x), z: r2(nx.z), ...(nx.walk ? { walk: true } : {}), ...(nx.ty ? { y: r2(nx.ty) } : {}), ...(nx.how ? { how: nx.how } : {}) } as BattleEvent); }
          dx = k.tx - k.x; dz = k.tz - k.z; d = Math.hypot(dx, dz);
        }
        if (d > 0.02) {
          const step = Math.min(d, k.speed * (k.wound > 0.5 ? WOUND_SLOW : 1) * STEP);
          k.x += dx / d * step; k.z += dz / d * step; k.moved = true;
          k.y += (k.ty - k.y) * Math.min(1, step / Math.max(d, d <= 0.3 ? 0.02 : 0.3));   // (the renderer's rule: the height follows the remaining distance, and lands exactly when he arrives)
        } else k.y += (k.ty - k.y) * Math.min(1, STEP * 4);
      }
      if (o.settle && o.route && !k.carriedBy && k.queue.length === 0 && Math.hypot(k.tx - k.x, k.tz - k.z) <= 0.02 && o.settle.ids.has(k.id) && t >= o.settle.from && t <= o.settle.to) {
        if (k.settleAt === undefined && k.lastKind === 'move') k.settleAt = t + 1.4;
        else if (k.settleAt !== undefined && t >= k.settleAt) { k.settleAt = undefined; k.lastKind = 'cover'; out.push({ t: r2(t), kind: 'cover', unit: k.id, x: r2(k.x), z: r2(k.z) }); }
      }
      // a raider on a ladder has nothing drawn to stand on at the top (no wall-walk): he is on the rungs while he climbs, a moment to look over, then straight back down
      if (o.route && !k.carriedBy && k.foot && side.get(k.id) === 'raider' && k.queue.length === 0 && k.y > 0.12 && Math.hypot(k.tx - k.x, k.tz - k.z) <= 0.02 && Math.abs(k.y - k.ty) < 0.03) {
        if (k.topAt === undefined) k.topAt = t;
        else if (t >= k.topAt + TOP_HOLD) { k.topAt = undefined; k.tx = k.foot.x; k.tz = k.foot.z; k.ty = 0; out.push({ t: r2(t), kind: 'move', unit: k.id, x: r2(k.foot.x), z: r2(k.foot.z) }); }
      } else k.topAt = undefined;
      if (k.x !== a.x || k.z !== a.z || Math.abs(k.y - ya) > 1e-6) o.onStep?.(k.id, t, a, { x: k.x, z: k.z }, k.y);
    }
  }
  void side;
  out.sort((p, q) => p.t - q.t);
  return { events: out, units, unrouted, lost, nudged };
}

/** Rewrite a battle so that every leg goes through openings. */
export function routeBattle(b: Battle, w: NavWorld, center?: Pt, settle?: WalkOpts['settle']): { battle: Battle; unrouted: number; lost: WalkResult['lost']; nudged: string[] } {
  const r = walkBattle(b, w, { route: true, center, settle });
  return { battle: { ...b, units: r.units, events: r.events }, unrouted: r.unrouted, lost: r.lost, nudged: r.nudged };
}

/** Every step in a battle's replay that goes through something solid. */
export function findClips(b: Battle, w: NavWorld, center?: Pt): Clip[] {
  const clips: Clip[] = [];
  const startBlocked = new Set<string>();
  for (const u of b.units) if (!u.machine && blockedAt(w, u.x, u.z, 0)) startBlocked.add(u.id);
  walkBattle(b, w, {
    route: false, center,
    onStep: (id, t, a, c) => {
      const d = Math.hypot(c.x - a.x, c.z - a.z), n = Math.max(1, Math.ceil(d / SUB));
      // (a step this long is a snap, not a walk: a carry that began far from the casualty)
      if (d > 0.25 && clips.length < 500) { clips.push({ unit: id, t: Math.round(t * 100) / 100, from: a, to: c }); return; }
      let was = blockedAt(w, a.x, a.z, t);
      for (let i = 1; i <= n; i++) {
        const f = i / n, x = a.x + (c.x - a.x) * f, z = a.z + (c.z - a.z) * f, now = blockedAt(w, x, z, t);
        // (a graze: sliding along a wall's clearance edge can cross it by a millionth of a unit; if a point 2 mm to either side is clear, it is not a clip)
        if (now && !was && ([[0.002, 0], [-0.002, 0], [0, 0.002], [0, -0.002]] as const).some(([ox, oz]) => !blockedAt(w, x + ox, z + oz, t))) { was = now; continue; }
        if (now && !was) { if (clips.length < 500) clips.push({ unit: id, t: Math.round(t * 100) / 100, from: a, to: { x, z } }); return; }
        was = now;
      }
    },
  });
  return clips;
}

/**
 * A spot the renderer pushes a raider to (out of a bush, off a neighbour) is only taken when the leg to it stays where the plan's leg was: a push that hops a wall, a
 * fence or a house beside an opening, or that turns the leg into a cut across a corner of the wall, would make the next straight step cross something solid.
 * `from` is where the plan put him, `to` the pushed spot, `now` where he stands (his last waypoint) and `next` the plan's next waypoint for him with the solid test as it
 * will be then (a breach that is still shut now is open by then); returns `to` or `from`.
 */
export function keepPush(solid: (x: number, z: number) => boolean, from: Pt, to: Pt, now?: Pt, next?: { at: Pt; solid: (x: number, z: number) => boolean }): Pt {
  if (to.x === from.x && to.z === from.z) return to;
  const openBy = (sol: (x: number, z: number) => boolean) => (a: Pt, b: Pt) => {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.03));
    for (let i = 1; i <= n; i++) if (sol(a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n)) return false;
    return true;
  };
  const open = openBy(solid);
  // (a push that ends inside something solid, from open ground, is refused; so is one whose way there is not open all along)
  if (solid(to.x, to.z) && !solid(from.x, from.z)) return from;
  if (!open(from, to)) return from;
  // (the plan's leg ran clear from where he stands to the planned spot: the pushed leg must too)
  if (now && open(now, from) && !open(now, to)) return from;
  // (and the leg on from the pushed spot to the plan's next waypoint, which ran clear from the planned spot)
  if (next) { const ahead = openBy(next.solid); if (ahead(from, next.at) && !ahead(to, next.at)) return from; }
  return to;
}

/** A tiny world for tests and tools: solid boxes, with the openings simply left out. */
export function boxWorld(boxes: readonly Rect[], barriers: Barrier[] = [], carves: Carve[] = []): NavWorld {
  // (a bucket index: a scene's routing asks this millions of times, and a scan of every box was most of its time)
  const B = 0.5, key = (i: number, j: number) => i * 8191 + j, buckets = new Map<number, Rect[]>();
  for (const b of boxes) for (let i = Math.floor(b.x0 / B); i <= Math.floor(b.x1 / B); i++) for (let j = Math.floor(b.z0 / B); j <= Math.floor(b.z1 / B); j++) { const k = key(i, j), a = buckets.get(k); if (a) a.push(b); else buckets.set(k, [b]); }
  return { solid: (x, z) => { const a = buckets.get(key(Math.floor(x / B), Math.floor(z / B))); if (!a) return false; for (const b of a) if (inRect(b, x, z)) return true; return false; }, barriers, carves };
}
