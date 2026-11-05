/**
 * Where the drive gate's kit stands (docs/DECISIONS.md, "Gate kit follows the drive"). Pure geometry (tested, no WebGL).
 *
 * The double gate (sally port), the intercom pole, the caged motor and the armed-response sign belong to the DRIVE, not to the wall: the road crosses
 * the wall at any angle (a slanted crossing is why a road gate is cut wider than the road, sim/roadGate `gateWidthFor`), and a driveway bends, often
 * right at the property line. So the kit is laid out from the drive's own center line at the crossing:
 *
 *   c   the point where the drive's center line meets the wall line
 *   t   the drive's unit heading there, toward the camp (the chord of `KIT.headingSpan` of drive either side of c: 0.5, the road station spacing, so it is the same frame the ribbon is drawn with, game/region/roadWorks `frames`)
 *   n   t turned to the left (the driver's side; x east, z south, so heading east the left is north)
 *
 * The sally port's two side walls are the drive's center line offset +-(clearHalf + half a wall) over `KIT.depth` of drive, so they are parallel to the
 * road at every point (a bend in the road is a bend in the port); each starts where its offset line meets the wall line, flush with it, with a short
 * wing closing any gap to the gate's pier. The inner gate frame closes the far end, square to the road there and centered on it. Small things (the
 * intercom pole, the sign, the motor cage) sit at their own lateral offset from the road, each measured from the real wall along the road, so a
 * slanted wall never leaves one on the wrong side of it.
 */
import { crossings, gateTakesDrive, isBarrierKind, ROAD_GATE_W, type Crossing } from '../../sim/roadGate';
import type { Gate, PerimeterRun, Pt } from '../../sim/perimeter';

const M = 1 / 6;

export const KIT = {
  /** Clear half-width between the side walls: the gate's own clear width (0.6 = 3.6 m) is wider than the widest vehicle on the drive (the motorhome, 0.44). */
  clearHalf: ROAD_GATE_W / 2,
  /** The side walls' thickness (a 14 cm steel panel) and height (2.3 m). */
  thick: 0.14 * M,
  height: 2.3 * M,
  /** The port's length along the drive, wall line to inner gate (6.9 m: room for a pickup, 0.92 long, with both gates shut), and the least it is built (a pickup and a little). */
  depth: 1.15,
  minDepth: 1.0,
  /** An open inner leaf lies against a side wall's inner face: how far it stands into the clear width (leaf thickness). */
  leafInset: 0.012,
  /** Drive length either side of a point that sets the heading there. */
  headingSpan: 0.5,
  /** Side walls are built in straight pieces at most this long (a piece's heading is within a degree or two of the road's). */
  piece: 0.15,
  /** The crossing must be at least this square (sine of the angle between wall and drive; roadGate cuts gates for slants down to 0.5 and no further, `gateWidthFor`). */
  minSin: 0.5,
} as const;

export interface Layout {
  c: Pt;
  /** Unit heading of the drive at the crossing, toward the camp; and its left. */
  t: Pt;
  n: Pt;
  /** Unit direction of the wall line there (the run's direction of travel). */
  wd: Pt;
  sin: number;
  /** Distance along the run to the crossing. */
  at: number;
  /** The gate's piers as distances along the wall from the crossing. */
  piers: [number, number];
  /** The widest the gate stands open, measured across the drive (at least `clearHalf`). */
  openHalf: number;
  /** Side walls, left (n) then right (-n): a polyline from the wall line in to the inner frame, parallel to the drive. */
  sides: [Pt[], Pt[]];
  /** Pieces of wall closing the gap between a pier and where a side wall meets the line. */
  wings: Array<{ a: Pt; b: Pt }>;
  /** The inner frame's two posts (left, right) and its heading (the drive's there, toward the camp). */
  inner: [Pt, Pt];
  tEnd: Pt;
  /** Open inner leaves lying against the side walls: a polyline from the inner post back along the wall. */
  innerLeaves: [Pt[], Pt[]];
  /** Outward direction (the road side), along which the outer leaves swing open. */
  out: Pt;
  /** Intercom pole (left, outside the wall, abreast of a driver's window) and sign (right, outside); the motor cage (right, inside). */
  intercom: Pt;
  sign: Pt;
  motor: Pt;
}

