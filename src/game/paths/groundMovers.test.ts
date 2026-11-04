import { describe, expect, it } from 'vitest';
import { climbLimit, drivablePrefix, gradeBetween, stepOk } from './groundMovers';

const ramp = (rise: number) => (x: number) => (x > 5 ? (x - 5) * rise : 0);

describe('slopes for animals', () => {
  it('a goat climbs what a cow will not', () => {
    expect(climbLimit('goat')).toBeGreaterThan(climbLimit('cow'));
    expect(climbLimit('person')).toBe(1);
    const g = (x: number) => x * 0.8;
    expect(stepOk((x) => g(x), [0, 0], [3, 0], climbLimit('goat'))).toBe(true);
    expect(stepOk((x) => g(x), [0, 0], [3, 0], climbLimit('cow'))).toBe(false);
  });
  it('a sheer face stops everything', () => {
    const cliff = (x: number) => (x > 2 ? 3 : 0);
    expect(stepOk(cliff, [0, 0], [4, 0], climbLimit('cougar'))).toBe(false);
    expect(gradeBetween(() => 0, [0, 0], [1, 0])).toBe(0);
  });
});

describe('vehicles and the slope limit', () => {
  const route: Array<[number, number]> = [[0, 0], [10, 0], [20, 0]];
  it('drives a gentle road whole', () => {
    const r = drivablePrefix(route, (x) => ramp(0.08)(x), false);
    expect(r.ok).toBe(true);
    expect(r.route).toHaveLength(3);
  });
  it('stops at the foot of a pitch over 12 %', () => {
    const r = drivablePrefix(route, (x) => ramp(0.2)(x), false);
    expect(r.ok).toBe(false);
    expect(r.route[r.route.length - 1][0]).toBeLessThan(5.6);
    expect(r.route[r.route.length - 1][0]).toBeGreaterThan(4.4);
  });
  it('snow lowers the limit to 7 %', () => {
    const g = (x: number) => ramp(0.09)(x);
    expect(drivablePrefix(route, g, false).ok).toBe(true);
    expect(drivablePrefix(route, g, true).ok).toBe(false);
  });
  it('a tunnel deck is the corridor\'s own design: the hill over it does not count', () => {
    const hill = () => 40;
    const deck: Array<[number, number, number]> = [[0, 0, 1], [10, 0, 1.4], [20, 0, 1.8]];
    expect(drivablePrefix(deck, hill, false).ok).toBe(true);
  });
});

import { animalRoute } from './groundMovers';
import { stepBeast, type Beast, type StepCtx } from '../wildlife/wildlifeAI';

describe('animals round obstacles', () => {
  // a wall along x = 5 from z = -20 to 20 with a gap at z in [8, 10]
  const wall = (x: number, z: number) => Math.abs(x - 5) < 0.3 && Math.abs(z) < 20 && !(z > 8 && z < 10);
  it('goes straight when clear, round a wall through its gap, and not at all when walled in', () => {
    expect(animalRoute([0, 30], [10, 30], wall)).toEqual([]);
    const r = animalRoute([0, 0], [10, 0], wall)!;
    expect(r.length).toBeGreaterThan(1);
    expect(r.some(p => p[1] > 7)).toBe(true);
    const closed = (x: number, z: number) => Math.abs(x - 5) < 0.3 && Math.abs(z) < 60;
    expect(animalRoute([0, 0], [10, 0], closed)).toBeNull();
  });
  it('a walking beast never crosses a cliff band on its way', () => {
    const cliff = (x: number, z: number) => Math.abs(x - 5) < 0.4 && z > -2 && z < 6;     // a short rock band with ground open round its ends
    const b: Beast = { id: 'a', sp: 'deer', x: 3, z: 2, rot: 0, hx: 3, hz: 2, tx: 8, tz: 2, mood: 'walk', t: 500, phase: 0, vis: 1, want: true, head: 0, v: 0, male: false, side: 'free', group: 0, k: 0.3 };
    const ctx: StepCtx = { threats: [], allowed: (x, z) => !cliff(x, z), rnd: () => 0.5, speedK: 1, route: (bb, tx, tz) => animalRoute([bb.x, bb.z], [tx, tz], cliff) };
    let crossed = false;
    for (let i = 0; i < 1500 && b.mood === 'walk'; i++) { stepBeast(b, 0.1, ctx); if (cliff(b.x, b.z)) crossed = true; }
    expect(crossed).toBe(false);
    expect(Math.hypot(b.x - 8, b.z - 2)).toBeLessThan(0.3);
  });
  it('with no way round it gives up and grazes', () => {
    const b: Beast = { id: 'a', sp: 'deer', x: 3, z: 2, rot: 0, hx: 3, hz: 2, tx: 8, tz: 2, mood: 'walk', t: 30, phase: 0, vis: 1, want: true, head: 0, v: 0, male: false, side: 'free', group: 0, k: 0.3 };
    stepBeast(b, 0.1, { threats: [], allowed: () => true, rnd: () => 0.5, speedK: 1, route: () => null });
    expect(b.mood).toBe('graze');
    expect(b.x).toBe(3);
  });
});
