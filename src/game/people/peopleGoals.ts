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
}

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
