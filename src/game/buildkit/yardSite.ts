/**
 * Where a vehicle yard stands beside the drive (docs/DECISIONS.md, "Yard beside the drive"). Pure geometry (tested, no WebGL).
 *
 * A 12 x 12 m fenced lot belongs beside the road it is reached by, not on a compass heading: its sides run parallel to the drive's heading at the nearest
 * point (so on a diagonal drive the yard is turned to it, a fractional quarter turn: `Structure.rot` is in quarter turns and the world rotates by rot * pi / 2),
 * its gate (local +z) faces the drive, and it is set back `YARD_SITE.gap` of clear ground from the road's edge, which the yard's gravel spur (vehicleYardGen) crosses.
 * Nothing of the fence reaches the roadway: on a bend the lot is pushed out until its whole outline clears the road's edge.
 */
import { arcNear, distToPolyline, headingAt, pointAtArc } from '../perimeter/gateKitLayout';
import type { Pt } from '../../sim/perimeter';

/** Setbacks to try, nearest first: the road's cut bank or fill slope can make the nearest ground too steep to level a yard on. */
export const YARD_GAPS: readonly number[] = [0.3, 0.55, 0.85, 1.2, 1.6];

/** Slides along the drive to try when the ground at the cursor will not take a yard (units), nearest first. */
export const YARD_SLIDES: readonly number[] = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.5, -2.5];

export const YARD_SITE = {
  /** Clear ground between the road's edge and the gate line (the spur crosses it). */
  gap: 0.3,
  /** The nearest the fence may come to the road's edge. */
  edge: 0.18,
  /** The nearest the yard's graded pad (the box round it, `pad` margin included) and its skirt may come to the road's edge: the road is not re-graded under its own bed. */
  skirt: 0.2, pad: 0.05, padClear: 0.25,
  /** A cursor within this many units of the drive snaps the yard beside it. */
  snapR: 4,
};

export interface YardSite {
  x: number; z: number;
  /** Quarter turns (fractional): the world rotation is rot * pi / 2. In [0, 4). */
  rot: number;
  /** Unit vector of the yard's front (its gate side), pointing at the drive. */
  front: Pt;
  /** Which side of the drive the yard is on (+1 left of the heading, -1 right). */
  side: 1 | -1;
  /** The drive's arc and heading at the nearest point. */
  arc: number; heading: Pt;
  /** The middle of the gate. */
  gate: Pt;
}

/**
 * Half size of the square pad graded under a yard at a fractional turn: the box round the turned yard (a pad is an axis-aligned rectangle; anything smaller leaves
 * the corners of the turned lot on the hill, buried). A whole turn is the yard's own half size.
 */
export function yardPadHalf(rot: number, half: number): number {
  const th = rot * Math.PI / 2;
  return half * (Math.abs(Math.cos(th)) + Math.abs(Math.sin(th)));
}

/** The yard's four corners in the world for a center, rot and half size. */
export function yardCorners(x: number, z: number, rot: number, half: number): Pt[] {
  const th = rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as Pt[]).map(([a, b]) => [x + (a * half) * c + (b * half) * s, z - (a * half) * s + (b * half) * c] as Pt);
}

/**
 * A yard (half size `half`) beside `drive` near the point `at`: on the side `at` lies on unless `side` is given, aligned to the drive's heading, its gate facing the road.
 * `driveW` is the drive's full width. Null when there is no drive.
 */
