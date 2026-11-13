import { describe, expect, it } from 'vitest';
import { goalFor, type GoalCtx, type Site } from './peopleGoals';
import { hearthPoint, ritualCtx, seatRole, splitSeats, stovePlace } from './ritualGoals';
import { FIG_POSE } from '../../engine/world/people/figureKit';
import { CABIN_SEATS } from '../buildkit/cabinGeometry';
import { HOUSING_SEATS } from '../buildkit/housingStyleBuildings';
import { dogGoal } from './dogGoals';

type Seat = [number, number, number, number];
const LOG_HOUSE: Seat[] = [[-0.3, -0.45, -0.4, -1.1], [-0.5, -0.45, -0.4, -1.1], [0.35, 0.62, 0.35, 0.78], [0.35, 0.94, 0.35, 0.78]];
const KITS: Record<string, readonly Seat[]> = { cabin: CABIN_SEATS as Seat[], log_house: LOG_HOUSE, ...HOUSING_SEATS };

const home = (seats: readonly Seat[], rot = 0.6): Site => ({ x: 30, z: 40, rot, w: 3, d: 2.6, seats });
const people = [{ kid: false, age: 38 }, { kid: false, age: 36 }, { kid: true, age: 11 }, { kid: true, age: 6 }];
const mk = (seats: readonly Seat[], tasks: string[], hour: number, calm: number, extra: Partial<GoalCtx> = {}): GoalCtx => ({
  camp: { x: 20, z: 20, rot: 0 }, site: () => null, home: home(seats), outdoors: false,
  ritual: ritualCtx(people, tasks, hour, calm), ...extra,
});
const inLocal = (h: Site, x: number, z: number): [number, number] => { const c = Math.cos(h.rot), s = Math.sin(h.rot), dx = x - h.x, dz = z - h.z; return [dx * c - dz * s, dx * s + dz * c]; };

describe('seat roles', () => {
  it('every kit has a hearth side and a table side, and the hearth is against the back wall', () => {
    for (const [name, seats] of Object.entries(KITS)) {
      const { table, fire } = splitSeats(seats);
      expect(table.length, name).toBeGreaterThan(0);
      expect(fire.length, name).toBeGreaterThan(0);
      const hp = hearthPoint(seats)!;
      if (name !== 'container_house') expect(hp[1], name).toBeLessThanOrEqual(-0.45);
    }
    expect(seatRole([0, 0, 0, -1])).toBe('fire');
    expect(seatRole([0, 0, 0, 0.6])).toBe('table');
  });
});

describe('a family comes to the table and sits', () => {
  it('dinner: each person walks to a different table chair and sits facing the table, within a bounded time', () => {
    for (const [name, seats] of Object.entries(KITS)) {
      const ctx = mk(seats, ['meal', 'meal', 'meal', 'meal'], 18.3, 1);
      const WALK = 0.5, MAX_SECONDS = 120;
      const goals = people.map((p, i) => goalFor(i, p.kid, 'meal', null, 18.3, ctx, 0));
      const spots = new Set<string>();
      goals.forEach((g, i) => {
        // they start in the yard, 4 world units from the house, and walk straight there at the diorama pace, a little slower than usual
        const secs = Math.hypot(g.x - 22, g.z - 38) / (WALK * (g.pace ?? 1));
        expect(secs, `${name} person ${i}`).toBeLessThan(MAX_SECONDS);
        expect(g.hidden).toBe(false);
        const [lx, lz] = inLocal(ctx.home!, g.x, g.z);
        expect(Math.abs(lx) < 1.5 && Math.abs(lz) < 1.3, `${name} inside`).toBe(true);
        spots.add(`${g.x.toFixed(2)},${g.z.toFixed(2)}`);
      });
      expect(spots.size, name).toBe(4);
      const seated = goals.filter(g => g.pose === FIG_POSE.BENCH).length;
      expect(seated, name).toBe(Math.min(4, splitSeats(seats).table.length));
      goals.forEach(g => { if (g.pose === FIG_POSE.BENCH) expect(g.face).not.toBeNull(); expect(g.pace).toBeLessThan(1); });
    }
  });
  it('the grown-ups take the chairs first and the little ones stand or sit on the rug when chairs run out', () => {
    const ctx = mk(CABIN_SEATS as Seat[], ['meal', 'meal', 'meal', 'meal'], 18.3, 1);
    const goals = people.map((p, i) => goalFor(i, p.kid, 'meal', null, 18.3, ctx, 0));
    expect(goals[0].pose).toBe(FIG_POSE.BENCH);
    expect(goals[1].pose).toBe(FIG_POSE.BENCH);
    const fire = mk(CABIN_SEATS as Seat[], ['leisure', 'leisure', 'leisure', 'leisure'], 20, 1);
    const fg = people.map((p, i) => goalFor(i, p.kid, 'leisure', null, 20, fire, 0));
    expect(fg.filter(g => g.pose === FIG_POSE.BENCH).length).toBe(2);   // the cabin has two armchairs: the little ones sit on the rug
    expect(fg.filter(g => g.pose === FIG_POSE.LAWN).length).toBe(2);
    expect(fg[2].pose).toBe(FIG_POSE.LAWN);
    const big = mk(CABIN_SEATS as Seat[], Array(4).fill('leisure'), 20, 1, { ritual: ritualCtx([...people, { kid: true, age: 4 }], Array(5).fill('leisure'), 20, 1) });
    expect(goalFor(4, true, 'leisure', null, 20, big, 0).pose).toBe(FIG_POSE.LAWN);
  });
  it('kids play in the yard in fine weather and on the rug when it is not', () => {
    const out = mk(CABIN_SEATS as Seat[], ['leisure', 'leisure', 'leisure', 'leisure'], 15.5, 1, { outdoors: true });
    const g = goalFor(2, true, 'leisure', null, 15.5, out, 0.3), [lx, lz] = inLocal(out.home!, g.x, g.z);
    expect(lz).toBeGreaterThan(out.home!.d / 2);
    expect(Math.abs(lx)).toBeLessThan(out.home!.w);
    const inn = mk(CABIN_SEATS as Seat[], ['leisure', 'leisure', 'leisure', 'leisure'], 15.5, 1, { outdoors: false });
    expect(goalFor(2, true, 'leisure', null, 15.5, inn, 0).pose).toBe(FIG_POSE.LAWN);
  });
});

