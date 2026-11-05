import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeakSpot } from '../sim/wallTops';

/** Marker colors: a building a climber steps from (red), a tree reaching over (orange), brush against the wall (olive). */
const COLOR: Record<WeakSpot['kind'], number> = { building: 0xe5483a, tree: 0xff9a2e, brush: 0xb9c23a };

/**
 * The Weak-spots overlay (sim/wallTops.ts `weakSpots`): a ground ring and a tall beam on every place a climber can bypass a wall.
 * One merged mesh, one draw call, drawn over the scene with no depth test so it reads from the air and at eye level. Rebuilt only when the list changes.
 */
export class WeakSpotOverlay {
  private readonly _mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  private _mesh: THREE.Mesh | null = null;
  private _key = '';
  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;

  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number) { this._scene = scene; this._ground = ground; }

  /** Show these markers (an empty list clears them). */
  set(spots: readonly WeakSpot[]): void {
    const key = spots.map(s => `${s.kind}${s.x.toFixed(1)},${s.z.toFixed(1)}`).join('|');
    if (key === this._key) return;
    this._key = key;
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh.geometry.dispose(); this._mesh = null; }
    if (!spots.length) return;
    const parts: THREE.BufferGeometry[] = [];
    const color = new THREE.Color();
    for (const s of spots) {
      const y = this._ground(s.x, s.z) + 0.04;
      const ring = new THREE.RingGeometry(0.7, 0.95, 24).rotateX(-Math.PI / 2).translate(s.x, y, s.z);
      const beam = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5).translate(s.x, y + 1.1, s.z);
      const cap = new THREE.ConeGeometry(0.28, 0.5, 5).rotateX(Math.PI).translate(s.x, y + 2.45, s.z);
      color.setHex(COLOR[s.kind]);
      for (const g of [ring, beam, cap]) {
        const n = g.getAttribute('position').count, c = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        g.deleteAttribute('uv'); g.deleteAttribute('normal');
        parts.push(g.index ? g.toNonIndexed() : g);
      }
    }
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) return;
    this._mesh = new THREE.Mesh(merged, this._mat);
    this._mesh.renderOrder = 9;
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
  }

  dispose(): void {
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh.geometry.dispose(); }
    this._mat.dispose();
  }
}
