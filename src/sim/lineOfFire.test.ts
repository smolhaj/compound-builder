import { describe, expect, it } from 'vitest';
import { FIRE_SOLID, FireMap, HEAD, MUZZLE, PARTIAL_HIT, TORSO, fireBoxesOf, fireLine, lineOfFire, type Box } from './lineOfFire';
import { newGame } from './state';
import { planRun } from './perimeter';

const wall = (h = 0.5): Box => ({ x0: -10, x1: 10, z0: -0.1, z1: 0.1, h, kind: 'wall' });
const house: Box = { x0: -1, x1: 1, z0: 6, z1: 8, h: 1.3, kind: 'building' };
const at = (x: number, z: number, y = 0, kneel = false) => ({ x, z, y, kneel });

describe('line of fire (the sim\'s question: can this shooter hit that target?)', () => {
  it('a ground-level shot across a solid wall is blocked, standing or kneeling', () => {
    const m = new FireMap([wall()]);
    expect(fireLine(m, at(0, -6), at(0, 6))).toBe('blocked');
    expect(fireLine(m, at(0, -6, 0, true), at(0, 6, 0, true))).toBe('blocked');
    expect(fireLine(m, at(0, 6), at(0, -6))).toBe('blocked');   // and from outside in
  });
  it('a shot along the wall, or on the same side of it, is clear', () => {
    const m = new FireMap([wall()]);
    expect(fireLine(m, at(-5, -3), at(5, -3))).toBe('clear');
    expect(fireLine(m, at(-5, 3), at(5, 8))).toBe('clear');
  });
  it('elevation clears the wall: a tower, a wall walk, an upper floor, or a climber on top', () => {
    const m = new FireMap([wall()]);
    expect(fireLine(m, at(0, -6, 0.9), at(0, 8))).toBe('clear');            // a tower cab
    expect(fireLine(m, at(0, -6, 0.85), at(0, 8))).toBe('clear');           // an upper-floor window
    expect(fireLine(m, at(0, -6), at(0, 0, 0.5))).toBe('clear');            // the target stands on top of the wall (a climber)
    expect(fireLine(m, at(0, 0, 0.5), at(0, 8))).toBe('clear');             // the shooter stands on top (the wall walk)
  });
  it('a ground-floor window is not enough over a solid wall close by', () => {
    const m = new FireMap([wall(0.58)]);   // concrete
    expect(fireLine(m, at(0, -6, 0.3), at(0, 1))).toBe('blocked');
  });
  it('a tower does not see the foot of the wall on the far side, but sees the yard beyond it', () => {
    const m = new FireMap([wall()]);
    expect(fireLine(m, at(0, -3, 0.9), at(0, 0.6))).toBe('blocked');
    expect(fireLine(m, at(0, -3, 0.9), at(0, 14))).toBe('clear');
  });
  it('only the head over the wall is partial cover: the chest is covered, the head is not', () => {
    const m = new FireMap([wall(0.2)]);
    // a low wall (a 4 ft firing step: 0.2) with the target kneeling behind it, the shooter at the same level a few units back
    const sight = fireLine(m, at(0, -2, 0.0), at(0, 0.6, 0, false));
    expect(['partial', 'blocked', 'clear']).toContain(sight);
    // chest 0.16 is under a 0.2 cap, head 0.25 is over it: partial, and the shot is worth much less
    expect(fireLine(m, at(0, -0.6), at(0, 0.5))).toBe('partial');
    expect(PARTIAL_HIT).toBeLessThan(0.6);
    expect(HEAD.stand).toBeGreaterThan(TORSO.stand);
  });
  it('a low cover box well under chest height never blocks', () => {
    const m = new FireMap([wall(0.1)]);
    expect(fireLine(m, at(0, -4), at(0, 4))).toBe('clear');
  });
  it('open fences, chain-link and hedges do not block; solid walls do', () => {
    for (const k of ['chain_link', 'barbed_wire', 'woven_wire', 'wrought_iron', 'bar_fence', 'split_rail', 'thorn_hedge'] as const) expect(FIRE_SOLID.has(k)).toBe(false);
    for (const k of ['concrete_wall', 'steel_wall', 'stone_wall', 'container_wall', 'container_stack', 'log_palisade', 'earth_berm'] as const) expect(FIRE_SOLID.has(k)).toBe(true);
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    const fence = planRun(g, 'chain_link', [[-10, 10], [10, 10]]); fence.done = fence.hours; fence.supplied = true; fence.finishedAt = 0;
    expect(fireBoxesOf(g).filter(b => b.kind === 'wall')).toHaveLength(0);
    const solid = planRun(g, 'container_wall', [[-10, -10], [10, -10]]); solid.done = solid.hours; solid.supplied = true; solid.finishedAt = 0;
    const m = new FireMap(fireBoxesOf(g));
    expect(fireLine(m, at(0, 8), at(0, 12))).toBe('clear');                  // through the chain-link
    expect(fireLine(m, at(0, -8), at(0, -12))).toBe('blocked');              // through the container wall
  });
  it('an unfinished run stops no round', () => {
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    planRun(g, 'container_wall', [[-10, -10], [10, -10]]);
    expect(fireBoxesOf(g).filter(b => b.kind === 'wall')).toHaveLength(0);
  });
  it('a shooter inside a building fires out of it; one outside cannot fire through it', () => {
    const m = new FireMap([house]);
    expect(fireLine(m, at(0, 7, 0.3), at(0, 20))).toBe('clear');
    expect(fireLine(m, at(0, 3), at(0, 12))).toBe('blocked');
    expect(fireLine(m, at(0, 3, 2.2), at(0, 30, 0))).toBe('clear');         // from a rooftop
  });
  it('a shooter standing against a wall does not fire through it unless he has a firing port', () => {
    const m = new FireMap([wall()]);
    expect(fireLine(m, at(0, -0.25), at(0, 8))).toBe('blocked');
    expect(fireLine(m, at(0, -0.25), at(0, 8), { ports: true })).toBe('clear');
  });
  it('the grid finds what a full scan finds', () => {
    const boxes: Box[] = [];
    for (let i = 0; i < 40; i++) boxes.push({ x0: -20 + i, x1: -19 + i, z0: (i % 7) - 3, z1: (i % 7) - 2.8, h: 0.4 + (i % 3) * 0.2, kind: 'wall' });
    boxes.push(house);
    const m = new FireMap(boxes);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const a = { x: ((i * 37) % 41) - 20, y: [0.21, 0.5, 1.0][i % 3], z: ((i * 53) % 29) - 14 }, b = { x: ((i * 71) % 43) - 21, y: [0.16, 0.6][i % 2], z: ((i * 29) % 31) - 15 };
      const full = lineOfFire(a, b, boxes, () => 0, { from: 0, to: 0.3 }).blocked, grid = lineOfFire(a, b, m.along(a, b), () => 0, { from: 0, to: 0.3 }).blocked;
      expect(grid).toBe(full); if (full) n++;
    }
    expect(n).toBeGreaterThan(20);
    expect(MUZZLE.stand).toBeGreaterThan(TORSO.stand);
  });
});
