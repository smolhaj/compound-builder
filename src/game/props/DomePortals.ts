/**
 * Where a tunnel meets a dome (sim/dome/crossing.ts): at each airlock a corridor of the family's passes through, the inner end of the vestibule gets a
 * concrete portal collar with a dark steel door set in it and a lamp over it, and the ground outside the airlock shows the tunnel's line as a strip of
 * fresh spoil (the corridor itself runs buried under the buried skirt, which is why it must cross at the airlock). One merged mesh, built only when the
 * domes or corridors change. SCALE v2: 1 unit = 20 ft, a door about 0.37.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Dome } from '../../sim/dome/standing';
import { airlockOfCorridor } from '../../sim/dome/crossing';
import type { PerimeterRun } from '../../sim/perimeter';
import { CROSSING_KINDS } from '../../sim/dome/crossing';

type Ground = (x: number, z: number) => number;

function part(geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, ry: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1)));
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class DomePortals {
  private _mesh: THREE.Mesh | null = null;
  private _key = '';
  private readonly _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.1 });
  private readonly _scene: THREE.Scene;
  private readonly _ground: Ground;
  constructor(scene: THREE.Scene, ground: Ground) { this._scene = scene; this._ground = ground; }

  sync(domes: readonly Dome[], runs: readonly PerimeterRun[]): void {
    const found: Array<{ d: Dome; i: number }> = [];
    for (const r of runs) {
      if (!CROSSING_KINDS.includes(r.kind) || r.finishedAt === null) continue;
      for (const d of domes) { const a = airlockOfCorridor(d, r.pts); if (a) found.push({ d, i: a.index }); }
    }
    const key = found.map(f => `${f.d.id}:${f.i}:${f.d.x.toFixed(2)},${f.d.z.toFixed(2)}`).join('|');
    if (key === this._key) return;
    this._key = key;
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh.geometry.dispose(); this._mesh = null; }
    const all: THREE.BufferGeometry[] = [];
    for (const { d, i } of found) {
      const a = d.airlocks[i], s = Math.sin(a.angle), c = Math.cos(a.angle), g = this._ground;
      const P = (back: number, lat: number): [number, number] => [a.inX - s * back + c * lat, a.inZ - c * back - s * lat];
      const y = g(a.inX, a.inZ);
      const [cx, cz] = P(0.14, 0);
      all.push(part(new THREE.BoxGeometry(a.w * 0.95, 0.05, 0.2), 0x9d9d96, cx, y + 0.025, cz, a.angle));                           // the collar slab
      for (const side of [-1, 1]) { const [px, pz] = P(0.14, side * a.w * 0.36); all.push(part(new THREE.BoxGeometry(a.w * 0.1, 0.34, 0.2), 0x8d8d87, px, y + 0.17, pz, a.angle)); }   // its jambs
      const [lx, lz] = P(0.14, 0);
      all.push(part(new THREE.BoxGeometry(a.w * 0.7, 0.04, 0.2), 0x8d8d87, lx, y + 0.34, lz, a.angle));                           // the lintel
      const [dx, dz] = P(0.215, 0);
      all.push(part(new THREE.BoxGeometry(a.w * 0.62, 0.3, 0.012), 0x2a3036, dx, y + 0.17, dz, a.angle));                          // the steel door, closed
      all.push(part(new THREE.BoxGeometry(a.w * 0.2, 0.012, 0.012), 0xffe9a8, dx, y + 0.31, dz, a.angle));                         // its lamp
      // the line of the buried corridor out beyond the airlock: a strip of fresh spoil
      for (let k = 0; k < 6; k++) { const [sx, sz] = [a.outX + s * (0.12 + k * 0.17), a.outZ + c * (0.12 + k * 0.17)]; all.push(part(new THREE.BoxGeometry(a.w * (0.7 - k * 0.05), 0.012, 0.15), 0x6b5a45, sx, g(sx, sz) + 0.008, sz, a.angle)); }
    }
    if (!all.length) return;
    this._mesh = new THREE.Mesh(mergeGeometries(all), this._mat);
    this._mesh.name = 'dome-portals'; this._mesh.userData = { noSSAO: true };
    this._scene.add(this._mesh);
  }
  get drawCalls(): number { return this._mesh ? 1 : 0; }
  dispose(): void { this.sync([], []); this._mat.dispose(); }
}
