/**
 * Tree-marking tool (store tool 'fell'): a ring follows the tree under the
 * cursor; click marks it for felling (orange paint band) or unmarks it.
 * Esc / right-click stops. The family fells marked trees in work hours.
 */
import * as THREE from 'three';
import type { HomesteadWorld } from './HomesteadWorld';
import { PARCEL_SIZE } from './parcel/parcelTerrain';
import type { ParcelTree } from './parcel/parcelTrees';
import { trunkRadius } from './forestry/woodsGeometry';
import { useGameStore } from '../store/gameStore';
import { isMarked } from '../sim/forestry';

export class MarkTool {
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private readonly _ring: THREE.Mesh;
  private _on = false;
  private _hover: ParcelTree | null = null;
  private _down: { x: number; y: number } | null = null;
  private readonly _off: Array<() => void> = [];
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom: HTMLElement;
  private readonly _world: HomesteadWorld;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLElement, world: HomesteadWorld) {
    this._scene = scene; this._camera = camera; this._dom = dom; this._world = world;
    this._ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    this._ring.renderOrder = 6;
    this._ring.visible = false;
    scene.add(this._ring);
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, f as EventListener);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on(dom, 'pointermove', e => this._move(e.clientX, e.clientY));
    on(dom, 'pointerdown', e => { if (!this._on) return; if (e.button === 0) this._down = { x: e.clientX, y: e.clientY }; if (e.button === 2) this.setOn(false); });
    on(dom, 'pointerup', e => {
      const d = this._down;
      this._down = null;
      if (!this._on || e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this._move(e.clientX, e.clientY);
      this.markHover();
    });
    on(window, 'keydown', e => { if (this._on && e.code === 'Escape') this.setOn(false); });
  }

  setOn(on: boolean): void {
    this._on = on;
    if (!on) { this._ring.visible = false; this._hover = null; }
    const st = useGameStore.getState();
    if (!on && st.tool === 'fell') st.setTool(null);
  }

  private _move(cx: number, cy: number): void {
    if (!this._on) return;
    const r = this._dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this._camera);
    this._setHover(this._world.pickTree(this._ray.ray));
  }

  private _setHover(t: ParcelTree | null): void {
    this._hover = t;
    if (!t) { this._ring.visible = false; useGameStore.getState().setToolProblem(null); return; }
    const own = t.x >= 0 && t.z >= 0 && t.x <= PARCEL_SIZE && t.z <= PARCEL_SIZE;
    const s = trunkRadius(t.scale) * 3.2;
    this._ring.scale.set(s, 1, s);
    this._ring.position.set(t.x, this._world.groundAt(t.x, t.z) + 0.03, t.z);
    (this._ring.material as THREE.MeshBasicMaterial).color.set(own ? 0xffb04a : 0xe36a5a);
    this._ring.visible = true;
    const name = t.kind === 'conifer' ? 'Ponderosa pine' : t.kind === 'oval' ? 'Aspen' : 'Cottonwood';
    const marked = isMarked(useGameStore.getState().game, t.id);
    useGameStore.getState().setToolProblem(own ? `${name}: click to ${marked ? 'unmark' : 'mark for felling'}` : 'Not your land (a neighbour\'s tree)');
  }

  /** Mark / unmark the hovered tree (also QA). */
  markHover(): void {
    const t = this._hover;
    if (!t || t.x < 0 || t.z < 0 || t.x > PARCEL_SIZE || t.z > PARCEL_SIZE) return;
    const y = this._world.access.yard;
    useGameStore.getState().toggleMark({ id: t.id, x: t.x, z: t.z, kind: t.kind as 'conifer' | 'oval' | 'broad', scale: t.scale }, Math.hypot(t.x - y.x, t.z - y.z));
    this._setHover(t);
  }

  /** QA: hover a tree by id. */
  hoverTree(id: number): void {
    this._on = true;
    this._setHover(this._world.treeById(id) ?? null);
  }

  dispose(): void {
    this._off.forEach(f => f());
    this._scene.remove(this._ring);
    this._ring.geometry.dispose();
    (this._ring.material as THREE.Material).dispose();
  }
}
