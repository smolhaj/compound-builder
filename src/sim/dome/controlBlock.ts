/**
 * The arcology's control block (owner request 2026-11-21; since 2026-11-27 the placement rule reads its keepouts (below), and it is a plant unit `control` in plantUnits.ts; nothing of it is saved): ONE armored building inside the dome that runs every dome
 * system, set on the level pad against the inner arc between the plant yard's service airlock and the main entrance module (the vehicle sally port and the person airlock).
 * It has five labeled wings (Power, Water, Climate, Doors and airlocks, Security) round a glass-walled Operations Room. The utility wings face the plant yard, so the pipes and
 * conduit that come in through the yard's sealed passage run the short way to them; the Doors and Security wings face the entrance.
 *
 * This file is only the PLAN (pure, deterministic, tested in controlBlock.test.ts): where the block stands, how it turns, where its door is, the footpaths that join it to the
 * yard airlock and to the dome's ring path, the pipe runs, and the nav colliders. `buildkit/domeControl.ts` draws it, `fx/domeInteriorPlan.ts` keeps the floor dressing off it.
 * The plan is always made in the dome's own frame (turn 0, the port angle in that frame) and `turnPlan` carries it to the world frame, so the drawn block, the colliders and the
 * dressing agree whatever the dome's quarter turns. SCALE v2: 1 unit = 20 ft, a person 0.28, a door 0.37.
 */
import type { DomeTier } from './tiers';
import { VESTIBULE } from './standing';
import { entryR, personLateral, portFrame, insideLane } from './vehiclePort';
import { yardGeometry } from './plantYard';
import { vestibuleOf } from './vestibule';

export type Pt = [number, number];
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** Outside size of the block (width along the arc, depth in from the shell) and the clearances it keeps. */
export const CB = { W_MAX: 5.6, W: 3.7, D: 1.9, /** The back wall stands this far inside the shell's inner wall radius: flush against it, no lawn behind. */ WALL_GAP: 0.06, RING_FRAC: 0.6, RING_CLEAR: 0.5, MARGIN: 0.22 } as const;
/** Height of the walls of the five wings and the Operations Room (world units). */
export const CB_H = { ops: 0.5, wing: 0.6, tall: 0.7 } as const;

export type PipeKind = 'power' | 'water' | 'chill';
export interface PipeRun { kind: PipeKind; /** Waypoints in the plan's frame; the first is at the manifold, the last at the wing's wall. */ pts: Pt[]; /** Height of the pipe's axis above the floor. */ y: number }

export interface ControlBlockPlan {
  /** Centre of the footprint and its turn about +y: the block's local +z faces the dome's centre (its front), local +x is the direction of decreasing angle. */
  cx: number; cz: number; yaw: number;
  /** Footprint (local x across, z in/out). */
  w: number; d: number;
  /** Angle of the centre from the dome's centre (radians from +z toward +x) and its radius. */
  angle: number; rho: number;
  /** +1 when the yard's service airlock is toward local +x (the utility wings stand on that side), else -1. */
  yardSide: 1 | -1;
  /** The front door's landing (where the footpath ends) and the point of the door itself. */
  landing: Pt; door: Pt;
  /** The yard's service airlock: its dome-side door, and the manifold where the buried lines surface beside it. */
  yardDoor: Pt; manifold: Pt;
  /** The main person airlock's inner door (where the household comes in) and the entrance module's centre line. */
  gateDoor: Pt;
  /** Footpaths this block adds: from the yard door to the ring path and from the ring path to the landing (waypoints). */
  paths: Pt[][];
  /** The ring path's radius the paths join. */
  ringR: number;
  pipes: PipeRun[];
  /** Nav colliders (axis-aligned boxes covering the footprint) and the same as obstacles for the floor dressing. */
  colliders: Rect[];
  /** True when the block stands on the shorter arc between the yard airlock and the entrance (the owner's layout); false when the room there did not allow it. */
  between: boolean;
}

