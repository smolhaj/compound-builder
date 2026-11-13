/**
 * Where the family is for the evening rituals (sim/rituals.ts), from the home's seats. Pure; peopleGoals.goalFor calls it first.
 *
 * Seats come as (local x, z, face x, z). In every kit the hearth or stove stands against the back wall (local z at or below
 * -0.45 where the sitters face), and the table is nearer the middle or the front, so a seat that faces the back wall is a
 * fireside chair and the rest are table chairs. A house with only one kind (a container house) uses its seats for both.
 *
 *  settled  dinner: sits at a table chair (more people than chairs: the rest stand at the table's edge, the grown-ups first
 *           to sit); fireside: sits in the chairs facing the hearth, the little ones on the rug; play: the kids in the yard
 *           in fine weather, on the rug in the house when it is not. All at an unhurried pace.
 *  wary     calm has fallen (a stranger at the gate, a fire): nobody sits; they stand up at the table's edge and look to the
 *           front of the house.
 *  alert    the house is under attack: the grown-ups at the front wall (rifle up when the place has guns), the kids and the old
 *           down low by the hearth, all at a run.
 */
import { FIG_POSE, FIG_TOOL } from '../../engine/world/people/figureKit';
import { ritualKind, stanceOf, type RitualKind } from '../../sim/rituals';
import type { Goal, GoalCtx, Site } from './peopleGoals';

type Seat = readonly [number, number, number, number];

/** Which kind of chair: facing the hearth against the back wall, or at the table. */
export const seatRole = (s: Seat, role?: 'fire' | 'table'): 'fire' | 'table' => role ?? (s[3] <= -0.45 ? 'fire' : 'table');

/** The home's seats split by role (a house with just one kind uses them for both). */
export function splitSeats(seats: readonly Seat[], roles?: ReadonlyArray<'fire' | 'table'>): { table: Seat[]; fire: Seat[] } {
  const table = seats.filter((s, i) => seatRole(s, roles?.[i]) === 'table'), fire = seats.filter((s, i) => seatRole(s, roles?.[i]) === 'fire');
  return { table: table.length ? table : [...seats], fire: fire.length ? fire : [...seats] };
}

/** The hearth in local coordinates (where the fireside chairs face), or null when the home has no seats. */
export function hearthPoint(seats: readonly Seat[] | undefined, roles?: ReadonlyArray<'fire' | 'table'>): [number, number] | null {
  if (!seats?.length) return null;
  const f = splitSeats(seats, roles).fire;
  return [f.reduce((a, s) => a + s[2], 0) / f.length, f.reduce((a, s) => a + s[3], 0) / f.length];
}

/** A point in front of the hearth where a dog curls up: a hand's width toward the chairs. */
export function stovePlace(h: Site & { seats?: readonly Seat[] }, k = 0): { x: number; z: number } | null {
  const hp = hearthPoint(h.seats, h.seatRoles);
  if (!hp || !h.seats || !h.seats.some((s, i) => seatRole(s, h.seatRoles?.[i]) === 'fire')) return null;   // no hearth in this kit: the dog keeps to the old places
  const f = splitSeats(h.seats, h.seatRoles).fire, cx = f.reduce((a, s) => a + s[0], 0) / f.length, cz = f.reduce((a, s) => a + s[1], 0) / f.length;
  const dx = cx - hp[0], dz = cz - hp[1], d = Math.hypot(dx, dz) || 1;
  const lx = hp[0] + dx / d * 0.1 + (dz / d) * 0.06 * (k % 2 ? 1 : -1), lz = hp[1] + dz / d * 0.1 - (dx / d) * 0.06 * (k % 2 ? 1 : -1);
  return world(h, lx, lz);
}

function world(h: Site, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(h.rot), sn = Math.sin(h.rot);
  return { x: h.x + lx * c + lz * sn, z: h.z - lx * sn + lz * c };
}
const faceTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);
const wob = (i: number, clock: number, period: number): number => { const x = Math.sin((Math.floor(clock / period) + i * 97.13) * 12.9898) * 43758.5453; return x - Math.floor(x); };

const RELAXED = 0.8, HURRIED = 1.5;

/** Tasks in which a person is "at home with the family" and so drops everything for an alarm. */
export const HOME_TASKS = new Set(['meal', 'leisure', 'study', 'party', 'school']);

/**
 * The ritual goal for person `i`, or null to let the ordinary goals decide. `ctx.ritual.kind` is the ritual their task is at this hour
 * (sim/rituals.ts ritualKind), null outside one.
 */
