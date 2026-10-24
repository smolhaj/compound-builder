/**
 * Perimeter tool (store tool 'fence:<kind>'): click to drop corner points
 * (snapped to a 1.5 m grid) and draw the line; Shift-click on the line
 * leaves a gate; Enter or double-click lays it out (the family builds it);
 * Backspace drops the last point; Esc / right-click cancels. The HUD shows
 * length, cost and hours as you draw.
 */
import { ownsAt } from '../sim/land';
import * as THREE from 'three';
import type { HomesteadWorld } from './HomesteadWorld';
import { PARCEL_SIZE } from './parcel/parcelTerrain';
import { closestOnLine } from './parcel/parcelTerrain';
import { useGameStore } from '../store/gameStore';
import { OFF_PARCEL_HOURS, PERIMETER, runBill, runHours, wallLength, type Gate, type PerimeterKind, type Pt } from '../sim/perimeter';
import { orderCost } from '../sim/economy';
import { MATERIALS, type MaterialId } from '../sim/materials';

const SNAP = 0.25;
/** How far beyond the parcel a tunnel may run (≈ 360 m). */
const OFF_PARCEL_REACH = 60;

/** Length of a polyline lying outside the parcel. */
function offParcel(pts: readonly Pt[]): number {
  let off = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 0.25));
    for (let k = 0; k < n; k++) {
      const x = ax + (bx - ax) * (k + 0.5) / n, z = az + (bz - az) * (k + 0.5) / n;
      if (!ownsAt(useGameStore.getState().game, x, z)) off += l / n;
    }
  }
  return off;
}
/** Gate width: a truck fits (≈ 3.6 m). */
export const GATE_W = 0.6;
/** A pedestrian (man-door) gate: ≈ 1.2 m. */
export const PED_GATE_W = 0.2;