const TAU = Math.PI * 2;
const wrap = (a: number): number => { let d = a % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
/**
 * The block is curved: its back wall is an arc concentric with the shell (radius `rho + d/2`), its front wall a concentric arc, its end caps radial. A point of the block's own frame
 * (x across, along the arc of the middle radius, positive toward decreasing angle; z in toward the dome's centre from the middle radius) is at radius `rho - z` and angle `angle - x / rho`.
 */
type Polar = { angle: number; rho: number };
const loc = (p: Polar, lx: number, lz: number): Pt => { const rr = p.rho - lz, th = p.angle - lx / p.rho; return [rr * Math.sin(th), rr * Math.cos(th)]; };
/** A point of the plan's frame in the block's own frame (the inverse of `fromBlock`). */
export const toBlock = (p: Polar, x: number, z: number): Pt => [-wrap(Math.atan2(x, z) - p.angle) * p.rho, p.rho - Math.hypot(x, z)];
/** A point of the block's own frame in the plan's frame. */
export const fromBlock = loc;
/** The direction (radians, a figure's `rot`) that points from a place in the block straight out toward the shell, i.e. at the wall of screens. */
export const outwardAt = (p: Polar, lx: number): number => p.angle - lx / p.rho;

/** A short path segment from a to b is within `rad` of the point (px, pz)? (capsule test) */
const nearSeg = (px: number, pz: number, a: Pt, b: Pt, rad: number): boolean => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t)) < rad;
};

interface Ctx { tier: DomeTier; r: number; port: number; yardDoor: Pt; er: Pt; manifold: Pt; gateDoor: Pt; gateZone: { u: Pt; lam0: number; lam1: number; u0: number; u1: number }; spoke: [Pt, Pt]; lane: Pt[]; ringR: number }

/** The pieces of the dome's floor the block must keep clear of. */
export function contextOf(tier: DomeTier, r: number, port: number): Ctx | null {
  const yg = yardGeometry(tier, r, 0), f = portFrame(tier, 0, 0, r, port);
  if (!yg || !f) return null;
  const lat = personLateral(tier, r), Re = entryR(tier, r), lane = insideLane(f), pv = vestibuleOf(tier, r), padRho = lane ? Math.hypot(lane.pad[0], lane.pad[1]) : Re - 3.5;
  const u: Pt = f.u, lamDir: Pt = [u[1], -u[0]];     // (the person chamber stands to the larger-angle side: +lam along (cos a, -sin a))
  // the service airlock's dome-side door and the manifold beside it, on the side toward the block's arc (set after the side is known; here: the door)
  const yardDoor = yg.portal.from as Pt, er = yg.er as Pt;
  const gateDoor: Pt = [u[0] * (Re - pv.len) + lamDir[0] * lat, u[1] * (Re - pv.len) + lamDir[1] * lat];
  const spokeIn: Pt = [gateDoor[0] * 0.14, gateDoor[1] * 0.14];
  return {
    tier, r, port, yardDoor, er, manifold: [0, 0], gateDoor,
    // the entrance module's whole run: from its outer face in to the end of the lane's pad, a clear margin round the chambers
    gateZone: { u, lam0: -(portFrame(tier, 0, 0, r, port)!.v.w / 2 + 0.6), lam1: lat + VESTIBULE[tier].w / 2 + 0.6, u0: padRho - 0.8, u1: Re + 0.2 },
    spoke: [gateDoor, spokeIn], lane: lane ? lane.pts : [], ringR: r * CB.RING_FRAC,
  };
}

/** Is the point inside any of the keepouts (the entrance module and its lane, the person airlock's spoke, the yard airlock's way in)? */
function blockedBy(c: Ctx, x: number, z: number, extra: readonly Rect[]): boolean {
  const g = c.gateZone, u = x * g.u[0] + z * g.u[1], lam = x * g.u[1] * 1 - z * g.u[0];
  // lam along (u[1], -u[0]) is x*u[1] - z*u[0]
  if (u > g.u0 && u < g.u1 && lam > g.lam0 && lam < g.lam1) return true;
  if (nearSeg(x, z, c.spoke[0], c.spoke[1], 0.75)) return true;
  const yd = c.yardDoor, spurEnd: Pt = [yd[0] - c.er[0] * 1.3, yd[1] - c.er[1] * 1.3];
  if (Math.hypot(x - yd[0], z - yd[1]) < 1.0 || nearSeg(x, z, yd, spurEnd, 0.55)) return true;
  for (const e of extra) if (x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1) return true;
  return false;
}

