/**
 * The arcology's control block (owner request 2026-11-21, VISUAL + LAYOUT only: no rules read it and nothing is saved): ONE armored building inside the dome that runs every dome
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
export const CB = { W_MAX: 5.4, W: 3.7, D: 1.9, SHELL_CLEAR: 0.8, RING_FRAC: 0.6, RING_CLEAR: 0.5, MARGIN: 0.22 } as const;
/** Height of the walls of the five wings and the Operations Room (world units). */
export const CB_H = { ops: 0.52, wing: 0.6, tall: 0.78 } as const;

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
const loc = (p: ControlBlockPlan | { cx: number; cz: number; yaw: number }, lx: number, lz: number): Pt => [p.cx + lx * Math.cos(p.yaw) + lz * Math.sin(p.yaw), p.cz - lx * Math.sin(p.yaw) + lz * Math.cos(p.yaw)];
/** A point of the plan's frame in the block's own frame (the inverse of `controlLocal`). */
export const toBlock = (p: { cx: number; cz: number; yaw: number }, x: number, z: number): Pt => { const dx = x - p.cx, dz = z - p.cz; return [dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw), dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)]; };
/** A point of the block's own frame in the plan's frame. */
export const fromBlock = loc;

/** A short path segment from a to b is within `rad` of the point (px, pz)? (capsule test) */
const nearSeg = (px: number, pz: number, a: Pt, b: Pt, rad: number): boolean => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t)) < rad;
};

interface Ctx { tier: DomeTier; r: number; port: number; yardDoor: Pt; er: Pt; manifold: Pt; gateDoor: Pt; gateZone: { u: Pt; lam0: number; lam1: number; u0: number; u1: number }; spoke: [Pt, Pt]; lane: Pt[]; ringR: number }

/** The pieces of the dome's floor the block must keep clear of. */
function contextOf(tier: DomeTier, r: number, port: number): Ctx | null {
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
  const yd = c.yardDoor, spurEnd: Pt = [yd[0] - c.er[0] * 3.4, yd[1] - c.er[1] * 3.4];
  if (Math.hypot(x - yd[0], z - yd[1]) < 1.15 || nearSeg(x, z, yd, spurEnd, 0.7)) return true;
  for (const e of extra) if (x > e.x0 && x < e.x1 && z > e.z0 && z < e.z1) return true;
  return false;
}

