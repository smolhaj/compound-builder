/**
 * Ring shapes (docs/DECISIONS.md, "Ring shapes"): the compound's wall does
 * not have to be a square. `ringPolygon` makes a closed outline inside the
 * core rectangle: a rounded oval, an octagon, or an irregular one that follows
 * the lay of the land (it pulls in where the ground drops off and bulges out
 * on the level). Everything downstream (the wall plan, the gate, the towers,
 * the patrol deck, the garage, the passage, the yard check) already works on a
 * polyline, so a shape is only a different list of points. Pure (tested).
 *
 * The gate side is always flat: a gatehouse garage needs a straight stretch of
 * wall, so a chord a little longer than the gate is cut where the driveway
 * comes in (`flattenAt`).
 */
import type { Rect } from './land';
import { firstEntry } from './roadGate';
import type { Pt } from './perimeter';

export type RingShape = 'square' | 'rounded' | 'octagon' | 'irregular';

export const RING_SHAPES: ReadonlyArray<{ id: RingShape; name: string; blurb: string }> = [
  { id: 'square', name: 'Square', blurb: 'Four straight walls and four corners: the cheapest to plan and the easiest to watch.' },
  { id: 'rounded', name: 'Round', blurb: 'A rounded oval: no corners to hide behind, towers spread evenly round it. A little less ground inside for the same box.' },
  { id: 'octagon', name: 'Octagon', blurb: 'Eight straight walls: corners cut off, so a tower on each looks along two walls at a gentler angle.' },
  { id: 'irregular', name: 'Follow the land', blurb: 'Pulls in where the ground drops away and runs out along the level, the way a wall hugs an outcrop. Every land is different.' },
];
export const ringShapeName = (s: RingShape): string => RING_SHAPES.find(x => x.id === s)!.name.toLowerCase();

/** A walled area: the closed outlines of its edge (first point not repeated) and a point-in-area test. */
export interface Region {
  loops: Pt[][];
  contains: (x: number, z: number) => boolean;
  /** Set when the area is a union of rectangles (the square ring and the property line): the tower siting has a faster path for those. */
  rects?: Rect[];
}

export function pointInPolygon(pts: readonly Pt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

export function regionFromPolygon(poly: readonly Pt[]): Region {
  const pts = poly.map(p => [p[0], p[1]] as Pt);
  return { loops: [pts], contains: (x, z) => pointInPolygon(pts, x, z) };
}

/** Area (world units²), unsigned. */
export function polygonArea(pts: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

export function polygonLength(pts: readonly Pt[]): number {
  return pts.reduce((a, p, i) => a + Math.hypot(pts[(i + 1) % pts.length][0] - p[0], pts[(i + 1) % pts.length][1] - p[1]), 0);
}

/** Does a polygon cross itself? (O(n²): rings are a few dozen points.) */
export function selfIntersects(pts: readonly Pt[]): boolean {
  const n = pts.length;
  const ccw = (a: Pt, b: Pt, c: Pt) => (c[1] - a[1]) * (b[0] - a[0]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    const a = pts[i], b = pts[(i + 1) % n], c = pts[j], d = pts[(j + 1) % n];
    if (ccw(a, c, d) * ccw(b, c, d) < 0 && ccw(a, b, c) * ccw(a, b, d) < 0) return true;
  }
  return false;
}

/** Seeded 0–1 sequence (the shape of an irregular ring is the same on every look at the plan). */
function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export interface RingOptions {
  /** Where the driveway (or the farm gate) meets the ring: the wall is cut flat there. */
  drive?: readonly Pt[];
  roadGate?: Pt;
  /** The gate gap the flat stretch must hold (world units). */
  gateW: number;
  seed: number;
  /** Ground height (world units) at a point: the irregular ring follows it. */
  ground?: (x: number, z: number) => number;
}

/** How steep (rise over run) the ground may get before an irregular ring stops short of it (≈ 22°). */
export const STEEP = 0.4;
/** The fewest and most points a ring has. */
const ROUND_N = 28, IRREG_N = 18;

function base(shape: RingShape, r: Rect, o: RingOptions): Pt[] {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, a = (r.x1 - r.x0) / 2, b = (r.z1 - r.z0) / 2;
  if (shape === 'square') return [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]];
  if (shape === 'octagon') {
    const cut = 0.2929 * Math.min(2 * a, 2 * b);
    return [[r.x0 + cut, r.z0], [r.x1 - cut, r.z0], [r.x1, r.z0 + cut], [r.x1, r.z1 - cut], [r.x1 - cut, r.z1], [r.x0 + cut, r.z1], [r.x0, r.z1 - cut], [r.x0, r.z0 + cut]];
  }
  if (shape === 'rounded') {
    // a squircle (exponent 2.4): rounder than a rectangle with cut corners, fuller than an ellipse
    const e = 2 / 2.4;
    return Array.from({ length: ROUND_N }, (_, i) => {
      const t = (i / ROUND_N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      return [cx + a * Math.sign(c) * Math.abs(c) ** e, cz + b * Math.sign(s) * Math.abs(s) ** e] as Pt;
    });
  }
  // irregular: rays from the middle, each as far out as the ground stays walkable, with seeded give and take
  const rnd = rng(o.seed * 2654435761);
  const raw = Array.from({ length: IRREG_N }, (_, i) => {
    const t = (i / IRREG_N) * Math.PI * 2 + (rnd() - 0.5) * 0.12, c = Math.cos(t), s = Math.sin(t);
    // the longest reach inside the rectangle along this ray
    const R = Math.min(c !== 0 ? a / Math.abs(c) : Infinity, s !== 0 ? b / Math.abs(s) : Infinity);
    let reach = R * (0.74 + 0.26 * rnd());
    if (o.ground) {
      // walk out; stop where the ground turns steep (a cliff, an outcrop's flank), with a little margin
      let prev = o.ground(cx, cz);
      const step = 0.5;
      for (let d = step; d <= reach; d += step) {
        const h = o.ground(cx + c * d, cz + s * d);
        if (Math.abs(h - prev) / step > STEEP) { reach = Math.max(R * 0.55, d - 0.8); break; }
        prev = h;
      }
    }
    return { t, c, s, reach, R };
  });
  // one pass of smoothing so a single short ray does not make a spike
  const sm = raw.map((q, i) => Math.max(q.R * 0.5, Math.min(q.reach, 0.25 * raw[(i + IRREG_N - 1) % IRREG_N].reach + 0.5 * q.reach + 0.25 * raw[(i + 1) % IRREG_N].reach)));
  return raw.map((q, i) => [cx + q.c * Math.min(sm[i], q.R), cz + q.s * Math.min(sm[i], q.R)] as Pt);
}

/** Cut a flat chord into a closed outline where `p` lies on it: the vertices within `w / 2 + margin` (along the outline) go, two points on the edge replace them. */
export function flattenAt(poly: readonly Pt[], p: Pt, w: number, margin = 0.4): Pt[] {
  const n = poly.length;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]));
  const L = cum[n];
  // arc position of p
  let best = { d: Infinity, s: 0 };
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dz * t));
    if (d < best.d) best = { d, s: cum[i] + t * Math.sqrt(l2) };
  }
  const half = w / 2 + margin;
  const at = (s: number): Pt => {
    s = ((s % L) + L) % L;
    let i = 0;
    while (i < n - 1 && cum[i + 1] <= s) i++;
    const a = poly[i], b = poly[(i + 1) % n], l = cum[i + 1] - cum[i], t = l > 0 ? (s - cum[i]) / l : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  if (L < 4 * half) return poly.map(q => [q[0], q[1]] as Pt);
  const lo = best.s - half, hi = best.s + half;
  const arcDist = (s: number) => { const d = Math.abs(((s - best.s + L / 2) % L + L) % L - L / 2); return d; };
  // walk the outline from `hi` round to `lo`, keeping the vertices outside the cut
  const keep: Pt[] = [];
  const startIdx = (() => { let i = 0; const h = ((hi % L) + L) % L; while (i < n && cum[i] <= h) i++; return i % n; })();
  for (let k = 0; k < n; k++) {
    const i = (startIdx + k) % n;
    if (arcDist(cum[i]) > half + 1e-9) keep.push([poly[i][0], poly[i][1]]);
  }
  return keep.length >= 1 ? [at(hi), ...keep, at(lo)] : poly.map(q => [q[0], q[1]] as Pt);
}

