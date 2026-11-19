/**
 * What a crew's work at a dome's shell looks like while the cutscene plays (sim/dome/domeBeats.ts `probe` events): a bright ping and a few sparks where a
 * round, a sledge or a blade meets the shell, the flare of a torch, and the marks left behind (soft dark scorch, pale chips, grey dents) as one instanced
 * quad mesh. Marks are only drawn for the length of the scene; the lasting ones are `GameState.shellScars` (game/props/DomeScars.ts). Scale: 1 unit = 20 ft.
 */
import * as THREE from 'three';
import type { BattleEvent } from '../../sim/battleTypes';

export interface ShellHooks {
  ground: (x: number, z: number) => number;
  puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void;
  flash: (p: THREE.Vector3, k: number, color: number) => void;
  shake: (v: number) => void;
}
const MAX = 64;
type Probe = Extract<BattleEvent, { kind: 'probe' }>;

let SOFT: THREE.CanvasTexture | null = null;
export const soft = (): THREE.CanvasTexture => {
  if (SOFT) return SOFT;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  SOFT = new THREE.CanvasTexture(c);
  return SOFT;
};

export class ShellFx {
  private readonly _group: THREE.Group;
  private readonly _h: ShellHooks;
  private _marks: THREE.InstancedMesh | null = null;
  private _n = 0;
  private _seed = 11;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _c = new THREE.Color();
  constructor(group: THREE.Group, hooks: ShellHooks) { this._group = group; this._h = hooks; }

  get marks(): number { return this._n; }
  begin(): void { this.end(); }
  end(): void {
    if (this._marks) { this._group.remove(this._marks); this._marks.geometry.dispose(); (this._marks.material as THREE.Material).dispose(); this._marks = null; }
    this._n = 0;
  }
  private _rnd(): number { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0; return this._seed / 4294967296; }

  private _mark(p: THREE.Vector3, ox: number, oz: number, size: number, color: number, opacity: number): void {
    if (!this._marks) {
      const mat = new THREE.MeshBasicMaterial({ map: soft(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 1, side: THREE.DoubleSide });
      this._marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
      this._marks.count = 0; this._marks.frustumCulled = false; this._marks.userData = { noSSAO: true };
      this._group.add(this._marks);
    }
    if (this._n >= MAX) return;
    // a plane lying in the shell: its normal is the outward vector
    this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(ox, 0, oz).normalize());
    this._m.compose(p, this._q, new THREE.Vector3(size, size * (0.8 + this._rnd() * 0.4), 1));
    this._marks.setMatrixAt(this._n, this._m);
    this._marks.setColorAt(this._n, this._c.setHex(color).multiplyScalar(opacity));
    this._n++;
    this._marks.count = this._n; this._marks.instanceMatrix.needsUpdate = true; if (this._marks.instanceColor) this._marks.instanceColor.needsUpdate = true;
  }

  onEvent(e: Probe): void {
    const h = this._h, y = h.ground(e.x, e.z) + 0.07 + this._rnd() * 0.22;
    // the point just proud of the shell
    const p = new THREE.Vector3(e.x + e.ox * 0.012, y, e.z + e.oz * 0.012);
    const spark = (n: number, color = 0xffd27a) => { for (let i = 0; i < n; i++) h.puff(p.clone().add(new THREE.Vector3((this._rnd() - 0.5) * 0.05, (this._rnd() - 0.2) * 0.05, (this._rnd() - 0.5) * 0.05)).addScaledVector(new THREE.Vector3(e.ox, 0, e.oz), 0.03 + i * 0.01), 0.005, 0.014, 0.22 + this._rnd() * 0.15, -0.05, color, 1, true); };
    switch (e.what) {
      case 'rifle':
        h.flash(p, 5, 0xfff0c8); spark(5);
        this._mark(p, e.ox, e.oz, e.tier === 'glass' ? 0.05 : 0.035, e.tier === 'glass' ? 0xe8f2ff : 0x2a2a2a, e.tier === 'glass' ? 1 : 0.8);
        break;
      case 'sledge':
        h.flash(p, 6, 0xffe9b8); spark(4, 0xffe2a0); h.shake(0.05);
        h.puff(p.clone(), 0.03, 0.14, 0.8, 0.02, 0xbfc4c8, 0.35);
        this._mark(p, e.ox, e.oz, 0.07, 0x9aa0a6, 0.7);
        break;
      case 'saw':
        spark(7, 0xffc060); this._mark(p, e.ox, e.oz, 0.045, e.holds ? 0x44484c : 0x151515, 0.8);
        break;
      case 'torch':
        h.flash(p, 9, 0xffa040); spark(4, 0xff8a30);
        h.puff(p.clone(), 0.03, 0.12, 1.4, 0.07, 0x22201e, 0.45);
        this._mark(p, e.ox, e.oz, 0.14, 0x050505, 0.9);
        break;
      case 'pry':
        h.flash(p, 3, 0xffe9b8); spark(3, 0xffe2a0); h.shake(0.03);
        break;
    }
  }
}