/** Is a block of the given size at (angle, front radius) clear? Sampled on a grid, inflated by the margin. */
function fits(c: Ctx, w: number, d: number, angle: number, rhoF: number, extra: readonly Rect[]): boolean {
  const rc = rhoF + d / 2, p = { cx: Math.sin(angle) * rc, cz: Math.cos(angle) * rc, yaw: angle + Math.PI };
  for (const lx of [-w / 2, w / 2]) for (const lz of [-d / 2, d / 2]) { const [x, z] = loc(p, lx, lz); if (Math.hypot(x, z) > c.r - CB.SHELL_CLEAR) return false; }
  const m = CB.MARGIN, nx = Math.ceil((w + 2 * m) / 0.14), nz = Math.ceil((d + 2 * m) / 0.14);
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = -(w / 2 + m) + (w + 2 * m) * i / nx, lz = -(d / 2 + m) + (d + 2 * m) * j / nz, [x, z] = loc(p, lx, lz), rho = Math.hypot(x, z);
    const inner = Math.abs(lx) <= w / 2 + 1e-6 && Math.abs(lz) <= d / 2 + 1e-6;
    if (inner && rho > c.r - CB.SHELL_CLEAR) return false;
    if (rho > c.r - 0.4) return false;
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
  const sizes: Array<[number, number]> = [[CB.W_MAX, CB.D], [4.6, CB.D], [CB.W, CB.D], [CB.W - 0.4, CB.D - 0.1]];
  const span = Math.abs(wrap(G - S)), inArc = (a: number): boolean => Math.abs(wrap(a - S)) + Math.abs(wrap(G - a)) <= span + 1e-6;
  let best: { a: number; rf: number; w: number; d: number; cost: number; between: boolean } | null = null;
  const rfs = [c.ringR + CB.RING_CLEAR + CB.MARGIN, c.ringR + CB.RING_CLEAR + CB.MARGIN + 0.15, c.ringR + CB.RING_CLEAR + CB.MARGIN + 0.3];
  for (const onlyBetween of [true, false]) {
    for (const [w, d] of sizes) {
      for (let k = 0; k < 720; k++) {
        const a = k * TAU / 720, between = inArc(a);
        if (onlyBetween && !between) continue;
        for (const rf of rfs) {
          if (!fits(c, w, d, a, rf, extra)) continue;
          const cost = Math.abs(wrap(a - T)) + (rf - rfs[0]) * 0.05;
          if (!best || cost < best.cost - 1e-9) best = { a, rf, w, d, cost, between };
          break;      // (the nearest front radius that fits)
        }
      }
      if (best) break;
    }
    if (best) break;
  }
  if (!best) return null;
  const { a, rf, w, d } = best, rc = rf + d / 2;
  const base = { cx: Math.sin(a) * rc, cz: Math.cos(a) * rc, yaw: a + Math.PI };
  const yardSide: 1 | -1 = wrap(S - a) < 0 ? 1 : -1;       // (local +x is toward decreasing angle)
  const door = loc(base, 0, d / 2), landing = loc(base, 0, d / 2 + 0.2);
  // the manifold where the buried lines surface: beside the yard door, on the side toward the block, close to the shell
  const sideTo: Pt = [Math.cos(yd[0] === 0 && yd[1] === 0 ? 0 : S) * (wrap(a - S) > 0 ? 1 : -1), -Math.sin(S) * (wrap(a - S) > 0 ? 1 : -1)];
  const manifold: Pt = [yd[0] + sideTo[0] * 0.62 + c.er[0] * 0.12, yd[1] + sideTo[1] * 0.62 + c.er[1] * 0.12];
  // footpaths: from the yard door straight in (along -er) to the ring path, and from the ring path to the landing
  const ringR = c.ringR;
  let t = 0; for (let s = 0; s < 80; s++) { const q = s * 0.05, px = yd[0] - c.er[0] * q, pz = yd[1] - c.er[1] * q; if (Math.hypot(px, pz) <= ringR) { t = q; break; } t = q; }
  const join: Pt = [yd[0] - c.er[0] * t, yd[1] - c.er[1] * t];
  const ringPt: Pt = [Math.sin(a) * ringR, Math.cos(a) * ringR];
  const paths: Pt[][] = [[yd, join], [ringPt, landing]];
  // pipes: three runs from the manifold to the utility wings' outer wall on the yard side (and the climate wing's back wall), in the block's frame first
  const s = yardSide, wx = s * (w / 2 + 0.03), pipes: PipeRun[] = [];
  const bz = (k: number): number => -(d / 2) - 0.12 - 0.09 * k;      // (three lanes behind the block's back wall, nearest first)
  const run = (kind: PipeKind, y: number, pts: Pt[]): void => { pipes.push({ kind, y, pts: [manifold, ...pts.map(q => loc(base, q[0], q[1]))] }); };
  run('power', 0.06, [[wx + s * 0.14, bz(0)], [wx + s * 0.14, -0.5], [wx, -0.5]]);
  run('water', 0.1, [[wx + s * 0.26, bz(1)], [wx + s * 0.26, 0.5], [wx, 0.5]]);
  run('chill', 0.16, [[wx + s * 0.38, bz(2)], [s * 0.12, bz(2)], [s * 0.12, -(d / 2) - 0.02]]);
  const plan: ControlBlockPlan = { ...base, w, d, angle: a, rho: rc, yardSide, landing, door, yardDoor: yd, manifold, gateDoor: c.gateDoor, paths, ringR, pipes, colliders: [], between: best.between };
  plan.colliders = collidersOf(plan);
  return plan;
}

/** Axis-aligned boxes that together cover the footprint (the nav boxes are axis-aligned): strips along the block's width, each the bounds of its own turned piece. */
export function collidersOf(p: Pick<ControlBlockPlan, 'cx' | 'cz' | 'yaw' | 'w' | 'd'>): Rect[] {
  const n = Math.max(1, Math.ceil(p.w / 0.3)), out: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const l0 = -p.w / 2 + p.w * i / n, l1 = -p.w / 2 + p.w * (i + 1) / n;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const lx of [l0, l1]) for (const lz of [-p.d / 2, p.d / 2]) { const [x, z] = loc(p, lx, lz); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
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
export function inBlock(p: Pick<ControlBlockPlan, 'cx' | 'cz' | 'yaw' | 'w' | 'd'>, x: number, z: number, pad = 0): boolean {
  const [lx, lz] = toBlock(p, x, z);
  return Math.abs(lx) <= p.w / 2 + pad && Math.abs(lz) <= p.d / 2 + pad;
}
