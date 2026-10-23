/**
 * The delivery truck: when an order is delivered the lumber-yard flatbed
 * drives up the county road, turns in at the gate, unloads at the yard (the
 * load then shows in the stockpile) and drives off north. Visual only; runs
 * in real time (a little faster at fast-forward). One truck at a time,
 * further loads queue.
 */
import * as THREE from 'three';
import { buildTruck } from './props/truckGeometry';
import { buildStockpile } from './props/stockpileGeometry';
import { emptyStock, type Stock } from '../sim/materials';
import type { OrderLine } from '../sim/state';
import { lineLength, pointAt, roadX, type Pt } from './region/access';

type Phase = 'in' | 'unload' | 'out';

export class DeliveryTruck {
  private readonly _truck: THREE.Group;
  private readonly _scene: THREE.Scene;
  private _load: THREE.Group | null = null;
  private readonly _queue: OrderLine[][] = [];
  private _cur: { lines: OrderLine[]; phase: Phase; d: number; t: number } | null = null;
  private _in: Pt[] = [];
  private _out: Pt[] = [];
  private _inLen = 0;
  private _outLen = 0;
  private _held = false;

  private readonly _ground: (x: number, z: number) => number;

  constructor(scene: THREE.Scene, drive: readonly Pt[], ground: (x: number, z: number) => number) {
    this._scene = scene;
    this._ground = ground;
    this._truck = buildTruck();
    this._truck.visible = false;
    scene.add(this._truck);
    // in: up the county road from the south, then the driveway; out: back to the road and on north
    const gz = drive[0][1];
    const south: Pt[] = [];
    for (let z = gz - 150; z < gz; z += 3) south.push([roadX(z) + 0.25, z]);
    this._in = [...south, ...drive];
    const north: Pt[] = [];
    for (let z = gz + 1; z < gz + 150; z += 3) north.push([roadX(z) - 0.25, z]);
    this._out = [...[...drive].reverse(), ...north];
    this._inLen = lineLength(this._in);
    this._outLen = lineLength(this._out);
  }

  get busy(): boolean { return this._cur !== null; }

  /** Materials still on the truck (not yet in the stockpile). */
  onTruck(): Stock {
    const s = emptyStock();
    const add = (lines: OrderLine[]) => { for (const l of lines) s[l.material] += l.qty; };
    for (const q of this._queue) add(q);
    if (this._cur && this._cur.phase === 'in') add(this._cur.lines);
    if (this._cur && this._cur.phase === 'unload' && this._cur.t < 2.5) add(this._cur.lines);
    return s;
  }

  enqueue(lines: OrderLine[]): void { this._queue.push(lines); }

  /** QA: freeze the truck with a load, `d` units along the way in (or at the yard with d < 0). */
  qaHold(lines: OrderLine[], d: number): void {
    this._held = true;
    this._cur = { lines, phase: d < 0 ? 'unload' : 'in', d: Math.max(0, d), t: 1 };
    this._setLoad(lines);
    const p = pointAt(this._in, d < 0 ? this._inLen : Math.min(d, this._inLen));
    this._truck.position.set(p.x, this._ground(p.x, p.z), p.z);
    this._truck.rotation.y = p.rot;
    this._truck.visible = true;
  }

  /** Path length in (QA: d for "on the driveway"). */
  get inLength(): number { return this._inLen; }

  update(dt: number, speedK: number): void {
    if (this._held) return;
    if (!this._cur) {
      const next = this._queue.shift();
      if (!next) { this._truck.visible = false; return; }
      this._cur = { lines: next, phase: 'in', d: 0, t: 0 };
      this._setLoad(next);
    }
    const c = this._cur;
    const k = Math.min(4, Math.max(1, speedK));
    if (c.phase === 'in' || c.phase === 'out') {
      const path = c.phase === 'in' ? this._in : this._out, len = c.phase === 'in' ? this._inLen : this._outLen;
      // fast on the road, slow on the driveway
      const onDrive = c.phase === 'in' ? c.d > this._inLen - lineLength(this._in.slice(-Math.ceil(this._in.length / 3))) : c.d < 40;
      c.d += dt * k * (onDrive ? 1.4 : 5);
      const p = pointAt(path, Math.min(c.d, len));
      this._truck.position.set(p.x, this._ground(p.x, p.z), p.z);
      this._truck.rotation.y = p.rot;
      this._truck.visible = true;
      if (c.d >= len) {
        if (c.phase === 'in') { c.phase = 'unload'; c.t = 0; }
        else { this._cur = null; this._truck.visible = false; }
      }
    } else {
      c.t += dt * k;
      if (c.t > 2.5 && this._load) this._setLoad(null);
      if (c.t > 4) { c.phase = 'out'; c.d = 0; }
    }
  }

  private _setLoad(lines: OrderLine[] | null): void {
    if (this._load) { this._truck.remove(this._load); this._load.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this._load = null; }
    if (!lines) return;
    const s = emptyStock();
    for (const l of lines) s[l.material] += Math.min(l.qty, 6);
    const g = buildStockpile(s);
    g.scale.setScalar(0.45);
    g.rotation.y = Math.PI / 2;
    g.position.set(0, 0.2, -0.2);
    this._load = g;
    this._truck.add(g);
  }

  dispose(): void {
    this._setLoad(null);
    this._scene.remove(this._truck);
    this._truck.traverse(o => (o as THREE.Mesh).geometry?.dispose());
  }
}
