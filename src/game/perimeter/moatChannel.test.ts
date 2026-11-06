import { describe, expect, it } from 'vitest';
import { MOAT, moatHeight, planMoatChannel, poolAt, waterBed, waterHalf, type Pt } from './moatChannel';

/** A hillside falling toward +z at `slope` (rise per unit), with a cross-fall along x of `along`. */
const hill = (slope: number, along = 0) => (x: number, z: number) => 10 - z * slope - x * along;
const line = (len: number): Pt[] => [[0, 0], [len, 0]];

describe('moat channel: a dug channel with a bank on both sides', () => {
  it('on level ground it is one pool, a symmetric ditch with the crest at the ground', () => {
    const ch = planMoatChannel(line(6), () => 10);
    expect(ch.breaks).toEqual([]);
    expect(waterBed(ch, 3)).toBeCloseTo(10 - MOAT.depth, 9);
    const l = moatHeight(ch, 3, -0.3, 10), r = moatHeight(ch, 3, 0.3, 10);
    expect(l).toBeCloseTo(r, 9);
    expect(l).toBeLessThan(10);
    expect(moatHeight(ch, 3, MOAT.reach + 0.1, 10)).toBe(10);
  });
  it('on a cross-slope there is a bank on the downhill side, above the water, and a cut on the uphill side', () => {
    const nat = hill(0.35), ch = planMoatChannel(line(5), nat);
    const yb = waterBed(ch, 2.5), water = yb + MOAT.waterMax;
    // the channel is flat across: the same bed 0.1 either side of the line
    expect(moatHeight(ch, 2.5, 0.1, nat(2.5, 0.1))).toBeCloseTo(moatHeight(ch, 2.5, -0.1, nat(2.5, -0.1)), 6);
    // downhill (+z falls): the bank crest stands above the full water and above the natural ground there
    let crest = -Infinity;
    for (let d = 0.3; d < 2.4; d += 0.02) { const h = moatHeight(ch, 2.5, d, nat(2.5, d)); crest = Math.max(crest, h); }
    expect(crest).toBeGreaterThan(water + 0.05);
    expect(crest).toBeGreaterThan(nat(2.5, 1.5) + 0.05);
    // uphill: the cut face rises to meet the hill, never below the bed
    for (let d = 0.3; d < 2; d += 0.05) expect(moatHeight(ch, 2.5, -d, nat(2.5, -d))).toBeGreaterThanOrEqual(yb - 1e-9);
  });
  it('the ground is continuous: no jump across the whole footprint, steep or flat', () => {
    for (const slope of [0, 0.2, 0.4, 0.6]) {
      const nat = hill(slope, 0.1), ch = planMoatChannel(line(8), nat);
      let worst = 0;
      for (let x = -0.5; x < 8.5; x += 0.05) for (let z = -2.4; z < 2.4; z += 0.02) {
        const a = moatHeight(ch, x, z, nat(x, z)), b = moatHeight(ch, x, z + 0.02, nat(x, z + 0.02));
        worst = Math.max(worst, Math.abs(a - b));
      }
      expect(worst).toBeLessThan(0.02 * 2.2 + 0.02);   // no step steeper than ~2.2 : 1 per 0.02 cell (the cut face is 1 : 0.7)
    }
  });
  it('along the line the bed only steps at a pool break, by a smooth drop, and the pools are flat', () => {
    const nat = hill(0, 0.25), ch = planMoatChannel(line(10), nat);
    expect(ch.breaks.length).toBeGreaterThan(1);
    expect(ch.bed.length).toBe(ch.breaks.length + 1);
    for (let i = 1; i < ch.bed.length; i++) expect(ch.bed[i]).toBeLessThan(ch.bed[i - 1]);
    // flat inside a pool
    const mid = (ch.breaks[0] + ch.breaks[1]) / 2;
    expect(waterBed(ch, mid)).toBe(waterBed(ch, mid + 0.05));
    // the drop is rounded, not a cliff
    const sa = ch.breaks[0] - MOAT.stepHalf, sb = ch.breaks[0] + MOAT.stepHalf;
    expect(waterBed(ch, sa)).toBeCloseTo(ch.bed[0], 6);
    expect(waterBed(ch, sb)).toBeCloseTo(ch.bed[1], 6);
    expect(poolAt(ch, sa)).toBe(0);
    expect(poolAt(ch, sb)).toBe(1);
  });
  it('the bed is never above the natural ground less the dig depth by more than a pool tolerance', () => {
    const nat = hill(0, 0.2), ch = planMoatChannel(line(12), nat);
    for (let s = 0; s <= 12; s += 0.1) expect(waterBed(ch, s) - (nat(s, 0) - MOAT.depth)).toBeLessThanOrEqual(0.06);
  });
  it('no gap in the bank: the crest is above the full water everywhere the water is', () => {
    const nat = hill(0.3, 0.1), ch = planMoatChannel(line(8), nat);
    for (let s = 0.5; s < 7.5; s += 0.25) {
      const yb = waterBed(ch, s), water = yb + MOAT.waterMax, hw = waterHalf(MOAT.waterMax);
      for (const side of [-1, 1]) { const h = moatHeight(ch, s, side * (hw + 0.02), nat(s, side * (hw + 0.02))); expect(h).toBeGreaterThanOrEqual(water - 0.02); }
    }
  });
  it('a gate gap and the partly dug channel', () => {
    const ch = planMoatChannel(line(6), () => 10);
    expect(moatHeight(ch, 3, 0, 10, 1, [{ at: 3, w: 1 }])).toBe(10);
    const half = moatHeight(ch, 3, 0, 10, 0.5);
    expect(half).toBeGreaterThan(moatHeight(ch, 3, 0, 10, 1));
    expect(half).toBeLessThan(10);
  });
});