/** Is a curved block of this size at this angle clear (its back flush against the inner wall)? Sampled on a grid, inflated by the margin. */
export function fits(c: Ctx, w: number, d: number, angle: number, extra: readonly Rect[]): boolean {
  const p = { angle, rho: c.r - CB.WALL_GAP - d / 2 }, m = CB.MARGIN, nx = Math.ceil((w + 2 * m) / 0.14), nz = Math.ceil((d + 2 * m) / 0.14);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -(w / 2 + m) + (w + 2 * m) * i / nx, lz = -(d / 2 + m) + (d + 2 * m) * j / nz, [x, z] = loc(p, lx, lz), rho = Math.hypot(x, z);
    const inner = Math.abs(lx) <= w / 2 + 1e-6 && Math.abs(lz) <= d / 2 + 1e-6;
    if (rho < c.ringR + CB.RING_CLEAR - (inner ? 0 : m)) return false;
    if (blockedBy(c, x, z, extra)) return false;
  }
  return true;
}

/**
 * The control block for a dome (arcology only; null for every other tier). `port` is the vehicle port's angle in the frame asked for (turn 0 for the dome builder), `extra` are boxes in
 * that frame the block must also avoid (ground machinery, buildings the family has put inside).
 */
export function controlBlockPlan(tier: DomeTier, r: number, port: number, extra: readonly Rect[] = []): ControlBlockPlan | null {
  if (tier !== 'arcology') return null;
  const c = contextOf(tier, r, port);
  if (!c) return null;
  const yd = c.yardDoor, S = Math.atan2(yd[0], yd[1]);
  // the target is the middle of the shorter arc between the yard door and the entrance module's centre
  const G = port + Math.atan2(personLateral(tier, r) / 2, entryR(tier, r)), T = S + wrap(G - S) / 2;
  // the widest block that fits in the gap goes there (the gap between the two entrances along the inner arc, as close to both as the clearances allow); the compact sizes follow, and
  // only when none fits on that arc does the search look at the far side (`between` false)
  const sizes: Array<[number, number]> = [[CB.W_MAX, CB.D], [4.8, CB.D], [CB.W, CB.D], [CB.W - 0.5, CB.D - 0.1]];
  const span = Math.abs(wrap(G - S)), inArc = (a: number): boolean => Math.abs(wrap(a - S)) + Math.abs(wrap(G - a)) <= span + 1e-6;
  let best: { a: number; w: number; d: number; cost: number; between: boolean } | null = null;
  for (const onlyBetween of [true, false]) {
    for (const [w, d] of sizes) {
      for (let k = 0; k < 720; k++) {
        const a = k * TAU / 720, between = inArc(a);
        if (onlyBetween && !between) continue;
        if (!fits(c, w, d, a, extra)) continue;
        const cost = Math.abs(wrap(a - T));
        if (!best || cost < best.cost - 1e-9) best = { a, w, d, cost, between };
      }
      if (best) break;
    }
    if (best) break;
  }
  if (!best) return null;
  const { a, w, d } = best, rc = c.r - CB.WALL_GAP - d / 2;
  const base = { angle: a, rho: rc }, cxz = loc(base, 0, 0);
  const yardSide: 1 | -1 = wrap(S - a) < 0 ? 1 : -1;       // (local +x is toward decreasing angle)
  const door = loc(base, 0, d / 2), landing = loc(base, 0, d / 2 + 0.2);
  // the manifold where the buried lines surface: beside the yard door, on the side toward the block, close to the shell
  const sideTo: Pt = [Math.cos(yd[0] === 0 && yd[1] === 0 ? 0 : S) * (wrap(a - S) > 0 ? 1 : -1), -Math.sin(S) * (wrap(a - S) > 0 ? 1 : -1)];
  const manifold: Pt = [yd[0] + sideTo[0] * 0.62 + c.er[0] * 0.12, yd[1] + sideTo[1] * 0.62 + c.er[1] * 0.12];
  // footpaths: from the yard door straight in (along -er) to the ring path, and from the ring path to the landing
  const ringR = c.ringR;
  const ringPt: Pt = [Math.sin(a) * ringR, Math.cos(a) * ringR];
  // the service strip: from the yard airlock and from the entrance module's inner door to the block's landing, round the block's front corners (outside the pipe lanes), plus a stub to the ring path
  const inward = (q: Pt, k: number): Pt => [q[0] * (1 - k / Math.hypot(q[0], q[1])), q[1] * (1 - k / Math.hypot(q[0], q[1]))];
  const Fy = loc(base, yardSide * (w / 2 + 0.75), d / 2 + 0.4), Fg = loc(base, -yardSide * (w / 2 + 0.55), d / 2 + 0.4);
  const paths: Pt[][] = [[yd, inward(yd, 0.9), Fy, landing], [c.gateDoor, inward(c.gateDoor, 0.9), Fg, landing], [ringPt, landing]];
  // pipes: three runs from the manifold along the inner wall to the yard-side end cap of the block (the utility wings), each at its own height and offset so none crosses another
  const s = yardSide, wx = s * (w / 2 + 0.03), pipes: PipeRun[] = [];
  const run = (kind: PipeKind, y: number, pts: Pt[]): void => { pipes.push({ kind, y, pts: [manifold, ...pts.map(q => loc(base, q[0], q[1]))] }); };
  run('power', 0.06, [[wx + s * 0.35, -0.6], [wx, -0.6]]);
  run('chill', 0.16, [[wx + s * 0.6, -0.12], [wx, -0.12]]);
  run('water', 0.1, [[wx + s * 0.85, 0.42], [wx, 0.42]]);
  const plan: ControlBlockPlan = { cx: cxz[0], cz: cxz[1], yaw: a + Math.PI, w, d, angle: a, rho: rc, yardSide, landing, door, yardDoor: yd, manifold, gateDoor: c.gateDoor, paths, ringR, pipes, colliders: [], between: best.between };
  plan.colliders = collidersOf(plan);
  return plan;
}