/** Total length of a polyline. */
export function lineLen(pts: readonly Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

/** Point at distance `s` along a polyline. */
export function pointAtArc(pts: readonly Pt[], s: number): Pt {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) { const k = l > 0 ? Math.min(1, left / l) : 0; return [ax + (bx - ax) * k, az + (bz - az) * k]; }
    left -= l;
  }
  return pts[0];
}

/** Unit heading of a polyline at arc `s`: the chord from `span` before to `span` after (clamped to the line). */
export function headingAt(pts: readonly Pt[], s: number, span: number = KIT.headingSpan): Pt {
  const a = pointAtArc(pts, Math.max(0, s - span)), b = pointAtArc(pts, Math.min(lineLen(pts), s + span));
  const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}

/** Arc along the drive of the point nearest `p`. */
export function arcNear(drive: readonly Pt[], p: Pt): number {
  let acc = 0, best = Infinity, arc = 0;
  for (let i = 1; i < drive.length; i++) {
    const [ax, az] = drive[i - 1], [bx, bz] = drive[i], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz), l2 = l * l;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)) : 0, d = Math.hypot(p[0] - (ax + dx * k), p[1] - (az + dz * k));
    if (d < best) { best = d; arc = acc + k * l; }
    acc += l;
  }
  return arc;
}

/** The crossing of a run with the drive that this gate takes (the nearest to the gate's middle), or null. A gatehouse garage is the gate itself and carries no kit. */
export function driveCrossing(run: Pick<PerimeterRun, 'pts' | 'kind'>, g: Gate, drive: readonly Pt[] | undefined): Crossing | null {
  return g.garage ? null : crossingOf(run, g, drive);
}
/** The same, a gatehouse garage's drive-through gate included. */
function crossingOf(run: Pick<PerimeterRun, 'pts' | 'kind'>, g: Gate, drive: readonly Pt[] | undefined): Crossing | null {
  if (!drive || drive.length < 2 || run.pts.length < 2 || !isBarrierKind(run.kind)) return null;
  let best: Crossing | null = null;
  for (const c of crossings(run.pts, drive)) if (gateTakesDrive(g, c.at, c.sin) && (!best || Math.abs(c.at - g.at) < Math.abs(best.at - g.at))) best = c;
  return best;
}

export interface Entry { runId: string; gate: Gate; crossing: Crossing }

/** The first way in: of the finished walls, the vehicle gate the drive meets first coming from the road (a gatehouse garage counts: it is the gate). */
export function entryGate(runs: readonly Pick<PerimeterRun, 'id' | 'pts' | 'kind' | 'gates' | 'finishedAt' | 'hostId'>[], drive: readonly Pt[] | undefined): Entry | null {
  let best: Entry | null = null;
  for (const r of runs) {
    if (r.finishedAt === null || r.hostId) continue;
    for (const g of r.gates) {
      const c = crossingOf(r, g, drive);
      if (c && g.w >= 0.5 && (!best || c.driveArc < best.crossing.driveArc)) best = { runId: r.id, gate: g, crossing: c };
    }
  }
  return best;
}

/** Even-odd point-in-polygon on a closed run. */
export function insidePoly(poly: readonly Pt[], p: Pt): boolean {
  let ins = false;
  for (let i = 1; i < poly.length; i++) {
    const [ax, az] = poly[i - 1], [bx, bz] = poly[i];
    if ((az > p[1]) !== (bz > p[1]) && p[0] < ax + (bx - ax) * (p[1] - az) / (bz - az)) ins = !ins;
  }
  return ins;
}

/** Distance from a point to a polyline. */
export function distToPolyline(pts: readonly Pt[], p: Pt): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - (ax + dx * k), p[1] - (az + dz * k)));
  }
  return best;
}

const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const at2 = (c: Pt, v: Pt, k: number): Pt => [c[0] + v[0] * k, c[1] + v[1] * k];
const leftOf = (t: Pt): Pt => [t[1], -t[0]];

