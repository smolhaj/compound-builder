/**
 * Access: the gravel county road along the east side of the parcel (the
 * plain side; the range is west) and the driveway from it to the camp,
 * through a ranch gate on the property line (docs/DECISIONS.md: deliveries
 * by truck on a county road). Pure geometry (tested).
 */
import { PARCEL_SIZE } from '../parcel/parcelTerrain';
import { ROAD_EXTENT, ROAD_W, roadLine as countyLine, countyRoad } from './countyRoad';
import type { RoadPlan } from '../../sim/roadPlan';

export { ROAD_W, ROAD_EXTENT };
export const DRIVE_W = 0.55;

export type Pt = [number, number];

/** The classic county road (Mountain West, seed 0): kept for tests and the old callers. */
const CLASSIC_ROAD = countyRoad('mountain_west', 0);
export const roadX = (z: number): number => CLASSIC_ROAD.x(z);
export const roadLine = (step = 4): Pt[] => countyLine(CLASSIC_ROAD, step);

export interface Access {
  /** Driveway center line from the road to the yard (first point on the road), a point every half unit. */
  drive: Pt[];
  /** The same, every ~1.5 units, for the distance tests (`onAccess`). */
  driveQ: Pt[];
  /** Its bounding box. */
  box: [number, number, number, number];
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
export function planAccess(camp: { x: number; z: number }, zMin = 4, zMax = PARCEL_SIZE - 4): Access {
  const gz = Math.min(zMax, Math.max(zMin, camp.z + 1.5));
  const rx = roadX(gz);
  const yard = { x: camp.x + 2.2, z: camp.z + 1.2 };
  const raw: Pt[] = [[rx - ROAD_W / 2, gz], [PARCEL_SIZE + 0.6, gz], [PARCEL_SIZE - 3, gz], [(PARCEL_SIZE - 3 + yard.x) / 2, (gz + yard.z) / 2], [yard.x + 0.6, yard.z]];
  const drive = smoothLine(raw, 0.5);
  return { drive, ...queryForm(drive), gate: { x: PARCEL_SIZE, z: gz, rot: 0 }, yard };
}

/** The coarse polyline and bounding box the distance tests use. */
function queryForm(drive: readonly Pt[]): { driveQ: Pt[]; box: [number, number, number, number] } {
  const q: Pt[] = drive.filter((_, i) => i % 3 === 0 || i === drive.length - 1);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of drive) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { driveQ: q, box: [x0, z0, x1, z1] };
}

/** The access the world draws and walks, from the planned road (sim/roadPlan.ts). */
export function accessFromPlan(plan: RoadPlan): Access {
  const drive = plan.pts.map(p => [p.x, p.z] as Pt);
  return { drive, ...queryForm(drive), gate: { x: plan.gate.x, z: plan.gate.z, rot: 0 }, yard: { x: plan.yard[0], z: plan.yard[1] } };
}
