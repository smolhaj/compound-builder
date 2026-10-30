/**
 * The plow on the drive (docs/DECISIONS.md, "Roads follow the land"; sim/slope.ts `plowReport`): with a plow blade in stock and snow on the
 * ground, the pickup with the blade goes down the drive to the county road and back, and the snow it pushes lies in a berm along each edge
 * of the drive. Without the blade the drive is simply snowed under (no berms, no truck). Visual only (the closure days and the response
 * time are the sim's: the card shows them). Real scale (1 u = 6 m): a pickup 0.31 x 0.75, the blade 0.4 wide, the berm 0.06 high.
 */
import * as THREE from 'three';
import { buildVehicle } from '../props/vehicleGeometry';
import { lineLength, pointAt, type Pt } from '../region/access';

type Phase = 'idle' | 'out' | 'back';

const SNOW_MAT = new THREE.MeshStandardMaterial({ color: 0xf0f3f7, roughness: 0.95 });
const BLADE_MAT = new THREE.MeshStandardMaterial({ color: 0xe0a820, roughness: 0.55, metalness: 0.2 });
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: 0x2c2e32, roughness: 0.8 });

/** The blade and its frame, hung on the front of a pickup (front toward +z). */
export function buildPlowBlade(): THREE.Group {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.11, 0.03), BLADE_MAT);
  blade.position.set(0, 0.13, 0.47); blade.rotation.y = 0.28;
  const curl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.05), SNOW_MAT);
  curl.position.set(0, 0.2, 0.47); curl.rotation.y = 0.28;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.1), FRAME_MAT);
  frame.position.set(0, 0.11, 0.43);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.12), FRAME_MAT);
  beam.position.set(0, 0.14, 0.42);
  for (const m of [blade, curl, frame, beam]) { m.castShadow = true; }
  g.add(blade, curl, frame, beam);
  return g;
}

/** A low berm along both edges of a drive: a half-round of snow `off` out from the centre line. */
export function buildBerms(drive: readonly Pt[], ground: (x: number, z: number) => number, off: number): THREE.Mesh | null {
  if (drive.length < 3) return null;
  const rows = drive.length, pos: number[] = [], idx: number[] = [];
  const side = (sg: number) => {
    const base = pos.length / 3;
    for (let i = 0; i < rows; i++) {
      const [x, z] = drive[i], [ax, az] = drive[Math.max(0, i - 1)], [bx, bz] = drive[Math.min(rows - 1, i + 1)];
      let tx = bx - ax, tz = bz - az; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = tz * sg, nz = -tx * sg;
      // a humped cross-section: foot toward the road, crest, foot on the verge (lower and thinner at the very ends)
      const end = Math.min(1, i / 4, (rows - 1 - i) / 4), hgt = 0.065 * (0.3 + 0.7 * end);
      for (const [o, h] of [[off - 0.05, 0], [off + 0.01, hgt], [off + 0.08, hgt * 0.7], [off + 0.15, 0]] as const) {
        const px = x + nx * o, pz = z + nz * o;
        pos.push(px, ground(px, pz) + h + 0.012, pz);
      }
    }
    for (let i = 0; i < rows - 1; i++) for (let k = 0; k < 3; k++) { const a = base + i * 4 + k, b = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b, b, c, d); }
  };
  side(1); side(-1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf0f3f7, roughness: 0.95, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}

export class PlowRun {
  private readonly _truck: THREE.Group;
  private _berms: THREE.Mesh | null = null;
  private _route: Pt[] = [];
  private _len = 0;
  private _phase: Phase = 'idle';
  private _d = 0;
  private _cool = 4;
  private _ground: (x: number, z: number) => number;
  private _driveY: (x: number, z: number) => number | null;

  private readonly _scene: THREE.Scene;

  constructor(scene: THREE.Scene, drive: readonly Pt[], ground: (x: number, z: number) => number, driveY: (x: number, z: number) => number | null = () => null) {
    this._scene = scene;
    this._ground = ground; this._driveY = driveY;
    this._truck = buildVehicle('pickup', 0x2f5a8a);
    this._truck.add(buildPlowBlade());
    this._truck.visible = false;
    scene.add(this._truck);
    this.setRoute(drive);
  }

  /** The drive changed (another entrance, or it was built): re-lay the berms and send the truck the new way. */
  setRoute(drive: readonly Pt[]): void {
    this._route = [...drive].reverse();   // from the yard out to the county road
    this._len = lineLength(this._route);
    this._phase = 'idle'; this._truck.visible = false; this._d = 0; this._cool = 3;
    if (this._berms) { this._scene.remove(this._berms); this._berms.geometry.dispose(); this._berms = null; }
    const b = buildBerms(drive.filter((_, i) => i % 2 === 0 || i === drive.length - 1), this._ground, 0.34);
    if (b) { b.visible = false; this._berms = b; this._scene.add(b); }
  }

  /** `blade`: the plow is in stock and the drive is built; `snow`: how much snow lies (0-1, seasonState.params.snow). */
  update(dt: number, blade: boolean, snow: number, speedK = 1): void {
    const plowed = blade && snow > 0.3;
    if (this._berms) this._berms.visible = plowed;
    if (!plowed) { this._phase = 'idle'; this._truck.visible = false; this._cool = Math.max(this._cool, 3); return; }
    if (this._phase === 'idle') {
      this._cool -= dt * Math.min(4, Math.max(1, speedK));
      if (this._cool <= 0) { this._phase = 'out'; this._d = 0; }
      else { this._truck.visible = false; return; }
    }
    const k = Math.min(4, Math.max(1, speedK));
    this._d += dt * k * 1.5;
    const path = this._phase === 'out' ? this._route : [...this._route].reverse(), len = this._len;
    const p = pointAt(path, Math.min(this._d, len));
    this._truck.position.set(p.x, this._driveY(p.x, p.z) ?? this._ground(p.x, p.z), p.z);
    this._truck.rotation.y = p.rot;
    this._truck.visible = true;
    if (this._d >= len) {
      if (this._phase === 'out') { this._phase = 'back'; this._d = 0; }
      else { this._phase = 'idle'; this._cool = 40; this._truck.visible = false; }
    }
  }

  /** QA: put the truck `d` units along the drive from the yard, going out. */
  qaPose(d: number): void {
    this._phase = 'out'; this._d = d;
    if (this._berms) this._berms.visible = true;
    const p = pointAt(this._route, Math.min(d, this._len));
    this._truck.position.set(p.x, this._driveY(p.x, p.z) ?? this._ground(p.x, p.z), p.z);
    this._truck.rotation.y = p.rot;
    this._truck.visible = true;
  }

  dispose(): void {
    this._scene.remove(this._truck);
    this._truck.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    if (this._berms) { this._scene.remove(this._berms); this._berms.geometry.dispose(); }
  }
}
