import { describe, expect, it } from 'vitest';
import { CAM, WALL_DOG, cameraAim, cameraNightSee, isGuardUnit, wallDogEffect } from './defenseTune';
import type { Dog } from './pets';

const dog = (o: Partial<Dog>): Dog => ({ id: 'd1', guard: true, health: 100, training: 60, died: null, ...o } as Dog);

describe('defense tuning numbers', () => {
  it('only trained, healthy, living guard dogs fight at the wall, two at most', () => {
    expect(wallDogEffect([]).n).toBe(0);
    expect(wallDogEffect([dog({ guard: false })]).n).toBe(0);
    expect(wallDogEffect([dog({ training: 10 })]).n).toBe(0);
    expect(wallDogEffect([dog({ health: 20 })]).n).toBe(0);
    expect(wallDogEffect([dog({ died: 5 })]).n).toBe(0);
    expect(wallDogEffect([dog({}), dog({ id: 'd2' }), dog({ id: 'd3' })]).n).toBe(WALL_DOG.MAX);
  });
  it('more dogs bite more, never less', () => {
    expect(wallDogEffect([dog({}), dog({ id: 'd2' })]).bitePerS).toBeGreaterThan(wallDogEffect([dog({})]).bitePerS);
  });
  it('cameras only ever help the defenders, with diminishing returns past two', () => {
    expect(cameraAim(0)).toBe(1);
    expect(cameraNightSee(0)).toBe(0.5);
    for (let c = 1; c <= 6; c++) { expect(cameraAim(c)).toBeGreaterThanOrEqual(cameraAim(c - 1)); expect(cameraNightSee(c)).toBeGreaterThanOrEqual(cameraNightSee(c - 1)); }
    expect(cameraAim(10)).toBeCloseTo(CAM.MAX_AIM, 6);
    expect(cameraNightSee(10)).toBeCloseTo(CAM.NIGHT_SEE, 6);
  });
  it('a guard unit is h_ plus a guard person id, never a family member', () => {
    expect(isGuardUnit('h_pg12')).toBe(true);
    expect(isGuardUnit('h_p3')).toBe(false);
    expect(isGuardUnit('r4')).toBe(false);
  });
});
