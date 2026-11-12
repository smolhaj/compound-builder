import { describe, expect, it } from 'vitest';
import type { Battle, BattleUnit } from './battleTypes';
import { boxWorld, findClips, findPath, routeBattle, blockedAt } from './cutNav';

// a house 4 x 3 with one door on the south wall (x 1.9..2.1) and a partition at x = 2 with a doorway (z 1.4..1.6)
const T = 0.1;
const walls = [
  { x0: 0, z0: 0, x1: 4, z1: T }, { x0: 0, z0: 3 - T, x1: 4, z1: 3 },       // north, south(z=3 is the door side below)
  { x0: 0, z0: 0, x1: T, z1: 3 }, { x0: 4 - T, z0: 0, x1: 4, z1: 3 },
];
// door in the z=3 wall at x 1.7..2.3: rebuild that wall in two pieces
const house = [
  { x0: 0, z0: 0, x1: 4, z1: T }, { x0: 0, z0: 0, x1: T, z1: 3 }, { x0: 4 - T, z0: 0, x1: 4, z1: 3 },
  { x0: 0, z0: 3 - T, x1: 1.7, z1: 3 }, { x0: 2.3, z0: 3 - T, x1: 4, z1: 3 },
  { x0: 2 - T / 2, z0: 0, x1: 2 + T / 2, z1: 1.3 }, { x0: 2 - T / 2, z0: 1.7, x1: 2 + T / 2, z1: 3 },
  { x0: 0.5, z0: 0.5, x1: 1.1, z1: 0.9 },   // a table
];
void walls;
const unit = (id: string, side: 'home' | 'raider', x: number, z: number): BattleUnit => ({ id, side, x, z, post: 'open' });

describe('cutNav: nobody walks through a wall', () => {
  it('a straight leg across a wall is a clip; the routed leg is not, and goes through the door', () => {
    const w = boxWorld(house);
    const b: Battle = { night: true, duration: 40, units: [unit('r0', 'raider', 1, 4.5), unit('h0', 'home', 3, 1)], events: [{ t: 1, kind: 'move', unit: 'r0', x: 1, z: 1 }, { t: 2, kind: 'move', unit: 'h0', x: 1, z: 2 }, { t: 40, kind: 'end', result: 'repelled' }] };
    expect(findClips(b, w).length).toBeGreaterThan(0);
    const r = routeBattle(b, w);
    expect(r.unrouted).toBe(0);
    expect(findClips(r.battle, w)).toEqual([]);
    const legs = r.battle.events.filter(e => e.kind === 'move' && e.unit === 'r0');
    expect(legs.length).toBeGreaterThan(1);
  });
  it('a closed door is a wall until it is opened, then a way', () => {
    const w = boxWorld(house, [{ id: 'd', x0: 1.7, z0: 2.85, x1: 2.3, z1: 3.05, openAt: 10 }]);
    expect(blockedAt(w, 1.8, 2.95, 5)).toBe(true);
    expect(blockedAt(w, 1.8, 2.95, 11)).toBe(false);
    const closed = findPath(w, { x: 2, z: 4 }, { x: 1, z: 1.5 }, 11);
    expect(closed).not.toBeNull();
    const b: Battle = { night: true, duration: 40, units: [unit('r0', 'raider', 2, 4)], events: [{ t: 1, kind: 'move', unit: 'r0', x: 1, z: 1.5 }, { t: 40, kind: 'end', result: 'repelled' }] };
    // sent in at t=1 with the door shut until t=10: routed legs still never cross it before it opens
    const r = routeBattle(b, w);
    expect(findClips(r.battle, w)).toEqual([]);
  });
  it('a breach carve lets a unit through the wall from its moment on, and fleeing units leave by an opening', () => {
    const w = boxWorld([{ x0: -5, z0: -5, x1: 5, z1: -4.9 }], [], [{ x0: -0.4, z0: -5.1, x1: 0.4, z1: -4.8, from: 3 }]);
    const b: Battle = { night: false, duration: 30, units: [unit('r0', 'raider', 0, -8), unit('h0', 'home', 0, 0)], events: [{ t: 5, kind: 'move', unit: 'r0', x: 0, z: -2 }, { t: 12, kind: 'flee', unit: 'r0' }, { t: 30, kind: 'end', result: 'fled' }] };
    const r = routeBattle(b, w);
    expect(findClips(r.battle, w)).toEqual([]);
  });
  it('a unit that starts inside something solid is moved out, not left clipped', () => {
    const w = boxWorld(house);
    const b: Battle = { night: false, duration: 10, units: [unit('h0', 'home', 0.8, 0.7)], events: [{ t: 1, kind: 'move', unit: 'h0', x: 3, z: 1 }] };
    const r = routeBattle(b, w);
    expect(r.nudged).toEqual(['h0']);
    expect(findClips(r.battle, w)).toEqual([]);
  });
});

describe('cutNav: the router remembers only what stays true', () => {
  // a long wall at x = 5 whose only opening is a door that is shut from t = 5 to t = 20
  const wall = [{ x0: 4.95, z0: -30, x1: 5.05, z1: -0.5 }, { x0: 4.95, z0: 0.5, x1: 5.05, z1: 30 }];
  const door = { id: 'door0', x0: 4.9, x1: 5.1, z0: -0.5, z1: 0.5, from: 5, openAt: 20 };
  it('a leg that fails because the door will be shut on arrival is not condemned for the moment it is open', () => {
    const w = boxWorld(wall, [door]);
    const a = { x: 0, z: 5 }, b = { x: 9, z: 5 };
    expect(findPath(w, a, b, 1)).toBeNull();            // he would reach the door at about t = 7, shut
    expect(findPath(w, a, b, 21)).not.toBeNull();       // the same two points once it is open: a real way (this answer was served from the failure above)
  });
});
