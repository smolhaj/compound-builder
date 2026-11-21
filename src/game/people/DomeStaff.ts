/**
 * The people of the arcology's control block (visual only: no sim reads them): operators seated at the console desks and one standing at the wall of screens, and two staff
 * who walk the footpaths between the dome's airlocks and the block's door. They are instances of the household's own figure layer (FamilyRenderer extras), dressed with the
 * figure kit's persona wear, no weapons. Poses are a pure function of time (`staffAt`), tested in DomeStaff.test.ts. SCALE v2: a person 0.28 tall, a chair seat 0.075.
 */
import { FIG_POSE, stridePhase, type FigurePose } from '../../engine/world/people/figureKit';
import { pickPersonaWear, type Wear } from '../../engine/world/people/crowdWear';
import type { ControlBlockPlan, Pt } from '../../sim/dome/controlBlock';
import { fromBlock } from '../../sim/dome/controlBlock';
import { detailTier } from '../buildkit/buildingDetail';

export interface StaffSpec { plan: ControlBlockPlan; /** The dome's centre in the world and the floor height inside it. */ ox: number; oz: number; y: number }
export interface StaffFigure { wear: Wear; pose: FigurePose }

const lcg = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
/** Walking pace of the staff (world units per second): an unhurried walk. */
export const STAFF_PACE = 0.34;
/** Seconds a walker waits at each end of the route (a word at the door, a look at the board). */
export const STAFF_PAUSE = 3.5;

/** Seats at the consoles in block-local terms: (x, z of the chair), as laid out in buildkit/domeControl.ts (row A at z -0.04, row B at z 0.42, chairs 0.17 behind). */
export const SEATS: ReadonlyArray<[number, number]> = [[-0.62, 0.13], [0, 0.13], [0.56, 0.59]];
/** The supervisor's place behind the second row, facing the wall of screens. */
export const SUPERVISOR: [number, number] = [0.3, 0.2];

const wrapA = (a: number): number => { let d = a % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/** The route a staff member walks: from an airlock's inner door along the footpaths (the ring path between) to the block's landing. `from`: 'yard' or 'gate'. */
export function routeOf(plan: ControlBlockPlan, from: 'yard' | 'gate'): Pt[] {
  const R = plan.ringR, a1 = Math.atan2(plan.landing[0], plan.landing[1]);
  const start = from === 'yard' ? plan.yardDoor : plan.gateDoor;
  const join: Pt = from === 'yard' ? plan.paths[0][1] : [plan.gateDoor[0] * R / Math.hypot(...plan.gateDoor), plan.gateDoor[1] * R / Math.hypot(...plan.gateDoor)];
  const a0 = Math.atan2(join[0], join[1]), da = wrapA(a1 - a0), n = Math.max(1, Math.ceil(Math.abs(da) / 0.12));
  const pts: Pt[] = [start, join];
  for (let i = 1; i <= n; i++) { const a = a0 + da * i / n; pts.push([Math.sin(a) * R, Math.cos(a) * R]); }
  pts.push(plan.landing);
  return pts;
}
const lengthOf = (pts: readonly Pt[]): number => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
/** The point at distance `s` along a polyline and the heading there. */
export function along(pts: readonly Pt[], s: number): { x: number; z: number; rot: number } {
  let rest = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dz = pts[i][1] - pts[i - 1][1], L = Math.hypot(dx, dz);
    if (rest <= L || i === pts.length - 1) { const t = L ? Math.min(1, rest / L) : 0; return { x: pts[i - 1][0] + dx * t, z: pts[i - 1][1] + dz * t, rot: Math.atan2(dx, dz) }; }
    rest -= L;
  }
  return { x: pts[0][0], z: pts[0][1], rot: 0 };
}
/** A walker's state at time t: forward along the route, a pause, back, a pause. */
export function walkerAt(route: readonly Pt[], t: number, offset: number): { x: number; z: number; rot: number; moving: boolean; dist: number } {
  const L = lengthOf(route), leg = L / STAFF_PACE, cycle = 2 * (leg + STAFF_PAUSE), u = (((t + offset) % cycle) + cycle) % cycle;
  if (u < leg) { const q = along(route, u * STAFF_PACE); return { ...q, moving: true, dist: u * STAFF_PACE }; }
  if (u < leg + STAFF_PAUSE) { const q = along(route, L); return { ...q, moving: false, dist: L }; }
  if (u < 2 * leg + STAFF_PAUSE) { const s = L - (u - leg - STAFF_PAUSE) * STAFF_PACE, q = along(route, s); return { x: q.x, z: q.z, rot: q.rot + Math.PI, moving: true, dist: L + (L - s) }; }
  const q = along(route, 0); return { x: q.x, z: q.z, rot: q.rot + Math.PI, moving: false, dist: 2 * L };
}

const wearCache = new Map<number, Wear>();
const wearOf = (i: number): Wear => { let w = wearCache.get(i); if (!w) { w = pickPersonaWear(lcg(7001 + i * 131), 'resident', { season: 'summer', team: null }); w.hasPack = false; wearCache.set(i, w); } return w; };

/** Every figure of one control block at time t (seconds). */
export function staffAt(spec: StaffSpec, t: number, lite = detailTier() !== 'high'): StaffFigure[] {
  // (Medium and Low draw four of the six: the figure layer's triangles count against the dome's budget)
  const { plan, ox, oz, y } = spec, out: StaffFigure[] = [], P = (lx: number, lz: number): Pt => fromBlock(plan, lx, lz);
  const facing = plan.yaw + Math.PI;           // (toward the wall of screens: local -z)
  SEATS.forEach(([lx, lz], i) => { if (lite && i === 1) return; const [x, z] = P(lx, lz); out.push({ wear: wearOf(i), pose: { x: ox + x, y, z: oz + z, rot: facing + (i === 1 ? 0.15 * Math.sin(t * 0.3 + i) : 0), scale: 1, pose: FIG_POSE.BENCH, phase: i * 2.1, amp: 0, look: 0.2 * Math.sin(t * 0.4 + i * 1.7) } }); });
  { const [x, z] = P(...SUPERVISOR); out.push({ wear: wearOf(3), pose: { x: ox + x, y, z: oz + z, rot: facing + 0.25 * Math.sin(t * 0.2), scale: 1, pose: FIG_POSE.STAND, phase: 1, amp: 0 } }); }
  (['yard', 'gate'] as const).forEach((from, i) => {
    if (lite && i === 1) return;
    const w = walkerAt(routeOf(plan, from), t, i * 17);
    out.push({ wear: wearOf(4 + i), pose: { x: ox + w.x, y, z: oz + w.z, rot: w.rot, scale: 1, pose: FIG_POSE.STAND, phase: w.moving ? stridePhase(w.dist, 1, 0.5) : 0, amp: w.moving ? 0.5 : 0 } });
  });
  return out;
}