export class PerimeterTool {
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private _kind: PerimeterKind | null = null;
  private _pts: Pt[] = [];
  private _gates: Gate[] = [];
  private _cursor: Pt | null = null;
  private _down: { x: number; y: number; t: number } | null = null;
  private _lastClick = 0;
  private readonly _line: THREE.Line;
  private readonly _dots: THREE.InstancedMesh;
  private readonly _off: Array<() => void> = [];
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom: HTMLElement;
  private readonly _world: HomesteadWorld;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLElement, world: HomesteadWorld) {
    this._scene = scene; this._camera = camera; this._dom = dom; this._world = world;
    this._line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true }));
    this._line.renderOrder = 7;
    this._dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, depthTest: false, transparent: true }), 64);
    this._dots.renderOrder = 7;
    this._dots.count = 0;
    this._line.visible = this._dots.visible = false;
    scene.add(this._line, this._dots);
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, f as EventListener);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on(dom, 'pointermove', e => { if (this._kind) { this._cursor = this._hit(e.clientX, e.clientY); this._redraw(); } });
    on(dom, 'pointerdown', e => { if (!this._kind) return; if (e.button === 0) this._down = { x: e.clientX, y: e.clientY, t: performance.now() }; if (e.button === 2) this.cancel(); });
    on(dom, 'pointerup', e => {
      const d = this._down;
      this._down = null;
      if (!this._kind || e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      const p = this._hit(e.clientX, e.clientY);
      if (!p) return;
      const now = performance.now();
      if (now - this._lastClick < 320 && this._pts.length >= 2) { this.finish(); return; }
      this._lastClick = now;
      if (e.shiftKey && this._kind !== 'escape_tunnel') this.addGateAt(p[0], p[1], e.altKey || e.ctrlKey ? PED_GATE_W : GATE_W);
      else this.addPoint(p[0], p[1]);
    });
    on(window, 'keydown', e => {
      if (!this._kind) return;
      if (e.code === 'Enter') this.finish();
      if (e.code === 'Backspace') { this._pts.pop(); this._gates = this._gates.filter(g => g.at < this._len()); this._redraw(); }
      if (e.code === 'Escape') this.cancel();
    });
  }

  /** Tool on for a kind (or off). */
  setKind(kind: PerimeterKind | null): void {
    this._kind = kind;
    this._pts = []; this._gates = [];
    this._line.visible = this._dots.visible = !!kind;
    this._redraw();
  }

  private _hit(cx: number, cy: number): Pt | null {
    const mesh = this._world.terrain.mesh;
    if (!mesh) return null;
    const r = this._dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this._camera);
    const h = this._ray.intersectObject(mesh, false)[0];
    if (!h) return null;
    // an escape tunnel may run on under the neighbors' land; everything else stays on yours
    const m = this._kind === 'escape_tunnel' ? OFF_PARCEL_REACH : 0;
    const x = Math.min(PARCEL_SIZE + m, Math.max(-m, Math.round(h.point.x / SNAP) * SNAP));
    const z = Math.min(PARCEL_SIZE + m, Math.max(-m, Math.round(h.point.z / SNAP) * SNAP));
    return [x, z];
  }

  private _len(): number { return wallLength({ pts: this._pts, gates: [] }); }

  addPoint(x: number, z: number): void {
    // an escape tunnel starts at a free wall of a bunker room
    if (this._kind === 'escape_tunnel' && this._pts.length === 0) {
      const s = this._world.tunnelStartAt(x, z);
      if ('problem' in s) { useGameStore.getState().setToolProblem(s.problem); return; }
      [x, z] = s.pt;
    }
    const last = this._pts.at(-1);
    if (last && Math.hypot(last[0] - x, last[1] - z) < SNAP * 0.5) return;
    this._pts.push([x, z]);
    this._redraw();
  }

  /** Leave a gate where the line passes nearest (x, z). */
  addGateAt(x: number, z: number, w = GATE_W): void {
    if (this._pts.length < 2) return;
    const { d, s } = closestOnLine(this._pts, x, z);
    if (d > 0.6) return;
    const L = this._len();
    const at = Math.min(L - w / 2, Math.max(w / 2, s));
    if (this._gates.some(g => Math.abs(g.at - at) < (g.w + w) / 2 + 0.02)) return;
    this._gates.push({ at, w });
    this._redraw();
  }

  finish(): void {
    if (!this._kind || this._pts.length < 2) return;
    if (this._kind === 'escape_tunnel' && this._world.tunnelRouteProblem(this._pts)) return;
    useGameStore.getState().planRun(this._kind, this._pts.map(p => [p[0], p[1]] as Pt), this._gates.map(g => ({ ...g })), this._kind === 'escape_tunnel' ? offParcel(this._pts) : 0);
    this._pts = []; this._gates = [];
    this._redraw();
  }

  cancel(): void {
    if (this._pts.length) { this._pts = []; this._gates = []; this._redraw(); return; }
    useGameStore.getState().setTool(null);
  }

  private _redraw(): void {
    const pts = this._cursor && this._kind ? [...this._pts, this._cursor] : this._pts;
    const g = this._world.groundAt;
    const v: number[] = [];
    for (const [x, z] of pts) v.push(x, g(x, z) + 0.05, z);
    this._line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    this._line.geometry.computeBoundingSphere();
    const m = new THREE.Matrix4();
    let n = 0;
    for (const [x, z] of this._pts) { m.makeTranslation(x, g(x, z) + 0.05, z); this._dots.setMatrixAt(n++, m); }
    for (const gt of this._gates) {
      let acc = 0;
      for (let i = 1; i < this._pts.length; i++) {
        const [ax, az] = this._pts[i - 1], [bx, bz] = this._pts[i], l = Math.hypot(bx - ax, bz - az);
        if (gt.at <= acc + l) { const t = (gt.at - acc) / l, x = ax + (bx - ax) * t, z = az + (bz - az) * t; m.makeScale(2.4, 2.4, 2.4).setPosition(x, g(x, z) + 0.06, z); this._dots.setMatrixAt(n++, m); break; }
        acc += l;
      }
    }
    this._dots.count = Math.min(64, n);
    this._dots.instanceMatrix.needsUpdate = true;
    if (!this._kind) return;
    const len = wallLength({ pts: pts as Pt[], gates: this._gates });
    const bill = len > 0 ? runBill(this._kind, len) : {};
    const lines = Object.entries(bill).map(([k, q]) => ({ material: k as MaterialId, qty: q as number }));
    const buyable = lines.filter(l => MATERIALS[l.material].price !== null);
    const own = lines.filter(l => MATERIALS[l.material].price === null).map(l => `${l.qty} ${MATERIALS[l.material].name.toLowerCase()}`);
    const tunnelWhy = this._kind === 'escape_tunnel' ? this._world.tunnelRouteProblem(pts as Pt[]) : null;
    (this._line.material as THREE.LineBasicMaterial).color.set(tunnelWhy ? 0xe36a5a : 0xffd27a);
    const txt = tunnelWhy ? tunnelWhy
      : this._pts.length === 0 ? (this._kind === 'escape_tunnel' ? 'Escape tunnel: click a bunker room to start at its wall, then out to the exit' : `${PERIMETER[this._kind].name}: click to start the line`)
      : `${Math.round(len * 6)} m${this._kind === 'escape_tunnel' && offParcel(pts as Pt[]) > 0 ? ` (${Math.round(offParcel(pts as Pt[]) * 6)} m under neighbors' land)` : ''} · ~$${orderCost(buyable).toLocaleString('en-US')}${own.length ? ' + ' + own.join(', ') : ''} · ${Math.round(runHours(this._kind, len) + (this._kind === 'escape_tunnel' ? OFF_PARCEL_HOURS * offParcel(pts as Pt[]) : 0))} h${this._gates.length ? ` · ${this._gates.length} gate${this._gates.length > 1 ? 's' : ''}` : ''}`;
    const e = pts[pts.length - 1] as Pt | undefined;
    const hide = !tunnelWhy && this._kind === 'escape_tunnel' && this._pts.length > 0 && e
      ? (this._world.tunnelExitWoods(e[0], e[1]) >= 0.3 ? ' · exit hidden under leaf litter in the trees' : ' · exit in the open: hidden under turf (the trees hide it better)') : '';
    useGameStore.getState().setToolProblem(txt + hide);
  }

  dispose(): void {
    this._off.forEach(f => f());
    this._scene.remove(this._line, this._dots);
    this._line.geometry.dispose();
    this._dots.geometry.dispose();
  }
}
