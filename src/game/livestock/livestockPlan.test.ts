import { describe, expect, it } from 'vitest';
import { animalGoal, doorOf, drawnHerd, shelterOf, type Home } from './livestockPlan';

const homes: Home[] = [
  { id: 'barn_out', kind: 'barn', x: 40, z: 0, rot: 0, w: 3, d: 4, depth: 0 },
  { id: 'barn_in', kind: 'barn', x: 10, z: 0, rot: 2, w: 3, d: 4, depth: 2 },
  { id: 'coop', kind: 'chicken_coop', x: 12, z: 6, rot: 1, w: 1.5, d: 1.5, depth: 1 },
];
const house: [number, number] = [8, 0];
const calm = { hour: 11, raided: false, storm: false, house, clock: 5 };

describe('drawing the herd from head counts', () => {
  it('caps a big herd and draws a dozen hens a coop', () => {
    const h = drawnHerd({ goat: 14, sheep: 3, cow: 0 }, 1);
    expect(h.filter(a => a.kind === 'goat')).toHaveLength(8);
    expect(h.filter(a => a.kind === 'sheep')).toHaveLength(3);
    expect(h.filter(a => a.kind === 'cow')).toHaveLength(0);
    expect(h.filter(a => a.kind === 'hen')).toHaveLength(8);
    expect(drawnHerd({}, 0)).toHaveLength(0);
  });
});

describe('where an animal stays', () => {
  it('hens use the coop; hoofed stock the barn, not the coop', () => {
    expect(shelterOf('hen', 'hen0', homes, false, house)?.id).toBe('coop');
    expect(shelterOf('cow', 'cow0', homes, false, house)?.kind).toBe('barn');
  });
  it('a raid sends the stock to the innermost barn, not the nearest or the first', () => {
    for (let i = 0; i < 6; i++) expect(shelterOf('goat', `goat${i}`, homes, true, [45, 0])?.id).toBe('barn_in');
  });
  it('no roof: they lie up by the camp', () => {
    const g = animalGoal({ id: 'pig0', kind: 'pig' }, [], calm);
    expect(g.home).toBeNull();
    expect(g.inside).toBe(false);
  });
});

describe('the day of the herd', () => {
  const a = { id: 'goat1', kind: 'goat' as const };
  it('turned out into the paddock in front of the door by day, shut in at night, in a storm and on the alarm', () => {
    const day = animalGoal(a, homes, calm), home = homes.find(h => h.id === day.home)!, door = doorOf(home);
    expect(day.inside).toBe(false);
    expect(Math.hypot(day.x - door.x, day.z - door.z)).toBeLessThan(3.2);
    expect(animalGoal(a, homes, { ...calm, hour: 22 }).inside).toBe(true);
    expect(animalGoal(a, homes, { ...calm, storm: true }).inside).toBe(true);
    const raid = animalGoal(a, homes, { ...calm, raided: true });
    expect(raid.inside).toBe(true);
    expect(raid.panic).toBe(true);
    expect(raid.home).toBe('barn_in');
  });
  it('the door is on the front (+z at rotation 0)', () => {
    const d = doorOf({ id: 'b', kind: 'barn', x: 0, z: 0, rot: 0, w: 2, d: 4, depth: 0 });
    expect(d.z).toBeGreaterThan(2);
    expect(Math.abs(d.x)).toBeLessThan(1e-9);
  });
  it('moves on to a new spot every few game hours', () => {
    const p1 = animalGoal(a, homes, calm), p2 = animalGoal(a, homes, { ...calm, clock: 5.5 });
    expect(Math.hypot(p1.x - p2.x, p1.z - p2.z)).toBeGreaterThan(0.01);
  });
});

import { hostileAtGate } from './livestockPlan';
describe('who sends the animals in', () => {
  it('an armed gang does; a trader or an unarmed refugee does not', () => {
    expect(hostileAtGate({ kind: 'gang', armed: true })).toBe(true);
    expect(hostileAtGate({ kind: 'trader', armed: true })).toBe(false);
    expect(hostileAtGate({ kind: 'refugees', armed: false })).toBe(false);
    expect(hostileAtGate(null)).toBe(false);
  });
});

describe('a shelter there is no way to', () => {
  it('is passed over for the next best', () => {
    const a = shelterOf('goat', 'goat1', homes, true, house)!;
    const b = shelterOf('goat', 'goat1', homes, true, house, new Set([a.id]))!;
    expect(b.id).not.toBe(a.id);
    // when every home is cut off the first is kept (the animal waits)
    expect(shelterOf('goat', 'goat1', homes, true, house, new Set(homes.map(h => h.id)))).not.toBeNull();
  });
});
