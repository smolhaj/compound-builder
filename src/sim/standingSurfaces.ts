/**
 * What a person can really stand on in a raid scene (user rule: nobody is elevated unless a real surface exists under them). Pure.
 *
 * A palisade, a stone wall and a container wall come with a fighting step on the inside: a plank platform on posts (palisade), a stone ledge (stone
 * wall) or a bench of crates (container wall), whose top is `stepHeight(kind, wallHeight)` above the ground so that a defender's rifle just clears
 * the wall (sim/lineOfFire.ts `FIRING_STEP`). It is DRAWN (game/perimeter/perimeterGeometry.ts uses `STEP_NEAR`, `STEP_FAR` and `stepSide` from here),
 * and the battle sim puts a defender up on it only where `stepHeightAt` says it exists, so sim and picture cannot disagree. The other surfaces
 * (a wall-top deck, a tower's cab, a house's upper floor) are real buildings and are listed by the tests, not here.
 */
import { FIRING_STEP, stepHeight } from './lineOfFire';
import { PERIMETER, runFinished, type PerimeterRun } from './perimeter';

/** The step lies this far behind the wall's center line (world units, 1 = 6 m): from its inner face to a little over a meter. */
export const STEP_NEAR = 0.05, STEP_FAR = 0.36;
type Pt = readonly [number, number];

/** Which side of a run the step is on: +1 left of the direction of travel, -1 right. A closed loop has it on the inside; an open run on the left. */
export function stepSide(pts: readonly Pt[]): 1 | -1 {
  const a = pts[0], z = pts[pts.length - 1];
  if (pts.length < 4 || Math.hypot(a[0] - z[0], a[1] - z[1]) > 0.5) return 1;
  // shoelace sum (x east, z south): positive when the loop runs clockwise on the map, which puts the LEFT of travel on the inside
  let area = 0;
  for (let i = 1; i < pts.length; i++) area += pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1];
  return area > 0 ? 1 : -1;
}

function lengthOf(pts: readonly Pt[]): number { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

/** Solid intervals along a run (gates removed). */
export function spansOf(run: Pick<PerimeterRun, 'pts' | 'gates'>): Array<[number, number]> {
  const L = lengthOf(run.pts);
  const gaps = run.gates.map(g => [g.at - g.w / 2, g.at + g.w / 2] as const).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let s = 0;
  for (const [g0, g1] of [...gaps, [L, L] as const]) { const e = Math.min(g0, L); if (e > s) out.push([s, e]); s = Math.max(s, g1); }
  return out;
}

export interface StepSeg { runId: string; kind: string; ax: number; az: number; bx: number; bz: number; /** Unit normal toward the step's side. */ nx: number; nz: number; /** Height of the step's top above the ground. */ y: number }

/** The stretches of drawn fighting step: the finished solid spans of the runs that have one, cut along their bends. */
export function stepSegments(runs: readonly Pick<PerimeterRun, 'id' | 'kind' | 'pts' | 'gates' | 'finishedAt'>[]): StepSeg[] {
  const out: StepSeg[] = [];
  for (const run of runs) {
    if (run.finishedAt === null || !FIRING_STEP.has(run.kind as never) || run.pts.length < 2) continue;
    const def = PERIMETER[run.kind as keyof typeof PERIMETER];
    if (!def) continue;
    const side = stepSide(run.pts), y = stepHeight(run.kind, def.height);
    if (y <= 0) continue;
    for (const [s0, s1] of spansOf(run)) {
      // walk the polyline, clipping each piece to [s0, s1]
      let acc = 0;
      for (let i = 1; i < run.pts.length; i++) {
        const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i], l = Math.hypot(bx - ax, bz - az);
        const lo = Math.max(s0, acc), hi = Math.min(s1, acc + l);
        if (hi > lo + 1e-6 && l > 0) {
          const ux = (bx - ax) / l, uz = (bz - az) / l;
          out.push({ runId: run.id, kind: run.kind, ax: ax + ux * (lo - acc), az: az + uz * (lo - acc), bx: ax + ux * (hi - acc), bz: az + uz * (hi - acc), nx: -uz * side, nz: ux * side, y });
        }
        acc += l;
      }
    }
  }
  return out;
}

/** The height of a drawn fighting step at a point (null: none there). */
export function stepHeightAt(segs: readonly StepSeg[], x: number, z: number): number | null {
  for (const g of segs) {
    const dx = g.bx - g.ax, dz = g.bz - g.az, l = Math.hypot(dx, dz);
    if (l < 1e-9) continue;
    const t = ((x - g.ax) * dx + (z - g.az) * dz) / l, d = (x - g.ax) * g.nx + (z - g.az) * g.nz;
    if (t >= -0.02 && t <= l + 0.02 && d >= STEP_NEAR && d <= STEP_FAR) return g.y;
  }
  return null;
}

export { runFinished };
