import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HeavyFx, buildTank } from './HeavyFx';

const hooks = () => { const log = { puffs: 0, flashes: 0 }; return { log, h: { ground: () => 0, puff: () => { log.puffs++; }, flash: () => { log.flashes++; }, shake: () => {}, tracer: () => {} } }; };

describe('HeavyFx', () => {
  it('costs nothing while idle', () => {
    const g = new THREE.Group(), { h } = hooks(), fx = new HeavyFx(g, h);
    fx.update(1 / 60);
    expect(fx.active).toBe(false);
    expect(g.children.length).toBe(0);
  });
  it('a hit on the shell makes only fading effects and end() clears them', () => {
    const g = new THREE.Group(), { h, log } = hooks(), fx = new HeavyFx(g, h);
    fx.fire('tank', new THREE.Vector3(0, 0.2, 10), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1));
    for (let i = 0; i < 240; i++) fx.update(1 / 60);
    expect(fx.impacts).toBe(1);
    expect(log.puffs).toBeGreaterThan(5);
    for (let i = 0; i < 600; i++) fx.update(1 / 60);
    expect(fx.active).toBe(false);
    expect(g.children.filter(c => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh).length).toBe(0);
    fx.end();
    expect(g.children.length).toBe(0);
  });
  it('the tank is a person-scale-correct vehicle (about 26 ft hull) with a muzzle', () => {
    const t = buildTank(), box = new THREE.Box3().setFromObject(t);
    expect(box.max.z - box.min.z).toBeGreaterThan(1.2);
    expect(box.max.z - box.min.z).toBeLessThan(2.4);
    expect(t.userData.muzzle).toBeInstanceOf(THREE.Vector3);
  });
  it('a temporary prop (tank, truck) is removed and freed on time, and the scene is idle again', () => {
    const g = new THREE.Group(), { h } = hooks(), fx = new HeavyFx(g, h), t = buildTank();
    fx.temp(t, 2);
    expect(fx.active).toBe(true);
    for (let i = 0; i < 100; i++) fx.update(1 / 60);
    expect(g.children).toContain(t);
    for (let i = 0; i < 40; i++) fx.update(1 / 60);
    expect(g.children).not.toContain(t);
    expect(fx.active).toBe(false);
  });
  it('a thermite cut glares, throws sparks and runs drips for its whole burn, then leaves nothing', () => {
    const g = new THREE.Group(), { h, log } = hooks(), fx = new HeavyFx(g, h);
    fx.fire('thermite', new THREE.Vector3(0, 0.2, 2), new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 1));
    fx.update(1 / 60);
    const glow = g.children.filter(c => (c as THREE.Mesh).isMesh);
    expect(glow.length).toBeGreaterThanOrEqual(3);                        // halo, body, white core
    let mid = 0;
    for (let i = 0; i < 120; i++) fx.update(1 / 60);
    const sp = g.children.find(c => (c as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh;
    mid = sp.count;
    expect(mid).toBeGreaterThan(20);                                      // still throwing at two seconds
    expect(log.flashes).toBeGreaterThan(8);                               // the glare flickers on the light
    for (let i = 0; i < 60 * 8; i++) fx.update(1 / 60);
    expect(fx.active).toBe(false);
    expect(g.children.filter(c => (c as THREE.Mesh).isMesh && !(c as THREE.InstancedMesh).isInstancedMesh).length).toBe(0);
  });
});
