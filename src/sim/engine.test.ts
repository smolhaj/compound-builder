import { describe, expect, it } from 'vitest';
import { newGame, hourOf, type GameState } from './state';
import { step } from './engine';
import { placeOrder, orderProblem, LEAD_TIME_DAYS } from './economy';
import { planStructure, progress, blockedReason, isFinished } from './construction';
import { CABIN_BLUEPRINT, totalBill } from './blueprints';
import { MATERIAL_IDS } from './materials';
import { routineAt } from './schedule';

const fullCabinOrder = () => (Object.entries(totalBill(CABIN_BLUEPRINT)) as Array<[typeof MATERIAL_IDS[number], number]>).map(([material, qty]) => ({ material, qty }));

describe('sim engine', () => {
  it('advances the clock without mutating the input', () => {
    const g = newGame(7);
    const g2 = step(g, 0.5);
    expect(g.clock.t).toBe(0);
    expect(g2.clock.t).toBeCloseTo(0.5);
    expect(hourOf(g2.clock.t)).toBeCloseTo(18);
  });

  it('is independent of how time is chopped up', () => {
    let a: GameState = newGame(3), b: GameState = newGame(3);
    for (const s of [a, b]) { placeOrder(s, fullCabinOrder()); planStructure(s, 'timber_cabin', 20, 20, 0); }
    a = step(a, 6);
    for (let i = 0; i < 600; i++) b = step(b, 0.01);
    expect(b.structures[0].stage).toBe(a.structures[0].stage);
    expect(b.structures[0].done).toBeCloseTo(a.structures[0].done, 6);
  });

  it('charges for orders and delivers them after the lead time', () => {
    let g = newGame(1);
    const money = g.money;
    placeOrder(g, [{ material: 'lumber', qty: 10 }]);
    expect(g.money).toBeLessThan(money - 2500);
    g = step(g, LEAD_TIME_DAYS - 0.1);
    expect(g.stock.lumber).toBe(0);
    g = step(g, 0.2);
    expect(g.stock.lumber).toBe(10);
    expect(orderProblem(g, [{ material: 'lumber', qty: 10000 }])).toBe('cannot_afford');
    expect(orderProblem(g, [{ material: 'logs', qty: 1 }])).toBe('not_for_sale');
  });

  it('waits for materials, then the family builds a cabin in about three weeks', () => {
    let g = newGame(7);
    const st = planStructure(g, 'timber_cabin', 20, 20, 0);
    g = step(g, 1);
    // site prep needs no materials: work starts at once; the foundation then waits for stone
    g = step(g, 3);
    expect(g.structures[0].stage).toBe(1);
    expect(blockedReason(g, g.structures[0])).toMatch(/fieldstone/);
    placeOrder(g, fullCabinOrder());
    g = step(g, 25);
    const done = g.structures.find(x => x.id === st.id)!;
    expect(isFinished(done)).toBe(true);
    expect(done.finishedAt! - LEAD_TIME_DAYS).toBeGreaterThan(14);
    expect(done.finishedAt!).toBeLessThan(30);
    expect(progress(done)).toBe(1);
    expect(Object.values(g.stock).every(v => v === 0)).toBe(true);
  });

  it('keeps the routine: nobody builds at night, kids are in school in the morning', () => {
    const g = newGame(2);
    for (const p of g.people) expect(routineAt(p, 2)).toBe('sleep');
    for (const p of g.people.filter(x => x.kid)) expect(routineAt(p, 10)).toBe('school');
    for (const p of g.people.filter(x => !x.kid)) expect(routineAt(p, 10)).toBe('work');
  });
});
