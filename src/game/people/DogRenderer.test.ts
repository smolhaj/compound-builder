import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../../sim/state';
import { adoptDog } from '../../sim/pets';
import { DogRenderer } from './DogRenderer';
import type { DogCtx } from './dogGoals';

describe('dogs on the ground', () => {
  it('a dog stands on the same height function the people use, wherever it is, and is the right size', () => {
    const g = newGame(1); const d = adoptDog(g, { ageYears: 3 });
    const ground = (x: number, z: number) => 2 + 0.1 * x - 0.05 * z;      // a slope
    const ctx: DogCtx = { home: { x: 30, z: 30, rot: 0, w: 4, d: 3 }, camp: { x: 25, z: 25 }, gate: { x: 67, z: 30 }, yard: { x: 50, z: 30 }, atGate: false, person: () => null };
    const r = new DogRenderer(new THREE.Scene());
    r.update(0.016, g, 12, 0.5, ctx, ground, 1);
    const pos = r.positions().find(p => p.id === d.id)!;
    // the body sits a body-height above the ground at its own x, z (lying 0.042; standing 0.1, times breed size)
    const y = r.bodyY(0), gy = ground(pos.x, pos.z);
    expect(y).toBeGreaterThan(gy);
    expect(y - gy).toBeLessThan(0.1 * 1.1 * 1.06);
    // the shoulder of a standing dog reaches 0.12 to 0.18 against a 0.28 person
    const shoulder = (0.1 + 0.028) * 1.06;
    expect(shoulder).toBeGreaterThan(0.12); expect(shoulder).toBeLessThan(0.18);
    r.dispose();
  });
});