/** Axis-aligned boxes that together cover the curved footprint (the nav boxes are axis-aligned): one strip every ~0.3 along the arc, each the bounds of its own sector piece (corners and mid-edges). */
export function collidersOf(p: Pick<ControlBlockPlan, 'angle' | 'rho' | 'w' | 'd'>): Rect[] {
  const n = Math.max(1, Math.ceil(p.w / 0.3)), out: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const l0 = -p.w / 2 + p.w * i / n, l1 = -p.w / 2 + p.w * (i + 1) / n;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const lx of [l0, (l0 + l1) / 2, l1]) for (const lz of [-p.d / 2, p.d / 2]) { const [x, z] = loc(p, lx, lz); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    out.push({ x0: x0 - 0.02, z0: z0 - 0.02, x1: x1 + 0.02, z1: z1 + 0.02 });
  }
  return out;
}

/** The plan carried to another frame: the same dome turned `phi` radians about its centre (quarter turns of the structure). */
export function turnPlan(p: ControlBlockPlan, phi: number): ControlBlockPlan {
  if (!phi) return p;
  const c = Math.cos(phi), s = Math.sin(phi), R = (q: Pt): Pt => [q[0] * c + q[1] * s, -q[0] * s + q[1] * c];
  const [cx, cz] = R([p.cx, p.cz]);
  const out: ControlBlockPlan = {
    ...p, cx, cz, yaw: p.yaw + phi, angle: p.angle + phi, landing: R(p.landing), door: R(p.door), yardDoor: R(p.yardDoor), manifold: R(p.manifold), gateDoor: R(p.gateDoor),
    paths: p.paths.map(l => l.map(R)), pipes: p.pipes.map(q => ({ ...q, pts: q.pts.map(R) })), colliders: [],
  };
  out.colliders = collidersOf(out);
  return out;
}

