import * as THREE from 'three';
import { ownsAt } from '../sim/land';
import { KIT, PROBLEM_TEXT, snapCenter, footprint, type SiteQuery } from './buildkit/kit';
import { DEPTH, isUnderground, previewDatum, siteProblem } from './buildkit/underground';
import { useWorldStore } from '../store/worldStore';
import { buildGhost } from './buildkit/buildings';
import type { HomesteadWorld } from './HomesteadWorld';
import { useGameStore } from '../store/gameStore';
import { onJustPlaced, type Spot } from './buildkit/justPlaced';

/**
 * Build tool: a translucent ghost of the kit piece follows the cursor over
 * the terrain, snapped to the 3 m grid; green where it can go, red (with the
 * reason in the HUD) where it can't. Click to place, R to rotate, Esc /
 * right-click to stop.
 */
export class PlacementTool {
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private _ghost: THREE.Group | null = null;
  private _kind: string | null = null;
  private _rot = 0;
  private _at: [number, number] | null = null;
  private _ok = false;
  /** The spot just staked: the cursor is still over it, so say nothing about it. */
  private _just: Spot | null = null;
  private _down: { x: number; y: number } | null = null;
  private readonly _okMat = new THREE.MeshBasicMaterial({ color: 0x9be38a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly _badMat = new THREE.MeshBasicMaterial({ color: 0xe36a5a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly _off: Array<() => void> = [];
  private readonly _site: SiteQuery;
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom: HTMLElement;
  private readonly _world: HomesteadWorld;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLElement, world: HomesteadWorld) {
    this._scene = scene; this._camera = camera; this._dom = dom; this._world = world;
    const _world = world, _dom = dom;
    this._site = {
      height: (x, z) => _world.parcel.natural(x, z).h,
      owned: (x, z) => ownsAt(useGameStore.getState().game, x, z),
      water: (x, z) => _world.parcel.isCreek(x, z) || _world.stream.depthAt(x, z) > 0,
      blocked: (x, z) => _world.onCamp(x, z) || _world.onAccess(x, z, 0.1),
    };
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, f as EventListener);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on(_dom, 'pointermove', e => this._move(e.clientX, e.clientY));
    // off the map (onto a panel): no ghost, no message about a spot the cursor is not over
    on(_dom, 'pointerleave', () => { if (!this._kind) return; this._at = null; this._ok = false; if (this._ghost) this._ghost.visible = false; useGameStore.getState().setToolProblem(null); });
    on(_dom, 'pointerdown', e => { if (e.button === 0) this._down = { x: e.clientX, y: e.clientY }; if (e.button === 2) this.setKind(null); });
    on(_dom, 'pointerup', e => {
      const d = this._down;
      this._down = null;
      if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this._place();
    });
    on(window, 'keydown', e => {
      if (!this._kind) return;
      if (e.code === 'KeyR') { this._rot = (this._rot + 1) % 4; this._update(); }
      if (e.code === 'Escape') this.setKind(null);
    });
  }

  get active(): boolean { return this._kind !== null; }

  setKind(kind: string | null): void {
    if (kind && !KIT[kind]) kind = null;          // another tool (tree marking) is active
    if (kind === this._kind) return;
    const wasPlacing = this._kind !== null;
    this._kind = kind;
    this._just = null;
    if (this._ghost) { this._scene.remove(this._ghost); this._ghost.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this._ghost = null; }
    if (kind) {
      if (isUnderground(KIT[kind])) useWorldStore.getState().setUnderground(true);
      this._ghost = buildGhost(KIT[kind]);
      this._ghost.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).renderOrder = 5; } });
      this._ghost.visible = false;
      this._scene.add(this._ghost);
    }
    const st = useGameStore.getState();
    if (st.tool !== kind && (kind || (wasPlacing && st.tool && KIT[st.tool]))) st.setTool(kind);
  }

  /** QA: put the ghost at a world point. */
  hoverAt(x: number, z: number, rot = this._rot): void {
    this._rot = rot;
    this._at = [x, z];
    this._update();
  }

  /** QA / click: place at the current hover point if allowed. */
  private _place(): void {
    if (!this._kind || !this._at || !this._ok) return;
    const [x, z] = this._at;
    useGameStore.getState().plan(this._kind, x, z, this._rot);
    this._just = { x, z, rot: this._rot };
    this._update();
  }

  placeHere(): void { this._place(); }

  /** QA: the nearest valid spot for a piece to (x, z) (searched in a growing ring on the build grid), or null. */
  findSpot(kind: string, x: number, z: number, rot = 0, maxR = 30): [number, number] | null {
    const def = KIT[kind];
    const placed = useGameStore.getState().game.structures;
    for (let r = 0; r <= maxR; r += 0.5) {
      const n = Math.max(1, Math.ceil(2 * Math.PI * r / 0.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const [sx, sz] = snapCenter(def, x + Math.cos(a) * r, z + Math.sin(a) * r, rot);
        if (siteProblem(def, sx, sz, rot, this._site, placed) === null) return [sx, sz];
      }
    }
    return null;
  }

  private _move(cx: number, cy: number): void {
    if (!this._kind || !this._world.terrain.mesh) return;
    const r = this._dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this._camera);
    const hit = this._ray.intersectObject(this._world.terrain.mesh, false)[0];
    if (!hit) return;
    this._at = [hit.point.x, hit.point.z];
    this._update();
  }

  private _update(): void {
    const g = this._ghost, kind = this._kind;
    if (!g || !kind || !this._at) return;
    const def = KIT[kind];
    const [x, z] = snapCenter(def, this._at[0], this._at[1], this._rot);
    this._at = [x, z];
    if (onJustPlaced(this._just, x, z, this._rot)) { this._ok = false; g.visible = false; useGameStore.getState().setToolProblem(null); return; }
    this._just = null;
    const placed = useGameStore.getState().game.structures;
    const problem = siteProblem(def, x, z, this._rot, this._site, placed);
    this._ok = problem === null;
    const fp = footprint(def, x, z, this._rot);
    // a bunker room's ghost hangs at its bunker's floor level, under the see-through ground
    const y = isUnderground(def) ? previewDatum(def, x, z, this._rot, this._site.height, placed) ?? this._site.height(x, z) - DEPTH : this._world.parcel.padHeight(fp.x0, fp.z0, fp.x1, fp.z1);
    g.position.set(x, y, z);
    g.rotation.y = this._rot * Math.PI / 2;
    g.visible = true;
    const m = this._ok ? this._okMat : this._badMat;
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m; });
    useGameStore.getState().setToolProblem(problem ? PROBLEM_TEXT[problem] : null);
  }

  dispose(): void {
    this.setKind(null);
    this._off.forEach(f => f());
    this._okMat.dispose();
    this._badMat.dispose();
  }
}
