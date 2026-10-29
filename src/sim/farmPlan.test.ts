import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { calendar, foodPlan, monthOf, outlook, spoilageRisks, stores, thisSeason, dateText } from './farmPlan';
import { sowWindow } from './crops';
import { addFood } from './pantry';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -100 };
  g.structures.push(st);
  return st;
};

describe('farm plan', () => {
  it('months and dates', () => {
    expect(monthOf(1)).toBe(0); expect(monthOf(60)).toBe(2); expect(monthOf(365)).toBe(11);
    expect(dateText(32)).toBe('Feb 1');
  });
  it('the calendar only offers what the place has, and says what is on now and soon', () => {
    const g = newGame(1, 100);
    expect(thisSeason(g)).toEqual([]);
    built(g, 'f', 'field');
    const [w0] = sowWindow(g);
    g.clock.startDoy = w0 - 10;
    const soon = thisSeason(g);
    expect(soon.find(d => d.item.id === 'sow')?.state).toBe('soon');
    g.clock.startDoy = w0 + 3;
    expect(thisSeason(g).find(d => d.item.id === 'sow')?.state).toBe('now');
    expect(calendar(g).filter(i => i.here).map(i => i.id)).toContain('sow');
  });
  it('stores are counted in days by where they are kept', () => {
    const g = newGame(1);
    addFood(g, 'rice_bucket', 10);
    const s = stores(g);
    expect(s.needPerDay).toBeGreaterThan(5000);
    expect(s.lines.find(l => l.id === 'dry')!.days).toBeGreaterThan(50);
    expect(s.totalDays).toBeGreaterThan(50);
  });
  it('spoilage and the plan name what is wrong', () => {
    const g = newGame(1, 250);
    built(g, 'h', 'timber_cabin'); built(g, 'f', 'field');
    g.stock.fresh = 100; g.stock.lids = 20; g.stock.canner = 0;
    expect(spoilageRisks(g).some(r => /rotting/.test(r.text))).toBe(true);
    const plan = foodPlan(g).map(p => p.text).join(' ');
    expect(plan).toMatch(/pressure canner/);
    expect(outlook(g).fieldsKcal).toBeGreaterThan(100_000);
  });
});
