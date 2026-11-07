import { describe, expect, it } from 'vitest';
import { breachFates, takeCap, type BreachCrew, type BreachDefender, type Fate } from './breachFates';
import { mulberry32 } from './rng';

const adult = (i: number, down = false): BreachDefender => ({ id: `h${i}`, down, kid: false, age: 35 });
const kid = (i: number): BreachDefender => ({ id: `k${i}`, down: false, kid: true, age: 12 });
const tally = (defs: (n: number) => BreachDefender, crew: BreachCrew, N = 3000) => {
  const r = mulberry32(11), t: Record<Fate, number> = { killed: 0, finished: 0, wounded: 0, taken: 0, held: 0, fled: 0 };
  for (let i = 0; i < N; i++) for (const f of breachFates([defs(i)], crew, r)) t[f.fate]++;
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / N])) as Record<Fate, number>;
};

describe('what becomes of the defenders when the line breaks', () => {
  it('gives every defender exactly one fate', () => {
    const defs = [adult(1), adult(2, true), kid(3), adult(4)];
    const out = breachFates(defs, { temper: 'hard', kind: 'gang', men: 6 }, mulberry32(1));
    expect(out.map(o => o.id)).toEqual(defs.map(d => d.id));
    for (const o of out) expect(['killed', 'finished', 'wounded', 'taken', 'held', 'fled']).toContain(o.fate);
  });
  it('is deterministic', () => {
    const defs = [adult(1), adult(2), adult(3, true), kid(4)];
    const a = breachFates(defs, { temper: 'savage', men: 5 }, mulberry32(9)), b = breachFates(defs, { temper: 'savage', men: 5 }, mulberry32(9));
    expect(a).toEqual(b);
  });
  it('savage: shoots or finishes; takes the children, never an adult', () => {
    const up = tally(adult, { temper: 'savage', men: 6 });
    expect(up.killed + up.wounded).toBeGreaterThan(0.6); expect(up.taken).toBe(0);
    const down = tally(i => adult(i, true), { temper: 'savage', men: 6 });
    expect(down.finished).toBeGreaterThan(0.5);
    const k = tally(kid, { temper: 'savage', men: 6 });
    expect(k.taken).toBeGreaterThan(0.4);
  });
  it('hard: takes or hurts, holds the rest, kills rarely', () => {
    const up = tally(adult, { temper: 'hard', kind: 'gang', men: 8 });
    expect(up.held + up.taken + up.wounded).toBeGreaterThan(0.75); expect(up.killed).toBeLessThan(0.12); expect(up.taken).toBeGreaterThan(0.1);
    const mil = tally(adult, { temper: 'hard', kind: 'militia', men: 8 });
    expect(mil.killed).toBeLessThan(up.killed);
  });
  it('desperate: grabs and goes. Holds some, the rest run, almost nobody is shot, nobody is taken', () => {
    const up = tally(adult, { temper: 'desperate', kind: 'looters', men: 3 });
    expect(up.held + up.fled).toBeGreaterThan(0.85); expect(up.killed).toBeLessThan(0.08); expect(up.taken).toBe(0);
    const down = tally(i => adult(i, true), { temper: 'desperate', kind: 'looters', men: 3 });
    expect(down.wounded).toBeGreaterThan(0.9);
    const kids = tally(kid, { temper: 'desperate', kind: 'looters', men: 3 });
    expect(kids.taken).toBe(0); expect(kids.killed).toBe(0);
  });
  it('refugees shoot nobody on purpose', () => {
    const up = tally(adult, { temper: 'desperate', kind: 'refugees', men: 6 });
    expect(up.killed).toBeLessThan(0.03);
  });
  it('a crew carries off only so many: hard two, desperate none', () => {
    expect(takeCap('hard', 'gang', 12)).toBe(2); expect(takeCap('hard', 'gang', 3)).toBe(1); expect(takeCap('desperate', 'looters', 12)).toBe(0);
    const out = breachFates(Array.from({ length: 12 }, (_, i) => adult(i)), { temper: 'hard', kind: 'gang', men: 12 }, mulberry32(4));
    expect(out.filter(o => o.fate === 'taken').length).toBeLessThanOrEqual(2);
  });
});
