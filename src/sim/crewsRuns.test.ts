import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure, isFinished } from './construction';
import { BLUEPRINTS } from './blueprints';
import { emptyStock } from './materials';
import { planRun, runBill, runFinished, wallLength } from './perimeter';
import { CREW_RATE, CREW_WEEK, crewMarket, crewStep, crewProblem, crewQuote, crewsFor, crewsOn, hireCrew, hireCrews, maxRunCrews } from './crews';
import { wallCrewCard, wallFirstCard } from './wallCrew';
import { runNeedLines } from './structureNeed';
import { setFocus } from './priority';
import { suggestions } from './guidance';
import { step } from './engine';

const ring: Array<[number, number]> = [[10, 10], [50, 10], [50, 50], [10, 50], [10, 10]];
const fresh = (money = 2_000_000): GameState => {
  const g = newGame(5); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; g.money = money;
  g.crews = []; g.people = g.people.map(p => ({ ...p, job: undefined })) as never;
  return g;
};
const stocked = (g: GameState, kind: Parameters<typeof planRun>[1], pts = ring) => {
  const r = planRun(g, kind, pts.map(p => [...p] as [number, number]), [], 0, true);
  for (const [k, n] of Object.entries(runBill(r.kind, wallLength(r)))) g.stock[k as keyof typeof g.stock] += n as number;
  return r;
};
const run = (g: GameState, days: number, until?: (g: GameState) => boolean) => { for (let d = 0; d < days && !(until && until(g)); d++) g = step(g, 1); return g; };
/** Run whole days, summing what the crews are paid (each crew's `paid`, kept after it goes home). */
const paidOver = (g: GameState, days: number, until?: (g: GameState) => boolean): { g: GameState; paid: number; hours: number } => {
  const seen = new Map<string, [number, number]>();
  for (let d = 0; d < days && !(until && until(g)); d++) { g = step(g, 1); for (const c of g.crews) seen.set(c.id, [c.paid, c.hours]); }
  const all = [...seen.values()];
  return { g, paid: all.reduce((a, b) => a + b[0], 0), hours: all.reduce((a, b) => a + b[1], 0) };
};
const withHome = (g: GameState) => { const h = planStructure(g, 'timber_cabin', 80, 80, 0); h.stage = BLUEPRINTS.timber_cabin.stages.length; h.finishedAt = 0; expect(isFinished(h)).toBe(true); return h; };

describe('crews on perimeter runs', () => {
  it('hire a crew on a run: it is billed by the hours worked and finishes the wall', () => {
    let g = fresh();
    const r = stocked(g, 'split_rail', [[10, 10], [30, 10]]);   // 20 units x 3 h = 60 person-hours
    expect(hireCrew(g, r.id)).toBeNull();
    const w = paidOver(g, 20, x => runFinished(x.perimeter[0]));
    g = w.g;
    expect(runFinished(g.perimeter[0])).toBe(true);
    // billed by the hours the crew worked (the family helps with the rest of the 60 person-hours)
    expect(w.hours).toBeGreaterThan(10);
    expect(w.hours).toBeLessThanOrEqual(60 + 1e-6);
    expect(w.paid).toBeCloseTo(w.hours * CREW_RATE, 3);
    g = run(g, 1);
    expect(g.crews.length).toBe(0);
    expect(g.log.some(l => /crew finished the split-rail fence/.test(l.text))).toBe(true);
  });

  it('waits unbilled for the materials, then starts when they land', () => {
    let g = fresh();
    const r = planRun(g, 'stone_wall', ring.map(p => [...p] as [number, number]), [], 0, true);
    expect(hireCrew(g, r.id)).toBeNull();
    g = run(g, 10);
    expect(g.crews[0].paid).toBe(0);
    expect(g.perimeter[0].done).toBe(0);
    expect(runNeedLines(g, g.perimeter[0]).length).toBeGreaterThan(0);
    for (const [k, n] of Object.entries(runBill(r.kind, wallLength(r)))) g.stock[k as keyof typeof g.stock] += n as number;
    expect(runNeedLines(g, g.perimeter[0])).toEqual([]);
    g = run(g, 10);
    expect(g.perimeter[0].done).toBeGreaterThan(0);
    expect(g.crews[0].paid).toBeGreaterThan(0);
  });

  it('several crews work one wall side by side: same wages, far sooner (money buys speed)', () => {
    const days = (n: number) => {
      const g = fresh(5_000_000);
      const r = stocked(g, 'stone_wall');
      expect(hireCrews(g, r.id, n).hired).toBe(n);
      const w = paidOver(g, 400, x => runFinished(x.perimeter[0]));
      return { d: w.g.clock.t - g.clock.t, paid: w.paid, hours: w.hours, total: r.hours };
    };
    const one = days(1), ten = days(10);
    expect(ten.d).toBeLessThan(one.d / 4);
    expect(ten.d).toBeLessThan(60);   // a 100-unit-class ring in weeks, not hundreds of days
    expect(ten.paid).toBeCloseTo(ten.hours * CREW_RATE, 3);   // realistic: every hour is billed at the crew rate
    expect(ten.hours).toBeGreaterThan(ten.total * 0.9);   // the money did the work
    expect(ten.paid).toBeGreaterThan(one.paid);   // and costs more in wages than one crew with the family helping
  });

  it('limits crews per run to its length and to a week of work each', () => {
    const g = fresh();
    const small = planRun(g, 'split_rail', [[10, 10], [30, 10]], [], 0, true);
    expect(maxRunCrews(small)).toBe(1);
    expect(hireCrew(g, small.id)).toBeNull();
    expect(hireCrew(g, small.id)).toMatch(/room/);
    const big = planRun(g, 'stone_wall', ring.map(p => [...p] as [number, number]), [], 0, true);
    expect(maxRunCrews(big)).toBeGreaterThan(10);
    expect(crewsFor(g, big, 4)).toBe(Math.ceil(big.hours / (CREW_WEEK * 4)));
    expect(hireCrews(g, big.id, 3).hired).toBe(3);
    expect(crewsOn(g, big.id)).toBe(3);
    expect(crewQuote(big, 3).weeks).toBeLessThan(crewQuote(big, 1).weeks);
  });
});

