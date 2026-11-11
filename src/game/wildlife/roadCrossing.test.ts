import { describe, expect, it } from 'vitest';
import { CLEAR, HOLD, HOURS, MAX_PER_DAY, SEE, crossingDeck, onRoad, planRoadCrossings, stillDue, yieldSpeed } from './roadCrossing';

const herds = [{ sp: 'deer' as const, n: 10 }, { sp: 'turkey' as const, n: 8 }, { sp: 'bear' as const, n: 1 }];

describe('animals crossing the county road', () => {
  it('plans the same day the same way, only at dawn and dusk, and never more than the cap', () => {
    for (let day = 0; day < 60; day++) {
      const a = planRoadCrossings(5, day, herds, 100), b = planRoadCrossings(5, day, herds, 100);
      expect(a).toEqual(b);
      expect(a.length).toBeLessThanOrEqual(MAX_PER_DAY);
      for (const c of a) {
        expect(HOURS.some(([lo, hi]) => c.at >= lo && c.at <= hi)).toBe(true);
        expect(Math.abs(c.z - 100)).toBeLessThanOrEqual(15);
        expect(c.sp).not.toBe('bear');
        expect(c.n).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('is occasional: some days have a crossing, many have none', () => {
    const per = Array.from({ length: 200 }, (_, d) => planRoadCrossings(9, d, herds, 0).length);
    const days = per.filter(n => n > 0).length;
    expect(days).toBeGreaterThan(40);
    expect(days).toBeLessThan(170);
  });

  it('a place with no crossing kinds living on it sees none; a bigger herd crosses more often', () => {
    expect(planRoadCrossings(5, 3, [{ sp: 'bear', n: 2 }, { sp: 'deer', n: 0 }], 0)).toEqual([]);
    const count = (n: number) => Array.from({ length: 300 }, (_, d) => planRoadCrossings(2, d, [{ sp: 'deer', n }], 0).length).reduce((a, b) => a + b, 0);
    expect(count(12)).toBeGreaterThan(count(1));
  });

  it('a file never has more animals than live on the place', () => {
    for (let d = 0; d < 100; d++) for (const c of planRoadCrossings(4, d, [{ sp: 'elk', n: 2 }], 0)) expect(c.n).toBeLessThanOrEqual(2);
  });

  it('nothing steps out late after a fast-forward', () => {
    const c = { id: 'x', sp: 'deer' as const, at: 6, z: 0, dir: 1 as const, n: 1 };
    expect(stillDue(c, 5.9)).toBe(false);
    expect(stillDue(c, 6.1)).toBe(true);
    expect(stillDue(c, 9)).toBe(false);
  });

  it('the deck runs from one verge, across the carriageway, to the far verge', () => {
    const xAt = (z: number) => 50 + Math.sin(z * 0.1);
    const pts = crossingDeck(xAt, () => 0, 0.5, { z: 10, dir: 1 }, 0);
    expect(pts.length).toBeGreaterThan(5);
    expect(pts[0][0]).toBeLessThan(xAt(pts[0][1]) - 0.5);
    expect(pts[pts.length - 1][0]).toBeGreaterThan(xAt(pts[pts.length - 1][1]) + 0.5);
    const back = crossingDeck(xAt, () => 0, 0.5, { z: 10, dir: -1 }, 0);
    expect(back[0][0]).toBeGreaterThan(xAt(back[0][1]) + 0.5);
    // the second in the file starts further back
    const second = crossingDeck(xAt, () => 0, 0.5, { z: 10, dir: 1 }, 1);
    expect(Math.abs(second[0][0] - xAt(second[0][1]))).toBeGreaterThan(Math.abs(pts[0][0] - xAt(pts[0][1])));
    expect(onRoad(0.3, 0.5)).toBe(true);
    expect(onRoad(2, 0.5)).toBe(false);
  });

  it('a vehicle slows for an animal in its way, stops short of it and goes on when it is past', () => {
    expect(yieldSpeed(SEE + 1, 3)).toBe(3);
    expect(yieldSpeed(HOLD - 0.1, 3)).toBe(0);
    expect(yieldSpeed(0, 3)).toBe(0);
    const mid = yieldSpeed((SEE + HOLD) / 2, 3);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(3);
    let prev = 0;
    for (let a = HOLD; a <= SEE; a += 0.2) { const v = yieldSpeed(a, 3); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    expect(yieldSpeed(-CLEAR - 0.1, 3)).toBe(3);
  });
});
