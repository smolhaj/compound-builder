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
    // a man-door the player put there is widened into the vehicle gate rather than doubled
    const clash = out.findIndex(o => Math.abs(o.at - g.at) < (o.w + g.w) / 2 && !o.garage);
    if (clash >= 0) out.splice(clash, 1);
    if (out.some(o => Math.abs(o.at - g.at) < (o.w + g.w) / 2)) continue;
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

/** Cut the missing gates through every wall that crosses the driveway. Returns how many. */
export function cutRoadGates(s: GameState, drive: readonly Pt[] | undefined, quiet = false): number {
  let n = 0;
  for (const run of s.perimeter) {
    if (!isBarrierKind(run.kind) || run.pts.length < 2) continue;
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
