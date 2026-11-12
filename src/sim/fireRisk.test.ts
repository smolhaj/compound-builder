import { describe, expect, it } from 'vitest';
import { bandOf, burnChance, fireMarks, fireOverlayNote, type FireMark } from './fireRisk';
import { newGame } from './state';

describe('fire overlay empty state', () => {
  const m = (band: FireMark['band']): FireMark => ({ id: 'a', x: 0, z: 0, near: 1, p: 0.1, band });
  it('explains an empty or all-green map and stays quiet when there is something to read', () => {
    expect(fireOverlayNote([], 0)).toMatch(/Nothing to mark/);
    expect(fireOverlayNote([], 2)).toMatch(/underground/);
    expect(fireOverlayNote([m('low'), m('low')], 2)).toMatch(/green/);
    expect(fireOverlayNote([m('low'), m('high')], 2)).toBeNull();
  });
});

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
