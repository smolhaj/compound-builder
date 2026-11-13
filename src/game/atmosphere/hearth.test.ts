import { describe, expect, it } from 'vitest';
import { fireLevel, fireScale, flicker, lampScale, roomVariant } from './hearth';

describe('warmth', () => {
  it('lamps dim but stay on; the fire sinks faster than the lamps', () => {
    expect(lampScale(1)).toBe(1);
    expect(lampScale(0)).toBeGreaterThan(0.2);
    for (const w of [0.2, 0.5, 0.8]) expect(fireScale(w)).toBeLessThan(lampScale(w));
    expect(fireScale(0)).toBe(0);
  });
  it('the fire follows the dark and the cold, and a cold dark night burns hardest', () => {
    expect(fireLevel(1, 0, 1)).toBeGreaterThan(fireLevel(0, 0, 1));
    expect(fireLevel(0, 1, 1)).toBeGreaterThan(fireLevel(0, 0.2, 1));
    expect(fireLevel(1, 1, 0.3)).toBeLessThan(fireLevel(1, 1, 1));
  });
  it('rooms keep one of three colour temperatures, spread over a compound', () => {
    expect(roomVariant('a1')).toBe(roomVariant('a1'));
    const seen = new Set(Array.from({ length: 30 }, (_, i) => roomVariant('b' + i)));
    expect(seen.size).toBe(3);
  });
  it('the flicker stays in a believable band', () => {
    for (let t = 0; t < 20; t += 0.1) { const f = flicker(t, 1); expect(f).toBeGreaterThan(0.75); expect(f).toBeLessThanOrEqual(1.001); }
  });
});
