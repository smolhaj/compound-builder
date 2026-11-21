/**
 * The airlock chamber as a real room (owner request 2026-11-18): two doors and a hollow vestibule between them, set inside the shell. The outer door is
 * in the shell's own plane, the inner door at the chamber's far end, and the walls between are a pair of side walls. People (the sim, the walkers and the
 * raid router) pass through the doors and the chamber, which is a kill zone at the inner door (siege.ts `SALLY_HOLD`). This module holds the one set of
 * numbers the renderer and the nav colliders both read, so what is drawn is what blocks. Local frame: the dome's center at the origin, an airlock at
 * `angle` (radians from +z toward +x), `u` outward along the axis and `v` across it. Pure (tested in vestibule.test.ts).
 */
import type { DomeTier } from './tiers';

export interface Box { x0: number; z0: number; x1: number; z1: number }

/** Where the shell's own plane sits inside the radius the airlocks are laid on (the struts and panels stand a little inside it). */
export const SHELL_INSET = 0.03;

/** How far the surround plate reaches past the side wall on each side (world units): what the shell colliders must also hold shut. */
export const SURROUND_PAD = 0.12;

export interface Vestibule {
  /** Outside width of the chamber (world units; 1 unit = 20 ft). */
  w: number;
  /** How far the chamber runs in from the shell. */
  len: number;
  /** Clear width inside, and the width of each door's opening. */
  cw: number; dw: number;
  /** Wall thickness. */
  t: number;
  /** Ceiling height and door height. */
  h: number; dh: number;
}

/** Outside width and the nominal run of each tier's chamber (as sized for the default dome; a smaller dome shortens it). */
const BASE: Record<DomeTier, { w: number; len: number; t: number; h: number; dh: number; door: number }> = {
  earthen: { w: 0.24, len: 0.2, t: 0.03, h: 0.2, dh: 0.18, door: 0.55 },
  geodesic: { w: 0.42, len: 0.5, t: 0.03, h: 0.42, dh: 0.34, door: 0.74 },
  glass: { w: 0.55, len: 0.7, t: 0.03, h: 0.5, dh: 0.4, door: 0.68 },
  arcology: { w: 1.7, len: 2.0, t: 0.06, h: 1.55, dh: 1.3, door: 0.82 },
};

/** The chamber of a dome of this tier whose airlocks lie on radius `r`: never longer than a third of the radius, so a small dome keeps its floor. */
export function vestibuleOf(tier: DomeTier, r: number): Vestibule {
  const b = BASE[tier];
  const len = Math.max(b.t * 4 + b.w * 0.5, Math.min(b.len, r * 0.34));
  const cw = b.w - 2 * b.t;
  return { w: b.w, len, cw, dw: cw * b.door, t: b.t, h: b.h, dh: b.dh };
}

/** Axis and cross vectors for an angle. */
export const axisOf = (angle: number) => ({ ux: Math.sin(angle), uz: Math.cos(angle), vx: Math.cos(angle), vz: -Math.sin(angle) });

/** A point of the chamber: `rho` out along the axis from the dome's center, `lam` across it. */
export function chamberPoint(angle: number, rho: number, lam: number): [number, number] {
  const a = axisOf(angle);
  return [a.ux * rho + a.vx * lam, a.uz * rho + a.vz * lam];
}

/** Radii of the chamber: the outer door plane (in the shell's own plane) and the inner door plane (the chamber's far end). */
export const chamberRho = (r: number, v: Vestibule): { outer: number; inner: number } => ({ outer: r - SHELL_INSET, inner: r - v.len });

/** A thin wall from (a) to (b) as a chain of axis-aligned boxes (the nav colliders are axis-aligned): each no longer than `step`, fat enough to cover the wall. */
export function wallBoxes(ax: number, az: number, bx: number, bz: number, thick: number, step = 0.04): Box[] {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
  const dx = (bx - ax) / (L || 1), dz = (bz - az) / (L || 1), out: Box[] = [];
  for (let i = 0; i < n; i++) {
    const m = (i + 0.5) / n, cx = ax + (bx - ax) * m, cz = az + (bz - az) * m, seg = L / n;
    const hx = (seg * Math.abs(dx) + thick * Math.abs(dz)) / 2, hz = (seg * Math.abs(dz) + thick * Math.abs(dx)) / 2;
    out.push({ x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz });
  }
  return out;
}

/** The walls of one chamber as nav colliders: two side walls, the inner door's two stubs, and the outer door's two stubs flanking the opening. The doors themselves and the room between them are open. */
export function chamberColliders(r: number, angle: number, v: Vestibule, reach: number | readonly [number, number] = SURROUND_PAD, off = 0): Box[] {
  const { outer, inner } = chamberRho(r, v), half = v.cw / 2 + v.t / 2, out: Box[] = [];
  const P = (rho: number, lam: number) => chamberPoint(angle, rho, lam + off);      // (`off`: the person chamber of the entrance module stands beside the port on a parallel axis)
  for (const s of [-1, 1]) {
    const a = P(inner, s * half), b = P(outer, s * half);
    out.push(...wallBoxes(a[0], a[1], b[0], b[1], v.t));
    // the two stubs of the inner door and of the outer door, from the door's edge to the side wall
    // (the outer ones run on past the side wall under the surround plate to `reach`, as far as the shell ring's skipped boxes did, so no seam is open)
    for (const rho of [inner, outer]) {
      const rc = typeof reach === 'number' ? reach : reach[s === -1 ? 0 : 1], c = P(rho, s * v.dw / 2), d = P(rho, s * (v.cw / 2 + v.t + (rho === outer ? rc : 0)));
      out.push(...wallBoxes(c[0], c[1], d[0], d[1], v.t));
    }
  }
  return out;
}

/** Is a point of the shell ring inside the airlock's gap (so the shell ring leaves no collider there)? `ang` is the ring box's own angle. */
export function ringSkipped(ang: number, r: number, angle: number, v: Vestibule, boxHalfAngle: number): boolean {
  const d = Math.abs(Math.atan2(Math.sin(ang - angle), Math.cos(ang - angle)));
  return d < (v.cw / 2 + v.t) / r + boxHalfAngle;
}

/** Is a point (local frame) inside a chamber's door window, low enough to be in the doorway, so a shell strut or panel there is left out? */
export function inDoorway(x: number, y: number, z: number, y0: number, angle: number, v: Vestibule, r: number): boolean {
  const a = axisOf(angle), rho = x * a.ux + z * a.uz, lam = x * a.vx + z * a.vz;
  return Math.abs(lam) < v.cw / 2 + v.t && rho > r - 0.12 && y - y0 < v.dh + 0.04;
}
