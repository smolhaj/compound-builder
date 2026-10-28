/**
 * "Wall my property": trace the whole closed property line (the outline of
 * the land the family owns), build it in one wall type, leave a gap at each
 * place the creek crosses the line and bar it with creek bars, hang a
 * vehicle gate on the road side, and skip any stretch an existing run
 * already holds (so a partly walled line is filled in, never doubled).
 * Plans first (cost, hours, what it would do) and lays out only on
 * confirm. Pure (tested).
 */
import { MATERIALS, type MaterialId, type Stock } from './materials';
import { log, orderCost } from './economy';
import { ownedRects } from './enclosure';
import type { Rect } from './land';
import { PERIMETER, planRun, runBill, runHours, wallLength, type Gate, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import type { GameState } from './state';

/** A vehicle gate (the drive's width), world units. */
export const ROAD_GATE_W = 0.6;
/** A wall within this of the line holds it (matches enclosure.ts). */
const REACH = 0.75;
/** Sampling step along the line. */
const STEP = 0.25;
/** The creek is barred this far either side of its centerline, beyond its half width. */
const BANK = 0.6;
/** Shortest stretch worth a run of its own. */
const MIN_RUN = 0.6;

/** What the world knows that the sim does not: the creek's line and the road gate. */
export interface PropertyGeometry {
  /** Where the creek runs (z at x); it flows west to east. */
  creekZ?: (x: number) => number;
  creekHalf?: number;
  /** The farm gate on the county road. */
  roadGate?: Pt;
}

/** The kinds that make sense as the one wall round a property. */
export const WALL_CHOICES: readonly PerimeterKind[] = ['split_rail', 'barbed_wire', 'woven_wire', 'thorn_hedge', 'log_palisade', 'container_wall', 'earth_berm', 'ditch', 'chain_link', 'wrought_iron', 'iron_barbed', 'steel_wall', 'electric_steel'];

// ── the line as a loop ──

/** The outer outlines (and any holes) of the union of rectangles, as closed point lists (first point not repeated). */
export function traceLoops(rects: readonly Rect[]): Pt[][] {
  const xs = [...new Set(rects.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap(r => [r.z0, r.z1]))].sort((a, b) => a - b);
  const owned = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= xs.length - 1 || j >= zs.length - 1) return false;
    const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
    return rects.some(r => cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1);
  };
  const key = (i: number, j: number) => `${i},${j}`;
  const edges = new Map<string, Array<[number, number]>>();
  const add = (a: [number, number], b: [number, number]) => { const k = key(...a); (edges.get(k) ?? edges.set(k, []).get(k)!).push(b); };
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    if (!owned(i, j)) continue;
    if (!owned(i, j - 1)) add([i, j], [i + 1, j]);
    if (!owned(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!owned(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!owned(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const loops: Pt[][] = [];
  while (edges.size) {
    const first = edges.keys().next().value as string;
    let cur = first.split(',').map(Number) as [number, number];
    const pts: Pt[] = [];
    for (let guard = 0; guard < 100000; guard++) {
      const out = edges.get(key(...cur));
      if (!out || !out.length) break;
      const nxt = out.shift()!;
      if (!out.length) edges.delete(key(...cur));
      pts.push([xs[cur[0]], zs[cur[1]]]);
      cur = nxt;
      if (key(...cur) === first) break;
    }
    // drop the points in the middle of straight stretches
    const simple = pts.filter((p, k) => {
      const a = pts[(k + pts.length - 1) % pts.length], b = pts[(k + 1) % pts.length];
      return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
    });
    if (simple.length >= 3) loops.push(simple);
  }
  return loops.sort((a, b) => loopLength(b) - loopLength(a));
}

const loopLength = (pts: readonly Pt[]): number => pts.reduce((a, p, k) => a + Math.hypot(pts[(k + 1) % pts.length][0] - p[0], pts[(k + 1) % pts.length][1] - p[1]), 0);

/** A closed polyline you can walk by arc length. */
class Loop {
  readonly cum: number[] = [0];
  readonly pts: readonly Pt[];
  constructor(pts: readonly Pt[]) {
    this.pts = pts;
    for (let i = 0; i < pts.length; i++) this.cum.push(this.cum[i] + Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]));
  }
  get length(): number { return this.cum[this.pts.length]; }
  at(s: number): Pt {
    const L = this.length;
    s = ((s % L) + L) % L;
    let i = 0;
    while (i < this.pts.length - 1 && this.cum[i + 1] <= s) i++;
    const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length], l = this.cum[i + 1] - this.cum[i], t = l > 0 ? (s - this.cum[i]) / l : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  /** The points from arc s0 to s1 (s1 > s0, may pass the start), vertices included. */
  slice(s0: number, s1: number): Pt[] {
    const L = this.length, out: Pt[] = [this.at(s0)];
    for (let lap = Math.floor(s0 / L); lap * L < s1; lap++) {
      for (let i = 0; i < this.pts.length; i++) {
        const s = lap * L + this.cum[i];
        if (s > s0 + 1e-6 && s < s1 - 1e-6) out.push([this.pts[i][0], this.pts[i][1]]);
      }
    }
    out.push(this.at(s1));
    return out;
  }
  /** Nearest arc position to a point, and the distance. */
  nearest(x: number, z: number): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) : 0;
      const d = Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
      if (d < best.d) best = { d, s: this.cum[i] + t * Math.sqrt(l2) };
    }
    return best;
  }
}

