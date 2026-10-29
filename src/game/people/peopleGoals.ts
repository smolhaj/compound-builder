/**
 * Where each family member should be and what they look like doing it,
 * from their sim task (pure; tested). The renderer walks them there.
 *
 *  build    a work spot along the structure's walls (spread by person), facing in
 *  chores   round the camp / home: fire, water barrel, woodpile
 *  school   kids at the camp table (seated)
 *  leisure  evenings sat round the fire; daytime kids roam near camp
 *  sleep    inside the tent / cabin (hidden once there)
 *  daily life (sim/daily.ts): hoeing / weeding the garden and fields, feed
 *  pails at the coop, the axe at the chopping block and stacking, buckets
 *  between the well and the house, stirring at the fire pit, laundry at the
 *  line and the tub, a hammer at the fence, the watch (tower, a rifle along
 *  the wall, the gate), meals at the picnic table, a gathering round the fire
 */
import { FIG_POSE, FIG_TOOL } from '../../engine/world/people/figureKit';
import { CAMP } from '../props/campGeometry';
import { YARD } from '../props/yardGeometry';
import type { TaskKind } from '../../sim/state';

export interface Site { x: number; z: number; rot: number; w: number; d: number; /** Evening seats (local x, z, face x, z). */ seats?: ReadonlyArray<readonly [number, number, number, number]> }

export interface GoalCtx {
  /** Camp center (world) and its rotation. */
  camp: { x: number; z: number; rot: number };
  /** The structure a builder works on. */
  site: (id: string) => Site | null;
  /** Finished home (cabin center) — the family sleeps there once it stands. */
  home: Site | null;
  /** A felling job's tree: where it stands, which way it fell, how long it is. */
  tree?: (jobId: string) => WorkTree | null;
  /** Stockpile yard (logs are skidded here). */
  yard?: { x: number; z: number };
  /** Where the daily work happens (finished structures, the wall). */
  spots?: WorkSpots;
  /** The watch post of a person (sim/daily.ts watchNow), by id order of the people. */
  post?: (i: number) => 'tower' | 'wall' | 'gate';
  /** Fine weather for eating outdoors. */
  outdoors?: boolean;
  /** Anyone carries a long gun on watch. */
  armed?: boolean;
  /** Where person `i` sleeps tonight (sim/housing.ts sleepSpotFor): the kind of place, the structure or tent it is in, and which seat. */
  sleepAt?: (i: number) => { kind: string; where: string | null; slot: number } | null;
  /** Pace multiplier at a point (game/paths: a little quicker on a path, slower in mud off one); 1 = open dry ground. */
  footing?: (x: number, z: number) => number;
  /** The points to pass through to keep to the paths between two points ([] = straight). */
  via?: (fx: number, fz: number, tx: number, tz: number) => ReadonlyArray<readonly [number, number]>;
  /** The yard position of dome tent `n` (props/TentsRenderer). */
  tentAt?: (n: number) => { x: number; z: number } | undefined;
}

