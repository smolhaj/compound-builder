/**
 * The scene props leave nothing behind (user: no leaks over 20 consecutive cutscenes). Without a GPU: every geometry and material a prop creates is
 * disposed in `end()`, every mesh is taken out of the group, and a second raid on the same props object starts from nothing. Counted with spies on
 * `dispose`, over repeated raids that use every prop kind.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AftermathProps } from './AftermathProps';
import { SceneProps, type PropHooks } from './SceneProps';
import type { BattleEvent } from '../../sim/battleTypes';

const hooks = (): PropHooks => ({ ground: () => 0, puff: () => {}, flash: () => {}, glow: () => {}, shake: () => {} });
const at = () => ({ x: 0, y: 0, z: 0, rot: 0, dead: false, gone: false });

/** Count every dispose on geometries and materials made while `fn` runs. */
function counting<T>(fn: () => T): { out: T; made: { geo: number; mat: number }; disposed: { geo: number; mat: number } } {
  const made = { geo: 0, mat: 0 }, disposed = { geo: 0, mat: 0 };
  const geoDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(() => { disposed.geo++; });
  const matDispose = vi.spyOn(THREE.Material.prototype, 'dispose').mockImplementation(() => { disposed.mat++; });
  const out = fn();
  geoDispose.mockRestore(); matDispose.mockRestore();
  return { out, made, disposed };
}

const aftermath: BattleEvent[] = [
  { t: 1, kind: 'tool', unit: 'a', what: 'shovel', secs: 5 }, { t: 1, kind: 'tool', unit: 'b', what: 'rake', secs: 5 }, { t: 1, kind: 'tool', unit: 'c', what: 'hammer', secs: 5 },
  { t: 1, kind: 'grave', x: 1, z: 1, stage: 'dig', secs: 5 }, { t: 6, kind: 'grave', x: 1, z: 1, stage: 'lower', secs: 1.4, unit: 'x' }, { t: 8, kind: 'grave', x: 1, z: 1, stage: 'fill', secs: 5, unit: 'x' },
  { t: 9, kind: 'repair', x: 2, z: 2, w: 0.8, heading: 0.3, secs: 4 },
] as BattleEvent[];

describe('the aftermath props leave nothing behind', () => {
  it('twenty raids on the same props: everything made is disposed and the group is empty each time', () => {
    const group = new THREE.Group(), p = new AftermathProps(group, hooks());
    let total = { geo: 0, mat: 0 };
    for (let raid = 0; raid < 20; raid++) {
      const r = counting(() => {
        for (const e of aftermath) p.onEvent(e);
        for (let i = 0; i < 40; i++) p.update(0.25, () => at());
        expect(group.children.length).toBeGreaterThan(0);
        p.end();
      });
      total = { geo: total.geo + r.disposed.geo, mat: total.mat + r.disposed.mat };
      expect(group.children.length, `raid ${raid}: meshes left in the group`).toBe(0);
      expect(p.live).toEqual({ tools: 0, grave: false, repair: false });
    }
    // (the same number of disposals every raid: nothing grows)
    expect(total.geo).toBeGreaterThan(20 * 3);
    expect(total.mat).toBeGreaterThan(20 * 3);
  });

  it('the dispose count is the same on the first raid and the twentieth', () => {
    const group = new THREE.Group(), p = new AftermathProps(group, hooks());
    const counts: number[] = [];
    for (let raid = 0; raid < 20; raid++) {
      const r = counting(() => { for (const e of aftermath) p.onEvent(e); for (let i = 0; i < 40; i++) p.update(0.25, () => at()); p.end(); });
      counts.push(r.disposed.geo + r.disposed.mat);
    }
    expect(new Set(counts).size).toBe(1);
  });
});

describe('SceneProps takes everything away at the end of a scene', () => {
  const events: BattleEvent[] = [
    { t: 0, kind: 'ladder', x: 1, z: 1, h: 0.5, fx: 1, fz: 1.3 }, { t: 0, kind: 'flag', unit: 'r0' }, { t: 0, kind: 'flare', x: 0, z: 0, secs: 6 },
    { t: 0, kind: 'loot', by: 'r1', what: 'food', n: 1, from: 'yard' }, { t: 0, kind: 'fire', structure: 'barn', x: 1, z: 1 }, { t: 0, kind: 'alarm', what: 'dog' },
    ...aftermath,
  ] as BattleEvent[];
  it('twenty scenes: the group is empty after each and the disposals do not grow', () => {
    const group = new THREE.Group(), p = new SceneProps(group, hooks());
    p.centerOf = () => ({ x: 0, z: 0 });
    const counts: number[] = [];
    for (let scene = 0; scene < 20; scene++) {
      const r = counting(() => { for (const e of events) p.onEvent(e); for (let i = 0; i < 40; i++) p.update(0.25, () => at()); p.end(); });
      counts.push(r.disposed.geo + r.disposed.mat);
      expect(group.children.length, `scene ${scene}: left in the group`).toBe(0);
    }
    expect(counts[19]).toBeLessThanOrEqual(counts[0]);
  });
});

describe('a ladder is not left standing after its raider retreats', () => {
  const lad = { t: 0, kind: 'ladder', x: 1, z: 1, h: 0.5, fx: 1, fz: 1.3, unit: 'r0' } as BattleEvent;
  const pos = { x: 1, y: 0, z: 1.3, rot: 0, dead: false, gone: false };

  it('tips over once the raider has climbed and walked away, then is picked up; nothing is left in the group at the end', () => {
    const group = new THREE.Group(), p = new SceneProps(group, hooks());
    p.centerOf = () => ({ x: 0, z: 0 });
    for (let scene = 0; scene < 5; scene++) {
      p.onEvent(lad);
      expect(p.live.standing).toBe(1);
      p.update(0.25, () => pos);                         // he is at the foot
      p.update(0.25, () => ({ ...pos, y: 0.4 }));        // up the rungs
      expect(p.live.standing).toBe(1);
      const mesh = group.children.find(c => (c as THREE.InstancedMesh).isInstancedMesh && (c as THREE.InstancedMesh).count === 1) as THREE.InstancedMesh;
      const m = new THREE.Matrix4(), up0 = new THREE.Vector3();
      mesh.getMatrixAt(0, m); up0.setFromMatrixColumn(m, 1);
      expect(up0.y).toBeGreaterThan(0.3);                // leaning, up on the wall
      for (let i = 0; i < 4; i++) p.update(0.25, () => ({ ...pos, x: 6, z: 6 }));   // he retreated
      expect(p.live.standing).toBe(0);
      mesh.getMatrixAt(0, m); up0.setFromMatrixColumn(m, 1);
      expect(Math.abs(up0.y), 'lying flat, not upright').toBeLessThan(0.05);
      for (let i = 0; i < 20; i++) p.update(0.25, () => ({ ...pos, x: 6, z: 6 }));
      mesh.getMatrixAt(0, m); up0.setFromMatrixColumn(m, 1);
      expect(up0.length(), 'picked up').toBeLessThan(1e-6);
      p.end();
      expect(group.children.length, `scene ${scene}: left in the group`).toBe(0);
      expect(p.live.ladders).toBe(0);
    }
  });

  it('a dead raider\'s ladder is laid down too', () => {
    const group = new THREE.Group(), p = new SceneProps(group, hooks());
    p.onEvent(lad);
    p.update(0.25, () => pos);
    p.update(0.25, () => ({ ...pos, dead: true }));
    expect(p.live.standing).toBe(0);
    p.end();
  });
});