describe('the old farmhouse (explicit seat roles)', () => {
  const FARM: Seat[] = [[-0.09, -0.667, 0, -0.55], [0.09, -0.667, 0, -0.55], [-0.09, -0.433, 0, -0.55], [0.09, -0.433, 0, -0.55], [-0.43, -0.11, -0.62, -0.11], [-0.43, 0.03, -0.62, 0.03]];
  const ROLES = ['table', 'table', 'table', 'table', 'fire', 'fire'] as const;
  it('all four sit at the table at dinner, and the fireside chairs face the range', () => {
    const ctx = { ...mk(FARM, ['meal', 'meal', 'meal', 'meal'], 18.3, 1), home: { ...home(FARM), seatRoles: ROLES } };
    const goals = people.map((p, i) => goalFor(i, p.kid, 'meal', null, 18.3, ctx, 0));
    expect(goals.every(g => g.pose === FIG_POSE.BENCH)).toBe(true);
    expect(new Set(goals.map(g => `${g.x.toFixed(2)},${g.z.toFixed(2)}`)).size).toBe(4);
    const fire = { ...ctx, ritual: ritualCtx(people, ['leisure', 'leisure', 'leisure', 'leisure'], 20, 1) };
    const fg = people.map((p, i) => goalFor(i, p.kid, 'leisure', null, 20, fire, 0));
    expect(fg.filter(g => g.pose === FIG_POSE.BENCH).length).toBe(2);
    expect(hearthPoint(FARM, ROLES)![0]).toBeCloseTo(-0.62);
    expect(stovePlace({ ...home(FARM), seatRoles: ROLES })).not.toBeNull();
  });
});

describe('a breach stops the table', () => {
  it('on alert nobody sits: the grown-ups at the front wall, the kids down by the hearth, all hurried', () => {
    const ctx = mk(CABIN_SEATS as Seat[], ['meal', 'meal', 'meal', 'meal'], 18.3, 0.1);
    const goals = people.map((p, i) => goalFor(i, p.kid, 'meal', null, 18.3, ctx, 0));
    goals.forEach(g => { expect(g.pose).not.toBe(FIG_POSE.BENCH); expect(g.pace).toBeGreaterThan(1.2); });
    expect(goals[2].pose).toBe(FIG_POSE.COVER);
    expect(goals[3].pose).toBe(FIG_POSE.COVER);
    expect([FIG_POSE.STAND, FIG_POSE.RIFLE]).toContain(goals[0].pose);
    const armed = goalFor(0, false, 'meal', null, 18.3, { ...ctx, armed: true }, 0);
    expect(armed.pose).toBe(FIG_POSE.RIFLE);
  });
  it('as calm recovers they return to the table one at a time', () => {
    const sat: number[] = [];
    for (const calm of [0.2, 0.5, 0.62, 0.68, 0.75, 0.9]) {
      const four = mk(CABIN_SEATS as Seat[], ['meal', 'meal', 'meal', 'meal'], 18.3, calm);
      sat.push(people.map((p, i) => goalFor(i, p.kid, 'meal', null, 18.3, four, 0)).filter(g => g.pose === FIG_POSE.BENCH).length);
    }
    expect(sat[0]).toBe(0);
    expect(sat[sat.length - 1]).toBe(2);   // two table chairs in the cabin; the rest stand at the table once they are back
    for (let k = 1; k < sat.length; k++) expect(sat[k]).toBeGreaterThanOrEqual(sat[k - 1]);
  });
  it('outside a ritual hour, a calm house changes nothing (the ordinary goals decide)', () => {
    const ctx = mk(CABIN_SEATS as Seat[], ['garden', 'garden', 'school', 'school'], 10, 1);
    expect(goalFor(0, false, 'school', null, 10, { ...ctx, ritual: ritualCtx(people, ['school', 'school', 'school', 'school'], 10, 1) }, 0).pose).toBe(FIG_POSE.BENCH);
  });
});

describe('the dog by the stove', () => {
  it('after supper and through the night the house dog lies on the floor by the hearth, not on a chair', () => {
    const h = home(CABIN_SEATS as Seat[]);
    const dog = { id: 'd1', name: 'Biscuit', guard: false, health: 90, hunger: 20, play: 50, born: -900, bond: null } as never;
    const sp = stovePlace(h, 0)!;
    const dctx = { home: h, camp: { x: 20, z: 20 }, gate: { x: 0, z: 0 }, yard: { x: 20, z: 30 }, atGate: false, person: () => null, calm: 1 };
    for (const hour of [19.5, 22.5, 3]) {
      const g = dogGoal(dog, 0, hour, 5, dctx, 0);
      expect(g.stance).toBe('lie');
      expect(Math.hypot(g.x - sp.x, g.z - sp.z)).toBeLessThan(0.2);
    }
    const [lx, lz] = inLocal(h, sp.x, sp.z), hp = hearthPoint(CABIN_SEATS as Seat[])!;
    expect(Math.hypot(lx - hp[0], lz - hp[1])).toBeLessThan(0.25);
  });
});
