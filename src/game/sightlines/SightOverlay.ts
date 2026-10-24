/**
 * Sightline overlay: a translucent heatmap draped over the parcel showing
 * how exposed each spot is (red = in plain view, blue-green = hidden) —
 * from the county road, from the ridge, at night through lit windows — or a
 * viewshed from one eye (a tower, the gate). Computed a few rows per frame
 * so the game never stalls.
 */
import * as THREE from 'three';
import { exposure, Sight, type Observer, type SightWorld } from './visibility';

export type SightMode = 'off' | 'road' | 'ridge' | 'night' | 'viewshed';

const CELL = 1.25;

export interface OverlaySource {
  /** Current sight world (trees, walls, buildings) and the area to map. */
  sightWorld(): SightWorld;
  bounds: { x0: number; z0: number; x1: number; z1: number };
  observers(mode: 'road' | 'ridge'): Observer[];
  /** Lit buildings at night: positions and how bright. */
  lights(): Array<{ x: number; z: number; h: number; k: number }>;
}

export class SightOverlay {
  private readonly _mesh: THREE.Mesh;
  private readonly _colors: Float32Array;
  private readonly _nx: number;
  private readonly _nz: number;
  private _mode: SightMode = 'off';
  private _eye: Observer | null = null;
  private _row = 0;
  private _sight: Sight | null = null;
  private _world: SightWorld | null = null;
  private _obs: Observer[] = [];
  private _lights: Array<{ x: number; z: number; h: number; k: number; vis: number }> = [];
  private readonly _src: OverlaySource;
  /** Done computing the current map (QA). */
  ready = true;

  constructor(scene: THREE.Scene, src: OverlaySource) {
    this._src = src;
    const b = src.bounds;
    this._nx = Math.round((b.x1 - b.x0) / CELL) + 1;
    this._nz = Math.round((b.z1 - b.z0) / CELL) + 1;
    const geo = new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0, this._nx - 1, this._nz - 1).rotateX(-Math.PI / 2).translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
    this._colors = new Float32Array(this._nx * this._nz * 4);
    geo.setAttribute('color', new THREE.BufferAttribute(this._colors, 4));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.renderOrder = 4;
    this._mesh.visible = false;
    this._mesh.frustumCulled = false;
    scene.add(this._mesh);
  }

  get mode(): SightMode { return this._mode; }

  /** Show a mode (or the viewshed from `eye`); recomputes from scratch. */
  set(mode: SightMode, eye: Observer | null = null): void {
    this._mode = mode;
    this._eye = eye;
    this._mesh.visible = mode !== 'off' && !(mode === 'viewshed' && !eye);
    if (this._mesh.visible) this.refresh();
  }

  /** Recompute (the compound changed). */
  refresh(): void {
    if (this._mode === 'off') return;
    this._world = this._src.sightWorld();
    this._sight = new Sight(this._world);
    this._obs = this._mode === 'viewshed' ? (this._eye ? [this._eye] : []) : this._src.observers(this._mode === 'ridge' ? 'ridge' : 'road');
    // drape the grid on the ground
    const pos = this._mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this._world.ground(pos.getX(i), pos.getZ(i)) + 0.05);
    pos.needsUpdate = true;
    this._mesh.geometry.computeBoundingSphere();
    // night: how visible each lit window is from the road
    this._lights = this._mode === 'night' ? this._src.lights().map(l => ({ ...l, vis: exposure(this._sight!, this._world!, l.x, l.z, l.h, this._src.observers('road')) })) : [];
    this._row = 0;
    this.ready = false;
    this._colors.fill(0);
  }

  /** Spend about `budgetMs` computing more rows. */
  /** Night mode: how much hidden lamplight is at the cell being painted. */
  private _hid = 0;

  update(budgetMs = 6): void {
    if (this.ready || !this._sight || !this._world || this._mode === 'off') return;
    const t0 = performance.now(), b = this._src.bounds, w = this._world;
    while (this._row < this._nz && performance.now() - t0 < budgetMs) {
      const j = this._row++;
      // PlaneGeometry rows run from -z to +z after the rotation? (rotateX(-π/2) maps +y → -z): row 0 is the far (min-z) edge
      const z = b.z0 + j * CELL;
      for (let i = 0; i < this._nx; i++) {
        const x = b.x0 + i * CELL;
        let v: number;
        if (this._mode === 'night') {
          // warm where a lit window shows from the road, a faint blue pool where it is hidden
          let seen = 0, hid = 0;
          for (const l of this._lights) { const f = l.k * Math.exp(-Math.hypot(l.x - x, l.z - z) / 2.2); seen += l.vis * f; hid += (1 - l.vis) * f; }
          this._hid = Math.min(1, hid * 1.2);
          v = Math.min(1, seen * 1.4);
        } else v = Math.min(1, exposure(this._sight, w, x, z, 0.25, this._obs) * (this._mode === 'viewshed' ? 1 : 1.6));
        this._paint(i, j, v);
      }
    }
    (this._mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    if (this._row >= this._nz) this.ready = true;
  }

  private _paint(i: number, j: number, v: number): void {
    // vertex order: PlaneGeometry rows go +y → -y, i.e. after rotateX(-π/2) from -z… mapped below
    const row = j, k = (row * this._nx + i) * 4;
    const night = this._mode === 'night', view = this._mode === 'viewshed';
    let r: number, g: number, bl: number, a: number;
    if (night) { const h = this._hid * (1 - v); r = 0.25 + 0.75 * v; g = 0.45 + 0.33 * v; bl = 0.35 + 0.6 * h; a = Math.max(v * 0.75, h * 0.35); }
    else if (view) { r = 0.35 + 0.65 * v; g = 0.85 * v + 0.15; bl = 0.25; a = 0.15 + 0.4 * v; }
    else { r = Math.min(1, v * 1.6); g = 0.35 + 0.35 * (1 - Math.abs(v - 0.45) * 2); bl = Math.max(0, 0.75 - v * 1.2); a = 0.28 + 0.3 * v; }
    this._colors[k] = r; this._colors[k + 1] = g; this._colors[k + 2] = bl; this._colors[k + 3] = a;
  }

  dispose(): void {
    this._mesh.removeFromParent();
    this._mesh.geometry.dispose();
    (this._mesh.material as THREE.Material).dispose();
  }
}
