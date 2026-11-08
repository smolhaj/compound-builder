import { describe, expect, it } from 'vitest';
import { breachFates, takeCap, type BreachCrew, type BreachDefender, type Fate } from './breachFates';
import { mulberry32 } from './rng';

const adult = (i: number, down = false): BreachDefender => ({ id: `h${i}`, down, kid: false, age: 35 });
const kid = (i: number): BreachDefender => ({ id: `k${i}`, down: false, kid: true, age: 12 });
const tally = (defs: (n: number) => BreachDefender, crew: BreachCrew, N = 3000) => {
  const r = mulberry32(11), t: Record<Fate, number> = { killed: 0, finished: 0, wounded: 0, taken: 0, held: 0, fled: 0, spared: 0, hid: 0 };
  for (let i = 0; i < N; i++) for (const f of breachFates([defs(i)], crew, r)) t[f.fate]++;
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / N])) as Record<Fate, number>;
};

describe('what becomes of the defenders when the line breaks', () => {
  it('gives every defender exactly one fate', () => {
    const defs = [adult(1), adult(2, true), kid(3), adult(4)];
    const out = breachFates(defs, { temper: 'hard', kind: 'gang', men: 6 }, mulberry32(1));
    expect(out.map(o => o.id)).toEqual(defs.map(d => d.id));
    for (const o of out) expect(['killed', 'finished', 'wounded', 'taken', 'held', 'fled', 'spared', 'hid']).toContain(o.fate);
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
  it('hostile (a hard gang): kills nearly everyone it finds, sometimes keeps a captive', () => {
    const up = tally(adult, { temper: 'hard', kind: 'gang', men: 8 });
    expect(up.killed + up.finished).toBeGreaterThan(0.4); expect(up.taken).toBeGreaterThan(0.05); expect(up.spared).toBe(0);
  });
  it('merciful (hard militia): holds and takes nobody to kill, spares the unarmed who comply, never the armed', () => {
    const unarmed = tally(i => ({ ...adult(i), armed: false }), { temper: 'hard', kind: 'militia', men: 8 });
    expect(unarmed.spared).toBeGreaterThan(0.5); expect(unarmed.killed).toBeLessThan(0.03);
    const armed = tally(i => ({ ...adult(i), armed: true }), { temper: 'hard', kind: 'militia', men: 8 });
    expect(armed.spared).toBe(0); expect(armed.killed + armed.wounded + armed.held + armed.fled).toBeCloseTo(1, 5);
  });
  it('desperate: grabs and goes. Children are always spared, nobody is taken, almost nobody is shot', () => {
    const up = tally(adult, { temper: 'desperate', kind: 'looters', men: 3 });
    expect(up.killed).toBeLessThan(0.08); expect(up.taken).toBe(0); expect(up.spared).toBe(0);   // (a man on his feet with a gun is held or hurt, never spared)
    const down = tally(i => adult(i, true), { temper: 'desperate', kind: 'looters', men: 3 });
    expect(down.spared + down.wounded).toBeGreaterThan(0.9);
    const kids = tally(kid, { temper: 'desperate', kind: 'looters', men: 3 });
    expect(kids.spared).toBe(1);
  });
  it('a merciful crew ALWAYS spares a child, whatever the temper; a hostile one never promises it', () => {
    for (const [temper, kind] of [['desperate', 'refugees'], ['desperate', 'looters'], ['hard', 'militia'], ['hard', 'patrol']] as const) expect(tally(kid, { temper, kind, men: 8 }, 600).spared).toBe(1);
    const gang = tally(kid, { temper: 'hard', kind: 'gang', men: 8 }, 1500);
    expect(gang.spared).toBeLessThan(0.3); expect(gang.taken).toBe(0);   // (a hard gang does not carry children off)
    expect(tally(kid, { temper: 'savage', kind: 'gang', men: 8 }, 1500).taken).toBeGreaterThan(0.4);
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
