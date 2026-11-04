import { describe, expect, it } from 'vitest';
import { closing, deckY, findCountyGaps, onGap } from './countyCrossings';

const flat = () => 1;
describe('county road gaps', () => {
  it('flat ground has none', () => expect(findCountyGaps(flat, () => false, 0, 100)).toEqual([]));
  it('a gorge across the road is one gap, rim to rim, level with the rims', () => {
    const h = (z: number) => (Math.abs(z - 50) < 6 ? 1 - 4 * (1 - Math.abs(z - 50) / 6) : 1);   // a V, 4 units deep
    const g = findCountyGaps(h, () => false, 0, 100, { maxDryM: 200 });
    expect(g).toHaveLength(1);
    expect(g[0].z0).toBeLessThanOrEqual(46); expect(g[0].z1).toBeGreaterThanOrEqual(54);
    expect(g[0].depth).toBeGreaterThan(3.5);
    expect(deckY(g[0], 50)).toBeCloseTo(1, 1);
    expect(onGap(g, 50)).toBe(g[0]); expect(onGap(g, 10)).toBeNull();
  });
  it('a creek on flat ground is a gap by wetness; a shallow dip is not', () => {
    expect(findCountyGaps(flat, z => Math.abs(z - 50) < 1, 0, 100)).toHaveLength(1);
    expect(findCountyGaps(z => (Math.abs(z - 50) < 3 ? 0.5 : 1), () => false, 0, 100)).toEqual([]);
  });
  it('two cuts a few units apart merge; far apart stay two', () => {
    const cut = (c: number) => (z: number) => (Math.abs(z - c) < 1.5 ? -2 : 0);
    expect(findCountyGaps(z => Math.min(cut(60)(z), cut(63)(z)), () => false, 0, 120)).toHaveLength(1);
    expect(findCountyGaps(z => Math.min(cut(30)(z), cut(90)(z)), () => false, 0, 120)).toHaveLength(2);
  });
  it('the deck is lifted clear of the water', () => {
    const g = findCountyGaps(flat, z => Math.abs(z - 50) < 1, 0, 100)[0];
    expect(deckY(g, 50, 1.4)).toBe(1.4);
  });
  it('a dry valley wider than a bridge is worth is left to the road to grade through; water is always bridged', () => {
    const h = (z: number) => (Math.abs(z - 100) < 20 ? -3 : 0);
    expect(findCountyGaps(h, () => false, 0, 200)).toEqual([]);
    expect(findCountyGaps(h, z => Math.abs(z - 100) < 1, 0, 200)).toHaveLength(1);
  });
  it('a wall wider than the window is not bridged (the road runs down it)', () => {
    const cl = closing(Array.from({ length: 200 }, (_, i) => (i > 40 && i < 160 ? -3 : 0)), 5);
    expect(cl[100]).toBe(-3);
  });
});
