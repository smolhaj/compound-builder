/**
 * The gate where the road comes in (docs/DECISIONS.md, "Gate where the
 * driveway crosses the wall"). The county road and the driveway from it to
 * the camp are drawn by the world (game/region/access.ts); the sim only needs
 * the driveway's polyline (`PropertyGeometry.drive`). Wherever a wall, fence,
 * hedge, berm or ditch crosses that polyline there has to be a vehicle gate,
 * centered on the crossing, wide enough for the fleet and the delivery truck.
 *
 *  - `crossings` finds where a line meets the driveway;
 *  - `autoRoadGates` adds the missing gate to a hand-drawn run;
 *  - `ungatedCrossings` / `cutRoadGates` find and fix walls already laid out
 *    (older games, a run drawn before this rule) with a one-click opening;
 *  - `roadGateStatus` is what the cards and the Defense tab read.
 *
 * Nothing here is saved state: the driveway is derived from the camp, and a
 * gate is just a `Gate` on a run. Pure (tested).
 */
import { PERIMETER, UTILITY_LINES, runLength, type Gate, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { GARAGE_GATE_W } from './garage';
import { log } from './economy';
import type { GameState } from './state';

/** A vehicle gate (the drive's width), world units (≈ 3.6 m: the widest vehicle, a motorhome, is 0.44). */
export const ROAD_GATE_W = 0.6;
/** Half the driveway's width (game/region/access.ts `DRIVE_W` = 0.55). */
export const DRIVE_HALF = 0.275;
/** Half the widest vehicle that uses the drive (the motorhome, 0.44 wide): the gate must clear it with the vehicle on the center line. */
export const VEHICLE_HALF = 0.22;
/** A gap narrower than this is a man-door: people only. */
export const MIN_VEHICLE_GATE = 0.5;
/** The widest a slanted road gate is cut. */
const MAX_GATE_W = 1.4;

export interface Crossing {
  /** Distance along the first line to the crossing. */
  at: number;
  x: number;
  z: number;
  /** Unit direction of the line there. */
  dx: number;
  dz: number;
  /** Distance along the driveway from the road end. */
  driveArc: number;
  /** Sine of the angle between line and driveway (1 = square across). */
  sin: number;
}

/** Where a polyline meets the driveway, in order along the line. A crossing exactly at a vertex of the line counts once. */
export function crossings(line: readonly Pt[], drive: readonly Pt[]): Crossing[] {
  const out: Crossing[] = [];
  let accA = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i], rx = bx - ax, rz = bz - az, rl = Math.hypot(rx, rz);
    let accD = 0;
    for (let j = 1; j < drive.length; j++) {
      const [cx, cz] = drive[j - 1], [ex, ez] = drive[j], sx = ex - cx, sz = ez - cz, sl = Math.hypot(sx, sz);
      const den = rx * sz - rz * sx;
      if (rl > 0 && sl > 0 && Math.abs(den) > 1e-9) {
        const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
        if (t >= -1e-9 && t <= 1 + 1e-9 && (t < 1 - 1e-9 || i === line.length - 1) && u >= -1e-9 && u <= 1 + 1e-9 && (u < 1 - 1e-9 || j === drive.length - 1)) {
          out.push({ at: accA + Math.max(0, Math.min(1, t)) * rl, x: ax + rx * t, z: az + rz * t, dx: rx / rl, dz: rz / rl, driveArc: accD + Math.max(0, Math.min(1, u)) * sl, sin: Math.abs(den) / (rl * sl) });
        }
      }
      accD += sl;
    }
    accA += rl;
  }
  return out.sort((p, q) => p.at - q.at);
}

/** The first crossing along the driveway from the road end, over several closed lines (each given as its points; the closing edge is added). */
export function firstEntry(loops: ReadonlyArray<readonly Pt[]>, drive: readonly Pt[]): { loop: number; c: Crossing } | null {
  let best: { loop: number; c: Crossing } | null = null;
  loops.forEach((l, k) => {
    for (const c of crossings([...l, l[0]], drive)) if (!best || c.driveArc < best.c.driveArc) best = { loop: k, c };
  });
  return best;
}

/** How wide to cut a gate across a driveway meeting the line at this sine (a slanted crossing needs a wider mouth). */
export const gateWidthFor = (sin: number): number => Math.min(MAX_GATE_W, ROAD_GATE_W / Math.max(0.5, sin));

/** Is this a kind of line a vehicle would have to get through (a barrier that stops vehicles, not a pipe, a deck, a tunnel or creek bars)? */
export function isBarrierKind(kind: PerimeterKind): boolean {
  const d = PERIMETER[kind];
  if (d.wallTop || d.walkway || d.twoWay || d.egressOnly || d.hidden) return false;
  if (kind === 'creek_bars' || UTILITY_LINES.includes(kind)) return false;
  return d.blocks.vehicles > 0 || d.blocks.people > 0;
}