export function yardBesideDrive(drive: readonly Pt[] | undefined, at: Pt, half: number, driveW: number, side?: 1 | -1, gap: number = YARD_SITE.gap, along = 0): YardSite | null {
  if (!drive || drive.length < 2) return null;
  const arc0 = arcNear(drive, at), arc = Math.max(0, arc0 + along), c = pointAtArc(drive, arc), t = headingAt(drive, arc), left: Pt = [t[1], -t[0]];
  const c0 = pointAtArc(drive, arc0), sd: 1 | -1 = side ?? (((at[0] - c0[0]) * left[0] + (at[1] - c0[1]) * left[1]) >= 0 ? 1 : -1);
  const front: Pt = [-left[0] * sd, -left[1] * sd];
  const th = Math.atan2(front[0], front[1]);
  const rot = (((th / (Math.PI / 2)) % 4) + 4) % 4;
  let d = driveW / 2 + gap + half, x = c[0] + left[0] * sd * d, z = c[1] + left[1] * sd * d;
  // on a bend the near side can swing in: push out until the whole outline (corners and edge midpoints) clears the road's edge
  for (let i = 0; i < 8; i++) {
    const cs = yardCorners(x, z, rot, half), pts: Pt[] = [...cs, ...cs.map((p, k) => [(p[0] + cs[(k + 1) % 4][0]) / 2, (p[1] + cs[(k + 1) % 4][1]) / 2] as Pt)];
    const m = Math.min(...pts.map(p => distToPolyline(drive, p)));
    // the pad is the box round the (turned) yard, not the yard: on a diagonal drive its corners reach toward the road
    const hp = yardPadHalf(rot, half) + YARD_SITE.pad, bx0 = x - hp, bx1 = x + hp, bz0 = z - hp, bz1 = z + hp;
    const bp: Pt[] = []; for (let k = 0; k <= 6; k++) { const u = k / 6; bp.push([bx0 + (bx1 - bx0) * u, bz0], [bx0 + (bx1 - bx0) * u, bz1], [bx0, bz0 + (bz1 - bz0) * u], [bx1, bz0 + (bz1 - bz0) * u]); }
    const mp = Math.min(...bp.map(p => distToPolyline(drive, p)));
    const need = Math.max(driveW / 2 + YARD_SITE.edge - m, driveW / 2 + YARD_SITE.padClear - mp);
    if (need <= 0) break;
    d += need + 0.02; x = c[0] + left[0] * sd * d; z = c[1] + left[1] * sd * d;
  }
  return { x, z, rot: Math.round(rot * 1e4) / 1e4 % 4, front, side: sd, arc, heading: t, gate: [x + front[0] * half, z + front[1] * half] };
}

/** Length of the gravel spur from a yard's gate to the drive's edge (what the yard's builder lays: `BuildOpts.spur`): clear ground along the front, clamped. */
export function yardSpur(drive: readonly Pt[] | undefined, x: number, z: number, rot: number, half: number, driveW: number): number {
  if (!drive || drive.length < 2) return 0.4;
  const th = rot * Math.PI / 2, f: Pt = [Math.sin(th), Math.cos(th)], g: Pt = [x + f[0] * half, z + f[1] * half];
  return Math.max(0.05, Math.min(2, distToPolyline(drive, g) - driveW / 2 + 0.03));
}

/** Can a gravel spur of length `spur` rise or fall `drop` from the yard's pad to the road's edge? A farm drive grades to ~15 % (plus a little for the crown); steeper means the yard sits above a road cut. */
export const spurGradeOk = (spur: number, drop: number): boolean => Math.abs(drop) <= 0.15 * spur + 0.04;

/**
 * Does the ground between a yard's gate and the road lie as a plain slope? `heights[i][j]` is the ground at station i (0 at the gate, last at the road's edge) and
 * lateral offset j across the spur; the spur is laid draped on the ground, so it is only a drive when the ground is within `tol` of the straight line from the pad's
 * level `pad` to the road's level `roadY`. A bank (a road cut's slope or a bench edge) beside or across the way breaks that and the site is refused.
 */
export function spurProfileOk(pad: number, roadY: number, heights: ReadonlyArray<ReadonlyArray<number>>, tol = 0.1): boolean {
  const n = heights.length;
  if (n < 2) return true;
  for (let i = 0; i < n; i++) for (const h of heights[i]) if (Math.abs(h - (pad + (roadY - pad) * i / (n - 1))) > tol) return false;
  return true;
}
