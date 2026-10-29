import { describe, expect, it } from 'vitest';
import { crossesHard, slopePace, stairRuns, walkRoute, type WalkWorld } from './walkRoute';
import { routeLength, type Pt } from '../../sim/pathRoute';

/** A wall across x = 5 for z in [-30, 30] with an optional gap, and a house box. */
const world = (gap?: [number, number]): WalkWorld => {
  const hard = (x: number, z: number) => (Math.abs(x - 5) < 0.2 && Math.abs(z) < 30 && !(gap && z > gap[0] && z < gap[1])) || (x > 12 && x < 14 && z > -1 && z < 1);
  return { hard, blocked: (x, z) => hard(x, z) || (Math.abs(x - 5) < 0.4 && Math.abs(z) < 30 && !(gap && z > gap[0] - 0.2 && z < gap[1] + 0.2)) };
};
const none = () => [] as Pt[];

describe('walking across ground with things in the way', () => {
  it('goes straight when nothing is in the way', () => {
    expect(walkRoute([0, 5], [4, 5], world(), none)).toEqual([]);
    expect(crossesHard(world().hard, [0, 5], [4, 5])).toBe(false);
  });
  it('goes round a wall through its gap, not through it', () => {
    const w = world([8, 10]), r = walkRoute([0, 0], [10, 0], w, none);
    expect(r.length).toBeGreaterThan(3);
    expect(r[r.length - 1]).toEqual([10, 0]);
    for (let k = 1; k < r.length; k++) { const a = r[k - 1], b = r[k]; for (let u = 0; u <= 1; u += 0.1) expect(w.hard(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u)).toBe(false); }
    expect(routeLength([[0, 0], ...r])).toBeLessThan(10 * 4);
    expect(r.some(p => p[1] > 7)).toBe(true);                       // it went to the gap
  });
  it('prefers the trails, even a long way round, when the straight line is bad', () => {
    const trail: Pt[] = [[0, 9], [10, 9]];
    const r = walkRoute([0, 0], [10, 0], world([8, 10]), d => (d >= 3 ? trail : []));
    expect(r).toEqual(trail);
  });
  it('reaches a goal inside a building footprint and starts from a doorway', () => {
    const w = world([8, 10]);
    const r = walkRoute([0, 0], [13, 0], w, none);                  // the goal is in the house box
    expect(r[r.length - 1]).toEqual([13, 0]);
    expect(routeLength([[0, 0], ...r])).toBeLessThan(13 * 4);
  });
  it('has no way through a wall with no gap: the walk is left straight (the caller keeps its old behaviour)', () => {
    expect(walkRoute([0, 0], [10, 0], world(), none)).toEqual([]);
  });
  it('is slower climbing steep ground and a little slower going down it, and never stops', () => {
    expect(slopePace(0)).toBe(1);
    expect(slopePace(0.05)).toBe(1);
    expect(slopePace(0.3)).toBeLessThan(0.8);
    expect(slopePace(0.6)).toBeLessThan(slopePace(0.3));
    expect(slopePace(-0.5)).toBeLessThan(1);
    expect(slopePace(-0.5)).toBeGreaterThan(slopePace(0.5));
    expect(slopePace(5)).toBeGreaterThanOrEqual(0.35);
  });
});

describe('stairs up a riser', () => {
  // flat to x = 4, a 1.5 u rise between x = 4 and 7 (grade 0.5), flat again
  const h = (x: number) => (x < 4 ? 0 : x > 7 ? 1.5 : (x - 4) * 0.5);
  const line = (x0: number, x1: number): Pt[] => { const o: Pt[] = []; for (let x = x0; x <= x1; x += 0.2) o.push([x, 0]); return o; };

  it('finds the steep stretch of a trail and only that', () => {
    const r = stairRuns(line(0, 11), (x) => h(x));
    expect(r).toHaveLength(1);
    expect(r[0].riseU).toBeGreaterThan(1.2);
    expect(r[0].lenU).toBeGreaterThan(2.4);
  });
  it('finds none on level or gently sloping ground, nor a short ramp', () => {
    expect(stairRuns(line(0, 11), () => 0)).toEqual([]);
    expect(stairRuns(line(0, 11), x => x * 0.2)).toEqual([]);
    expect(stairRuns(line(0, 11), x => (x < 4 ? 0 : x > 4.4 ? 0.4 : (x - 4)))).toEqual([]);
  });
});
