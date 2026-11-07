import { describe, expect, it } from 'vitest';
import { BEHIND, LOW, bounders, chooseCover, dropsProne } from './coverChoice';
import type { Box } from './cameraObstacles';

const crate: Box = { x0: -0.2, x1: 0.2, z0: 4.8, z1: 5.2, h: 0.15, kind: 'building' };
const wall: Box = { x0: -4, x1: 4, z0: 5, z1: 5.2, h: 0.5, kind: 'wall' };

describe('cover choice', () => {
  it('takes the nearest cover that lies between the shooter and the threat, and stands on the far side of it', () => {
    const p = chooseCover({ x: 0, z: 6.2 }, { x: 0, z: 20 }, [wall], []);   // threat at +z; the wall is behind the shooter: it does not block
    expect(p.stance).toBe('stand');
    const q = chooseCover({ x: 0, z: 3.9 }, { x: 0, z: 20 }, [wall], []);
    expect(q.stance).toBe('lean');
    expect(q.z).toBeLessThan(wall.z0);                       // behind the wall, away from the threat
    expect(q.z).toBeCloseTo((wall.z0 + wall.z1) / 2 - (0.1 + BEHIND), 1);
    expect(Math.abs(q.side)).toBe(1);
  });
  it('kneels behind something low and leans out of something tall', () => {
    expect(chooseCover({ x: 0, z: 4 }, { x: 0, z: 20 }, [crate], []).stance).toBe('kneel');
    expect(chooseCover({ x: 0, z: 4 }, { x: 0, z: 20 }, [wall], []).stance).toBe('lean');
    expect(LOW).toBeLessThan(0.28);
  });
  it('uses a bush, a rock or a trunk, and ignores cover that does not block the line or is out of reach', () => {
    const bush = { x: 0, z: 2, r: 0.2, h: 0.25 };
    expect(chooseCover({ x: 0, z: 1, }, { x: 0, z: 9 }, [], [bush]).stance).toBe('kneel');
    expect(chooseCover({ x: 1.5, z: 1 }, { x: 1.5, z: 9 }, [], [bush]).stance).toBe('stand');   // off to the side
    expect(chooseCover({ x: 0, z: -5 }, { x: 0, z: 9 }, [], [bush]).stance).toBe('stand');       // too far
  });
  it('picks the nearest of several', () => {
    const near = { x: 0, z: 1.6, r: 0.15, h: 0.25 }, far = { x: 0, z: 2.8, r: 0.15, h: 0.25 };
    const p = chooseCover({ x: 0, z: 1 }, { x: 0, z: 10 }, [], [far, near]);
    expect(p.z).toBeLessThan(1.6);
  });
  it('with nothing in reach: stands, or goes prone when rounds are landing', () => {
    expect(chooseCover({ x: 0, z: 0 }, { x: 0, z: 20 }, [], []).stance).toBe('stand');
    expect(chooseCover({ x: 0, z: 0 }, { x: 0, z: 20 }, [], [], true).stance).toBe('prone');
  });
  it('moves in bounds: alternate halves, so while some run the others fire', () => {
    expect(bounders(6, 0)).toEqual([0, 2, 4]);
    expect(bounders(6, 1)).toEqual([1, 3, 5]);
    expect(new Set([...bounders(5, 0), ...bounders(5, 1)]).size).toBe(5);
  });
  it('drops prone in the open on a close miss or a hit; behind cover only on a hit', () => {
    expect(dropsProne(false, false, true)).toBe(true);
    expect(dropsProne(true, false, true)).toBe(false);
    expect(dropsProne(true, true, false)).toBe(true);
  });
});
