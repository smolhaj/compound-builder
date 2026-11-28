import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { emptyStock, MATERIALS } from './materials';
import { affordableFirstStep, orderCost, orderProblem, orderShortfall, prices } from './economy';
import { shortOrder } from './firstHour';
import { groupStuckRows, type StuckRow } from './stalls';

const fresh = (money: number): GameState => { const g = newGame(7); g.structures = []; g.perimeter = []; g.stock = emptyStock(); g.orders = []; g.money = money; return g; };

describe('an order the cash cannot cover', () => {
  const lines = [{ material: 'lumber' as const, qty: 400 }, { material: 'concrete' as const, qty: 200 }];

  it('says how much more it needs', () => {
    const g = fresh(5_000);
    const cost = orderCost(lines, prices(g));
    expect(orderProblem(g, lines)).toBe('cannot_afford');
    expect(orderShortfall(g, lines)).toBe(cost - 5_000);
    const a = shortOrder(g, lines, cost);
    expect(a.note).toMatch(/Need \$[\d,k]+ more/);
  });

  it('offers a first step that fits the money, in the lines own order, and can be placed', () => {
    const g = fresh(5_000);
    const first = affordableFirstStep(g, lines);
    expect(first.length).toBeGreaterThan(0);
    expect(first[0].material).toBe('lumber');
    expect(first[0].qty).toBeLessThan(400);
    expect(orderCost(first, prices(g))).toBeLessThanOrEqual(5_000);
    expect(orderProblem(g, first)).toBeNull();
    const a = shortOrder(g, lines, orderCost(lines, prices(g)));
    expect(a.off).toBeUndefined();
    expect(a.label).toMatch(/first part/);
    expect(a.note).toMatch(/full order/);
  });

  it('with nothing affordable the button is off and carries the reason', () => {
    const g = fresh(MATERIALS.lumber.price! / 2);
    expect(affordableFirstStep(g, [{ material: 'lumber', qty: 10 }])).toEqual([]);
    const a = shortOrder(g, [{ material: 'lumber', qty: 10 }], orderCost([{ material: 'lumber', qty: 10 }], prices(g)));
    expect(a.off).toMatch(/^Need /);
  });

  it('a whole order that fits is not cut', () => {
    const g = fresh(500_000);
    expect(affordableFirstStep(g, lines)).toEqual(lines);
    expect(orderShortfall(g, lines)).toBe(0);
  });
});

describe('identical stalled rows fold into one', () => {
  const row = (key: string, days: number, at: string, label = 'Timber cabin (plumbing repair)'): StuckRow =>
    ({ key, at, label, days, what: '1 coil of PEX pipe', lines: [{ material: 'lumber', qty: 1 }], cost: 1_283 });

  it('counts them, keeps the longest and shortest wait, and orders for all of them together', () => {
    const g = fresh(200_000);
    const out = groupStuckRows(g, [row('a', 245, 'x1'), row('b', 234, 'x2'), row('c', 148, 'x3'), { ...row('d', 150, 'x4', 'Timber cabin'), what: '10 fieldstone' }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ count: 3, days: 245, minDays: 148, at: 'x1', ats: ['x1', 'x2', 'x3'] });
    expect(out[0].lines).toEqual([{ material: 'lumber', qty: 3 }]);
    expect(out[0].cost).toBe(orderCost([{ material: 'lumber', qty: 3 }], prices(g)));
    expect(out[1].count).toBe(1);
  });

  it('falls back to the first row order when the whole sum cannot be paid', () => {
    const g = fresh(1_000);
    g.stock = emptyStock();
    const out = groupStuckRows(g, [{ ...row('a', 9, 'x1'), lines: [{ material: 'lumber', qty: 1 }], cost: 100 }, { ...row('b', 8, 'x2'), lines: [{ material: 'lumber', qty: 100000 }], cost: 1e9 }]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].lines).toEqual([{ material: 'lumber', qty: 1 }]);
  });

  it('leaves a lone row as it was', () => {
    const g = fresh(100_000);
    const r = row('a', 40, 'x1');
    expect(groupStuckRows(g, [r])).toEqual([{ ...r, count: 1, minDays: 40, ats: ['x1'] }]);
  });
});

describe('a thin pantry on day 0 is a calm first step, not an alarm', () => {
  it('the same pantry is amber on day 0 and red once the days run', async () => {
    const { compoundBoard, BOARD } = await import('./compoundBoard');
    const { whatToDo } = await import('./whatToDo');
    const { daysOfFood } = await import('./needs');
    const g = newGame(5);
    g.clock.t = 0;
    // a thin pantry: a day or two on the shelf, nobody hungry yet
    for (const f of ['canned', 'grain', 'meat', 'produce', 'dairy', 'fats', 'sugar'] as const) if (f in g.stock) (g.stock as Record<string, number>)[f] = 0;
    (g.stock as Record<string, number>).canned = 3;
    const b0 = compoundBoard(g), f0 = b0.vitals.find(v => v.id === 'food')!;
    expect(f0.n ?? 99).toBeLessThan(BOARD.foodBad);
    expect(f0.first).toBe(true);
    expect(f0.tone).toBe('warn');
    const row = whatToDo(g, { board: b0 }).rows.find(r => r.id === 'alarm:food')!;
    expect(row.tone).toBe('warn');
    expect(row.title).not.toMatch(/^Out of food/);
    expect(row.act).toMatchObject({ act: { type: 'shop', tab: 'food' } });
    // the days of food are the same, and from day 1 the card is red again
    expect(daysOfFood(g)).toBeLessThan(BOARD.foodBad);
    g.clock.t = 2;
    const f2 = compoundBoard(g).vitals.find(v => v.id === 'food')!;
    expect(f2.first).toBeUndefined();
    expect(f2.tone).toBe('bad');
  });
});