export function ritualGoal(i: number, kid: boolean, task: string, hour: number, ctx: GoalCtx, clock: number): Goal | null {
  const R = ctx.ritual, h = ctx.home;
  if (!R || !h?.seats?.length) return null;
  const stance = stanceOf(R.calm, i), kind: RitualKind | null = R.kind(i), elder = R.elder(i);
  const at = (lx: number, lz: number) => world(h, lx, lz);
  const front = Math.max(...h.seats.map(s => s[1])) + 0.18;
  const hp = hearthPoint(h.seats, h.seatRoles) ?? [0, -0.6];
  if (stance === 'alert' && (kind || HOME_TASKS.has(task))) {
    const p = (kid || elder) ? at(hp[0] + (i % 3 - 1) * 0.12, hp[1] + 0.22 + 0.06 * (i % 2)) : at(-0.25 + (i % 4) * 0.2, front);
    if (kid || elder) return { x: p.x, z: p.z, pose: FIG_POSE.COVER, face: faceTo(p.x, p.z, h.x, h.z), hidden: false, work: false, pace: HURRIED };
    const rifle = ctx.armed;
    return { x: p.x, z: p.z, pose: rifle ? FIG_POSE.RIFLE : FIG_POSE.STAND, face: h.rot, hidden: false, work: false, tool: rifle ? FIG_TOOL.RIFLE : undefined, walkPose: rifle ? FIG_POSE.RIFLE : undefined, pace: HURRIED };
  }
  if (!kind) return null;
  const { table, fire } = splitSeats(h.seats, h.seatRoles);
  const { k, n } = R.rank(i);
  if (stance === 'wary') {
    const t = table[k % table.length], p = at(t[0] + 0.1 * ((k % 3) - 1), t[1] + 0.12);
    return { x: p.x, z: p.z, pose: FIG_POSE.STAND, face: h.rot, hidden: false, work: false, pace: 1.2 };
  }
  if (kind === 'dinner') {
    if (k < table.length) {
      const s = table[k], p = at(s[0], s[1]), t = at(s[2], s[3]);
      return { x: p.x, z: p.z, pose: FIG_POSE.BENCH, face: faceTo(p.x, p.z, t.x, t.z), hidden: false, work: false, pace: RELAXED };
    }
    const base = table[k % table.length], a = (k / Math.max(1, n)) * 2 * Math.PI + 0.7;
    const t = at(base[2], base[3]), x = t.x + Math.cos(a) * 0.15, z = t.z + Math.sin(a) * 0.15;
    return { x, z, pose: FIG_POSE.STAND, face: faceTo(x, z, t.x, t.z), hidden: false, work: false, pace: RELAXED };
  }
  if (kind === 'fireside' || (kind === 'play' && !(ctx.outdoors && hour < 18))) {
    if (kind === 'fireside' && k < fire.length) {
      const s = fire[k], p = at(s[0], s[1]), t = at(s[2], s[3]);
      return { x: p.x, z: p.z, pose: FIG_POSE.BENCH, face: faceTo(p.x, p.z, t.x, t.z), hidden: false, work: false, pace: RELAXED };
    }
    // on the rug in front of the hearth, round it
    const a = (k * 1.9 + 0.5) % (2 * Math.PI), r = 0.2 + 0.05 * (k % 3), t = at(hp[0], hp[1]);
    const lx = hp[0] + Math.cos(a) * r * 0.9, lz = hp[1] + 0.3 + Math.abs(Math.sin(a)) * r;
    const p = at(lx, lz);
    return { x: p.x, z: p.z, pose: FIG_POSE.LAWN, face: faceTo(p.x, p.z, t.x, t.z), hidden: false, work: false, pace: RELAXED };
  }
  // play, out in the yard in front of the house: a new spot every quarter hour or so, at a trot
  const px = (wob(i, clock, 0.012) - 0.5) * 1.6, pz = h.d / 2 + 0.35 + wob(i + 5, clock, 0.012) * 0.7;
  const p = world(h, px * h.w / 2, pz);
  return { x: p.x, z: p.z, pose: FIG_POSE.STAND, face: null, hidden: false, work: false, pace: 1.25 };
}

/** The ritual part of the goal context for this moment: who is at which ritual, in what order they take the chairs (the grown-ups first, the youngest last, so the little ones end up on the rug). */
export function ritualCtx(people: ReadonlyArray<{ kid: boolean; elder?: boolean; age: number }>, tasks: ReadonlyArray<string | undefined>, hour: number, calm: number): NonNullable<GoalCtx['ritual']> {
  const kinds = people.map((p, i) => ritualKind(tasks[i] ?? '', p.kid, hour));
  const order = new Map<RitualKind, number[]>();
  kinds.forEach((k, i) => { if (k) (order.get(k) ?? order.set(k, []).get(k)!).push(i); });
  const rank = new Map<number, { k: number; n: number }>();
  for (const list of order.values()) {
    list.sort((a, b) => (people[b].age - people[a].age) || (a - b));
    list.forEach((i, k) => rank.set(i, { k, n: list.length }));
  }
  return { calm, kind: i => kinds[i] ?? null, rank: i => rank.get(i) ?? { k: i, n: people.length }, elder: i => !!people[i]?.elder };
}