export interface WorkSpots {
  gardens: Site[];
  fields: Site[];
  coops: Site[];
  barns: Site[];
  /** Well, cistern or filter shed (where the water comes from). */
  water: { x: number; z: number } | null;
  towers: Array<{ x: number; z: number }>;
  /** Points along the finished wall / fence, in order (patrol). */
  wall: Array<[number, number]>;
  /** Height of the wall-top walkway the patrol walks on (world units), or 0 when the wall has none (sim/walkway.ts). */
  wallY?: number;
  /** The drive's gate (or where the drive meets the yard). */
  gate: { x: number; z: number } | null;
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
  /** Tool in hand (FIG_TOOL). */
  tool?: number;
  /** Height above the ground (a tower deck). */
  y?: number;
  /** Pose while walking there (a rifle carried, buckets). */
  walkPose?: number;
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
        return { x, z, pose: FIG_POSE.REACH, face: faceTo(x, z, st.x, st.z), hidden: false, work: true, tool: FIG_TOOL.HAMMER };
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
        return { x, z, pose: FIG_POSE.CHOP, face: faceTo(x, z, lx, lz), hidden: false, work: true, tool: FIG_TOOL.AXE };
      }
      // skidding: back and forth between the log sections and the yard
      const y = ctx.yard ?? ctx.camp;
      const toYard = wobble(i, clock, 0.03) < 0.5;
      const [tx, tz] = toYard ? [y.x - 0.3 + 0.1 * i, y.z - 0.9] : [t.x + dx * t.len * 0.3, t.z + dz * t.len * 0.3];
      return { x: tx + dz * 0.08 * side, z: tz - dx * 0.08 * side, pose: FIG_POSE.CARRY, face: null, hidden: false, work: false };
    }
    case 'gone':
    case 'away':
    case 'town':
    case 'shelter':
    case 'job': {
      // in town at the day job: off the land
      return { x: ctx.camp.x, z: ctx.camp.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
    }
    case 'school': {
      const [x, z] = campPt(ctx, CAMP.table.x + (i % 2 ? 0.07 : -0.07), CAMP.table.z + 0.12);
      const [tx, tz] = campPt(ctx, CAMP.table.x, CAMP.table.z);
      return { x, z, pose: FIG_POSE.BENCH, face: faceTo(x, z, tx, tz), hidden: false, work: false };
    }
    case 'sleep': {
      // sim/housing.ts decides WHERE (bed, couch, floor bag, tent, nowhere); the schedule (sim/daily.ts) decides WHEN
      const sp = ctx.sleepAt?.(i);
      const b = sp?.where && !sp.where.startsWith('tent:') ? ctx.site(sp.where) : null;
      if (sp && sp.where?.startsWith('tent:') && sp.where !== 'tent:wall') {
        const t = ctx.tentAt?.(Number(sp.where.slice(5)));
        if (t) return { x: t.x, z: t.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
      }
      if (sp && b && sp.kind !== 'bed') {
        // lying where they sleep, inside the building (seen when the roof is cut away): the sofa, a bag on the floor, a bunk, or on the porch
        const c = Math.cos(b.rot), s = Math.sin(b.rot);
        const w = (lx: number, lz: number): [number, number] => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
        const row = sp.slot % 6, line = Math.floor(sp.slot / 6);
        const [lx, lz] = sp.kind === 'couch' ? [-0.2 * b.w, -0.2 * b.d + 0.1 * sp.slot]
          : sp.kind === 'nowhere' ? [(row - 2.5) * 0.1, 0.5 * b.d + 0.12]
          : [(row - 2.5) * 0.1 * Math.min(1.5, b.w), 0.15 * b.d - line * 0.14];
        const [x, z] = w(lx, lz);
        return { x, z, pose: FIG_POSE.LAWN, face: b.rot + (sp.kind === 'couch' ? Math.PI : Math.PI / 2), hidden: false, work: false, y: sp.kind === 'nowhere' ? undefined : 0.1 };
      }
      if (sp?.where === 'tent:wall') { const [x, z] = campPt(ctx, CAMP.tent.x + (i - 1.5) * 0.05, CAMP.tent.z); return { x, z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false }; }
      if (ctx.home) return { x: ctx.home.x, z: ctx.home.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
      // no house yet: asleep in the camp's wall tent (hidden)
      const [x, z] = campPt(ctx, CAMP.tent.x + (i - 1.5) * 0.1, CAMP.tent.z + 0.1);
      return { x, z, pose: FIG_POSE.LAWN, face: ctx.camp.rot + Math.PI / 2, hidden: false, work: false };
    }
    case 'leisure': {
      if (ctx.home?.seats?.length && (hour >= 18 || hour < 6)) {
        // evenings at home: round the table, or in the chairs by the stove / fire (the home's seats, local frame)
        const seats = ctx.home.seats;
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
    default: {
      const g = dailyGoal(i, kid, task, hour, ctx, clock);
      if (g) return g;
      break;
    }
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

/** A spot inside a structure's footprint (local u, v in −1…1), in the world. */
function inSite(st: Site, u: number, v: number): [number, number] {
  const lx = u * st.w / 2, lz = v * st.d / 2, c = Math.cos(st.rot), sn = Math.sin(st.rot);
  return [st.x + lx * c + lz * sn, st.z - lx * sn + lz * c];
}

const pickOf = <T,>(xs: readonly T[], i: number): T | null => (xs.length ? xs[i % xs.length] : null);

/** The daily-life tasks (sim/daily.ts). Null: fall back to camp chores. */
export function dailyGoal(i: number, kid: boolean, task: TaskKind, hour: number, ctx: GoalCtx, clock: number): Goal | null {
  const sp = ctx.spots;
  const at = (lx: number, lz: number) => campPt(ctx, lx, lz);
  const goal = (x: number, z: number, pose: number, face: number | null, extra: Partial<Goal> = {}): Goal => ({ x, z, pose, face, hidden: false, work: false, ...extra });
  const fire = at(CAMP.fire.x, CAMP.fire.z);
  switch (task) {
    case 'garden':
    case 'fields': {
      const st = pickOf(task === 'garden' ? sp?.gardens ?? [] : sp?.fields ?? [], i);
      if (!st) return null;
      // a new row every half hour or so; hoeing, or down on the knees weeding / digging
      const u = (wobble(i, clock, 0.02) - 0.5) * 1.4, v = (wobble(i + 31, clock, 0.02) - 0.5) * 1.4;
      const [x, z] = inSite(st, u, v);
      const kneel = kid || wobble(i + 7, clock, 0.04) < (task === 'fields' ? 0.5 : 0.35);
      return goal(x, z, kneel ? FIG_POSE.KNEEL : FIG_POSE.HOE, st.rot + (i % 2 ? Math.PI : 0), { work: true, tool: kneel ? FIG_TOOL.NONE : FIG_TOOL.HOE });
    }
    case 'livestock': {
      const st = pickOf(sp?.coops ?? [], i) ?? pickOf(sp?.barns ?? [], i);
      if (!st) return null;
      // out in the run in front of the coop, scattering feed from a pail
      const [x, z] = inSite(st, (wobble(i, clock, 0.015) - 0.5) * 1.2, 1.25);
      return goal(x, z, FIG_POSE.PAIL, faceTo(x, z, st.x, st.z), { tool: FIG_TOOL.PAIL, walkPose: FIG_POSE.PAIL });
    }
    case 'wood': {
      // one splits at the block, the next stacks (carrying splits to the pile)
      if (i % 2 === 0 || kid) {
        const [x, z] = at(YARD.block.x + 0.14, YARD.block.z + 0.02);
        const [bx, bz] = at(YARD.block.x, YARD.block.z);
        return goal(x, z, FIG_POSE.CHOP, faceTo(x, z, bx, bz), { work: true, tool: FIG_TOOL.AXE });
      }
      const toPile = wobble(i, clock, 0.006) < 0.5;
      const [x, z] = toPile ? at(YARD.woodpile.x + 0.08, YARD.woodpile.z + (wobble(i + 3, clock, 0.006) - 0.5) * 0.4) : at(YARD.block.x - 0.05, YARD.block.z + 0.16);
      return goal(x, z, FIG_POSE.KNEEL, toPile ? Math.PI / 2 * -1 + ctx.camp.rot : null, { walkPose: FIG_POSE.CARRY, work: true });
    }
    case 'water': {
      // buckets between the well (or the creek side of camp) and the barrel at the house
      const src = sp?.water ?? { x: at(-0.9, -1.6)[0], z: at(-0.9, -1.6)[1] };
      const [bx, bz] = at(CAMP.barrel.x + 0.1, CAMP.barrel.z + 0.08);
      const there = wobble(i, clock, 0.012) < 0.5;
      const x = there ? src.x + 0.15 : bx, z = there ? src.z + 0.15 : bz;
      return goal(x, z, FIG_POSE.STAND, null, { tool: FIG_TOOL.BUCKETS, walkPose: FIG_POSE.STAND });
    }
    case 'kitchen': {
      // the summer kitchen at the fire pit: stirring the pot, putting up the harvest
      const a = 0.6 + (i % 3) * 0.9;
      const x = fire[0] + Math.cos(a) * 0.13, z = fire[1] + Math.sin(a) * 0.13;
      return goal(x, z, FIG_POSE.STIR, faceTo(x, z, fire[0], fire[1]), { tool: FIG_TOOL.SPOON, work: true });
    }
    case 'cleaning': {
      // scrubbing the step and the porch; inside the house when there is one
      const st = ctx.home;
      if (st) {
        const [x, z] = inSite(st, 1.15, ((i % 3) - 1) * 0.5);
        return goal(x, z, FIG_POSE.KNEEL, faceTo(x, z, st.x, st.z), { work: true });
      }
      const [x, z] = at(CAMP.table.x - 0.25 + (i % 2) * 0.1, CAMP.table.z + 0.2);
      return goal(x, z, FIG_POSE.KNEEL, null, { work: true });
    }
    case 'pets': {
      // the dogs' bowls by the door: a pail of water, then a walk round the yard
      const walk = wobble(i, clock, 0.02) < 0.4;
      const a = wobble(i + 9, clock, 0.01) * Math.PI * 2;
      const [x, z] = walk ? at(Math.cos(a) * 0.9, Math.sin(a) * 0.9 + 0.4) : at(CAMP.barrel.x - 0.25, CAMP.barrel.z + 0.2);
      return goal(x, z, FIG_POSE.PAIL, null, { tool: FIG_TOOL.PAIL, walkPose: FIG_POSE.PAIL, work: !walk });
    }
    case 'laundry': {
      const L = YARD.line;
      if (wobble(i, clock, 0.025) < 0.45) {
        // scrubbing at the tub
        const [x, z] = at(YARD.tub.x - 0.1, YARD.tub.z - 0.08);
        const [tx, tz] = at(YARD.tub.x, YARD.tub.z);
        return goal(x, z, FIG_POSE.KNEEL, faceTo(x, z, tx, tz), { work: true });
      }
      const lx = L.x0 + 0.1 + wobble(i + 5, clock, 0.01) * (L.x1 - L.x0 - 0.2);
      const [x, z] = at(lx, L.z + 0.07), [tx, tz] = at(lx, L.z);
      return goal(x, z, FIG_POSE.HANG, faceTo(x, z, tx, tz), { work: true });
    }
    case 'repairs': {
      const w = sp?.wall ?? [];
      if (w.length >= 2) {
        const k = Math.floor(wobble(i, clock, 0.04) * (w.length - 1));
        const [ax, az] = w[k], [bx, bz] = w[k + 1];
        const u = wobble(i + 11, clock, 0.04);
        const px = ax + (bx - ax) * u, pz = az + (bz - az) * u;
        // inside the line, facing it
        const nx = -(bz - az), nz = bx - ax, nl = Math.hypot(nx, nz) || 1;
        const side = (ctx.camp.x - px) * nx + (ctx.camp.z - pz) * nz > 0 ? 1 : -1;
        const x = px + nx / nl * 0.09 * side, z = pz + nz / nl * 0.09 * side;
        return goal(x, z, FIG_POSE.REACH, faceTo(x, z, px, pz), { work: true, tool: FIG_TOOL.HAMMER });
      }
      const st = ctx.home ?? pickOf(sp?.barns ?? [], i);
      if (!st) return null;
      const [x, z] = inSite(st, 1.15, (i % 2) - 0.5);
      return goal(x, z, FIG_POSE.REACH, faceTo(x, z, st.x, st.z), { work: true, tool: FIG_TOOL.HAMMER });
    }
    case 'medic': {
      // tending the sick: at the door of the house, bent over the bed, not hidden indoors
      const h = ctx.home;
      if (h) {
        const [x, z] = inSite(h, 0.95, 0.25);
        return goal(x, z, FIG_POSE.REACH, faceTo(x, z, h.x, h.z), { work: true });
      }
      return { x: ctx.camp.x, z: ctx.camp.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
    }
    case 'hunt':
    case 'radio': {
      // out in the woods / indoors with the sick / at the set
      const h = ctx.home;
      if (task !== 'hunt' && !h) return null;
      return { x: h?.x ?? ctx.camp.x, z: h?.z ?? ctx.camp.z, pose: FIG_POSE.STAND, face: null, hidden: true, work: false };
    }
    case 'teach': {
      // a teacher and their pupils (lessons, or the Mentor duty) stand side by side at the table, not on one spot
      const [x, z] = at(CAMP.table.x + 0.2 + ((i % 3) - 1) * 0.09, CAMP.table.z + (i % 2 ? 0.07 : -0.05));
      const [tx, tz] = at(CAMP.table.x, CAMP.table.z);
      return goal(x, z, FIG_POSE.REACH, faceTo(x, z, tx, tz), { work: true });
    }
    case 'study': {
      // an evening class: round the table at home, else at the camp table with the books
      if (ctx.home?.seats?.length) return goalFor(i, kid, 'leisure', null, 19, ctx, clock);
      return goalFor(i, kid, 'school', null, hour, ctx, clock);
    }
    case 'drill': {
      // the firing line: side by side past the yard, rifles up, facing out from the camp
      const [x, z] = at(-0.6 + (i % 5) * 0.3, 2.7), [tx, tz] = at(-0.6 + (i % 5) * 0.3, 5);
      return goal(x, z, FIG_POSE.RIFLE, faceTo(x, z, tx, tz), { tool: FIG_TOOL.RIFLE, walkPose: FIG_POSE.RIFLE, work: true });
    }
    case 'watch': {
      const post = ctx.post?.(i) ?? 'gate';
      const rifle = ctx.armed ? FIG_TOOL.RIFLE : FIG_TOOL.NONE, pose = ctx.armed ? FIG_POSE.RIFLE : FIG_POSE.STAND;
      const tower = pickOf(sp?.towers ?? [], 0);
      if (post === 'tower' && tower) return goal(tower.x + 0.05, tower.z + 0.05, pose, faceTo(tower.x, tower.z, ctx.camp.x, ctx.camp.z) + Math.PI, { y: 0.9, tool: rifle, walkPose: pose });
      const w = sp?.wall ?? [];
      if (post === 'wall' && w.length >= 2) {
        // walk the line, a new stretch every quarter hour, pausing to look out
        const k = Math.floor(wobble(i, clock, 0.012) * w.length);
        const [px, pz] = w[k];
        // on a wall-top walkway the guard stands ON the deck (up there, looking out over the line); otherwise just inside the wall
        if (sp?.wallY) return goal(px, pz, pose, faceTo(ctx.camp.x, ctx.camp.z, px, pz) + Math.PI, { y: sp.wallY + 0.02, tool: rifle, walkPose: pose });
        const x = px + (ctx.camp.x - px) * 0.04, z = pz + (ctx.camp.z - pz) * 0.04;
        return goal(x, z, pose, faceTo(ctx.camp.x, ctx.camp.z, px, pz), { tool: rifle, walkPose: pose });
      }
      const g = sp?.gate ?? { x: at(0, 2)[0], z: at(0, 2)[1] };
      const x = g.x + (ctx.camp.x - g.x) * 0.05 + (i % 2 ? 0.1 : -0.1), z = g.z + (ctx.camp.z - g.z) * 0.05;
      return goal(x, z, pose, faceTo(ctx.camp.x, ctx.camp.z, g.x, g.z), { tool: rifle, walkPose: pose });
    }
    case 'meal': {
      if (!ctx.outdoors && ctx.home?.seats?.length) return goalFor(i, kid, 'leisure', null, 19, ctx, clock);
      const P = YARD.picnic, side = i % 2 ? 1 : -1, k = Math.floor(i / 2) % 3;
      const [x, z] = at(P.x - 0.1 + k * 0.1, P.z + side * 0.12);
      const [tx, tz] = at(P.x - 0.1 + k * 0.1, P.z);
      return goal(x, z, FIG_POSE.BENCH, faceTo(x, z, tx, tz));
    }
    case 'party': {
      // the grill, round the fire on the stools, at the picnic table, standing about
      if (i === 0 && hour < 20) {
        const [x, z] = at(YARD.grill.x - 0.11, YARD.grill.z);
        const [gx, gz] = at(YARD.grill.x, YARD.grill.z);
        return goal(x, z, FIG_POSE.STIR, faceTo(x, z, gx, gz), { tool: FIG_TOOL.SPOON });
      }
      const n = YARD.stools.length;
      if (i - 1 < n) {
        const st = YARD.stools[(i - 1 + n) % n];
        const [x, z] = at(st.x, st.z);
        return goal(x, z, FIG_POSE.BENCH, faceTo(x, z, fire[0], fire[1]));
      }
      const P = YARD.picnic, side = i % 2 ? 1 : -1;
      const [x, z] = at(P.x - 0.12 + ((i >> 1) % 3) * 0.12, P.z + side * 0.12);
      return goal(x, z, FIG_POSE.BENCH, faceTo(x, z, fire[0], fire[1]));
    }
    default: return null;
  }
}
