import { describe, expect, it } from 'vitest';
import { gradeSquare, gradingCost, gradingLine, isGradedTier, padHalf } from './grading';

const plane = (slope: number) => (x: number) => x * slope;   // rise per unit of run, along x
const sq = (cells: number) => ({ x: 0, z: 0, half: padHalf(cells) });

describe('dome grading', () => {
  it('level ground moves no dirt and costs nothing', () => {
    const g = gradeSquare(sq(36), () => 5);
    expect(g.cutCy).toBe(0); expect(g.fillCy).toBe(0); expect(g.wallSf).toBe(0);
    expect(gradingCost(g).usd).toBe(0); expect(gradingLine(g)).toMatch(/Level/);
  });
  it('a plane balances cut and fill, and steeper means more dirt and more money', () => {
    let last = 0, lastUsd = 0;
    for (const s of [0.02, 0.05, 0.1, 0.2, 0.4]) {
      const g = gradeSquare(sq(36), plane(s));
      expect(Math.abs(g.cutCy - g.fillCy) / Math.max(1, g.cutCy)).toBeLessThan(0.02);
      expect(g.cutCy).toBeGreaterThan(last);
      const usd = gradingCost(g).usd;
      expect(usd).toBeGreaterThan(lastUsd);
      last = g.cutCy; lastUsd = usd;
    }
  });
  it('a bigger dome on the same slope costs more', () => {
    let last = -1;
    for (const c of [24, 30, 36, 48, 60]) { const u = gradingCost(gradeSquare(sq(c), plane(0.1))).usd; expect(u).toBeGreaterThan(last); last = u; }
  });
  it('a steep site gets a retaining wall; a gentle one does not', () => {
    expect(gradeSquare(sq(36), plane(0.005)).wallSf).toBe(0);
    expect(gradeSquare(sq(36), plane(0.3)).wallSf).toBeGreaterThan(0);
  });
  it('cost never falls as any volume grows, and only the big two are graded', () => {
    const a = gradingCost({ cutCy: 1000, fillCy: 800, wallSf: 0 }).usd;
    expect(gradingCost({ cutCy: 1200, fillCy: 800, wallSf: 0 }).usd).toBeGreaterThan(a);
    expect(gradingCost({ cutCy: 1000, fillCy: 800, wallSf: 500 }).usd).toBeGreaterThan(a);
    expect(isGradedTier('glass')).toBe(true);
    expect(isGradedTier('arcology')).toBe(true);
    expect(isGradedTier('geodesic')).toBe(false);
    expect(isGradedTier(null)).toBe(false);
  });
});
