import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstancedLodSet } from './instancedLod';

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.position.set(0, 5, 0);
  camera.lookAt(0, 5, -10);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const at = (x: number, z: number) => new THREE.Matrix4().makeTranslation(x, 5, z);
  // near + in view, far + in view, behind the camera
  const mats = [at(0, -10), at(0, -200), at(0, 50)];
  const levels = [
    { geometry: new THREE.BoxGeometry(1, 1, 1), maxDist: 50 },
    { geometry: new THREE.BoxGeometry(1, 1, 1), maxDist: Infinity },
  ];
  const set = new InstancedLodSet(scene, levels, new THREE.MeshBasicMaterial(), mats);
  return { scene, camera, set };
}

describe('InstancedLodSet', () => {
  it('culls off-screen instances and buckets the rest by distance', () => {
    const { set, camera } = setup();
    set.update(camera);
    expect(set.meshes[0].count).toBe(1);
    expect(set.meshes[1].count).toBe(1);
    const m = new THREE.Matrix4();
    set.meshes[1].getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).z).toBe(-200);
  });

  it('keeps per-instance colors with their instance after compaction', () => {
    const { set, camera } = setup();
    set.setColorAt(1, new THREE.Color(1, 0, 0));
    set.update(camera);
    const c = new THREE.Color();
    set.meshes[1].getColorAt(0, c);
    expect([c.r, c.g, c.b]).toEqual([1, 0, 0]);
  });

  it('draws everything at LOD 0 with culling disabled (QA tooling)', () => {
    const { set, camera } = setup();
    InstancedLodSet.setCullingEnabled(false);
    try {
      set.update(camera);
      expect(set.meshes[0].count).toBe(3);
      expect(set.meshes[1].count).toBe(0);
      expect(set.meshes[1].visible).toBe(false);
    } finally {
      InstancedLodSet.setCullingEnabled(true);
    }
  });

  it('runs from the scene render hook and dispose() unhooks + removes meshes', () => {
    const { set, scene, camera } = setup();
    const hook = scene.onBeforeRender as unknown as (r: unknown, s: THREE.Scene, c: THREE.Camera) => void;
    hook(null, scene, camera);
    expect(set.meshes[0].count).toBe(1);
    set.dispose();
    expect(scene.children.length).toBe(0);
  });
});