/** The block as the floor dressing sees it: boxes (center and half sizes), the footprint's own strips. */
export const obstaclesOf = (p: ControlBlockPlan): Array<{ x: number; z: number; hx: number; hz: number }> => p.colliders.map(c => ({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, hx: (c.x1 - c.x0) / 2, hz: (c.z1 - c.z0) / 2 }));

/** Is a point inside the footprint (grown by `pad`)? */
export function inBlock(p: Pick<ControlBlockPlan, 'angle' | 'rho' | 'w' | 'd'>, x: number, z: number, pad = 0): boolean {
  const [lx, lz] = toBlock(p, x, z);
  return Math.abs(lx) <= p.w / 2 + pad && Math.abs(lz) <= p.d / 2 + pad;
}

// ── protection: what the player may not build over (owner request 2026-11-27) ──────────────────────────────────────────────────────────

/** Why a piece cannot stand where it would cover the control block: on the block itself (its footprint or its nav colliders), or on the footpaths that join it to the yard airlock and to the entrance's inner door. */
export type ControlProblem = 'control_block' | 'control_path';
export const CONTROL_PROBLEM_TEXT: Record<ControlProblem, string> = {
  control_block: 'That is the arcology\'s control block: it runs the doors, power, water, climate and security, and nothing can be built on it or against it',
  control_path: 'That is the control block\'s service path, the way between the yard airlock, the entrance and the block: keep it clear',
};
/** Clear ground kept round the block's colliders, and half the width of a service path kept clear (a footpath is 0.7 wide; a person 0.28 and a hand cart need room beside it). */
export const CONTROL_PAD = 0.08, CONTROL_PATH_HALF = 0.42;

/** The block's keepouts in a world frame: the collision boxes and the two service paths (yard door to landing, entrance inner door to landing). */
export interface ControlKeepout { boxes: Rect[]; paths: Pt[][]; half: number; between: boolean }

/**
 * The keepouts of the control block of an arcology of shell radius `r` centered at (x, z), turned `rot` quarter turns, with its vehicle port at the world angle `port`
 * (the plan is made in the dome's own frame and carried to the world exactly as the builder and the world do). Null for any other tier. Cached: it is asked on every cursor move.
 */
const PLAN_CACHE = new Map<string, ControlBlockPlan | null>();
export function controlKeepout(tier: DomeTier, r: number, x: number, z: number, rot: number, port: number): ControlKeepout | null {
  if (tier !== 'arcology') return null;
  // (the plan is the slow part and depends only on the dome's own frame: it is cached without the dome's place, so a dome dragged across the map costs nothing)
  const key = `${r.toFixed(3)}|${rot}|${port.toFixed(4)}`, phi = rot * Math.PI / 2;
  let plan = PLAN_CACHE.get(key);
  if (plan === undefined) { const p0 = controlBlockPlan(tier, r, port - phi); plan = p0 ? turnPlan(p0, phi) : null; if (PLAN_CACHE.size > 64) PLAN_CACHE.clear(); PLAN_CACHE.set(key, plan); }
  if (!plan) return null;
  return {
    boxes: plan.colliders.map(c => ({ x0: c.x0 + x - CONTROL_PAD, z0: c.z0 + z - CONTROL_PAD, x1: c.x1 + x + CONTROL_PAD, z1: c.z1 + z + CONTROL_PAD })),
    paths: plan.paths.slice(0, 2).map(l => l.map(q => [q[0] + x, q[1] + z] as Pt)),
    half: CONTROL_PATH_HALF, between: plan.between,
  };
}

/** Distance from a point to a rectangle (0 inside). */
const distToRect = (px: number, pz: number, r: Rect): number => Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.z0 - pz, 0, pz - r.z1));

/** Does a rectangle (a building's footprint) cover the block or its service paths? The block is checked first. */
export function rectControlProblem(k: ControlKeepout, r: Rect): ControlProblem | null {
  for (const b of k.boxes) if (r.x0 < b.x1 && r.x1 > b.x0 && r.z0 < b.z1 && r.z1 > b.z0) return 'control_block';
  for (const path of k.paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.08));
    for (let j = 0; j <= n; j++) if (distToRect(a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n, r) < k.half) return 'control_path';
  }
  return null;
}
