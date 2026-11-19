import { describe, expect, it } from 'vitest';
import { breachOf, easeInterior, harshOutside, interiorDormant, interiorTarget, type InteriorInput } from './interiorClimate';

const base: InteriorInput = { indoorF: 68, outF: 5, powered: true, health: 1 };

describe('interior climate', () => {
  it('a heated, whole, powered dome is fully protected in an ice age or in the heat', () => {
    expect(interiorTarget(base)).toBe(1);
    expect(interiorTarget({ ...base, outF: 118, indoorF: 76 })).toBe(1);
  });
  it('indoor air under freezing or over the heat line loses the protection', () => {
    expect(interiorTarget({ ...base, indoorF: 10 })).toBe(0);
    expect(interiorTarget({ ...base, indoorF: 115, outF: 120 })).toBe(0);
    expect(interiorTarget({ ...base, indoorF: 36 })).toBeGreaterThan(0.9);
  });
  it('more panels down never makes the inside more protected', () => {
    for (const outF of [-20, 20, 60, 118]) for (const indoorF of [-5, 30, 45, 70, 105]) for (const powered of [true, false]) {
      let last = 2;
      for (let h = 1; h >= 0.2; h -= 0.05) { const v = interiorTarget({ indoorF, outF, powered, health: h }); expect(v).toBeLessThanOrEqual(last + 1e-12); last = v; }
    }
  });
  it('a dark plant never makes the inside more protected', () => {
    for (const outF of [-20, 20, 60, 118]) for (const indoorF of [-5, 30, 45, 70, 105]) for (const health of [1, 0.9, 0.5, 0.2]) {
      expect(interiorTarget({ indoorF, outF, health, powered: false })).toBeLessThanOrEqual(interiorTarget({ indoorF, outF, health, powered: true }) + 1e-12);
    }
  });
  it('a breach costs nothing when the outside is mild', () => {
    expect(interiorTarget({ indoorF: 70, outF: 62, powered: false, health: 0.2 })).toBe(1);
    expect(harshOutside(60)).toBe(0); expect(harshOutside(-10)).toBe(1); expect(harshOutside(120)).toBe(1);
    expect(breachOf(1)).toBe(0); expect(breachOf(0.2)).toBe(1);
  });
  it('eases slowly down and a little faster up, and never leaves 0..1', () => {
    let v = 1;
    for (let d = 0; d < 1; d += 0.25) v = easeInterior(v, 0, 0.25);
    expect(v).toBeGreaterThan(0.6); expect(v).toBeLessThan(0.9);
    for (let d = 0; d < 30; d += 1) v = easeInterior(v, 0, 1);
    expect(v).toBeLessThan(0.01);
    const up = easeInterior(0, 1, 1), down = 1 - easeInterior(1, 0, 1);
    expect(up).toBeGreaterThan(down);
    expect(easeInterior(NaN, 0.7, 1)).toBe(0.7);
    expect(easeInterior(0.5, Infinity, 1)).toBeLessThanOrEqual(1);
    expect(easeInterior(0.5, 1, NaN)).toBe(0.5);
  });
  it('the lawn is green in a warm band and dormant only in a frost-band dome', () => {
    expect(interiorDormant(70)).toBe(0); expect(interiorDormant(54)).toBe(0);
    expect(interiorDormant(35)).toBeGreaterThan(0.4);
    let last = 1; for (let f = 30; f <= 60; f += 2) { const v = interiorDormant(f); expect(v).toBeLessThanOrEqual(last + 1e-12); last = v; }
  });
  it('is finite for bad input', () => {
    const v = interiorTarget({ indoorF: NaN, outF: NaN, powered: true, health: NaN });
    expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
  });
});
