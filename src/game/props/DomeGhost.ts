/**
 * The dome's placing ghost (the diameter handle): not the finished building (a 360 ft arcology rebuilt at every wheel click would stall the frame) but what the
 * player needs to judge a circle: a pale shell cap, the footprint ring and the shell ring draped on the ground, a soft disc, red where the ring is off the
 * family's land, a red outline round each building the wall would cut, an orange ring on each tree it would clear. Green when the spot is good, red when not.
 * Scale: 1 unit = 20 ft. One group, rebuilt only when the spot, the size or the verdict changes.
 */
import * as THREE from 'three';

type Ground = (x: number, z: number) => number;
const OK = new THREE.Color(0x7fe28a), BAD = new THREE.Color(0xe8604e), TREE = new THREE.Color(0xf0a64a);

/** A flat ribbon of width `w` along a polyline (closed or not), draped on the ground `lift` above it, with a color per segment. */
function ribbon(pts: Array<[number, number]>, w: number, ground: Ground, color: (i: number) => THREE.Color, closed: boolean, lift = 0.03): { pos: number[]; col: number[] } {
  const pos: number[] = [], col: number[] = [], n = pts.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % n], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const P = (x: number, z: number): [number, number, number] => [x, ground(x, z) + lift, z];
    const a = P(ax + nx, az + nz), b = P(ax - nx, az - nz), c = P(bx - nx, bz - nz), d = P(bx + nx, bz + nz), k = color(i);
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let j = 0; j < 6; j++) col.push(k.r, k.g, k.b);
  }
  return { pos, col };
}
const circle = (x: number, z: number, r: number, n = 96): Array<[number, number]> => Array.from({ length: n }, (_, i) => [x + Math.sin(i / n * Math.PI * 2) * r, z + Math.cos(i / n * Math.PI * 2) * r]);

export interface GhostSpec {
  x: number; z: number;
  /** Shell radius and footprint (shell plus berm) radius, world units. */
  shellR: number; footR: number; height: number;
  ok: boolean;
  /** For each of N points round the footprint: on the family's land? */
  ringOwned: boolean[];
  /** Outlines of buildings the wall would cut, as [x0, z0, x1, z1]. */
  straddles: Array<[number, number, number, number]>;
  trees: Array<[number, number]>;
}

export class DomeGhost {
  readonly group = new THREE.Group();
  private _key = '';
  private readonly _ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  private readonly _discMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  private readonly _capOk = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  private readonly _capBad = new THREE.MeshBasicMaterial({ color: BAD, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  private _cap: THREE.Mesh | null = null;
  private _ground: Ground;
  constructor(ground: Ground) { this._ground = ground; this.group.visible = false; this.group.renderOrder = 6; }

  private _clear(): void { for (const c of [...this.group.children]) { this.group.remove(c); if (c !== this._cap) (c as THREE.Mesh).geometry?.dispose(); } if (this._cap) { this._cap.geometry.dispose(); this._cap = null; } }

  set(s: GhostSpec): void {
    const key = [s.x.toFixed(2), s.z.toFixed(2), s.shellR.toFixed(2), s.footR.toFixed(2), s.ok, s.ringOwned.map(o => (o ? 1 : 0)).join(''), s.straddles.join(','), s.trees.length].join('|');
    this.group.visible = true;
    if (key === this._key) return;
    this._key = key;
    this._clear();
    const g = this._ground, w = Math.max(0.09, Math.min(0.6, s.footR * 0.03)), base = s.ok ? OK : BAD;
    const rib = (pts: Array<[number, number]>, width: number, color: (i: number) => THREE.Color, closed = true, lift = 0.03) => {
      const r = ribbon(pts, width, g, color, closed, lift), geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(r.col, 3));
      const m = new THREE.Mesh(geo, this._ribbonMat); m.renderOrder = 6; this.group.add(m);
    };
    // the footprint ring (the wall of the site work): red where it is off the land
    const N = s.ringOwned.length, foot = circle(s.x, s.z, s.footR, N);
    rib(foot, w, i => (s.ringOwned[i] ? base : BAD));
    if (s.shellR < s.footR - 0.01) rib(circle(s.x, s.z, s.shellR, 96), w * 0.6, () => base, true, 0.04);   // the shell itself, inside its berm
    // the disc
    { const rings = 5, n = 64, pos: number[] = [], col: number[] = [];
      const P = (k: number, i: number): [number, number, number] => { const a = i / n * Math.PI * 2, r = s.footR * k / rings, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r; return [x, g(x, z) + 0.02, z]; };
      for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) { pos.push(...P(k, i), ...P(k + 1, i), ...P(k + 1, i + 1), ...P(k, i), ...P(k + 1, i + 1), ...P(k, i + 1)); for (let j = 0; j < 6; j++) col.push(base.r, base.g, base.b); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(geo, this._discMat); m.renderOrder = 5; this.group.add(m); }
    // the pale shell
    { const geo = new THREE.SphereGeometry(1, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2); geo.scale(s.shellR, s.height, s.shellR);
      const m = new THREE.Mesh(geo, s.ok ? this._capOk : this._capBad); m.position.set(s.x, g(s.x, s.z) + 0.02, s.z); m.renderOrder = 4; this._cap = m; this.group.add(m); }
    for (const [x0, z0, x1, z1] of s.straddles) rib([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], 0.05, () => BAD, true, 0.06);
    for (const [x, z] of s.trees.slice(0, 80)) rib(circle(x, z, 0.28, 14), 0.045, () => TREE, true, 0.05);
  }

  hide(): void { this.group.visible = false; this._key = ''; }
  dispose(): void { this._clear(); this._ribbonMat.dispose(); this._discMat.dispose(); this._capOk.dispose(); this._capBad.dispose(); }
}
