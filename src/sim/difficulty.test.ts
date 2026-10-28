import { describe, expect, it } from 'vitest';
import { DIFFICULTY, diffOf, difficultySummary, type Difficulty } from './difficulty';
import { newGame } from './state';
import { newDisaster, priceFactor, tension, tracksAt } from './disaster';
import { cadence, postureOf } from './encounters';
import { reviewDays } from './paperwork';

const LEVELS: Difficulty[] = ['cozy', 'standard', 'hardcore'];

describe('difficulty table', () => {
  it('Standard is 1 everywhere, so a Standard run is exactly the intended game', () => {
    for (const v of Object.values(DIFFICULTY.standard)) expect(v).toBe(1);
  });

  it('each knob is ordered Cozy < Standard < Hardcore (hardness) or the reverse (warning, money)', () => {
    const [c, s, h] = LEVELS.map(l => DIFFICULTY[l]);
    for (const k of ['raid', 'wound', 'storms', 'price', 'recovery', 'permits'] as const) { expect(c[k]).toBeLessThan(s[k]); expect(s[k]).toBeLessThan(h[k]); }
    // visits are further apart on Cozy, closer on Hardcore
    expect(c.cadence).toBeGreaterThan(s.cadence); expect(s.cadence).toBeGreaterThan(h.cadence);
    expect(c.warn).toBeGreaterThan(s.warn); expect(s.warn).toBeGreaterThan(h.warn);
    expect(c.money).toBeGreaterThan(s.money); expect(s.money).toBeGreaterThan(h.money);
  });

  it('Standard and Hardcore now differ in every knob, not just warning and raids', () => {
    for (const k of Object.keys(DIFFICULTY.standard) as Array<keyof typeof DIFFICULTY.standard>) expect(DIFFICULTY.hardcore[k]).not.toBe(DIFFICULTY.standard[k]);
  });

  it('a save without a difficulty plays as Standard', () => {
    expect(diffOf(undefined)).toBe(DIFFICULTY.standard);
    expect(diffOf({})).toBe(DIFFICULTY.standard);
  });
});

describe('what the knobs do', () => {
  const run = (difficulty: Difficulty) => newGame(11, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'financial', difficulty });

  it('prices climb higher in the panic and the scarcity after on Hardcore, less on Cozy; Standard is the old curve', () => {
    const at = (l: Difficulty, t: number) => { const d = run(l).disaster; return priceFactor(d, d.hitAt + t); };
    const std = run('standard').disaster;
    // the old curve, written out
    const old = (t: number) => { const w = tension(std, t); if (t < std.hitAt) return 1 + 0.6 * w * w; const tr = tracksAt(std, t); return 1.6 + 2.4 * (1 - Math.min(tr.stores, tr.deliveries)); };
    for (const dt of [-30, -5, 0, 20, 120, 400]) expect(priceFactor(std, std.hitAt + dt)).toBeCloseTo(old(std.hitAt + dt), 10);
    for (const dt of [-3, 10, 60]) { expect(at('hardcore', dt)).toBeGreaterThan(at('standard', dt)); expect(at('cozy', dt)).toBeLessThan(at('standard', dt)); expect(at('cozy', dt)).toBeGreaterThanOrEqual(1); }
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

  it('the county takes longer over a permit on Hardcore, half as long on Cozy', () => {
    const days = (l: Difficulty) => reviewDays(run(l), 'timber_cabin');
    expect(days('cozy')).toBeLessThan(days('standard'));
    expect(days('hardcore')).toBeGreaterThan(days('standard'));
  });

  it('the savings left after the land are bigger on Cozy, smaller on Hardcore', () => {
    const money = (l: Difficulty) => run(l).money;
    expect(money('cozy')).toBeGreaterThan(money('standard'));
    expect(money('hardcore')).toBeLessThan(money('standard'));
    expect(money('cozy') / money('standard')).toBeCloseTo(DIFFICULTY.cozy.money, 2);
  });
});

describe('the menu text', () => {
  it('Standard is the intended game; the others list what changes against it', () => {
    expect(difficultySummary('standard')).toEqual(['the intended game']);
    const hc = difficultySummary('hardcore').join('; ');
    expect(hc).toContain('raider crews +35%');
    expect(hc).toContain('price spikes +40%');
    expect(hc).toContain('raids at the gate +25%');
    expect(hc).toContain('permadeath');
    const cz = difficultySummary('cozy').join('; ');
    expect(cz).toContain('warning before the hit +60%');
    expect(cz).toContain('raider crews -40%');
    expect(cz).toContain('nobody dies for good');
  });
});
