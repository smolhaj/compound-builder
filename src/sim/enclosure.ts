/**
 * Is the property line closed? The old barrier measure counted how much wall
 * there was; this walks the boundary of the land the family owns and asks how
 * well each stretch of it is actually held, so a gap, an open gate or an
 * unbarred creek is where the raiders come in. Pure (tested).
 *
 *  - Every metre or so of the boundary takes the best wall within reach of it
 *    (people-blocking × growth; a gate counts 0.6 of the run it is in).
 *  - Barrier = the average hold; any open stretch (hold < 0.2) is a way in, so
 *    it cuts the barrier to 60 % of that, less the share of the line it is.
 *  - A creek through the place crosses the line twice (in on the west, out on
 *    the east). Each crossing needs creek bars; with either open the creek is
 *    the way round every wall and gate, and the barrier can't pass 35.
 */
import { PERIMETER, PREDATOR_BLOCK, peopleBlock, runFinished, runGrowth, type PerimeterRun, type Pt } from './perimeter';
import type { Rect } from './land';
import type { GameState } from './state';
import { GARAGE_HOLD, garageHolds } from './garage';

/** Closest approach of a point to a polyline, and how far along it that is. */
export function nearest(pts: readonly Pt[], x: number, z: number): { d: number; s: number } {
  let best = { d: Infinity, s: 0 }, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best.d) best = { d, s: acc + t * l };
    acc += l;
  }
  return best;
}

/** Points along the outer boundary of the owned rectangles (none where two of them meet), about `step` apart. */
export function ringPoints(rects: readonly Rect[], step = 1): Pt[] {
  const out: Pt[] = [];
  // a boundary point is on the outer line when a step outward from it leaves every owned rectangle
  const covered = (x: number, z: number) => rects.some(r => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6);
  for (const r of rects) {
    const sides: Array<[Pt, Pt, Pt]> = [[[r.x0, r.z0], [r.x1, r.z0], [0, -1]], [[r.x1, r.z0], [r.x1, r.z1], [1, 0]], [[r.x1, r.z1], [r.x0, r.z1], [0, 1]], [[r.x0, r.z1], [r.x0, r.z0], [-1, 0]]];
    for (const [a, b, nrm] of sides) {
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
      for (let i = 0; i < n; i++) {
        const x = a[0] + (b[0] - a[0]) * (i + 0.5) / n, z = a[1] + (b[1] - a[1]) * (i + 0.5) / n;
        if (!covered(x + nrm[0] * 0.05, z + nrm[1] * 0.05)) out.push([x, z]);
      }
    }
  }
  return out;
}

export const ownedRects = (s: GameState): Rect[] => [s.site.home, ...s.land.parcels.filter(p => p.owner === 'you').map(p => p.rect)];

/** How far a wall may sit from the line and still hold it (≈ 4.5 m). */
const REACH = 0.75;
/** A closed gate holds less than the fence it hangs in. */
const GATE_HOLD = 0.6;
/** What a creek left open caps the barrier at. */
export const CREEK_OPEN_CAP = 35;

export interface Enclosure {
  /** 0–100: how well the whole line holds. */
  barrier: number;
  /** Share (0–1) of the line that is open (nothing, or a barely-there fence). */
  openShare: number;
  /** Length of line, world units (≈ 6 m). */
  length: number;
  /** Creek crossings with no bars yet (0–2). */
  creekOpen: number;
  /** Where the line is open, a few sample points for the player to look at. */
  gaps: Pt[];
  /** Runs that lie along the property line (they count here, not as a compound ring). */
  onLine: Set<string>;
}

