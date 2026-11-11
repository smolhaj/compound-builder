/**
 * The plow on the drive (docs/DECISIONS.md, "Roads follow the land" and "Snow plowing on the drive"; sim/slope.ts `plowReport`, sim/plowing.ts):
 * the blade hangs on the fleet's real pickup (or the tractor, whose loader bucket is the blade) and, on a day with snow down, that vehicle goes
 * down the drive to the county road and back once; the snow it pushes lies in a berm along each edge of the drive. While the sim's closure
 * clock says the road is shut (`roadClosedFor`) drifts lie across the drive; they are pushed away by the pass on the closure's last day, and stay
 * all the closure when nothing can carry the blade. Visual only (the closure days and the response time are the sim's: the card shows them).
 * Real scale (1 u = 6 m): a pickup 0.31 x 0.75, the blade 0.4 wide, the berm 0.06 high, a drift 0.09 high.
 */
import * as THREE from 'three';
import { buildVehicle } from '../props/vehicleGeometry';
import type { VehicleKind } from '../../sim/vehicles';
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

/** Drifts across the drive: `n` humps spread along the middle of the polyline (index order runs from the yard out to the county road). */
export function buildDrifts(drive: readonly Pt[], ground: (x: number, z: number) => number, n = 4): THREE.Mesh | null {
  const len = lineLength(drive);
  if (drive.length < 3 || len < 3) return null;
  const pos: number[] = [], idx: number[] = [], U = 9, V = 5, halfW = 0.36, halfL = 0.34;
  for (let k = 0; k < n; k++) {
    const d = len * (0.14 + 0.72 * (k + 0.5) / n), c = pointAt(drive, d);
    const sx = Math.cos(c.rot), sz = -Math.sin(c.rot), fx = Math.sin(c.rot), fz = Math.cos(c.rot);     // across the drive, along it
    const hgt = 0.075 + 0.03 * ((k * 37) % 5) / 4, base = pos.length / 3;
    for (let j = 0; j < V; j++) for (let i = 0; i < U; i++) {
      const a = (i / (U - 1)) * 2 - 1, b = (j / (V - 1)) * 2 - 1;
      const h = hgt * Math.max(0, 1 - a * a) * Math.max(0, 1 - b * b * 0.9) * (0.85 + 0.15 * Math.cos(a * 5 + k));
      const x = c.x + sx * a * halfW + fx * b * halfL, z = c.z + sz * a * halfW + fz * b * halfL;
      pos.push(x, ground(x, z) + h + 0.01, z);
    }
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < U - 1; i++) { const q = base + j * U + i; idx.push(q, q + U, q + 1, q + 1, q + U, q + U + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf0f3f7, roughness: 0.95, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  m.userData.perDrift = (U - 1) * (V - 1) * 6;
  return m;
}

/** What the world tells the plow each frame. */
export interface PlowInput {
  /** The vehicle that carries the blade (sim/plowing `plowRig`), or null: none running, home and fueled, or no blade in stock. */
  rig: VehicleKind | null;
  /** Snow on the ground, 0-1 (seasonState.params.snow). */
  snow: number;
  /** Days the road is still shut by snow (sim/slope `roadClosedFor`). */
  closed: number;
  /** The game day and the hour of it. */
  day: number; hour: number;
  speedK: number;
}

export class PlowRun {
  private _truck: THREE.Group | null = null;
  private _kind: VehicleKind | null = null;
  private _berms: THREE.Mesh | null = null;
  private _drifts: THREE.Mesh | null = null;
  private _route: Pt[] = [];
  private _len = 0;
  private _phase: Phase = 'idle';
  private _d = 0;
  /** The last game day the blade went out, so it goes once a day, not in a loop. */
  private _passDay = -1;
  /** The pass has pushed this closure's drifts away. */
  private _cleared = false;
  private _ground: (x: number, z: number) => number;
  private _driveY: (x: number, z: number) => number | null;

  private readonly _scene: THREE.Scene;

  constructor(scene: THREE.Scene, drive: readonly Pt[], ground: (x: number, z: number) => number, driveY: (x: number, z: number) => number | null = () => null) {
    this._scene = scene;
    this._ground = ground; this._driveY = driveY;
    this.setRoute(drive);
  }

  /** Hang the blade on this kind of vehicle (rebuilt only when the kind changes). */
  private _rig(kind: VehicleKind): THREE.Group {
    if (this._truck && this._kind === kind) return this._truck;
    this._dropTruck();
    const t = buildVehicle(kind, kind === 'tractor' ? undefined : 0x2f5a8a);
    if (kind !== 'tractor') t.add(buildPlowBlade());     // (the tractor's loader bucket is its blade)
    t.visible = false;
    this._scene.add(t);
    this._truck = t; this._kind = kind;
    return t;
  }
  private _dropTruck(): void {
    if (!this._truck) return;
    this._scene.remove(this._truck);
    this._truck.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    this._truck = null; this._kind = null;
  }

  /** The drive changed (another entrance, or it was built): re-lay the berms and drifts and send the truck the new way. */
  setRoute(drive: readonly Pt[]): void {
    this._route = [...drive].reverse();   // from the yard out to the county road
    this._len = lineLength(this._route);
    this._phase = 'idle'; if (this._truck) this._truck.visible = false; this._d = 0; this._passDay = -1; this._cleared = false;
    for (const m of [this._berms, this._drifts]) if (m) { this._scene.remove(m); m.geometry.dispose(); }
    this._berms = this._drifts = null;
    const b = buildBerms(drive.filter((_, i) => i % 2 === 0 || i === drive.length - 1), this._ground, 0.34);
    if (b) { b.visible = false; this._berms = b; this._scene.add(b); }
    const d = buildDrifts(this._route, this._ground);
    if (d) { d.visible = false; this._drifts = d; this._scene.add(d); }
  }

  /** Drifts left across the drive: all of them until the truck has passed them, then none. */
  private _showDrifts(from: number): void {
    const m = this._drifts;
    if (!m) return;
    const per = m.userData.perDrift as number, total = (m.geometry.index?.count ?? 0) / per;
    // drifts lie at 14%..86% of the drive; those the truck has not reached yet (further out than `from`) stay
    const keep = Math.max(0, Math.min(total, Math.ceil(total - ((from / Math.max(1e-6, this._len)) - 0.14) / 0.72 * total)));
    m.geometry.setDrawRange(total - keep === 0 && from <= 0 ? 0 : (total - keep) * per, keep * per);
    m.visible = keep > 0;
  }

  /**
   * `o.rig`: the vehicle that carries the blade today (null: none), `snow` how much snow lies (0-1), `closed` days the road is still shut.
   * The pass is once a day, after 7 a.m., on a day with snow down. While the road is shut for more than one more day the drifts lie across the
   * drive and the truck waits; on the closure's last day it goes out and pushes them away. With nothing to carry the blade the drifts stay all closure.
   */
  /** QA shots: hold the pose set by `qaPose` (the frame loop's update would hide the truck on a summer day). */
  qaHold = false;
  update(dt: number, o: PlowInput): void {
    if (this.qaHold) return;
    const snowy = o.snow > 0.3, plowed = !!o.rig && snowy, drifted = snowy && o.closed > 0;
    if (this._berms) this._berms.visible = plowed;
    if (!snowy || o.closed <= 0) this._cleared = false;
    const waits = drifted && o.closed > 1;            // the road is still shut for days: the truck stays in the yard
    if (!plowed || waits) {
      this._phase = 'idle'; if (this._truck) this._truck.visible = false;
      if (!snowy) this._passDay = -1;
      if (this._drifts) { if (drifted) this._showDrifts(0); else this._drifts.visible = false; }
      return;
    }
    if (this._phase === 'idle') {
      if (this._drifts) { if (drifted && !this._cleared) this._showDrifts(0); else this._drifts.visible = false; }
      if (this._passDay === o.day || o.hour < 7) { if (this._truck) this._truck.visible = false; return; }
      this._phase = 'out'; this._d = 0; this._passDay = o.day;
    }
    const truck = this._rig(o.rig!);
    const k = Math.min(4, Math.max(1, o.speedK));
    this._d += dt * k * 1.5;
    const path = this._phase === 'out' ? this._route : [...this._route].reverse(), len = this._len;
    const p = pointAt(path, Math.min(this._d, len));
    truck.position.set(p.x, this._driveY(p.x, p.z) ?? this._ground(p.x, p.z), p.z);
    truck.rotation.y = p.rot;
    truck.visible = true;
    if (this._phase === 'out' && drifted && !this._cleared) this._showDrifts(Math.min(this._d, len));
    if (this._d >= len) {
      if (this._phase === 'out') { this._phase = 'back'; this._d = 0; if (drifted) this._cleared = true; if (this._drifts) this._drifts.visible = false; }
      else { this._phase = 'idle'; truck.visible = false; }
    }
  }

  /** QA: put the truck `d` units along the drive from the yard, going out (drifts beyond it stay). */
  qaPose(d: number, kind: VehicleKind = 'pickup', drifts = false): void {
    const truck = this._rig(kind);
    this.qaHold = true;
    this._phase = 'out'; this._d = d;
    if (this._berms) this._berms.visible = true;
    if (drifts) this._showDrifts(d); else if (this._drifts) this._drifts.visible = false;
    const p = pointAt(this._route, Math.min(d, this._len));
    truck.position.set(p.x, this._driveY(p.x, p.z) ?? this._ground(p.x, p.z), p.z);
    truck.rotation.y = p.rot;
    truck.visible = true;
  }

  dispose(): void {
    this._dropTruck();
    for (const m of [this._berms, this._drifts]) if (m) { this._scene.remove(m); m.geometry.dispose(); }
  }
}
