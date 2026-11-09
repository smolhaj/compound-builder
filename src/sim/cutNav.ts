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

interface K { id: string; x: number; z: number; tx: number; tz: number; speed: number; wound: number; dead: boolean; frozen: boolean; carriedBy?: string; y: number; ty: number; queue: Array<{ x: number; z: number; kind: 'move' | 'cover' | 'hide'; walk?: boolean; how?: string; ty?: number } | { flee: BattleEvent }> ; fleeing: boolean; moved: boolean; heldFor?: object; settleAt?: number; lastKind?: string; /** The foot of the ladder he is up (he goes back down it before going anywhere else). */ foot?: Pt; /** Where he is finally going (the end of the chain of legs). */ dest?: Pt }

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

/** A path from a to b through the open ground at time t, as waypoints (b last), or null. */
export function findPath(w: NavWorld, a: Pt, b: Pt, t: number, speed = RUN): Pt[] | null {
  const r = findPathCore(w, a, b, t, speed);
  if (r) return r;
  // a start or a goal pressed into a corner: step to a nearby open spot (a clear line away) and search from there
  for (const d of [0.08, 0.15, 0.25, 0.4]) for (let k = 0; k < 8; k++) {
    const dx = Math.cos(k * 0.785) * d, dz = Math.sin(k * 0.785) * d;
    const a2 = { x: a.x + dx, z: a.z + dz };
    if (!blockedAt(w, a2.x, a2.z, t) && lineClear(w, a, a2, t, speed)) { const r2 = findPathCore(w, a2, b, t, speed); if (r2) return [a2, ...r2]; }
    const b2 = { x: b.x + dx, z: b.z + dz };
    if (!blockedAt(w, b2.x, b2.z, t) && lineClear(w, b2, b, t, speed)) { const r2 = findPathCore(w, a, b2, t, speed); if (r2) return [...r2, b]; }
  }
  return null;
}

function findPathCore(w: NavWorld, a: Pt, b: Pt, t: number, speed: number): Pt[] | null {
  if (lineClear(w, a, b, t, speed)) return [b];
  for (const pad of [3, 8, 24]) {
    const x0 = Math.min(a.x, b.x) - pad, x1 = Math.max(a.x, b.x) + pad, z0 = Math.min(a.z, b.z) - pad, z1 = Math.max(a.z, b.z) + pad;
    const cell = Math.max(0.05, Math.max(x1 - x0, z1 - z0) / 300);
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const cx = (i: number) => x0 + (i + 0.5) * cell, cz = (j: number) => z0 + (j + 0.5) * cell;
    const idx = (i: number, j: number) => j * nx + i;
    const gi = (v: number) => Math.min(nx - 1, Math.max(0, Math.floor((v - x0) / cell)));
    const gj = (v: number) => Math.min(nz - 1, Math.max(0, Math.floor((v - z0) / cell)));
    let si = gi(a.x), sj = gj(a.z), ti = gi(b.x), tj = gj(b.z);
    let s = idx(si, sj), goal = idx(ti, tj);
    const g = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), closed = new Uint8Array(nx * nz);
    const heap: Array<[number, number]> = [];   // [f, node]
    const push = (f: number, n: number) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = (): [number, number] => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const memo = new Map<number, boolean>();
    const free = (i: number, j: number, te: number) => {
      // (the start and goal cells are always allowed: the caller has already put both on open ground)
      const n = idx(i, j);
      if (n === s || n === goal) return true;
      // static solidity is cached; barriers and carves are timed
      let st = memo.get(n);
      if (st === undefined) { st = w.solid(cx(i), cz(j)); memo.set(n, st); }
      for (const bar of w.barriers) if (te < bar.openAt + SLACK && te >= (bar.from ?? -1) && inRect(bar, cx(i), cz(j))) return false;
      if (!st) return true;
      for (const c of w.carves) if (te >= c.from + SLACK && inRect(c, cx(i), cz(j))) return true;
      return false;
    };
    // (a start or goal tight against a corner can sit in a grid cell whose neighbours are all solid: snap it to the nearest open cell with a clear straight line)
    const snapped: { a: Pt | null; b: Pt | null } = { a: null, b: null };
    const snap = (p: Pt, i0: number, j0: number): { i: number; j: number; p: Pt } | null => {
      const open = (i: number, j: number) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return false; const st2 = w.solid(cx(i), cz(j)); return !st2 || w.carves.some(c => t >= c.from + SLACK && inRect(c, cx(i), cz(j))); };
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
    g.fill(Infinity); heap.length = 0; g[s] = 0; push(Math.hypot(cx(ti) - cx(si), cz(tj) - cz(sj)), s);
    let found = false;
    while (heap.length) {
      const [, n] = pop();
      if (closed[n]) continue;
      closed[n] = 1;
      if (n === goal) { found = true; break; }
      const ci = n % nx, cj = (n - ci) / nx, te = t + g[n] * cell / speed;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
        const m = idx(ni, nj);
        if (closed[m] || !free(ni, nj, te)) continue;
        // no cutting a corner
        if (di && dj && (!free(ci + di, cj, te) || !free(ci, cj + dj, te))) continue;
        const step = di && dj ? 1.4142 : 1, ng = g[n] + step;
        if (ng < g[m]) { g[m] = ng; from[m] = n; push(ng + Math.hypot(cx(ti) - cx(ni), cz(tj) - cz(nj)), m); }
      }
    }
    if (!found) continue;
    const raw: Pt[] = [];
    for (let n = goal; n >= 0; n = from[n]) raw.push({ x: cx(n % nx), z: cz(Math.floor(n / nx)) });
    raw.reverse();
    raw[0] = snapped.a ?? a; raw[raw.length - 1] = snapped.b ?? b;
    if (snapped.a) raw.unshift(a);
    if (snapped.b) raw.push(b);
    // string-pull: from each anchor, the farthest point with a clear line
    const out: Pt[] = [];
    let anchor = a, tt = t, k = 0;
    while (k < raw.length - 1) {
      let far = k + 1;
      for (let m = raw.length - 1; m > k + 1; m--) if (lineClear(w, anchor, raw[m], tt, speed)) { far = m; break; }
      out.push(raw[far]);
      tt += Math.hypot(raw[far].x - anchor.x, raw[far].z - anchor.z) / speed;
      anchor = raw[far]; k = far;
    }
    // (a pulled leg must itself be clear; a coarse grid can pinch a doorway, so one leg that is not is refused and the next pad tried)
    let ok = true, p = a, tl = t;
    for (const q of out) { if (!lineClear(w, p, q, tl, speed)) { ok = false; break; } tl += Math.hypot(q.x - p.x, q.z - p.z) / speed; p = q; }
    if (ok) return out;
  }
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

/** A tiny world for tests and tools: solid boxes, with the openings simply left out. */
export function boxWorld(boxes: readonly Rect[], barriers: Barrier[] = [], carves: Carve[] = []): NavWorld {
  return { solid: (x, z) => boxes.some(b => inRect(b, x, z)), barriers, carves };
}
