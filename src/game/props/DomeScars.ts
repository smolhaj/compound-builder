/**
 * The marks a raid left on a dome's shell (sim/dome/scars.ts, `GameState.shellScars`): soft black scorch, pale chips in glass, grey dents, fading as the
 * days pass until the crew has scrubbed or replaced them. One instanced quad mesh for the whole place, rebuilt only when the marks or the day change.
 * Scale: 1 unit = 20 ft; marks sit on the sphere of the shell, flat against it.
 */
import * as THREE from 'three';
import type { Dome } from '../../sim/dome/standing';
import type { GameState } from '../../sim/state';
import { visibleScars } from '../../sim/dome/scars';
import { soft } from '../battle/ShellFx';

const MAX = 120;
const COLOR = { scorch: 0x0a0908, chip: 0xe9f3ff, dent: 0x8e949a } as const;
const SIZE = { scorch: 0.16, chip: 0.05, dent: 0.075 } as const;

export class DomeScars {
  private _mesh: THREE.InstancedMesh | null = null;
  private _key = '';
  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;
  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number) { this._scene = scene; this._ground = ground; }
  get count(): number { return this._mesh?.count ?? 0; }

  sync(domes: readonly Dome[], s: Pick<GameState, 'shellScars' | 'clock'>): void {
    const marks = domes.flatMap(d => visibleScars(s, d).map(m => ({ d, m })));
    const key = marks.map(({ d, m }) => `${d.id}${m.angle}${m.h}${m.kind}${Math.round(m.fade * 10)}`).join('|');
    if (key === this._key) return;
    this._key = key;
    if (!marks.length) { this.dispose(); return; }
    if (!this._mesh) {
      const mat = new THREE.MeshBasicMaterial({ map: soft(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
      this._mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
      this._mesh.frustumCulled = false; this._mesh.userData = { noSSAO: true };
      this._scene.add(this._mesh);
    }
    const q = new THREE.Quaternion(), m4 = new THREE.Matrix4(), c = new THREE.Color(), z = new THREE.Vector3(0, 0, 1);
    const list = marks.slice(0, MAX);
    list.forEach(({ d, m }, i) => {
      const el = m.h * Math.PI / 2, nx = Math.sin(m.angle) * Math.cos(el), nz = Math.cos(m.angle) * Math.cos(el), ny = Math.sin(el);
      const p = new THREE.Vector3(d.x + nx * (d.r + 0.01), this._ground(d.x, d.z) + ny * d.r + 0.02, d.z + nz * (d.r + 0.01));
      q.setFromUnitVectors(z, new THREE.Vector3(nx, ny, nz));
      const sz = SIZE[m.kind] * (0.7 + 0.3 * m.fade);
      m4.compose(p, q, new THREE.Vector3(sz, sz * 0.85, 1));
      this._mesh!.setMatrixAt(i, m4);
      this._mesh!.setColorAt(i, c.setHex(COLOR[m.kind]).multiplyScalar(0.25 + 0.75 * m.fade));
    });
    this._mesh.count = list.length; this._mesh.instanceMatrix.needsUpdate = true; if (this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void { if (this._mesh) { this._scene.remove(this._mesh); this._mesh.geometry.dispose(); (this._mesh.material as THREE.Material).dispose(); this._mesh = null; } this._key = ''; }
}