/** Where the ring is crossed by the driveway (else the point nearest the farm gate, else the east side): the gate goes here. */
export function gatePoint(poly: readonly Pt[], o: Pick<RingOptions, 'drive' | 'roadGate'>): Pt {
  if (o.drive && o.drive.length > 1) {
    const e = firstEntry([poly], o.drive);
    if (e) return [e.c.x, e.c.z];
  }
  const target = o.roadGate ?? [Math.max(...poly.map(p => p[0])) + 100, poly.reduce((a, p) => a + p[1], 0) / poly.length];
  let best: Pt = poly[0], bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / l2)) : 0;
    const q: Pt = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(target[0] - q[0], target[1] - q[1]);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
}

/**
 * The outline of a ring of this shape inside `rect`, flat where the gate goes.
 * `square` is the rectangle itself (the plan keeps its fast rectangle path).
 */
export function ringPolygon(shape: RingShape, rect: Rect, o: RingOptions): Pt[] {
  const poly = base(shape, rect, o);
  if (shape === 'square') return poly;
  const gp = gatePoint(poly, o);
  return flattenAt(poly, gp, o.gateW);
}

/** Fraction of the rectangle's ground the ring encloses (a rounder ring holds less for the same box). */
export function fillOf(poly: readonly Pt[], rect: Rect): number {
  return polygonArea(poly) / Math.max(1e-9, (rect.x1 - rect.x0) * (rect.z1 - rect.z0));
}

/**
 * The corners of the outline where a tower can stand: every vertex that turns
 * by at least `minTurn` radians, with the inward bisector there (pointing
 * into the region). Pure helper for the tower siting.
 */
export function cornersOf(poly: readonly Pt[], region: Pick<Region, 'contains'>, minTurn = 0.25): Array<{ at: Pt; inward: Pt; turn: number }> {
  const n = poly.length, out: Array<{ at: Pt; inward: Pt; turn: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], pa = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const u1: Pt = [pa[0] - a[0], pa[1] - a[1]], u2: Pt = [b[0] - a[0], b[1] - a[1]];
    const l1 = Math.hypot(u1[0], u1[1]) || 1, l2 = Math.hypot(u2[0], u2[1]) || 1;
    u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2;
    const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (turn < minTurn) continue;
    let bx = u1[0] + u2[0], bz = u1[1] + u2[1];
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) continue;
    bx /= bl; bz /= bl;
    if (!region.contains(a[0] + bx * 0.1, a[1] + bz * 0.1)) { bx = -bx; bz = -bz; }
    out.push({ at: [a[0], a[1]], inward: [bx, bz], turn });
  }
  return out;
}
