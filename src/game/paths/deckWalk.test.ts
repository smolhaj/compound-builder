import { describe, expect, it } from 'vitest';
import { hasDeck, inCorridorAt, sampleRoute, stepToward, type Mover } from './deckWalk';
import type { Wp } from './linkRoute';

const ground = (x: number) => 10 + x * 0.5;       // a hill rising with x

describe('stepToward', () => {
  it('stays on the ground on a ground leg', () => {
    const m: Mover = { x: 0, z: 0, y: null };
    const s = stepToward(m, [3, 0], 1, ground);
    expect(m).toEqual({ x: 1, z: 0, y: null });
    expect(s.arrived).toBe(false);
  });
  it('rides the deck under the hill: the height is the deck, not the ground over it', () => {
    const m: Mover = { x: 0, z: 0, y: null };
    stepToward(m, [4, 0, 1], 4, ground);        // onto the deck at the portal: ground there is 10, deck 1: eases down over the leg
    expect(m.y).toBeCloseTo(1, 6);
    stepToward(m, [8, 0, 3], 2, ground);
    expect(m.y).toBeCloseTo(2, 6);
    expect(m.y).toBeLessThan(ground(m.x));       // under the ground
    stepToward(m, [8, 0, 3], 2, ground);
    expect(m.y).toBeCloseTo(3, 6);
  });
  it('eases back onto the ground at the far mouth and is on the ground on arrival', () => {
    const m: Mover = { x: 8, z: 0, y: 3 };
    stepToward(m, [9, 0], 0.5, ground);
    expect(m.y).not.toBeNull();
    const s = stepToward(m, [9, 0], 5, ground);
    expect(s.arrived).toBe(true);
    expect(m.y).toBeNull();
  });
  it('reports the grade of the deck', () => {
    const m: Mover = { x: 0, z: 0, y: 1 };
    const s = stepToward(m, [10, 0, 2.5], 10, ground);
    expect(s.grade).toBeCloseTo(0.15, 6);
  });
});

describe('route sampling', () => {
  const route: Wp[] = [[0, 0], [1, 0], [2, 0, 1, 1], [6, 0, 2, undefined], [8, 0, 2.5, 2], [9, 0]];
  it('has a deck', () => { expect(hasDeck(route)).toBe(true); expect(hasDeck([[0, 0], [1, 1]])).toBe(false); });
  it('y and pitch along the deck, null on the ground', () => {
    expect(sampleRoute(route, 0.5).y).toBeNull();
    const m = sampleRoute(route, 4);          // 2 into the 4-long deck leg from x = 2 to 6: y = 1.5
    expect(m.y).toBeCloseTo(1.5, 6);
    expect(m.pitch).toBeCloseTo(Math.atan2(1, 4), 6);
    expect(sampleRoute(route, 8.5).y).toBeNull();
  });
  it('knows when it is inside', () => {
    expect(inCorridorAt(route, 0.5)).toBe(false);
    expect(inCorridorAt(route, 4)).toBe(true);
    expect(inCorridorAt(route, 8.5)).toBe(false);
  });
});
