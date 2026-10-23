/**
 * Where each family member should be and what they look like doing it,
 * from their sim task (pure; tested). The renderer walks them there.
 *
 *  build    a work spot along the structure's walls (spread by person), facing in
 *  chores   round the camp / home: fire, water barrel, woodpile
 *  school   kids at the camp table (seated)
 *  leisure  evenings sat round the fire; daytime kids roam near camp
 *  sleep    inside the tent / cabin (hidden once there)
 */
import { FIG_POSE } from '../../engine/world/people/figureKit';
import { CAMP } from '../props/campGeometry';
import type { TaskKind } from '../../sim/state';

export interface Site { x: number; z: number; rot: number; w: number; d: number }

export interface GoalCtx {
  /** Camp centre (world) and its rotation. */
  camp: { x: number; z: number; rot: number };
  /** The structure a builder works on. */
  site: (id: string) => Site | null;
  /** Finished home (cabin centre) — the family sleeps there once it stands. */
  home: Site | null;
  /** A felling job's tree: where it stands, which way it fell, how long it is. */
  tree?: (jobId: string) => WorkTree | null;
  /** Stockpile yard (logs are skidded here). */
  yard?: { x: number; z: number };
}

export interface WorkTree { x: number; z: number; scale: number; stage: 'marked' | 'felled' | 'bucked'; fall: number; len: number }

export interface Goal {
  x: number;
  z: number;
  pose: number;
  /** Heading to face once there (radians, figure faces +z at 0), or null = keep. */
  face: number | null;
  /** Hidden once arrived (asleep indoors). */
  hidden: boolean;
  /** Working motion (hammering / kneeling) once there. */
  work: boolean;
}

/** Rotate a camp-local point into the world. */
function campPt(ctx: GoalCtx, lx: number, lz: number): [number, number] {
  const c = Math.cos(ctx.camp.rot), s = Math.sin(ctx.camp.rot);
  return [ctx.camp.x + lx * c + lz * s, ctx.camp.z - lx * s + lz * c];
}

const faceTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

