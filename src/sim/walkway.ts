/**
 * Wall-top patrol walkway (docs/DECISIONS.md, "Fortress ring"): a steel deck
 * with a handrail along the top of a container, steel or concrete wall, the
 * way the user's picture shows it. It is added in place to a finished wall (a
 * run of kind `wall_walk` that rides on its host through upgrades), built by
 * the family like any other run (hours, materials, permit-free, shown in
 * Projects with its ETA).
 *
 * What it does:
 *  - guards on watch walk the top (daily.watchNow posts them there, the
 *    people renderer puts them on the deck), see over the line (a longer view
 *    in `towerPosture`) and fight from a parapet post like a low tower post
 *    (`wallPosts`, read by battle.ts);
 *  - a crew has to get over a wall with armed people looking down from it:
 *    fewer breaches (`WALK_CLIMB_FACTOR`, battle.ts).
 * Stairs (access points) stand at both sides of every gate and about every
 * `STAIR_EVERY` along the wall; the deck stops at a gatehouse garage, whose
 * roof is a post of its own (sim/garage.ts). Pure (tested).
 */
import { hasAll, shortfall, waitingFor, type MaterialId } from './materials';
import { log } from './economy';
import { PERIMETER, planRun, runBill, runFinished, wallLength, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import type { GameState } from './state';

/** The wall tiers a patrol deck can be added to (a deck needs a solid wall under it). */
export const WALKWAY_HOSTS: readonly PerimeterKind[] = ['container_wall', 'container_stack', 'stone_wall', 'steel_wall', 'electric_steel', 'concrete_wall'];
export const canHostWalkway = (kind: PerimeterKind): boolean => WALKWAY_HOSTS.includes(kind);

/** Deck width (≈ 1.2 m) and rail height (≈ 1.1 m), world units. */
export const DECK_W = 1.2 / 6, RAIL_H = 1.1 / 6;
/** Stairs up every this far along the wall (≈ 84 m), and at both sides of a gate. */
export const STAIR_EVERY = 14;
/** A guard post on the deck every this far (≈ 48 m): how many people can fight from it. */
export const POST_EVERY = 8, MAX_POSTS = 12;
/** What a post on the deck gives (cover is the share of hits that land, lower is better; a plain post behind the wall is 0.22): a solid kick plate and parapet and a long eye line. */
export const WALK_POST = { cover: 0.2, value: 3.2, acc: 1.08, reach: 1.08 };
/** A crew going over a wall with a guard post on top of it gets over this much less often (battle.ts). */
export const WALK_CLIMB_FACTOR = 0.6;

/** The finished walkways: the deck is done and so is the wall under it. */
export function walkRuns(s: GameState): Array<{ walk: PerimeterRun; host: PerimeterRun }> {
  const out: Array<{ walk: PerimeterRun; host: PerimeterRun }> = [];
  for (const walk of s.perimeter) {
    if (!PERIMETER[walk.kind].wallTop || !runFinished(walk)) continue;
    const host = s.perimeter.find(x => x.id === walk.hostId);
    if (host && runFinished(host)) out.push({ walk, host });
  }
  return out;
}

/** The walkway (finished or not) on a wall, if any. */
export const walkOn = (s: GameState, hostId: string): PerimeterRun | undefined => s.perimeter.find(x => PERIMETER[x.kind].wallTop && x.hostId === hostId);

/** Does the place have a finished patrol walkway? */
export const hasWalkway = (s: GameState): boolean => walkRuns(s).length > 0;

/** Height of the deck above the ground (world units): the wall's top. */
export const deckHeight = (host: Pick<PerimeterRun, 'kind'>): number => PERIMETER[host.kind].height;

/** Total finished walkway, world units (≈ 6 m). */
export const walkLength = (s: GameState): number => walkRuns(s).reduce((a, { walk }) => a + wallLength(walk), 0);

/** Why a wall can't take a walkway now (null = it can). */
export function walkwayProblem(s: GameState, hostId: string): string | null {
  const host = s.perimeter.find(x => x.id === hostId);
  if (!host) return 'no such wall';
  if (!canHostWalkway(host.kind)) return 'a deck needs a solid wall under it: container, steel or concrete';
  if (!runFinished(host)) return 'the wall is not finished yet';
  if (host.replaces) return 'this wall is itself an upgrade in progress';
  if (walkOn(s, hostId)) return runFinished(walkOn(s, hostId)!) ? 'it already has a walkway' : 'a walkway is already being built';
  if (s.perimeter.some(x => x.replaces === hostId && !runFinished(x))) return 'the wall is being upgraded: add the walkway after';
  return null;
}

/** Lay out a walkway on a finished wall: the same line, the deck broken where a gatehouse garage stands. */
export function addWalkway(s: GameState, hostId: string, quiet = false): string | null {
  const why = walkwayProblem(s, hostId);
  if (why) return why;
  const host = s.perimeter.find(x => x.id === hostId)!;
  return layWalkway(s, host, quiet) ? null : 'could not lay it out';
}

/** The deck run for a wall (also used by the ring planner for a wall that is only laid out so far). */
export function layWalkway(s: GameState, host: PerimeterRun, quiet = false): PerimeterRun {
  const run = planRun(s, 'wall_walk', host.pts.map(p => [p[0], p[1]] as Pt), host.gates.filter(g => g.garage).map(g => ({ ...g })), 0, true);
  run.hostId = host.id;
  if (!quiet) log(s, `Laying a patrol walkway along the top of the ${PERIMETER[host.kind].name.toLowerCase()} (${Math.round(wallLength(host) * 6)} m).`);
  return run;
}

/** The deck's materials for a length (so the Defense tab can price it before it is laid). */
export const walkwayBill = (len: number) => runBill('wall_walk', len);

/** Is the walkway's bill in the stockpile right now (a quick readiness hint)? */
export function walkwayAffordable(s: GameState, len: number): string | null {
  const bill = walkwayBill(len);
  return hasAll(s.stock, bill) ? null : waitingFor(shortfall(s.stock, bill) as Partial<Record<MaterialId, number>>);
}

// ── stairs and posts ──

/** A point along a run's polyline (distance s) with the direction there. */
function pointAt(pts: readonly Pt[], s: number): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: l ? (bx - ax) / l : 1, dz: l ? (bz - az) / l : 0 };
    }
    left -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

