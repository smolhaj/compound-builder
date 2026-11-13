/**
 * Where the held compound is (pure): the closed wall rings, a soft inside-ness for any point, and the camera's sample point.
 * The oasis grade blends by this so the warm look fades in across the wall (a few world units either side), never pops.
 */
import { PERIMETER, runFinished, type PerimeterRun, type Pt } from '../../sim/perimeter';
import { pointInPolygon, polygonArea } from '../../sim/ringShape';

type RunLike = Pick<PerimeterRun, 'kind' | 'pts' | 'finishedAt' | 'dropped' | 'hostId'>;

/** Half-width (world units, about 24 m) of the band across a wall in which the grade crosses over. */
export const FEATHER = 4;

/** Closed, finished, people-stopping wall rings (a fence of woven wire or better), biggest first. */
export function compoundPolygons(runs: readonly RunLike[]): Pt[][] {
  const out: Pt[][] = [];
  for (const r of runs) {
    const d = PERIMETER[r.kind];
    if (!d || r.pts.length < 4 || !runFinished(r as PerimeterRun) || r.dropped || r.hostId) continue;
    if (d.height < 0.3 || d.blocks.people < 0.3) continue;
    const a = r.pts[0], b = r.pts[r.pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.8) continue;
    if (polygonArea(r.pts) < 8) continue;
    out.push(r.pts as Pt[]);
  }
  return out.sort((p, q) => polygonArea(q) - polygonArea(p));
}

/** Rectangle as a ring (the property line, when it holds but no single run closes). */
export const rectRing = (r: { x0: number; z0: number; x1: number; z1: number }): Pt[] => [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]];

/** Distance from a point to a closed ring's edge. */
export function edgeDistance(poly: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const [ax, az] = poly[i - 1], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * k), z - (az + dz * k)));
  }
  return best;
}

const smooth = (x: number): number => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** 0 well outside every ring, 1 well inside one, smooth across the wall (0.5 on it). */
export function insideness(polys: readonly Pt[][], x: number, z: number, feather = FEATHER): number {
  let best = 0;
  for (const p of polys) {
    const d = edgeDistance(p, x, z), signed = pointInPolygon(p, x, z) ? d : -d;
    best = Math.max(best, smooth((signed + feather) / (2 * feather)));
  }
  return best;
}

/**
 * Where to sample the grade for a camera: at eye level the camera's own spot (outside looking in is outside); from high above, the ground
 * under what it looks at (an aerial of the compound is warm), blended by height so a rising camera does not pop.
 */
export function samplePoint(cam: { x: number; y: number; z: number }, target: { x: number; z: number }, groundY: number): { x: number; z: number } {
  const k = smooth((cam.y - groundY - 2) / 8);
  return { x: cam.x + (target.x - cam.x) * k, z: cam.z + (target.z - cam.z) * k };
}
