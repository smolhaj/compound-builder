import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { newGame } from '../../sim/state';
import { WildlifeRenderer, type WildlifeCtx } from './WildlifeRenderer';
import { SPECIES, type SpeciesId } from '../../sim/wildlife';

const ctx = (over: Partial<WildlifeCtx> = {}): WildlifeCtx => ({ ground: () => 0, blocked: () => false, creek: null, threats: [], cam: { x: 0, z: 0, y: 4 }, doy: 290, ...over });

/** A species the sim has not put on this land, so the test's own animals are the only ones of its model. */
function absent(r: WildlifeRenderer): SpeciesId {
  const have = new Set(r.animals().filter(a => !a.id.startsWith('qa:')).map(a => a.sp));
  return (Object.keys(SPECIES) as SpeciesId[]).find(sp => !have.has(sp) && sp !== 'waterfowl')!;
}

describe('the wildlife renderer draws modelled animals', () => {
  it('draws every species it is given: one instanced draw per species model in use (plus the shadow), never the old six-part balls', () => {
    const g = newGame(3);
    const scene = new THREE.Scene(), r = new WildlifeRenderer(scene);
    r.update(0.05, g, g.clock.t, ctx(), 1);
    const all = Object.keys(SPECIES) as SpeciesId[];
    all.forEach((sp, i) => r.spawnDebug(sp, i * 0.6, 0, i, i % 2 === 0));
    r.update(0.05, g, g.clock.t, ctx(), 1);
    const meshes = scene.children.filter(o => (o as THREE.InstancedMesh).isInstancedMesh && o.name.startsWith('wildlife_'));
    expect(meshes.length).toBeGreaterThan(5);
    for (const m of meshes) { expect(m.userData.noSSAO).toBe(true); expect((m as THREE.InstancedMesh).castShadow).toBe(false); }
    // 14 species (a duck and a goose share waterfowl: up to two models) near the camera, plus the sim's own animals: a draw per model and level in use, one shadow draw
    expect(r.drawCalls()).toBeGreaterThanOrEqual(all.length - 1);
    expect(r.drawCalls()).toBeLessThanOrEqual(all.length + 12);
    r.dispose();
  });
  it('an animal beyond the draw range costs nothing, and a far one uses the far level of detail', () => {
    const g = newGame(3);
    const r = new WildlifeRenderer(new THREE.Scene());
    r.update(0.05, g, g.clock.t, ctx(), 1);
    const base = r.drawCalls(), sp = absent(r);
    r.spawnDebug(sp, 300, 300, 0, true);
    r.update(0.05, g, g.clock.t, ctx(), 1);
    expect(r.drawCalls()).toBe(base);
    r.clearDebug();
    r.spawnDebug(sp, 0.5, 0, 0, true);
    r.update(0.05, g, g.clock.t, ctx({ cam: { x: 0, z: 0, y: 2 } }), 1);
    const near = r.drawCalls();
    expect(near).toBeGreaterThan(base - 1);
    r.spawnDebug(sp, 60, 0, 0, true);
    r.update(0.05, g, g.clock.t, ctx({ cam: { x: 0, z: 0, y: 2 } }), 1);
    expect(r.drawCalls()).toBe(near + 1);      // the second, far one is in the far level of detail: one more draw
    r.dispose();
  });
  it('the three quality tiers rebuild lazily and keep working', () => {
    const g = newGame(3);
    for (const q of ['high', 'medium', 'low'] as const) {
      const r = new WildlifeRenderer(new THREE.Scene());
      r.setQuality(q);
      r.update(0.05, g, g.clock.t, ctx(), 1);
      const base = r.drawCalls(), sp = absent(r);
      r.spawnDebug(sp, 0.3, 0, 0, true);
      r.update(0.05, g, g.clock.t, ctx(), 1);
      expect(r.drawCalls()).toBeGreaterThanOrEqual(base);
      r.dispose();
    }
  });
});