describe('the wall cards', () => {
  it('"wall first" sets the focus and then goes away; the crew card orders and hires', () => {
    const g = fresh(900_000);
    withHome(g);
    planStructure(g, 'garden', 60, 60, 0);
    const r = planRun(g, 'stone_wall', ring.map(p => [...p] as [number, number]), [], 0, true);
    const first = wallFirstCard(g)!;
    expect(first.run.id).toBe(r.id);
    const cards = suggestions(g, 60);
    const f = cards.find(c => c.id === 'wall_first')!, c = cards.find(c => c.id === 'wall_crew')!;
    expect(f.acts![0].act).toEqual({ type: 'focus', id: r.id });
    expect(c.acts![0].act).toMatchObject({ type: 'crew', id: r.id });
    expect((c.acts![0].act as { count: number }).count).toBeGreaterThan(5);
    expect((c.acts![0].act as { lines?: unknown[] }).lines!.length).toBeGreaterThan(0);
    expect(c.title).toMatch(/^Hire \d+ crews to put up the stone-and-timber wall in about \d+ weeks \(~\$/);
    expect(setFocus(g, r.id)).toBeNull();
    expect(wallFirstCard(g)).toBeNull();
    expect(suggestions(g, 60).some(x => x.id === 'wall_first')).toBe(false);
  });

  it('no wall cards before a home is up, or when the cash cannot cover the stone', () => {
    const g = fresh(900_000);
    planRun(g, 'stone_wall', ring.map(p => [...p] as [number, number]), [], 0, true);
    expect(wallFirstCard(g)).toBeNull();
    expect(wallCrewCard(g)).toBeNull();
    withHome(g);
    g.money = 40_000;
    expect(wallCrewCard(g)).toBeNull();
  });

  it('a poor family (no cash for crews) still has the free "wall first" card', () => {
    const g = fresh(30_000);
    withHome(g);
    planStructure(g, 'garden', 60, 60, 0);
    planRun(g, 'stone_wall', ring.map(p => [...p] as [number, number]), [], 0, true);
    expect(wallFirstCard(g)).not.toBeNull();
    expect(wallCrewCard(g)).toBeNull();
  });
});

describe('crews after the hit', () => {
  /** Monday 10 a.m.: a working hour for a crew. */
  const monday = (g: GameState) => { g.clock.t = 14 + 10 / 24; };
  it('keep working while the world holds partly together, at higher wages and in smaller numbers', () => {
    const g = fresh(3_000_000);
    const r = stocked(g, 'stone_wall');
    expect(crewMarket(g).rateMult).toBe(1);
    expect(crewMarket(g).maxCrews).toBe(Infinity);
    g.disaster.tracks.banks = 0.5; g.disaster.tracks.law = 0.5; g.disaster.tracks.fuel = 0.5;
    const m = crewMarket(g);
    expect(m.open).toBe(true);
    expect(m.rateMult).toBeCloseTo(1.75);
    expect(m.maxCrews).toBe(4);
    expect(hireCrew(g, r.id)).toBeNull();
    g.disaster.tracks.banks = 0.4;   // (the old rule sent them home under 0.5)
    monday(g);
    const money = g.money;
    crewStep(g, 0.25);
    expect(g.crews.length).toBe(1);
    expect(g.perimeter[0].done).toBeGreaterThan(0);
    const c = g.crews[0];
    expect(c.paid / c.hours).toBeCloseTo(CREW_RATE * crewMarket(g).rateMult, 5);
    expect(money - g.money).toBeCloseTo(c.paid, 5);
    expect(crewMarket(g).rateMult).toBeGreaterThan(1.75);
  });

  it('cap the number of crews as the world fails, send the newest home, and stop at collapse', () => {
    const g = fresh(3_000_000);
    const rs = [0, 1, 2, 3].map(i => stocked(g, 'stone_wall', [[10, 10 + i * 60], [60, 10 + i * 60]]));
    for (const r of rs) expect(hireCrew(g, r.id)).toBeNull();
    g.disaster.tracks.banks = 0.3; g.disaster.tracks.law = 0.3; g.disaster.tracks.fuel = 0.3;   // 8 x 0.3 = 2 crews
    expect(crewMarket(g).maxCrews).toBe(2);
    expect(crewProblem(g, planRun(g, 'stone_wall', [[10, 400], [60, 400]], [], 0, true))).toMatch(/no more crews/);
    monday(g);
    crewStep(g, 0.25);
    expect(g.crews.map(c => c.target)).toEqual([rs[0].id, rs[1].id]);
    g.disaster.tracks.law = 0.1;
    crewStep(g, 0.25);
    expect(g.crews.length).toBe(0);
    expect(hireCrew(g, rs[0].id)).toMatch(/nobody/);
  });
});
