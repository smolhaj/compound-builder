import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ContactShadows, groundNormal } from './ContactShadows';

const sun = (elevDeg: number, az = 0.7): THREE.Vector3 => { const e = elevDeg * Math.PI / 180; return new THREE.Vector3(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)); };

describe('ContactShadows', () => {
  it('keeps the static bands while the moving decals are rewritten each frame', () => {
    const c = new ContactShadows(new THREE.Scene());
    c.setLight(sun(50), 0);
    c.clearStatic(); c.begin();
    c.strip(0, 0, 4, 0, 0, 0, -1, 0.14, 0.8); c.strip(0, 4, 4, 4, 0, 0, 1, 0.14, 0.8);
    c.endStatic();
    expect(c.mesh.count).toBe(2);
    for (let f = 0; f < 3; f++) { c.begin(); c.blob(1, 0, 1, null, 0.1, 0.1, 0, 0.28, 0.8); c.blob(2, 0, 1, null, 0.1, 0.1, 0, 0.28, 0.8); c.end(); expect(c.mesh.count).toBe(4); }
    c.begin(); c.end();
    expect(c.mesh.count).toBe(2);
    c.dispose();
  });
  it('a band lies on the outside of its wall, with its dark edge (local +z) against the wall', () => {
    const c = new ContactShadows(new THREE.Scene());
    c.clearStatic(); c.begin();
    const outs: Array<[number, number, number, number, number, number]> = [[0, 0, 4, 0, 0, -1], [0, 4, 4, 4, 0, 1], [0, 0, 0, 4, -1, 0], [4, 0, 4, 4, 1, 0]];
    for (const [x0, z0, x1, z1, ox, oz] of outs) c.strip(x0, z0, x1, z1, 0, ox, oz, 0.2, 1);
    c.endStatic();
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    outs.forEach(([x0, z0, x1, z1, ox, oz], i) => {
      c.mesh.getMatrixAt(i, m); m.decompose(p, q, s);
      // centred 0.1 outside the wall's midpoint, as long as the wall
      expect(p.x).toBeCloseTo((x0 + x1) / 2 + ox * 0.1, 5); expect(p.z).toBeCloseTo((z0 + z1) / 2 + oz * 0.1, 5);
      expect(s.x).toBeCloseTo(Math.hypot(x1 - x0, z1 - z0), 5);
      // local +z (the dark edge) points toward the wall
      const lz = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      expect(lz.x * ox + lz.z * oz).toBeLessThan(-0.99);
    });
    c.dispose();
  });
  it('tilts a blob to the ground normal and lifts it a hair; the lean grows as the sun drops and the night weakens it', () => {
    const c = new ContactShadows(new THREE.Scene());
    const ground = (x: number, _z: number): number => 0.5 * x;     // a 26.6 degree slope
    const n = groundNormal(ground, 3, 3, new THREE.Vector3());
    expect(n.y).toBeCloseTo(Math.cos(Math.atan(0.5)), 3);
    const size = (elev: number): number => {
      c.setLight(sun(elev), 0); c.clearStatic(); c.begin(); c.blob(3, ground(3, 3), 3, n, 0.1, 0.1, 0, 0.28, 1); c.end();
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); c.mesh.getMatrixAt(0, m); m.decompose(p, q, s);
      expect(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(n)).toBeGreaterThan(0.999);
      expect(p.y).toBeGreaterThan(ground(3, 3));
      return Math.max(s.x, s.z);
    };
    expect(size(12)).toBeGreaterThan(size(70));
    c.setLight(sun(40), 1);
    expect((c.mesh.material as THREE.ShaderMaterial).uniforms.uNight.value).toBeCloseTo(0.45, 5);
    c.dispose();
  });
});
