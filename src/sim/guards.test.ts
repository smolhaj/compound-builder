import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { COLLAPSE, GUARD_DAY, GUARD_MONTH, MAX_GUARDS, bunk, coverage, guardDay, guardPosture, guardProblem, hireGuard, onDuty, onShift, parkedCars, permanentCollapse } from './guards';
import { postureOf, defenseOf } from './encounters';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const game = (): GameState => {
  const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.money = 500_000;
  g.structures.push({ id: 'home', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  return g;
};
const atHour = (g: GameState, h: number) => { g.clock.t = Math.floor(g.clock.t) + h / 24; };
const collapse = (g: GameState) => { g.disaster.tracks = { ...g.disaster.tracks, banks: 0, law: 0 }; };
const run = (g: GameState, days: number): string[] => { const out: string[] = []; for (let i = 0; i < days; i++) out.push(...guardDay(g)); return out; };

describe('hired guards: shifts', () => {
  it('each guard works one 8-hour shift; three cover the day, one a third', () => {
    const g = game();
    for (let i = 0; i < MAX_GUARDS; i++) { expect(hireGuard(g)).toBeNull(); if (i === 0) expect(coverage(g)).toBeCloseTo(1 / 3); }
    expect(coverage(g)).toBe(1);
    for (let h = 0; h < 24; h++) expect(onDuty(g, h).length).toBe(1);
    expect(guardProblem(g)).toMatch(/most/);
    expect(onShift({ shift: 22 }, 23)).toBe(true); expect(onShift({ shift: 22 }, 3)).toBe(true); expect(onShift({ shift: 22 }, 12)).toBe(false);
  });
  it('only the guard on shift adds anything at the gate', () => {
    const g = game(); hireGuard(g);
    const s = g.guards.staff[0].shift;
    atHour(g, s + 1); expect(guardPosture(g).fighters).toBe(1);
    atHour(g, (s + 12) % 24); expect(guardPosture(g).fighters).toBe(0);
  });
  it('they sleep in the gate house when there is one, otherwise their cars park at the drive', () => {
    const g = game(); hireGuard(g); hireGuard(g);
    expect(bunk(g)).toBe('cars'); expect(parkedCars(g)).toBe(2);
    g.stock.gate_house = 1; expect(bunk(g)).toBe('gate_house'); expect(parkedCars(g)).toBe(0);
  });
  it('pay is billed by the day, and a guard needs a home to guard and a month of money', () => {
    const g = game(); hireGuard(g); const m = g.money; guardDay(g); expect(g.money).toBe(m - GUARD_DAY);
    expect(GUARD_DAY * 365 / 12).toBeCloseTo(GUARD_MONTH, -2);
    const poor = game(); poor.money = 100; expect(guardProblem(poor)).toMatch(/money/);
    const bare = game(); bare.structures = []; expect(guardProblem(bare)).toMatch(/home/);
  });
});

describe('hired guards: quitting', () => {
  it('an ordinary outage (banks down, law holding; or a short collapse) sends nobody home', () => {
    const g = game(); hireGuard(g); hireGuard(g);
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0, law: 0.9 };
    expect(run(g, 60)).toEqual([]); expect(g.guards.staff.length).toBe(2);
    collapse(g); run(g, COLLAPSE.days - 1); expect(permanentCollapse(g)).toBe(false); expect(g.guards.staff.length).toBe(2);
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0.8, law: 0.8 }; run(g, 1);   // it recovers: the clock resets
    expect(g.guards.collapseDays).toBe(0); expect(g.guards.staff.length).toBe(2);
  });
  it('in a permanent collapse they leave one at a time, with a log line each, and payroll stops with the last', () => {
    const g = game(); for (let i = 0; i < 3; i++) hireGuard(g);
    collapse(g);
    const lines: string[] = [], counts: number[] = [];
    for (let d = 0; d < 80; d++) { lines.push(...guardDay(g)); counts.push(g.guards.staff.length); }
    expect(lines.length).toBe(3); expect(lines[2]).toMatch(/last guard/);
    expect(new Set(counts).size).toBeGreaterThan(2);           // staggered: not 3 -> 0 in one day
    expect(g.guards.lastQuit?.left).toBe(0);
    const m = g.money; run(g, 10); expect(g.money).toBe(m);   // nobody left to pay
  });
  it('a guard with family nearby, or years on the place, holds out longer; none leaves before the week is up', () => {
    const solo = (local: boolean, years: number): number => {
      const h = game(); hireGuard(h); const y = h.guards.staff[0]; y.local = local; y.holds = 2; h.clock.t += years * 365; collapse(h);
      let d = 0; while (h.guards.staff.length && d < 400) { guardDay(h); d++; h.money += GUARD_DAY * 5; } return d;
    };
    expect(solo(true, 0)).toBeGreaterThan(solo(false, 0));
    expect(solo(false, 3)).toBeGreaterThan(solo(false, 0));
    expect(solo(false, 0)).toBeGreaterThanOrEqual(COLLAPSE.days);
  });
  it('no agency sends guards once the collapse has begun', () => {
    const g = game(); collapse(g); expect(guardProblem(g)).toMatch(/agency/);
  });
});

describe('hired guards: monotone', () => {
  it('guards on or off shift never lower the gate posture, and once the last has quit the family is where it would have been', () => {
    for (const hour of [1, 7, 13, 19]) {
      const a = game(), b = game(); atHour(a, hour); atHour(b, hour);
      for (let i = 0; i < 3; i++) hireGuard(b);
      const pa = postureOf(a), pb = postureOf(b);
      expect(pb.fighters).toBeGreaterThanOrEqual(pa.fighters); expect(pb.detection).toBeGreaterThanOrEqual(pa.detection); expect(pb.barrier).toBe(pa.barrier);
      expect(defenseOf(pb)).toBeGreaterThanOrEqual(defenseOf(pa));
    }
    const a = game(), b = game();
    for (let i = 0; i < 3; i++) hireGuard(b);
    collapse(a); collapse(b);
    run(b, 120); expect(b.guards.staff.length).toBe(0);
    const pa = postureOf(a), pb = postureOf(b);
    expect(pb).toEqual(pa);
    expect(b.stock).toEqual(a.stock); expect(b.structures).toEqual(a.structures); expect(b.people).toEqual(a.people);
  });
});

describe('save', () => {
  it('a v80 save loads with an empty payroll and the second ring of land, once', () => {
    const g = game(); const raw = JSON.parse(JSON.stringify(g)); raw.version = 80; delete raw.guards;
    raw.land.parcels = raw.land.parcels.filter((p: { ring?: number }) => !p.ring);
    const n1 = raw.land.parcels.length;
    const m = migrate(raw) as unknown as GameState;
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.guards.staff).toEqual([]);
    expect(m.land.parcels.length).toBeGreaterThan(n1); expect(m.land.surveyed).toBe(false);
    expect(new Set(m.land.parcels.map(p => p.id)).size).toBe(m.land.parcels.length);
  });
});
