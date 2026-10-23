import { describe, it, expect } from 'vitest';
import { phaseWeights } from './dayPhase';

describe('phaseWeights', () => {
  it('is pure day at noon and pure night at midnight', () => {
    expect(phaseWeights(12)).toEqual({ day: 1, golden: 0, night: 0 });
    expect(phaseWeights(0)).toEqual({ day: 0, golden: 0, night: 1 });
  });

  it('peaks golden at dawn and dusk', () => {
    expect(phaseWeights(6.5).golden).toBeCloseTo(1);
    expect(phaseWeights(18.7).golden).toBeCloseTo(1);
  });

  it('weights always sum to 1 and change continuously', () => {
    let prev = phaseWeights(0);
    for (let t = 0.05; t <= 24; t += 0.05) {
      const w = phaseWeights(t);
      expect(w.day + w.golden + w.night).toBeCloseTo(1, 6);
      expect(Math.abs(w.day - prev.day)).toBeLessThan(0.1);
      expect(Math.abs(w.night - prev.night)).toBeLessThan(0.1);
      prev = w;
    }
  });

  it('wraps hours outside 0–24', () => {
    expect(phaseWeights(36)).toEqual(phaseWeights(12));
  });
});
