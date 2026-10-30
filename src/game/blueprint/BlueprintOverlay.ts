/**
 * Draws the blueprint view (game/blueprint/blueprintPlan.ts): flat footprints and wall lines in blueprint colours on the ground,
 * and name labels as a DOM layer over the canvas, declutter-sorted by priority. Built when the view is switched on or the compound
 * changes; the labels re-project only when the camera moves (and at most 20 times a second), so a still frame costs nothing.
 * DOM labels keep the same crisp size at every graphics tier.
 */
import * as THREE from 'three';
import { declutter, type BpMark, type BpOutline, type BlueprintPlan, type MarkCat } from './blueprintPlan';

const COLOR: Record<MarkCat, number> = { home: 0x6fd0ff, work: 0xa8c8e8, food: 0x8fe08a, water: 0x58a8ff, power: 0xffd860, bunker: 0xc89aff, tower: 0xffa040, gate: 0xff6070, ring: 0xff6070, tunnel: 0xc89aff, bridge: 0xffb060, wall: 0xe0e0e0 };
const CSS = (c: number): string => '#' + c.toString(16).padStart(6, '0');

interface Label { mark: BpMark; el: HTMLDivElement; w: number; h: number }

export class BlueprintOverlay {
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.Camera;
  private readonly _ground: (x: number, z: number) => number;
  private readonly _host: HTMLElement;
  private readonly _layer: HTMLDivElement;
  private _group: THREE.Group | null = null;
  private _labels: Label[] = [];
  private _on = false;
  private _lastKey = '';
  private _lastT = 0;
  private readonly _v = new THREE.Vector3();

  constructor(scene: THREE.Scene, camera: THREE.Camera, host: HTMLElement, ground: (x: number, z: number) => number) {
    this._scene = scene; this._camera = camera; this._host = host; this._ground = ground;
    this._layer = document.createElement('div');
    this._layer.setAttribute('data-testid', 'blueprint-labels');
    Object.assign(this._layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', display: 'none', zIndex: '4' });
    host.appendChild(this._layer);
  }

  get on(): boolean { return this._on; }

  /** Show a plan (or hide with null). */
  set(plan: BlueprintPlan | null): void {
    this._clear();
    this._on = !!plan;
    this._layer.style.display = plan ? 'block' : 'none';
    if (!plan) return;
    const g = new THREE.Group();
    for (const o of plan.outlines) g.add(this._line(o));
    this._group = g; this._scene.add(g);
    for (const m of plan.marks) {
      const el = document.createElement('div');
      const c = CSS(COLOR[m.cat]);
      Object.assign(el.style, { position: 'absolute', left: '0', top: '0', transform: 'translate(-50%,-100%)', font: '600 11.5px/1.25 system-ui,sans-serif', color: '#f4f8ff', background: 'rgba(8,24,52,0.82)', border: `1px solid ${c}`, borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', textShadow: '0 1px 1px #000', boxShadow: '0 1px 4px rgba(0,0,0,0.5)', visibility: 'hidden' });
      const head = document.createElement('div'); head.textContent = m.label; el.appendChild(head);
      if (m.sub) { const sub = document.createElement('div'); sub.textContent = m.sub; Object.assign(sub.style, { font: '400 10px/1.2 system-ui,sans-serif', color: '#b8cce8' }); el.appendChild(sub); }
      this._layer.appendChild(el);
      this._labels.push({ mark: m, el, w: 0, h: 0 });
    }
    for (const l of this._labels) { l.w = l.el.offsetWidth || 90; l.h = l.el.offsetHeight || 26; }
    this._lastKey = '';
  }

  /** Call each frame; cheap when the camera has not moved. */
  update(now: number): void {
    if (!this._on || now - this._lastT < 50) return;
    const cam = this._camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements, p = cam.projectionMatrix.elements;
    const key = `${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)},${e[0].toFixed(3)},${e[2].toFixed(3)},${e[6].toFixed(3)},${p[0].toFixed(3)},${this._host.clientWidth},${p[5].toFixed(3)}`;
    if (key === this._lastKey) return;
    this._lastKey = key; this._lastT = now;
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const W = this._host.clientWidth, H = this._host.clientHeight;
    const pts: Array<{ id: string; x: number; y: number; prio: number; w: number; h: number }> = [];
    for (const l of this._labels) {
      const m = l.mark;
      this._v.set(m.x, this._ground(m.x, m.z) + m.lift, m.z).project(cam);
      const visible = this._v.z > -1 && this._v.z < 1 && Math.abs(this._v.x) < 1.05 && Math.abs(this._v.y) < 1.05;
      if (visible) pts.push({ id: m.id, x: (this._v.x * 0.5 + 0.5) * W, y: (-this._v.y * 0.5 + 0.5) * H, prio: m.prio, w: l.w + 6, h: l.h + 4 });
    }
    const shown = new Set(declutter(pts));
    const at = new Map(pts.map(q => [q.id, q]));
    for (const l of this._labels) {
      const q = at.get(l.mark.id);
      if (q && shown.has(l.mark.id)) { l.el.style.visibility = 'visible'; l.el.style.transform = `translate(${Math.round(q.x)}px,${Math.round(q.y)}px) translate(-50%,-100%)`; } else l.el.style.visibility = 'hidden';
    }
  }

  private _line(o: BpOutline): THREE.Object3D {
    const pts = o.pts.map(p => new THREE.Vector3(p[0], this._ground(p[0], p[1]) + 0.1, p[1]));
    if (o.closed && pts.length) pts.push(pts[0].clone());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const col = COLOR[o.cat];
    const mat = o.under ? new THREE.LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.15, depthTest: false, transparent: true, opacity: 0.9 }) : new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 });
    const l = new THREE.Line(geo, mat);
    if (o.under) l.computeLineDistances();
    l.renderOrder = 7; l.frustumCulled = false;
    return l;
  }

  private _clear(): void {
    if (this._group) { this._group.traverse(o => { const m = o as THREE.Line; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); this._group.removeFromParent(); this._group = null; }
    for (const l of this._labels) l.el.remove();
    this._labels = [];
  }

  dispose(): void { this._clear(); this._layer.remove(); }
}
