/**
 * Access: the gravel county road along the east side of the parcel (the
 * plain side; the range is west) and the driveway from it to the camp,
 * through a ranch gate on the property line (docs/DECISIONS.md: deliveries
 * by truck on a county road). Pure geometry (tested).
 */
import { PARCEL_SIZE } from '../parcel/parcelTerrain';

/** Road surface width (≈ 6 m gravel). */
export const ROAD_W = 1.0;
export const DRIVE_W = 0.55;
/** The county road runs this far north and south of the parcel. */
export const ROAD_EXTENT = 700;

export type Pt = [number, number];

/** County road center x at z: a few units east of the parcel, gently wandering. */
export function roadX(z: number): number {
  return PARCEL_SIZE + 3.2 + 1.6 * Math.sin(z / 85 + 0.7) + 0.6 * Math.sin(z / 31);
}

/** County road center line, sampled every `step` units. */
export function roadLine(step = 4): Pt[] {
  const out: Pt[] = [];
  for (let z = -ROAD_EXTENT; z <= PARCEL_SIZE + ROAD_EXTENT; z += step) out.push([roadX(z), z]);
  return out;
}

export interface Access {
  /** Driveway center line from the road to the yard (first point on the road). */
  drive: Pt[];
  /** Gate on the property line. */
  gate: { x: number; z: number; rot: number };
  /** Stockpile yard (where trucks unload). */
  yard: { x: number; z: number };
}

/** Catmull-Rom resample of a polyline (smooth bends, ~`step` spacing). */
export function smoothLine(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Length of a polyline. */
export function lineLength(pts: readonly Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Point and heading (radians, 0 = +z) at distance `d` along a polyline. */
export function pointAt(pts: readonly Pt[], d: number): { x: number; z: number; rot: number } {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, rot: Math.atan2(bx - ax, bz - az) };
    }
    left -= l;
  }
  const [x, z] = pts[0];
  return { x, z, rot: 0 };
}

/** Distance from (x, z) to a polyline. */
export function distToLine(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/**
 * Driveway from the county road to the camp: leaves the road square, enters
 * through the gate a few units in from the property corner line, and swings
 * to a yard beside the camp. `camp` is the camp center; the yard sits on its
 * road side.
 */
export function planAccess(camp: { x: number; z: number }): Access {
  const gz = Math.min(PARCEL_SIZE - 4, Math.max(4, camp.z + 1.5));
  const rx = roadX(gz);
  const yard = { x: camp.x + 2.2, z: camp.z + 1.2 };
  const raw: Pt[] = [[rx - ROAD_W / 2, gz], [PARCEL_SIZE + 0.6, gz], [PARCEL_SIZE - 3, gz], [(PARCEL_SIZE - 3 + yard.x) / 2, (gz + yard.z) / 2], [yard.x + 0.6, yard.z]];
  return { drive: smoothLine(raw, 0.5), gate: { x: PARCEL_SIZE, z: gz, rot: 0 }, yard };
}
