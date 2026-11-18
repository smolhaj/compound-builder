/**
 * Where a tunnel meets a dome (sim/dome/crossing.ts): at each airlock a corridor of the family's passes through, the inner end of the vestibule gets a
 * floor hatch (a concrete coaming and a steel lid, a lamp on its post) beside the inner door, and the ground outside the airlock shows the
 * tunnel's line as a low turfed ridge of backfill with marker posts and a pile of the spoil beside it (the corridor itself runs buried under the buried
 * skirt, which is why it must cross at the airlock). One merged mesh, built only when the
 * domes or corridors change. SCALE v2: 1 unit = 20 ft, a door about 0.37.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Dome } from '../../sim/dome/standing';
import { airlockOfCorridor } from '../../sim/dome/crossing';
import { vestibuleOf } from '../../sim/dome/vestibule';
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
      const a = d.airlocks[i], s = Math.sin(a.angle), c = Math.cos(a.angle), g = this._ground, r = Math.hypot(a.x - d.x, a.z - d.z), v = vestibuleOf(d.tier, r);
      // the airlock's frame: `rho` out along its axis from the dome's center, `lam` across it (sim/dome/vestibule.ts)
      const W = (rho: number, lam: number): [number, number] => [d.x + s * rho + c * lam, d.z + c * rho - s * lam];
      const y = (x: number, z: number) => g(x, z);
      // inside: the tunnel's person hatch in the floor beside the inner door, a low concrete coaming and a steel lid 
      { const [hx, hz] = W(r - v.len - 0.2, v.dw / 2 + 0.13), hy = y(hx, hz);
        all.push(part(new THREE.BoxGeometry(0.17, 0.035, 0.17), 0x9d9d96, hx, hy + 0.0175, hz, a.angle));
        all.push(part(new THREE.BoxGeometry(0.15, 0.01, 0.15), 0x3c444b, hx, hy + 0.04, hz, a.angle));                       // the steel lid
        all.push(part(new THREE.BoxGeometry(0.07, 0.012, 0.012), 0x8d949a, hx, hy + 0.051, hz, a.angle));                     // its handle
        all.push(part(new THREE.BoxGeometry(0.012, 0.05, 0.012), 0xffe9a8, hx - c * 0.1, hy + 0.06, hz + s * 0.1, a.angle)); // a lamp on its post
      }
      // outside: the line of the buried corridor, a low turfed ridge of backfill with a crest of fresh soil that greens over, marker posts along it, a pile of spoil beside
      const L0 = r + 0.1, L1 = r + 3.2, N = 14, wMax = Math.max(0.2, v.cw * 0.55);
      const rows: Array<Array<[number, number, number]>> = [];
      for (let k = 0; k <= N; k++) {
        const t = k / N, rho = L0 + (L1 - L0) * t, w = wMax * (1 - 0.35 * t), h = 0.045 * (1 - 0.5 * t);
        rows.push([-1, -0.55, 0, 0.55, 1].map((q, j) => { const [x, z] = W(rho, q * w); return [x, y(x, z) + (j === 0 || j === 4 ? 0.002 : j === 2 ? h : h * 0.62), z]; }));
      }
      const pos: number[] = [], col: number[] = [], fresh = new THREE.Color(0x5b4a37), old = new THREE.Color(0x6f7a45), side = new THREE.Color(0x66603f);
      for (let k = 0; k < N; k++) for (let j = 0; j < 4; j++) {
        const A = rows[k][j], B = rows[k][j + 1], C = rows[k + 1][j + 1], D = rows[k + 1][j];
        pos.push(...A, ...B, ...C, ...A, ...C, ...D);
        const crest = j === 1 || j === 2, t = (k + 0.5) / N, cc = (crest ? fresh.clone().lerp(old, Math.min(1, t * 1.4)) : side.clone().lerp(old, t * 0.6));
        for (let q = 0; q < 6; q++) col.push(cc.r, cc.g, cc.b);
      }
      const ridge = new THREE.BufferGeometry();
      ridge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ridge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ridge.computeVertexNormals();
      all.push(ridge);
      for (let k = 0; k < 4; k++) {   // marker posts: a concrete stub with a yellow cap, on the crest every few steps
        const [mx, mz] = W(L0 + 0.45 + k * 0.78, 0), my = y(mx, mz) + 0.045 * (1 - 0.5 * (0.45 + k * 0.78) / 3.1);
        all.push(part(new THREE.BoxGeometry(0.022, 0.09, 0.022), 0xb9b9b1, mx, my + 0.045, mz, a.angle));
        all.push(part(new THREE.BoxGeometry(0.026, 0.014, 0.026), 0xe9b72b, mx, my + 0.097, mz, a.angle));
      }
      { const [px, pz] = W(r + 0.55, -(v.cw * 0.9 + 0.12)), py = y(px, pz);   // the spoil pile, loose and mounded, and a few stones on it
        const pile = new THREE.SphereGeometry(1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2); pile.scale(0.26, 0.09, 0.19);
        all.push(part(pile, 0x6e5b44, px, py - 0.004, pz, a.angle + 0.4));
        for (let q = 0; q < 4; q++) { const [sx, sz] = W(r + 0.55 + (q - 1.5) * 0.07, -(v.cw * 0.9 + 0.12) + (q % 2 ? 0.07 : -0.06)); all.push(part(new THREE.DodecahedronGeometry(0.022, 0), 0x8a8478, sx, y(sx, sz) + 0.045 + (q % 2) * 0.012, sz, q)); }
      }
    }
    if (!all.length) return;
    this._mesh = new THREE.Mesh(mergeGeometries(all), this._mat);
    this._mesh.name = 'dome-portals'; this._mesh.userData = { noSSAO: true };
    this._scene.add(this._mesh);
  }
  get drawCalls(): number { return this._mesh ? 1 : 0; }
  dispose(): void { this.sync([], []); this._mat.dispose(); }
}