/** Distance from a point to a polyline. */
function distToPolyline(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

// ── the plan ──

export interface PlannedRun { kind: PerimeterKind; pts: Pt[]; gates: Gate[] }

export interface WallPlan {
  kind: PerimeterKind;
  runs: PlannedRun[];
  /** Metres of new wall (gates excluded), of creek bars, and of the line already held by something built or planned. */
  wallM: number;
  barsM: number;
  heldM: number;
  /** Whole line, metres. */
  lineM: number;
  creekCrossings: number;
  gates: number;
  /** Why there is no gate (null = one is planned or none was wanted). */
  gateNote: string | null;
  bill: Partial<Stock>;
  /** What the buyable part of the bill costs, and the own-labor materials (logs). */
  cost: number;
  own: Array<{ material: MaterialId; qty: number }>;
  hours: number;
}

const M = 6;

/** Can this existing run stand for the property wall along the line? */
const holdsLine = (r: Pick<PerimeterRun, 'kind' | 'pts'>) => r.kind !== 'creek_bars' && PERIMETER[r.kind].blocks.people > 0 && r.pts.length > 1;

export function planPropertyWall(s: GameState, kind: PerimeterKind, geo: PropertyGeometry = {}): WallPlan {
  const loops = traceLoops(ownedRects(s)).map(p => new Loop(p));
  const walls = s.perimeter.filter(holdsLine), bars = s.perimeter.filter(r => r.kind === 'creek_bars' && r.pts.length > 1);
  const creek = s.site.creek && geo.creekZ ? geo : null;
  const gh = (geo.creekHalf ?? 0.7) + BANK;
  const out: PlannedRun[] = [];
  let lineLen = 0, held = 0, crossings = 0, barsLen = 0, gateCount = 0;
  let gateNote: string | null = null;

  // the road gate: the nearest point on any loop to the farm gate (else the middle of the eastmost side)
  let gateAt: { loop: Loop; s: number } | null = null;
  if (loops.length) {
    if (geo.roadGate) {
      for (const l of loops) { const n = l.nearest(geo.roadGate[0], geo.roadGate[1]); if (!gateAt || n.d < gateAt.loop.nearest(geo.roadGate[0], geo.roadGate[1]).d) gateAt = { loop: l, s: n.s }; }
    } else {
      const l = loops[0], maxX = Math.max(...l.pts.map(p => p[0]));
      let bestLen = 0, mid = 0;
      for (let i = 0; i < l.pts.length; i++) {
        const a = l.pts[i], b = l.pts[(i + 1) % l.pts.length];
        const len = l.cum[i + 1] - l.cum[i];
        if (Math.abs(a[0] - maxX) < 1e-6 && Math.abs(b[0] - maxX) < 1e-6 && len > bestLen) { bestLen = len; mid = l.cum[i] + len / 2; }
      }
      gateAt = { loop: l, s: mid };
    }
  }

  for (const loop of loops) {
    const L = loop.length, N = Math.max(8, Math.ceil(L / STEP)), seg = L / N;
    lineLen += L;
    const mid = (i: number) => loop.at((i + 0.5) * seg);
    // where the creek crosses this stretch of line
    const creekCut = new Array<boolean>(N).fill(false);
    if (creek) {
      let prev = Math.sign(loop.at(0)[1] - creek.creekZ!(loop.at(0)[0]));
      for (let i = 1; i <= N; i++) {
        const [x, z] = loop.at((i % N) * seg), sg = Math.sign(z - creek.creekZ!(x));
        if (sg !== 0 && prev !== 0 && sg !== prev) {
          crossings++;
          const reach = Math.ceil(gh / seg);
          for (let k = -reach; k <= reach; k++) creekCut[(((i - 1 + k) % N) + N) % N] = true;
        }
        if (sg !== 0) prev = sg;
      }
    }
    // stretches something already holds
    const heldCut = Array.from({ length: N }, (_, i) => { const [x, z] = mid(i); return walls.some(r => distToPolyline(r.pts, x, z) <= REACH); });
    const barCut = Array.from({ length: N }, (_, i) => { const [x, z] = mid(i); return bars.some(r => distToPolyline(r.pts, x, z) <= REACH); });
    held += heldCut.reduce((a, c, i) => a + (c && !creekCut[i] ? seg : 0), 0);
    const wallCut = creekCut.map((c, i) => c || heldCut[i]);
    const intervals = (cut: readonly boolean[]): Array<[number, number]> => {
      // maximal runs of false (cyclic), as [start index, length in segments]
      if (cut.every(c => !c)) return [[0, N]];
      const start = cut.findIndex(c => c);
      const res: Array<[number, number]> = [];
      let k = 0;
      while (k < N) {
        const i = (start + k) % N;
        if (cut[i]) { k++; continue; }
        let n = 0;
        while (k + n < N && !cut[(start + k + n) % N]) n++;
        res.push([i, n]);
        k += n;
      }
      return res;
    };
    // the wall
    const wallRuns: Array<{ s0: number; s1: number; closed: boolean }> = intervals(wallCut)
      .map(([i, n]) => ({ s0: i * seg, s1: (i + n) * seg, closed: n === N }))
      .filter(r => r.closed || r.s1 - r.s0 >= MIN_RUN);
    for (const w of wallRuns) {
      let s0 = w.s0, s1 = w.s1;
      // a closed loop starts opposite the gate so the seam is nowhere near it
      if (w.closed) { s0 = gateAt && gateAt.loop === loop ? gateAt.s + L / 2 : 0; s1 = s0 + L; }
      const gates: Gate[] = [];
      const pts = loop.slice(s0, s1);
      if (gateAt && gateAt.loop === loop) {
        const rel = (((gateAt.s - s0) % L) + L) % L, len = s1 - s0;
        if (rel <= len && len >= ROAD_GATE_W + 0.4) gates.push({ at: Math.min(len - ROAD_GATE_W / 2 - 0.05, Math.max(ROAD_GATE_W / 2 + 0.05, rel)), w: ROAD_GATE_W });
      }
      out.push({ kind, pts, gates });
      gateCount += gates.length;
    }
    // the bars across the creek
    if (creek) for (const [i, n] of intervals(creekCut.map(c => !c))) {
      if (n === N) continue;
      // `intervals` of the inverse gives the creek gaps; leave those a bar run already stands in
      const mids = Array.from({ length: n }, (_, k) => (i + k) % N);
      if (mids.every(k => barCut[k])) continue;
      const pts = loop.slice(i * seg, (i + n) * seg);
      out.push({ kind: 'creek_bars', pts, gates: [] });
      barsLen += n * seg;
    }
  }
  if (gateAt && gateCount === 0) gateNote = loops.length && out.some(r => r.kind === kind) ? 'the road side is already walled' : null;

  const bill: Partial<Stock> = {};
  for (const r of out) for (const [m, q] of Object.entries(runBill(r.kind, wallLength(r))) as Array<[MaterialId, number]>) bill[m] = (bill[m] ?? 0) + q;
  const buy = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, qty]) => ({ material, qty }));
  const own = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price === null).map(([material, qty]) => ({ material, qty }));
  const hours = out.reduce((a, r) => a + runHours(r.kind, wallLength(r)), 0);
  const wallM = out.filter(r => r.kind !== 'creek_bars').reduce((a, r) => a + wallLength(r), 0) * M;
  return { kind, runs: out, wallM: Math.round(wallM), barsM: Math.round(barsLen * M), heldM: Math.round(held * M), lineM: Math.round(lineLen * M), creekCrossings: crossings, gates: gateCount, gateNote, bill, cost: orderCost(buy), own, hours: Math.round(hours) };
}

/** Lay the plan out: every run goes on the list for the family to build. Returns how many runs. */
export function layPropertyWall(s: GameState, plan: WallPlan): number {
  for (const r of plan.runs) planRun(s, r.kind, r.pts.map(p => [p[0], p[1]] as Pt), r.gates.map(g => ({ ...g })), 0, true);
  if (plan.runs.length) log(s, `Laid out the property wall: ${plan.wallM} m of ${PERIMETER[plan.kind].name.toLowerCase()}${plan.barsM ? `, ${plan.barsM} m of creek bars` : ''}${plan.gates ? ', a gate on the road' : ''}.`);
  return plan.runs.length;
}
