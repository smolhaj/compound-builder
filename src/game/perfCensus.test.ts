import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sceneCensus } from './perfCensus';

describe('sceneCensus', () => {
  it('counts visible meshes, triangles, instances and shadow casters', () => {
    const s = new THREE.Scene();
    const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); a.castShadow = true;           // 12 triangles
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); hidden.visible = false;
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 10); inst.count = 4;   // 48 triangles, one call
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()]));
    s.add(a, hidden, inst, g);
    const light = new THREE.DirectionalLight(); light.castShadow = true; s.add(light);
    const c = sceneCensus(s);
    expect(c.drawCalls).toBe(1 + 1 + 2);
    expect(c.triangles).toBe(12 + 48 + 12);
    expect(c.instancedMeshes).toBe(1);
    expect(c.shadowCasters).toBe(1);
    expect(c.shadowTriangles).toBe(12);
    expect(c.lights).toBe(1); expect(c.shadowLights).toBe(1);
  });
  it('a hidden parent hides its children', () => {
    const s = new THREE.Scene(); const g = new THREE.Group(); g.visible = false; g.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())); s.add(g);
    expect(sceneCensus(s).drawCalls).toBe(0);
  });
});
