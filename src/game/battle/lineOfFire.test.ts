import { describe, expect, it } from 'vitest';
import { lowCoverHeight, FIRE_SOLID, MUZZLE, TORSO, WALL_POST, faceNormal, lineOfFire } from './lineOfFire';
import { PERIMETER } from '../../sim/perimeter';
import type { Box } from './cameraObstacles';

const flat = () => 0;
// a wall 0.5 tall (3 m) along x at z = 0
const wall: Box = { x0: -5, x1: 5, z0: -0.1, z1: 0.1, h: 0.5, kind: 'wall' };
const house: Box = { x0: -1, x1: 1, z0: 6, z1: 8, h: 1.2, kind: 'building' };

describe('line of fire', () => {
  it('muzzle and chest heights fit a person 0.28 tall', () => {
    expect(MUZZLE.stand).toBeLessThan(0.28); expect(MUZZLE.stand).toBeGreaterThan(TORSO.stand);
    expect(MUZZLE.kneel).toBeLessThan(MUZZLE.stand); expect(TORSO.kneel).toBeLessThan(TORSO.stand);
  });
  it('a ground-level shot across a solid wall stops at its face', () => {
    const r = lineOfFire({ x: 0, y: MUZZLE.stand, z: -4 }, { x: 0, y: TORSO.stand, z: 4 }, [wall], flat);
    expect(r.blocked).toBe(true);
    expect(r.at!.z).toBeLessThan(-0.05); expect(r.at!.z).toBeGreaterThan(-0.3);
    expect(r.at!.y).toBeLessThan(0.5);
  });
  it('both ends up high (a tower, a roof) clear the top', () => {
    expect(lineOfFire({ x: 0, y: 1.3, z: -2 }, { x: 0, y: 1.1, z: 2 }, [wall], flat).blocked).toBe(false);
  });
  it('a tower shooting down at a target at the foot of the wall on the far side is blocked', () => {
    // steep line: only 0.2 high where it comes out of the wall's far face
    expect(lineOfFire({ x: 0, y: 0.9, z: -1 }, { x: 0, y: 0.05, z: 0.6 }, [wall], flat).blocked).toBe(true);
  });
  it('a shooter standing against the wall (a loophole or a rest) fires over its own wall', () => {
    expect(lineOfFire({ x: 0, y: MUZZLE.stand, z: -0.25 }, { x: 0, y: TORSO.stand, z: 6 }, [wall], flat).blocked).toBe(false);
  });
  it('a defender on the wall line (the sim\'s wall post, a few units off the drawn run) fires over it; one in the yard does not', () => {
    const post = { x: 0, y: MUZZLE.stand, z: -3 }, target = { x: 0, y: TORSO.stand, z: 12 };
    expect(lineOfFire(post, target, [wall], flat, { from: WALL_POST, to: 0.3 }).blocked).toBe(false);
    expect(lineOfFire({ ...post, z: -8 }, target, [wall], flat, { from: WALL_POST, to: 0.3 }).blocked).toBe(true);
    expect(lineOfFire(post, target, [wall], flat).blocked).toBe(true);   // (a raider at the same spot gets no such rest)
  });
  it('shots that do not cross the wall are free', () => {
    expect(lineOfFire({ x: -2, y: 0.2, z: 1 }, { x: 3, y: 0.2, z: 5 }, [wall], flat).blocked).toBe(false);
    expect(lineOfFire({ x: 7, y: 0.2, z: -3 }, { x: 7, y: 0.2, z: 3 }, [wall], flat).blocked).toBe(false);
  });
  it('a building stops a round below the roof line', () => {
    expect(lineOfFire({ x: 0, y: 0.2, z: 3 }, { x: 0, y: 0.2, z: 12 }, [house], flat).blocked).toBe(true);
    expect(lineOfFire({ x: 0, y: 2, z: 3 }, { x: 0, y: 1.8, z: 12 }, [house], flat).blocked).toBe(false);
  });
  it('the first solid struck wins and trees and brush never block', () => {
    const tree: Box = { x0: -0.1, x1: 0.1, z0: -3, z1: -2.8, h: 2, kind: 'tree' };
    const r = lineOfFire({ x: 0, y: 0.2, z: -6 }, { x: 0, y: 0.2, z: 12 }, [tree, house, wall], flat);
    expect(r.by).toBe(wall);
  });
  it('follows the ground: the same wall on a rise is higher', () => {
    const hill = (_x: number, z: number) => (z > 0 ? 0.8 : 0);   // the far side is a bluff
    expect(lineOfFire({ x: 0, y: 1.0, z: -2 }, { x: 0, y: 1.0, z: 2 }, [wall], hill).blocked).toBe(true);
    expect(lineOfFire({ x: 0, y: 1.0, z: -2 }, { x: 0, y: 1.0, z: 2 }, [wall], flat).blocked).toBe(false);
  });
  it('face normals point out of the wall', () => {
    expect(faceNormal(wall, { x: 0, z: -0.1 })).toEqual({ x: 0, z: -1 });
    expect(faceNormal(wall, { x: 0, z: 0.1 })).toEqual({ x: 0, z: 1 });
  });
  it('only walls that stop a round are solid; open fences are not', () => {
    for (const k of FIRE_SOLID) expect(PERIMETER[k]).toBeTruthy();
    for (const k of ['chain_link', 'barbed_wire', 'woven_wire', 'wrought_iron', 'bar_fence', 'split_rail', 'thorn_hedge'] as const) expect(FIRE_SOLID.has(k)).toBe(false);
    for (const k of ['concrete_wall', 'steel_wall', 'stone_wall', 'container_wall', 'container_stack', 'log_palisade', 'earth_berm'] as const) expect(FIRE_SOLID.has(k)).toBe(true);
  });
  it('crates, wells, barrels and trucks are low cover; a house is not', () => {
    expect(lowCoverHeight('wood_crate')).toBeLessThan(0.34);
    expect(lowCoverHeight('hand_well')).toBeLessThan(0.34);
    expect(lowCoverHeight('farm_truck')).toBeLessThan(0.34);
    expect(lowCoverHeight('timber_cabin')).toBeNull();
  });
});