/** The drive's center line offset `v` to its left at arc `s`. */
export function offsetAt(drive: readonly Pt[], s: number, v: number): Pt {
  return at2(pointAtArc(drive, s), leftOf(headingAt(drive, s)), v);
}

/** The offset line (lateral `v`) over arcs s0..s1 in pieces of at most `KIT.piece`. */
function offsetLine(drive: readonly Pt[], s0: number, s1: number, v: number): Pt[] {
  const n = Math.max(1, Math.ceil((s1 - s0) / KIT.piece)), out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(offsetAt(drive, s0 + (s1 - s0) * i / n, v));
  return out;
}

/**
 * The kit's layout for one drive gate in the wall `wall` (the run's points). `pierHalf` is how far the gate's pier reaches past the gap (a stone gatehouse's piers are 0.16 wide).
 * Null when the crossing is too grazing to build square to.
 */
export function gateKitLayout(g: Gate, c: Crossing, drive: readonly Pt[], wall: readonly Pt[], pierHalf = 0.04): Layout | null {
  const t = headingAt(drive, c.driveArc), n = leftOf(t), wd: Pt = [c.dx, c.dz], cp: Pt = [c.x, c.z];
  const dn = dot(wd, n), dt = dot(wd, t);
  if (Math.abs(dn) < KIT.minSin) return null;
  /** How far along the drive the wall line is at lateral v (straight-wall approximation, for the small pieces). */
  const wallU = (v: number): number => v / dn * dt;
  const piers: [number, number] = [g.at - g.w / 2 - c.at, g.at + g.w / 2 - c.at];
  const openHalf = Math.max(KIT.clearHalf, Math.abs(piers[0] * dn), Math.abs(piers[1] * dn));
  const L = KIT.clearHalf + KIT.thick / 2;
  /** The arc where the drive's offset line at v meets the wall (the real run, so a bend in it counts; the root nearest the crossing). */
  const startArc = (v: number): number => {
    const guess = c.driveArc + wallU(v), s0 = Math.max(0, c.driveArc - 1.5), line: Pt[] = [];
    for (let i = 0; s0 + i * 0.04 <= c.driveArc + 1.5; i++) line.push(offsetAt(drive, s0 + i * 0.04, v));
    let best = guess, bestD = Infinity;
    const STEP = 0.04;
    for (const x of crossings(wall, line)) {
      // `x.driveArc` is the length along the offset line (longer or shorter than the drive's own on a bend): back to the drive's arc by the sample it falls in
      let acc = 0, k = 0, f = 0;
      for (let i = 1; i < line.length; i++) {
        const l = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]);
        if (acc + l >= x.driveArc || i === line.length - 1) { k = i - 1; f = l > 0 ? Math.min(1, (x.driveArc - acc) / l) : 0; break; }
        acc += l;
      }
      const r = s0 + (k + f) * STEP;
      if (Math.abs(r - guess) < bestD) { bestD = Math.abs(r - guess); best = r; }
    }
    return best;
  };
  // the port runs `KIT.depth` in along the drive; where the drive turns to run along the wall just inside it (a short facet, a road that hugs the line) the side walls
  // would stand in the wall, so the port is shortened to what clears it, and there is no port at all if it cannot hold a vehicle (`KIT.minDepth`)
  const sL = startArc(L), sR = startArc(-L);
  let arc1 = c.driveArc + KIT.depth, sides: [Pt[], Pt[]] = [[], []];
  for (let depth = KIT.depth; ; depth -= 0.05) {
    if (depth < KIT.minDepth - 1e-9) return null;
    arc1 = c.driveArc + depth;
    sides = [offsetLine(drive, sL, arc1, L), offsetLine(drive, sR, arc1, -L)];
    const clear = sides.every(sd => sd.every((q, i) => i === 0 || Math.hypot(q[0] - sd[0][0], q[1] - sd[0][1]) < 0.35 || distToPolyline(wall, q) >= 0.07));
    if (clear) break;
  }
  const wings: Layout['wings'] = [];
  for (const sd of sides) {
    const s = dot([sd[0][0] - cp[0], sd[0][1] - cp[1]], wd);
    if (s > piers[0] + 0.01 && s < piers[1] - 0.01) wings.push({ a: at2(cp, wd, s >= 0 ? piers[1] : piers[0]), b: sd[0] });
  }
  const tEnd = headingAt(drive, arc1), lv = KIT.clearHalf - 0.006;
  /**
   * A spot at lateral `v` from the drive's center line and `d` clear of the wall (positive inside), following the road's bend; a slanted wall needs more road for
   * the same clearance. On a closed run it is checked against the real outline (a facet corner can turn the wall away from the line the spot was measured from)
   * and walked along the road until it is on the right side and 0.1 clear of the wall.
   */
  const closed = wall.length > 3 && Math.hypot(wall[0][0] - wall[wall.length - 1][0], wall[0][1] - wall[wall.length - 1][1]) < 1e-6;
  const tryPlace = (v: number, d: number): Pt | null => {
    const sgn = d >= 0 ? 1 : -1;
    let arc = startArc(v) + d / Math.abs(dn);
    for (let k = 0; k < 40; k++, arc += sgn * 0.08) {
      const p = offsetAt(drive, arc, v);
      if ((!closed || insidePoly(wall, p) === (sgn > 0)) && distToPolyline(wall, p) >= 0.1) return p;
    }
    return null;
  };
  /** The spot on the preferred side of the road, else on the other (a road that hugs the wall leaves no room on its wall side). */
  const place = (v: number, d: number): Pt => tryPlace(v, d) ?? tryPlace(-v, d) ?? offsetAt(drive, startArc(v) + d / Math.abs(dn), v);
  const reach = openHalf + pierHalf;
  return {
    c: cp, t, n, wd, sin: Math.abs(dn), at: c.at, piers, openHalf, sides, wings,
    inner: [sides[0][sides[0].length - 1], sides[1][sides[1].length - 1]], tEnd,
    innerLeaves: [offsetLine(drive, arc1 - KIT.clearHalf, arc1, lv), offsetLine(drive, arc1 - KIT.clearHalf, arc1, -lv)],
    out: [-t[0], -t[1]],
    intercom: place(reach + 0.07, -0.35),
    sign: place(-(reach + 0.4), -0.6),
    motor: place(-(reach + 0.12), 0.32),
  };
}

