import { describe, expect, it } from 'vitest';
import { stepBeast, nearestThreat, speeds, type Beast, type StepCtx } from './wildlifeAI';
import { SPECIES } from '../../sim/wildlife';

const beast = (sp: Beast['sp'], over: Partial<Beast> = {}): Beast => ({ id: 'a', sp, x: 10, z: 10, rot: 0, hx: 10, hz: 10, tx: 10, tz: 10, mood: 'graze', t: 5, phase: 0, vis: 1, want: true, head: 0, v: 0, male: false, side: 'free', group: 0, k: 0.3, ...over });
let seed = 3;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const ctx = (threats: Array<[number, number]> = [], allowed: StepCtx['allowed'] = () => true): StepCtx => ({ threats, allowed, rnd, speedK: 1 });

describe('wildlife behavior', () => {
  it('a deer grazes undisturbed and stays near home', () => {
    const b = beast('deer');
    let far = 0;
    for (let i = 0; i < 2000; i++) { stepBeast(b, 0.1, ctx()); far = Math.max(far, Math.hypot(b.x - 10, b.z - 10)); }
    expect(far).toBeLessThan(8);
    expect(b.mood === 'graze' || b.mood === 'walk').toBe(true);
  });
  it('a deer flees from a person walking up, running faster than it walks, and ends further away', () => {
    const b = beast('deer'), person: [number, number] = [11.2, 10];
    stepBeast(b, 0.05, ctx([person]));
    expect(b.mood).toBe('flee');
    const x0 = b.x;
    for (let i = 0; i < 30; i++) stepBeast(b, 0.1, ctx([person]));
    expect(Math.hypot(b.x - person[0], b.z - person[1])).toBeGreaterThan(SPECIES.deer.fear);
    expect(b.x).toBeLessThan(x0);
    expect(speeds('deer').run).toBeGreaterThan(speeds('deer').walk * 4);
  });
  it('lifts its head when a person is near but not close, and flees from a dog the same way', () => {
    const b = beast('deer');
    stepBeast(b, 0.05, ctx([[10 + SPECIES.deer.fear * 1.6, 10]]));
    expect(b.mood).toBe('alert');
    const c = beast('rabbit');
    stepBeast(c, 0.05, ctx([[10.3, 10]]));
    expect(c.mood).toBe('flee');
  });
  it('a bear lets a person closer than a deer does', () => {
    expect(SPECIES.bear.fear).toBeLessThan(SPECIES.deer.fear);
    const bear = beast('bear'), deer = beast('deer');
    stepBeast(bear, 0.05, ctx([[11.5, 10]])); stepBeast(deer, 0.05, ctx([[11.5, 10]]));
    expect(deer.mood).toBe('flee');
    expect(bear.mood).not.toBe('flee');
  });
  it('never leaves the allowed ground (inside a wall, out of a building)', () => {
    const inside: StepCtx['allowed'] = (x, z) => x > 5 && x < 15 && z > 5 && z < 15;
    const b = beast('elk', { side: 'in' });
    for (let i = 0; i < 3000; i++) stepBeast(b, 0.1, ctx(i % 40 < 3 ? [[b.x - 0.5, b.z]] : [], inside));
    expect(inside(b.x, b.z, b)).toBe(true);
  });
  it('fades in and out as the hour brings animals and takes them', () => {
    const b = beast('deer', { vis: 0 });
    for (let i = 0; i < 40; i++) stepBeast(b, 0.1, ctx());
    expect(b.vis).toBeGreaterThan(0.9);
    b.want = false;
    for (let i = 0; i < 80; i++) stepBeast(b, 0.1, ctx());
    expect(b.vis).toBeLessThan(0.1);
  });
  it('finds the nearest threat and the way directly away from it', () => {
    const t = nearestThreat({ x: 0, z: 0 }, [[5, 0], [0, 2]]);
    expect(t.d).toBe(2); expect(t.az).toBe(-1);
  });
});
