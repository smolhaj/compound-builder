import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../../sim/state';
import { adoptDog } from '../../sim/pets';
import { DogRenderer } from './DogRenderer';
import type { DogCtx } from './dogGoals';
import { wildModelOf as modelOf } from '../wildlife/wildModels';

describe('dogs on the ground', () => {
  it('a dog stands on the same height function the people use, wherever it is, and is the right size', () => {
    const g = newGame(1); const d = adoptDog(g, { ageYears: 3 });
    const ground = (x: number, z: number) => 2 + 0.1 * x - 0.05 * z;      // a slope
    const ctx: DogCtx = { home: { x: 30, z: 30, rot: 0, w: 4, d: 3 }, camp: { x: 25, z: 25 }, gate: { x: 67, z: 30 }, yard: { x: 50, z: 30 }, atGate: false, person: () => null };
    const r = new DogRenderer(new THREE.Scene());
    r.update(0.016, g, 12, 0.5, ctx, ground, 1);
    const pos = r.positions().find(p => p.id === d.id)!;
    // the model stands on the ground at its own x, z (no floating, no sinking), and a standing dog's shoulder is 0.09 to 0.12 against a 0.28 person
    const dr = r.drawn().find(x => x.id === d.id)!;
    expect(dr.y).toBeCloseTo(ground(pos.x, pos.z), 6);
    const shoulder = modelOf(dr.breed).withers * dr.scale;
    expect(shoulder).toBeGreaterThan(0.06);
    expect(shoulder).toBeLessThan(0.13);
    expect(r.drawCalls()).toBeLessThanOrEqual(2);
    r.dispose();
  });
});