/**
 * Where the guard house's frame stands (the barrier arm spans the drive): on the drive just inside the entry wall and clear of its sally port.
 * The frame's local +x points out to the road: the world rotates it by `atan2(t.z, -t.x)`, `t` being the heading toward the camp. The house (lateral
 * 0.4..0.8 one side) and the cars parked on the other must all stand inside a slanted wall, so the frame's distance in (`u`) clears the wall line at
 * the widest of them. With no wall across the drive the frame is half a unit inside the property gate.
 */
export function gateHouseFrame(drive: readonly Pt[], entry: { crossing: Crossing } | null, sally: boolean, fallback: Pt): { origin: Pt; t: Pt } {
  if (!entry) {
    let k = 0, best = Infinity;
    drive.forEach((q, i) => { const e = Math.hypot(q[0] - fallback[0], q[1] - fallback[1]); if (e < best) { best = e; k = i; } });
    let s = 0;
    for (let i = 1; i <= k; i++) s += Math.hypot(drive[i][0] - drive[i - 1][0], drive[i][1] - drive[i - 1][1]);
    return { origin: pointAtArc(drive, s + 0.5), t: headingAt(drive, s + 0.5) };
  }
  const c = entry.crossing, t = headingAt(drive, c.driveArc), n = leftOf(t), wd: Pt = [c.dx, c.dz];
  const dn = dot(wd, n) || 1e-6, dt = dot(wd, t);
  let u = 0.5;
  for (const v of [-0.85, -0.35, 0.35, 0.8]) u = Math.max(u, v / dn * dt + 0.5);
  if (sally) u = Math.max(u, KIT.depth + 0.5);
  return { origin: pointAtArc(drive, c.driveArc + u), t: headingAt(drive, c.driveArc + u) };
}
