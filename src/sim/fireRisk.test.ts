import { describe, expect, it } from 'vitest';
import { bandOf, burnChance, fireMarks } from './fireRisk';
import { newGame } from './state';

describe('fire risk', () => {
  it('matches the wildfire formula: more trees, more risk, capped', () => {
    expect(burnChance(0, 1)).toBeCloseTo(0.05);
    expect(burnChance(5, 1)).toBeCloseTo(0.35);
    expect(burnChance(40, 1)).toBeCloseTo(0.85);
    expect(burnChance(5, 0.3)).toBeCloseTo(0.105);
  });
  it('bands', () => { expect(bandOf(0.1)).toBe('low'); expect(bandOf(0.3)).toBe('moderate'); expect(bandOf(0.6)).toBe('high'); });
  it('a new game has no finished buildings to mark', () => {
    const s = newGame(3, 100, 2027, { mode: 'sandbox' });
    expect(fireMarks(s, {}).every(m => m.p >= 0 && m.p <= 0.85)).toBe(true);
  });
});