/** Who the line is held against: raiders (the default), predators (bears, cougars, wolves, coyotes) or hooved game. */
export type Against = 'people' | 'predators' | 'hoofed';
/** A stretch of line below this hold is open, per `Against` (people keep the old 0.2; a bear walks through anything under a solid fence). */
const OPEN_BELOW: Record<Against, number> = { people: 0.2, predators: 0.5, hoofed: 0.5 };
/** What a run holds against `who` right now (before growth and gates). */
function holdOf(s: GameState, r: PerimeterRun, who: Against): number {
  if (who === 'predators') return PREDATOR_BLOCK[r.kind];
  if (who === 'hoofed') return r.kind === 'creek_bars' ? 1 : PERIMETER[r.kind].blocks.animals;
  return peopleBlock(s, r);
}

export function enclosure(s: GameState, t = s.clock.t, who: Against = 'people'): Enclosure {
  const rects = ownedRects(s);
  const ring = ringPoints(rects);
  const openBelow = OPEN_BELOW[who];
  // a gate is shut unless somebody is at it (a crew at the gate, a raid): then it is a hole in the line for animals too
  const gateHold = who === 'people' ? GATE_HOLD : s.gate.pending ? 0 : 0.95;
  const runs = s.perimeter.filter(r => runFinished(r) && r.kind !== 'creek_bars' && holdOf(s, r, who) > 0 && r.pts.length > 1);
  // creek bars that stand on the line close the gap the wall leaves at the creek (bars out in the middle of the place touch no ring point)
  const holders = [...runs, ...s.perimeter.filter(r => runFinished(r) && r.kind === 'creek_bars' && r.pts.length > 1)];
  let sum = 0, open = 0;
  const gaps: Pt[] = [];
  for (const [x, z] of ring) {
    let hold = 0;
    for (const r of holders) {
      const { d, s: along } = nearest(r.pts, x, z);
      if (d > REACH) continue;
      const gate = r.gates.find(g => Math.abs(along - g.at) <= g.w / 2);
      // a finished gatehouse garage fills its gap: nearly as good as the wall (steel gates, roll-up doors); for animals it is shut unless somebody is at the gate
      const garaged = !!gate?.garage && garageHolds(s, x, z);
      const gateF = garaged ? (who === 'people' ? GARAGE_HOLD : s.gate.pending ? 0.5 : 1) : gate ? gateHold : 1;
      hold = Math.max(hold, holdOf(s, r, who) * runGrowth(r, t) * gateF);
    }
    sum += hold;
    if (hold < openBelow) { open++; if (gaps.length < 8 && (open - 1) % 6 === 0) gaps.push([x, z]); }
  }
  const n = Math.max(1, ring.length), avg = sum / n, openShare = open / n;
  let barrier = 100 * avg * (open === 0 ? 1 : 0.6 * (1 - openShare));
  // the creek: in at the west, out at the east; bars west or east of the middle of the place count for that crossing
  let creekOpen = 0;
  if (s.site.creek) {
    const mid = (s.site.home.x0 + s.site.home.x1) / 2;
    const bars = s.perimeter.filter(r => r.kind === 'creek_bars' && runFinished(r) && r.pts.length > 1);
    const x = (r: typeof bars[number]) => r.pts.reduce((a, p) => a + p[0], 0) / r.pts.length;
    creekOpen = (bars.some(r => x(r) < mid) ? 0 : 1) + (bars.some(r => x(r) >= mid) ? 0 : 1);
    if (creekOpen > 0) barrier = Math.min(barrier, CREEK_OPEN_CAP);
  }
  // which runs are the property line itself: nearly all of their length lies within reach of it (a compound ring that only touches the line is not it)
  const onLine = new Set<string>();
  for (const r of runs) {
    let near = 0, tot = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
      for (let j = 0; j < k; j++) {
        const x = ax + (bx - ax) * (j + 0.5) / k, z = az + (bz - az) * (j + 0.5) / k;
        tot++;
        if (ring.some(([px, pz]) => Math.hypot(px - x, pz - z) <= REACH)) near++;
      }
    }
    if (tot > 0 && near / tot >= 0.8) onLine.add(r.id);
  }
  return { barrier: Math.min(100, barrier), openShare, length: n, creekOpen, gaps, onLine };
}
