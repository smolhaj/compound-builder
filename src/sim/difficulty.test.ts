import { describe, expect, it } from 'vitest';
import { DIFFICULTY, diffOf, difficultySummary, type Difficulty } from './difficulty';
import { newGame } from './state';
import { newDisaster, priceFactor, tension, tracksAt } from './disaster';
import { cadence, postureOf } from './encounters';
import { reviewDays } from './paperwork';

const LEVELS: Difficulty[] = ['cozy', 'standard', 'hardcore'];

describe('difficulty table', () => {
  it('Standard is 1 everywhere, so a Standard run is exactly the intended game', () => {
    for (const [k, v] of Object.entries(DIFFICULTY.standard)) expect(v).toBe(k === 'hunt' || k === 'winter' ? 0 : k === 'adapt' ? 0.3 : 1);
  });

  it('each knob is ordered Cozy < Standard < Hardcore (hardness) or the reverse (warning, money)', () => {
    const [c, s, h] = LEVELS.map(l => DIFFICULTY[l]);
    for (const k of ['raid', 'wound', 'storms', 'recovery'] as const) { expect(c[k]).toBeLessThan(s[k]); expect(s[k]).toBeLessThan(h[k]); }
    // Hardcore is harder once it hits, never with money: price, permits and savings are Standard's; Cozy is only kinder
    for (const k of ['price', 'permits', 'money'] as const) expect(h[k]).toBe(1);
    // visits are further apart on Cozy, closer on Hardcore
    expect(c.cadence).toBeGreaterThan(s.cadence); expect(s.cadence).toBeGreaterThan(h.cadence);
    expect(c.warn).toBeGreaterThan(s.warn); expect(s.warn).toBeGreaterThan(h.warn);
    expect(c.money).toBeGreaterThan(s.money);
  });

  it('Hardcore differs from Standard in every once-it-hits knob', () => {
    for (const k of ['hunt', 'warn', 'raid', 'cadence', 'wound', 'storms', 'recovery'] as const) expect(DIFFICULTY.hardcore[k]).not.toBe(DIFFICULTY.standard[k]);
  });

  it('a save without a difficulty plays as Standard', () => {
    expect(diffOf(undefined)).toBe(DIFFICULTY.standard);
    expect(diffOf({})).toBe(DIFFICULTY.standard);
  });
});

describe('what the knobs do', () => {
  const run = (difficulty: Difficulty) => newGame(11, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'financial', difficulty });

  it('prices climb less in the panic and the scarcity after on Cozy; Standard and Hardcore are the old curve', () => {
    const at = (l: Difficulty, t: number) => { const d = run(l).disaster; return priceFactor(d, d.hitAt + t); };
    const std = run('standard').disaster;
    // the old curve, written out
    const old = (t: number) => { const w = tension(std, t); if (t < std.hitAt) return 1 + 0.6 * w * w; const tr = tracksAt(std, t); return 1.6 + 2.4 * (1 - Math.min(tr.stores, tr.deliveries)); };
    for (const dt of [-30, -5, 0, 20, 120, 400]) expect(priceFactor(std, std.hitAt + dt)).toBeCloseTo(old(std.hitAt + dt), 10);
    for (const dt of [10, 60]) { expect(at('hardcore', dt)).toBeCloseTo(at('standard', dt), 10); expect(at('cozy', dt)).toBeLessThan(at('standard', dt)); expect(at('cozy', dt)).toBeGreaterThanOrEqual(1); }
  });

  it('the outside world comes back later on Hardcore and sooner on Cozy (same dice, scaled)', () => {
    for (const seed of [3, 4, 5, 6]) {
      const back = (l: Difficulty) => newDisaster(seed, 'scenario', 'short', 'financial', undefined, l).back;
      const [c, s, h] = LEVELS.map(back);
      for (const t of Object.keys(s) as Array<keyof typeof s>) { expect(c[t]!).toBeLessThanOrEqual(s[t]!); expect(h[t]!).toBeGreaterThanOrEqual(s[t]!); }
    }
  });

  it('raiders come more often on Hardcore (the gap between visits is shorter), less on Cozy', () => {
    const gap = (l: Difficulty) => { const g = run(l); g.clock.t = g.disaster.hitAt + 100; return cadence(g, postureOf(g)); };
    expect(gap('cozy')).toBeGreaterThan(gap('standard'));
    expect(gap('hardcore')).toBeLessThan(gap('standard'));
  });

  it('the county takes half as long over a permit on Cozy; Hardcore is Standard', () => {
    const days = (l: Difficulty) => reviewDays(run(l), 'timber_cabin');
    expect(days('cozy')).toBeLessThan(days('standard'));
    expect(days('hardcore')).toBe(days('standard'));
  });

  it('the savings left after the land are bigger on Cozy; Hardcore is Standard', () => {
    const money = (l: Difficulty) => run(l).money;
    expect(money('cozy')).toBeGreaterThan(money('standard'));
    expect(money('hardcore')).toBe(money('standard'));
    expect(money('cozy') / money('standard')).toBeCloseTo(DIFFICULTY.cozy.money, 2);
  });
});

describe('the menu text', () => {
  it('Standard is the intended game; the others list what changes against it', () => {
    expect(difficultySummary('standard')).toEqual(['after the first year crews are a little bigger against a well-defended place']);
    const hc = difficultySummary('hardcore').join('; ');
    expect(hc).toContain('size of raiding crews +30%');
    expect(hc).toContain('raids at the gate +54%');
    expect(hc).toContain('wound severity +50%');
    expect(hc).toContain('a crew finds a hiding family 12 points more often');
    expect(hc).not.toMatch(/price|permit|savings/);
    expect(hc).toContain('permadeath');
    expect(hc).toContain('after the first year the crews that come for a well-defended place are bigger');
    expect(hc).toContain('the first winter after the hit brings a deep freeze');
    const cz = difficultySummary('cozy').join('; ');
    expect(cz).toContain('warning before the hit +60%');
    expect(cz).toContain('size of raiding crews -30%');
    expect(cz).toContain('nobody dies for good');
  });
});

describe('raiding crew size', () => {
  it('a crew has more heads on Hardcore and fewer on Cozy (the battle counts heads), and the dossier agrees', async () => {
    const { gateDay } = await import('./encounters');
    const first = (l: Difficulty) => {
      let total = 0, n = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'financial', difficulty: l });
        g.clock.t = g.disaster.hitAt + 60; g.disaster.tracks.law = 0.1; g.gate.day = -5; g.gate.next = 0;
        const e = gateDay(g);
        if (e && e.strength) { total += e.size; n++; if (e.kind === 'looters' || e.kind === 'gang') expect(e.dossier[0]).toContain(String(e.size)); }
      }
      return total / Math.max(1, n);
    };
    expect(first('hardcore')).toBeGreaterThan(first('standard'));
    expect(first('cozy')).toBeLessThan(first('standard'));
  });
});
