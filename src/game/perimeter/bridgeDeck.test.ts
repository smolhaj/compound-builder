import { describe, expect, it } from 'vitest';
import { BRIDGE_GRADE, deckGrade } from './bridgeDeck';

describe('bridge deck on a slope', () => {
  it('level ground gives a level deck', () => { expect(deckGrade(5, 5, 2)).toEqual({ ya: 5, yb: 5 }); });
  it('a gentle slope pitches the deck to meet both banks (no gap under the low end)', () => {
    const g = deckGrade(5, 5.15, 2);
    expect(g).toEqual({ ya: 5, yb: 5.15 });
  });
  it('a steep slope is held to the bridge grade by lifting the LOWER end, never by lowering the higher one into the bank', () => {
    for (const [a, b] of [[5, 6], [6, 5]] as const) {
      const g = deckGrade(a, b, 2), hi = Math.max(a, b);
      expect(Math.abs(g.yb - g.ya)).toBeCloseTo(BRIDGE_GRADE * 2, 9);
      expect(Math.max(g.ya, g.yb)).toBeCloseTo(hi, 9);
      expect(g.ya).toBeGreaterThanOrEqual(a - 1e-9); expect(g.yb).toBeGreaterThanOrEqual(b - 1e-9);
    }
  });
});