/** Does this gate let the driveway through at `at` along its run? Man-doors do not; a gatehouse garage does by its middle drive-through gate. */
export function gateTakesDrive(g: Gate, at: number, sin = 1): boolean {
  if (g.garage) return Math.abs(at - g.at) <= GARAGE_GATE_W / 2 - VEHICLE_HALF + 0.03;
  if (g.w < MIN_VEHICLE_GATE) return false;
  return Math.abs(at - g.at) + VEHICLE_HALF / Math.max(0.5, sin) <= g.w / 2 + 0.02;
}

/**
 * The gate for one crossing: centered on it, as wide as the slant needs, kept inside the run, and nudged off a bend in the line
 * when the drive still fits through.
 */
function gateAtCrossing(pts: readonly Pt[], c: Crossing): Gate | null {
  const L = runLength(pts), w = gateWidthFor(c.sin);
  if (L < w + 0.1) return null;
  let at = Math.min(L - w / 2 - 0.02, Math.max(w / 2 + 0.02, c.at));
  // keep the posts on one straight stretch if the drive can still pass through
  let acc = 0;
  const slack = w / 2 - VEHICLE_HALF / Math.max(0.5, c.sin);
  for (let i = 1; i < pts.length - 1; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (at - w / 2 < acc && at + w / 2 > acc) {
      const toLeft = acc - w / 2 - 0.02, toRight = acc + w / 2 + 0.02;   // the gate centers that clear the bend
      const pick = Math.abs(toLeft - c.at) <= Math.abs(toRight - c.at) ? toLeft : toRight;
      if (Math.abs(pick - c.at) <= slack) at = pick;
    }
  }
  return { at, w };
}

/** The run drawn with the gates it needs where it crosses the driveway: `added` are the ones put in. */
export function autoRoadGates(kind: PerimeterKind, pts: readonly Pt[], gates: readonly Gate[], drive: readonly Pt[] | undefined): { gates: Gate[]; added: Gate[] } {
  const out: Gate[] = gates.map(g => ({ ...g })), added: Gate[] = [];
  if (!drive || drive.length < 2 || pts.length < 2 || !isBarrierKind(kind)) return { gates: out, added };
  for (const c of crossings(pts, drive)) {
    if (out.some(g => gateTakesDrive(g, c.at, c.sin))) continue;
    const g = gateAtCrossing(pts, c);
    if (!g) continue;
    // a gate or man-door already there (the player's, or a ring's own) is not doubled: the new gate takes over its span, so the opening still covers it
    // (a very slanted crossing falls right beside a ring's own gate); if that would be wider than a gate should be, the old one is simply replaced
    const clashes = out.filter(o => Math.abs(o.at - g.at) < (o.w + g.w) / 2 && !o.garage);
    if (clashes.length) {
      const lo = Math.min(g.at - g.w / 2, ...clashes.map(o => o.at - o.w / 2)), hi = Math.max(g.at + g.w / 2, ...clashes.map(o => o.at + o.w / 2));
      const rl = runLength(pts);
      if (hi - lo <= MAX_GATE_W + 0.6 && lo >= 0.02 && hi <= rl - 0.02) { g.at = (lo + hi) / 2; g.w = hi - lo; }
      for (const o of clashes) out.splice(out.indexOf(o), 1);
    }
    out.push(g);
    added.push(g);
  }
  out.sort((a, b) => a.at - b.at);
  return { gates: out, added };
}

export interface Ungated { run: PerimeterRun; crossing: Crossing }

/** The runs laid out (finished or not) that cross the driveway with no vehicle gate there. */
export function ungatedCrossings(s: Pick<GameState, 'perimeter'>, drive: readonly Pt[] | undefined): Ungated[] {
  if (!drive || drive.length < 2) return [];
  const out: Ungated[] = [];
  for (const run of s.perimeter) {
    if (!isBarrierKind(run.kind) || run.pts.length < 2) continue;
    for (const c of crossings(run.pts, drive)) if (!run.gates.some(g => gateTakesDrive(g, c.at, c.sin))) out.push({ run, crossing: c });
  }
  return out;
}

/**
 * A closed ring is a run that starts and ends at the same point, and a gate cannot straddle that seam: a road that crosses within half a gate of it cannot
 * be given a centered gate. Move the seam to the vertex farthest from the crossing that is clear of every gate (pts rotated, gates re-measured; the wall is
 * the same wall). Returns true if it moved.
 */