export interface Access { at: number; x: number; z: number; dx: number; dz: number }

/**
 * Where the stairs go up: either side of each gate (a short way off it, so
 * the steps do not block the gateway) and about every `STAIR_EVERY` between;
 * always at least two on a run long enough to need them.
 */
export function walkwayAccess(run: Pick<PerimeterRun, 'pts' | 'gates'>): Access[] {
  const L = wallLength({ pts: run.pts, gates: [] });
  if (L < 1) return [];
  const spots: number[] = [];
  const clear = (s: number) => run.gates.every(g => Math.abs(s - g.at) > g.w / 2 + 0.12) && spots.every(o => Math.abs(o - s) > 2.5);
  for (const g of run.gates) for (const side of [-1, 1]) {
    const s = g.at + side * (g.w / 2 + (g.garage ? 0.35 : 0.5));
    if (s > 0.4 && s < L - 0.4 && clear(s)) spots.push(s);
  }
  const n = Math.max(0, Math.floor(L / STAIR_EVERY));
  for (let i = 0; i < n; i++) { const s = (i + 0.5) * L / n; if (clear(s)) spots.push(s); }
  if (spots.length < 2 && L >= 4) for (const s of [L * 0.25, L * 0.75]) if (clear(s)) spots.push(s);
  return spots.sort((a, b) => a - b).map(at => ({ at, ...pointAt(run.pts, at) }));
}

export interface WallPost { runId: string; at: number; x: number; z: number; y: number }

/** Guard posts on the finished decks, spaced along them (at most `MAX_POSTS`). */
export function wallPosts(s: GameState): WallPost[] {
  const out: WallPost[] = [];
  for (const { walk, host } of walkRuns(s)) {
    const L = wallLength(walk);
    const n = Math.max(1, Math.round(L / POST_EVERY));
    for (let i = 0; i < n && out.length < MAX_POSTS; i++) {
      const at = (i + 0.5) * L / n, p = pointAt(walk.pts, at);
      out.push({ runId: walk.id, at, x: p.x, z: p.z, y: deckHeight(host) + 0.02 });
    }
  }
  return out;
}

/** Anyone on the night or day watch right now (the same filter as daily.watchNow). */
const watchers = (s: GameState): number => s.personState.filter(ps => ps.task === 'watch' && ps.needs.died == null).length;

/**
 * What the decks add to the watch: warning points and how far out the view
 * runs (world units). A deck with nobody on it is only a place to stand: it
 * adds 40 % of that; with a guard posted it adds all of it.
 */
export function walkwayWatch(s: GameState): { view: number; viewR: number; posts: number; manned: boolean } {
  const len = walkLength(s);
  if (len <= 0) return { view: 0, viewR: 0, posts: 0, manned: false };
  const manned = watchers(s) > 0;
  const k = manned ? 1 : 0.4;
  return { view: Math.min(7, 3 + len / 25) * k, viewR: Math.min(3, 1.2 + len / 80) * k, posts: wallPosts(s).length, manned };
}

/**
 * The deck spots nearest a point (where a raid meets the wall), at least `gap` apart, nearest first, none farther than `maxD`:
 * the battle stands its guards on the real deck there (x, z, and the deck's height).
 */
export function deckSpots(s: GameState, target: Pt, n: number, maxD = 8, gap = 3): Array<{ x: number; z: number; y: number }> {
  const all: Array<{ x: number; z: number; y: number; d: number }> = [];
  for (const { walk, host } of walkRuns(s)) {
    const L = wallLength({ pts: walk.pts, gates: [] });
    for (let at = 0; at <= L; at += 1.5) {
      const p = pointAt(walk.pts, at);
      if (walk.gates.some(g => Math.abs(at - g.at) < g.w / 2)) continue;
      all.push({ x: p.x, z: p.z, y: deckHeight(host) + 0.02, d: Math.hypot(p.x - target[0], p.z - target[1]) });
    }
  }
  all.sort((a, b) => a.d - b.d);
  const out: Array<{ x: number; z: number; y: number }> = [];
  for (const c of all) {
    if (c.d > maxD || out.length >= n) break;
    if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= gap)) out.push({ x: c.x, z: c.z, y: c.y });
  }
  return out;
}
