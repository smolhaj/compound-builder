import { describe, expect, it } from 'vitest';
import { newGame } from '../../sim/state';
import { sleepPlan } from './sleepPlan';
import type { BedSlot } from './sickbayPlan';
import { FIG_POSE } from '../../engine/world/people/figureKit';

const slot = (key: string, x: number): BedSlot => ({ key, bay: false, x, y: 0.2, z: 5, fx: 0, fz: 1, sx: 1, sz: 0, floorY: 0.1, openA: true, openB: true });

describe('sleepers lie in real beds', () => {
  it('a person asleep whose spot is a bed takes a free slot of that home and lies down; others stay out of sight', () => {
    const g = newGame(2);
    g.personState.forEach(ps => { ps.task = 'sleep'; });
    const slots = [slot('h1:0', 1), slot('h1:1', 2), slot('h2:0', 9)];
    const spot = (i: number) => ({ kind: i < 3 ? 'bed' : 'couch', where: i === 2 ? 'h2' : 'h1' });
    const plan = sleepPlan(g, slots, spot);
    const ids = g.people.map(p => p.id);
    expect(plan.get(ids[0])!.bed).toBe('h1:0');
    expect(plan.get(ids[1])!.bed).toBe('h1:1');
    expect(plan.get(ids[2])!.bed).toBe('h2:0');
    expect(plan.has(ids[3])).toBe(false);
    for (const p of plan.values()) { expect(p.pose).toBe(FIG_POSE.SLEEP); expect(p.pitch).toBeCloseTo(-Math.PI / 2); expect(p.y).toBeGreaterThan(0.2); }
    expect(new Set([...plan.values()].map(p => p.bed)).size).toBe(plan.size);
  });
  it('a bed the sick already hold is not taken, and the awake are not put to bed', () => {
    const g = newGame(2);
    g.personState[0].task = 'sleep'; g.personState[1].task = 'leisure';
    const plan = sleepPlan(g, [slot('h1:0', 1)], () => ({ kind: 'bed', where: 'h1' }), new Set(['h1:0']));
    expect(plan.size).toBe(0);
    expect(sleepPlan(g, [slot('h1:0', 1)], () => ({ kind: 'bed', where: 'h1' })).has(g.people[1].id)).toBe(false);
  });
});