/** A stable per-person random 0–1 that changes every `period` of `clock`. */
export function wobble(i: number, clock: number, period: number): number {
  const k = Math.floor(clock / period) + i * 97.13;
  const x = Math.sin(k * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function goalFor(i: number, kid: boolean, task: TaskKind, target: string | null, hour: number, ctx: GoalCtx, clock = 0): Goal {
  const fire = campPt(ctx, CAMP.fire.x, CAMP.fire.z);
  switch (task) {
    case 'build': {
      const st = target ? ctx.site(target) : null;
      if (st) {
        // spots round the walls, just outside them, spread by person index
        const spots: Array<[number, number]> = [[0.35, 1], [-1, 0.2], [1, -0.3], [-0.3, -1], [1, 0.45], [-1, -0.5]];
        const [u, v] = spots[i % spots.length];
        const lx = u * (st.w / 2 + 0.12), lz = v * (st.d / 2 + 0.12);
        const c = Math.cos(st.rot), s = Math.sin(st.rot);
        const x = st.x + lx * c + lz * s, z = st.z - lx * s + lz * c;
        return { x, z, pose: FIG_POSE.REACH, face: faceTo(x, z, st.x, st.z), hidden: false, work: true };
      }
      break;
    }
    case 'forestry': {
      const t = target && ctx.tree ? ctx.tree(target) : null;
      if (!t) break;
      const dx = Math.sin(t.fall), dz = Math.cos(t.fall), side = i % 2 ? 1 : -1;
      if (t.stage === 'marked') {
        // at the trunk on the back-cut side (away from the fall), saw in hand
        const x = t.x - dx * (0.07 * t.scale + 0.06) + dz * 0.05 * side, z = t.z - dz * (0.07 * t.scale + 0.06) - dx * 0.05 * side;
        return { x, z, pose: FIG_POSE.KNEEL, face: faceTo(x, z, t.x, t.z), hidden: false, work: true };
      }
      if (t.stage === 'felled') {
        // limbing and bucking along the log, each at their own cut
        const f = 0.2 + 0.25 * (i % 3);
        const lx = t.x + dx * t.len * f, lz = t.z + dz * t.len * f;
        const x = lx + dz * 0.09 * side, z = lz - dx * 0.09 * side;
        return { x, z, pose: FIG_POSE.REACH, face: faceTo(x, z, lx, lz), hidden: false, work: true };
      }
      // skidding: back and forth between the log sections and the yard
      const y = ctx.yard ?? ctx.camp;
      const toYard = wobble(i, clock, 0.03) < 0.5;
      const [tx, tz] = toYard ? [y.x - 0.3 + 0.1 * i, y.z - 0.9] : [t.x + dx * t.len * 0.3, t.z + dz * t.len * 0.3];
      return { x: tx + dz * 0.08 * side, z: tz - dx * 0.08 * side, pose: FIG_POSE.CARRY, face: null, hidden: false, work: false };
    }
    case 'school': {
      const [x, z] = campPt(ctx, CAMP.table.x + (i % 2 ? 0.07 : -0.07), CAMP.table.z + 0.12);
      const [tx, tz] = campPt(ctx, CAMP.table.x, CAMP.table.z);
      return { x, z, pose: FIG_POSE.BENCH, face: faceTo(x, z, tx, tz), hidden: false, work: false };
    }
    case 'sleep': {
      if (ctx.home) return { x: ctx.home.x, z: ctx.home.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
      const [x, z] = campPt(ctx, CAMP.tent.x + (i - 1.5) * 0.08, CAMP.tent.z);
      return { x, z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
    }
    case 'leisure': {
      if (ctx.home && (hour >= 18 || hour < 6)) {
        // evenings at home: round the table, or in the armchairs by the stove (cabin seats, local frame)
        const seats: Array<[number, number, number, number]> = [[-0.295, -0.08, -0.25, 0.02], [-0.205, 0.12, -0.25, 0.02], [0.11, -0.34, 0.26, -0.62], [0.38, -0.33, 0.26, -0.62]];
        const [sx, sz, fx, fz] = seats[i % seats.length];
        const h = ctx.home, c = Math.cos(h.rot), sn = Math.sin(h.rot);
        const w = (lx: number, lz: number): [number, number] => [h.x + lx * c + lz * sn, h.z - lx * sn + lz * c];
        const [x, z] = w(sx, sz), [tx, tz] = w(fx, fz);
        return { x, z, pose: FIG_POSE.BENCH, face: faceTo(x, z, tx, tz), hidden: false, work: false };
      }
      if (hour >= 18 || hour < 6 || !kid) {
        // round the fire, each in their own place
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const x = fire[0] + Math.cos(a) * 0.2, z = fire[1] + Math.sin(a) * 0.2;
        return { x, z, pose: FIG_POSE.LAWN, face: faceTo(x, z, fire[0], fire[1]), hidden: false, work: false };
      }
      // kids roam near camp, a new spot every couple of game hours
      const a = wobble(i, clock, 0.08) * Math.PI * 2, r = 0.6 + 1.6 * wobble(i + 9, clock, 0.08);
      const [x, z] = campPt(ctx, Math.cos(a) * r, Math.sin(a) * r);
      return { x, z, pose: FIG_POSE.STAND, face: null, hidden: false, work: false };
    }
    default: break;
  }
  // chores (and building with nothing to build): fire, barrel, woodpile by turns
  const spots: Array<[number, number, number]> = [
    [CAMP.fire.x + 0.13, CAMP.fire.z, FIG_POSE.KNEEL],
    [CAMP.barrel.x + 0.08, CAMP.barrel.z + 0.06, FIG_POSE.STAND],
    [CAMP.table.x - 0.18, CAMP.table.z - 0.12, FIG_POSE.REACH],
    [CAMP.tent.x - 0.32, CAMP.tent.z + 0.2, FIG_POSE.KNEEL],
  ];
  const [lx, lz, pose] = spots[(i + Math.floor(wobble(i, clock, 0.05) * 4)) % spots.length];
  const [x, z] = campPt(ctx, lx, lz);
  return { x, z, pose, face: faceTo(x, z, fire[0], fire[1]), hidden: false, work: pose !== FIG_POSE.STAND };
}