function moveSeamFrom(run: PerimeterRun, drive: readonly Pt[]): boolean {
  const p = run.pts, n = p.length;
  if (n < 5 || Math.hypot(p[0][0] - p[n - 1][0], p[0][1] - p[n - 1][1]) > 1e-6) return false;
  const L = runLength(p), bad = crossings(p, drive).filter(c => !run.gates.some(g => gateTakesDrive(g, c.at, c.sin)) && gateWidthFor(c.sin) / 2 + 0.05 > Math.min(c.at, L - c.at));
  if (!bad.length) return false;
  const cum: number[] = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const circ = (a: number, b: number): number => { const d = Math.abs(a - b) % L; return Math.min(d, L - d); };
  let best = -1, bestD = 0;
  for (let k = 1; k < n - 1; k++) {
    if (run.gates.some(g => circ(cum[k], g.at) < g.w / 2 + 0.1)) continue;
    const d = Math.min(...bad.map(c => circ(cum[k], c.at)));
    if (d > bestD) { bestD = d; best = k; }
  }
  if (best < 0 || bestD < 1.5) return false;
  const open = p.slice(0, n - 1), rot = [...open.slice(best), ...open.slice(0, best)];
  run.pts = [...rot, [rot[0][0], rot[0][1]]];
  for (const g of run.gates) g.at = ((g.at - cum[best]) % L + L) % L;
  run.gates.sort((a, b) => a.at - b.at);
  return true;
}


/**
 * A run that begins or ends right on the driveway (a ring cut at the seam, a fence stopped by the creek bars beside the road) cannot hold a gate centered
 * on the drive: the gate would hang past the run's end. The drive then simply gets a gap: the run is cut back half a gate (plus the vehicle's slack) on
 * each side that touches it. Gates and the run's other crossings are re-measured. Returns true if it cut anything.
 */
export function trimRunAtDrive(run: Pick<PerimeterRun, 'pts' | 'gates'>, drive: readonly Pt[]): boolean {
  let cut = false;
  for (let pass = 0; pass < 4; pass++) {
    const L = runLength(run.pts);
    const c = crossings(run.pts, drive).find(q => !run.gates.some(g => gateTakesDrive(g, q.at, q.sin)) && (gateWidthFor(q.sin) / 2 + 0.05 > q.at || gateWidthFor(q.sin) / 2 + 0.05 > L - q.at));
    if (!c) break;
    const half = gateWidthFor(c.sin) / 2 + 0.03;
    const atStart = c.at < L - c.at, s0 = atStart ? Math.min(L, c.at + half) : 0, s1 = atStart ? L : Math.max(0, c.at - half);
    if (s1 - s0 < 0.2) break;   // nothing worth keeping beside the road: leave it to the gate rule
    const pts: Pt[] = [], cum: number[] = [0];
    for (let i = 1; i < run.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1]));
    const at = (s: number): Pt => {
      for (let i = 1; i < run.pts.length; i++) if (s <= cum[i] + 1e-9) { const t = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0; return [run.pts[i - 1][0] + (run.pts[i][0] - run.pts[i - 1][0]) * t, run.pts[i - 1][1] + (run.pts[i][1] - run.pts[i - 1][1]) * t]; }
      return run.pts[run.pts.length - 1];
    };
    pts.push(at(s0));
    for (let i = 1; i < run.pts.length - 1; i++) if (cum[i] > s0 + 1e-6 && cum[i] < s1 - 1e-6) pts.push(run.pts[i]);
    pts.push(at(s1));
    run.gates = run.gates.filter(g => g.at - g.w / 2 >= s0 - 1e-6 && g.at + g.w / 2 <= s1 + 1e-6).map(g => ({ ...g, at: g.at - s0 }));
    run.pts = pts;
    cut = true;
  }
  return cut;
}

/** Cut the missing gates through every wall that crosses the driveway. Returns how many. */
export function cutRoadGates(s: GameState, drive: readonly Pt[] | undefined, quiet = false): number {
  let n = 0;
  for (const run of s.perimeter) {
    if (!isBarrierKind(run.kind) || run.pts.length < 2) continue;
    if (drive && drive.length > 1 && !run.hostId) { moveSeamFrom(run, drive); if (trimRunAtDrive(run, drive)) n++; }
    const r = autoRoadGates(run.kind, run.pts, run.gates, drive);
    if (r.added.length) { run.gates = r.gates; n += r.added.length; }
  }
  if (n && !quiet) log(s, `Cut ${n === 1 ? 'a gate' : `${n} gates`} through the wall where the road comes in.`);
  return n;
}

export interface RoadGateStatus {
  /** Walls that cross the driveway. */
  crossing: number;
  /** Of those, how many have a vehicle gate where the drive goes through. */
  gated: number;
  /** The rest: walls the road runs into. */
  missing: number;
  /** A gatehouse garage is the gate. */
  garage: boolean;
}

export function roadGateStatus(s: Pick<GameState, 'perimeter'>, drive: readonly Pt[] | undefined): RoadGateStatus {
  let crossing = 0, gated = 0, garage = false;
  if (drive && drive.length > 1) for (const run of s.perimeter) {
    if (!isBarrierKind(run.kind) || run.pts.length < 2 || run.hostId) continue;
    for (const c of crossings(run.pts, drive)) {
      crossing++;
      const g = run.gates.find(x => gateTakesDrive(x, c.at, c.sin));
      if (g) { gated++; if (g.garage) garage = true; }
    }
  }
  return { crossing, gated, missing: crossing - gated, garage };
}
