import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { compoundBoard } from './compoundBoard';
import { actKey, TODO_ROWS, whatToDo } from './whatToDo';

describe('whatToDo', () => {
  it('shows at most three rows, first an alarm when food runs out', () => {
    const g = newGame(7);
    g.stock = { ...g.stock, food: 0 } as typeof g.stock;
    const w = whatToDo(g);
    expect(w.rows.length).toBeLessThanOrEqual(TODO_ROWS);
    expect(w.rows.length).toBeGreaterThan(0);
  });
  it('never repeats a click or a title', () => {
    const w = whatToDo(newGame(3));
    const keys = w.rows.map(r => actKey(r.act?.act)).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(w.rows.map(r => r.title.toLowerCase())).size).toBe(w.rows.length);
  });
  it('a fresh game has a goal row with an action', () => {
    const w = whatToDo(newGame(3));
    const goal = w.rows.find(r => r.kind === 'goal');
    expect(goal?.act).toBeTruthy();
    expect(w.progress?.total).toBeGreaterThan(0);
  });
  it('folds the goal away when the player closed the goals', () => {
    const w = whatToDo(newGame(3), { goalsClosed: 'dismissed' });
    expect(w.rows.some(r => r.kind === 'goal')).toBe(false);
  });
  it('actKey distinguishes shelves', () => {
    expect(actKey({ type: 'shop', tab: 'food' })).not.toBe(actKey({ type: 'shop', tab: 'tools' }));
  });
  it('a red food vital leads with "Out of food in 3 days" and an Open food shelf click', () => {
    const g = newGame(5);
    g.clock.t = 2;   // past day 0
    g.disaster.phase = 'warning';
    const b = compoundBoard(g);
    b.vitals = b.vitals.map(v => (v.id === 'food' ? { ...v, tone: 'bad' as const, n: 3 } : v));
    const w = whatToDo(g, { board: b });
    expect(w.rows[0].kind).toBe('alarm');
    expect(w.rows[0].title).toBe('Out of food in 3 days');
    expect(w.rows[0].act).toMatchObject({ label: 'Open food shelf', act: { type: 'shop', tab: 'food' } });
    expect(w.rows.length).toBeLessThanOrEqual(TODO_ROWS);
  });
  it('day 0: the first-hour goal leads and the food alarm follows', () => {
    const g = newGame(5), b = compoundBoard(g);
    b.vitals = b.vitals.map(v => (v.id === 'food' ? { ...v, tone: 'bad' as const, n: 3 } : v));
    const w = whatToDo(g, { board: b });
    expect(w.rows[0].kind).toBe('goal');
    expect(w.rows.some(r => r.id === 'alarm:food')).toBe(true);
  });
  it('day 0 with food at 0 days, or a collapse running: the alarm leads', () => {
    const g = newGame(5), b = compoundBoard(g);
    b.vitals = b.vitals.map(v => (v.id === 'food' ? { ...v, tone: 'bad' as const, n: 0 } : v));
    expect(whatToDo(g, { board: b }).rows[0].id).toBe('alarm:food');
    const h = newGame(5), b2 = compoundBoard(h);
    b2.vitals = b2.vitals.map(v => (v.id === 'food' ? { ...v, tone: 'bad' as const, n: 3 } : v));
    h.disaster.phase = 'survival';
    expect(whatToDo(h, { board: b2 }).rows[0].id).toBe('alarm:food');
  });
  it('an alarm and the goal both fit, and a goal that offers the same click is dropped', () => {
    const g = newGame(5), b = compoundBoard(g);
    g.clock.t = 2;
    b.vitals = b.vitals.map(v => (v.id === 'food' ? { ...v, tone: 'bad' as const, n: 3 } : v));
    const w = whatToDo(g, { board: b });
    const keys = w.rows.map(r => actKey(r.act?.act)).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
