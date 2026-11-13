import { describe, expect, it } from 'vitest';
import { COZY_NONE, cozyFrom, cozyKey, TIER_DAYS, type CozyInput } from './cozy';

const base: CozyInput = { days: 0, kids: false, foodDays: 0, books: false, candles: false, dog: false, garden: false };
const rich: CozyInput = { days: 900, kids: true, foodDays: 120, books: true, candles: true, dog: true, garden: true };

describe('cozy decor', () => {
  it('a new home is bare, a settled one is full, and decor only ever grows with time', () => {
    const n = cozyFrom(base), s = cozyFrom(rich);
    expect(n.tier).toBe(0);
    expect(n.kettle || n.herbs || n.photos || n.pillows > 0).toBe(false);
    expect(s.tier).toBe(3);
    expect(s.pillows).toBe(3);
    for (const k of ['throwBlanket', 'kettle', 'herbs', 'garlic', 'drawings', 'photos', 'plant', 'books', 'rug2'] as const) expect(s[k], k).toBe(true);
    expect(s.candles).toBe(3);
    expect(s.preserves).toBe(3);
    let prev = cozyFrom({ ...rich, days: 0 });
    for (const days of [TIER_DAYS[0], TIER_DAYS[1], TIER_DAYS[2], 2000]) {
      const c = cozyFrom({ ...rich, days });
      for (const k of ['pillows', 'candles', 'preserves', 'tier'] as const) expect(c[k]).toBeGreaterThanOrEqual(prev[k]);
      prev = c;
    }
  });
  it('reads what the family owns: no kids no drawings, no books no bookstack, a bare pantry no preserves', () => {
    const c = cozyFrom({ ...rich, kids: false, books: false, foodDays: 0 });
    expect(c.drawings).toBe(false);
    expect(c.books).toBe(false);
    expect(c.preserves).toBe(0);
    expect(c.garlic).toBe(false);
  });
  it('preserves follow the pantry', () => {
    const p = (foodDays: number) => cozyFrom({ ...rich, foodDays }).preserves;
    expect([p(5), p(20), p(60), p(200)]).toEqual([0, 1, 2, 3]);
  });
  it('keys differ when the decor differs and match when it does not', () => {
    expect(cozyKey(cozyFrom(rich))).toBe(cozyKey(cozyFrom({ ...rich })));
    expect(cozyKey(cozyFrom(rich))).not.toBe(cozyKey(cozyFrom(base)));
    expect(cozyKey(COZY_NONE)).toBe(cozyKey(cozyFrom(base)));
  });
});
