/**
 * Terrain overlay (docs/DECISIONS.md, "Terrain has mechanics"): the analysis
 * of sim/terrain.ts painted on the ground so the player can see what the
 * land does: high ground (where a tower sees and shoots farther), the lanes
 * a crew would come by and the chokes on them, the water (floodplain, mud,
 * frost pockets, reservoir sites) and the sun. One translucent mesh draped on
 * the terrain with per-vertex colors, plus a few lines and rings; no per-frame
 * cost once built.
 */
import * as THREE from 'three';
import { T, type Lane, type SiteCandidate, type Terrain } from '../../sim/terrain';

export type TerrainMode = 'off' | 'high' | 'lanes' | 'water' | 'sun';

/** What each mode shows, in plain words (the legend). */
export const TERRAIN_LEGEND: Record<Exclude<TerrainMode, 'off'>, { label: string; tip: string; legend: string }> = {
  high: { label: 'High ground', tip: 'Where the land stands above its surroundings', legend: 'Orange: ground above the land round it. A tower here sees farther and shoots farther (an extra 10 m of view at the best). Blue-grey: hollows that hide a watcher.' },
  lanes: { label: 'Lanes', tip: 'The ways a crew would come at you', legend: 'Green: easy going. Amber: a scramble. Red: cliff (ladders needed). Blue: the creek (a ford). The bright line is the way a crew takes: the cheapest; rings mark where it narrows to a choke. The road side counts as easy.' },
  water: { label: 'Water', tip: 'Floodplain, mud, frost pockets and reservoir sites', legend: 'Deep blue: the creek\'s floodplain (floods take what stands here; spring mud slows building). Light blue: wet flats and draws. White: frost pockets where cold air pools. Green ring: a bench that would feed the camp by gravity.' },
  sun: { label: 'Sun', tip: 'Which slopes catch the sun', legend: 'Yellow: south-facing ground (up to +25 % solar and warmer beds). Blue: north-facing ground (down to -25 %, frost lingers).' },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class TerrainOverlay {
  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;
  private _mesh: THREE.Mesh | null = null;
  private _marks: THREE.Group | null = null;
  private _mode: TerrainMode = 'off';
  private _t: Terrain | null = null;
  private _lanes: Lane[] = [];
  private _sites: SiteCandidate[] = [];

  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number) { this._scene = scene; this._ground = ground; }

  get mode(): TerrainMode { return this._mode; }

  /** Show a mode with the analysis it reads. */
  set(mode: TerrainMode, t: Terrain | null, lanes: Lane[] = [], sites: SiteCandidate[] = []): void {
    this._mode = mode; this._t = t; this._lanes = lanes; this._sites = sites;
    this.refresh();
  }

  refresh(): void {
    this._clear();
    const t = this._t;
    if (this._mode === 'off' || !t) return;
    const { nx, nz, x0, z0, step } = t.grid;
    const geo = new THREE.PlaneGeometry((nx - 1) * step, (nz - 1) * step, nx - 1, nz - 1).rotateX(-Math.PI / 2).translate(x0 + (nx - 1) * step / 2, 0, z0 + (nz - 1) * step / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const col = new Float32Array(nx * nz * 4);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = j * nx + i;
      pos.setY(v, this._ground(pos.getX(v), pos.getZ(v)) + 0.05);
      const c = this._paint(t, j * nx + i);
      col.set(c, v * 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this._mesh = new THREE.Mesh(geo, mat);
    this._mesh.renderOrder = 4; this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
    this._marks = new THREE.Group();
    this._scene.add(this._marks);
    if (this._mode === 'lanes') this._laneMarks();
    if (this._mode === 'water') this._siteMarks(['reservoir', 'hydro']);
    if (this._mode === 'high') this._siteMarks(['tower_hill', 'keep_ridge']);
  }

  /** RGBA for a cell. */
  private _paint(t: Terrain, k: number): [number, number, number, number] {
    switch (this._mode) {
      case 'high': {
        const h = Math.min(1, t.high[k] / T.HIGH_FULL);
        if (h > 0.05) return [1, lerp(0.75, 0.3, h), 0.1, 0.12 + 0.5 * h];
        // a hollow: how little it sees
        const blind = 1 - t.sight[k];
        return blind > 0.15 ? [0.35, 0.45, 0.65, Math.min(0.4, 0.1 + blind * 0.4)] : [0, 0, 0, 0];
      }
      case 'lanes': {
        const c = t.cost[k];
        if (t.creek && c >= T.COST_WATER && t.slope[k] < T.EASY) return [0.2, 0.45, 0.95, 0.5];
        if (c < 1.6) return [0.25, 0.8, 0.35, 0.18];
        if (c < T.COST_HARD) return [0.95, 0.75, 0.2, 0.3];
        return [0.9, 0.2, 0.15, 0.5];
      }
      case 'water': {
        if (t.wet[k] === 2) return [0.1, 0.3, 0.85, 0.5];
        if (t.wet[k] === 1) return [0.35, 0.6, 0.95, 0.38];
        if (t.frost[k]) return [0.92, 0.92, 1, 0.5];
        return [0, 0, 0, 0];
      }
      case 'sun': {
        const s = t.sun[k] - 1;
        return s >= 0 ? [1, 0.85, 0.2, Math.min(0.55, s * 3)] : [0.2, 0.4, 0.95, Math.min(0.55, -s * 3)];
      }
      default: return [0, 0, 0, 0];
    }
  }

  private _line(pts: ReadonlyArray<readonly [number, number]>, color: number, lift = 0.12): THREE.Line {
    const g = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0], this._ground(p[0], p[1]) + lift, p[1])));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false }));
    l.renderOrder = 6;
    return l;
  }

  private _ring(x: number, z: number, r: number, color: number): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.8, r, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    m.position.set(x, this._ground(x, z) + 0.15, z);
    m.renderOrder = 6;
    return m;
  }

  private _laneMarks(): void {
    if (!this._marks) return;
    // the cheapest lane bright, the rest dim
    const best = this._lanes.reduce<Lane | null>((a, l) => (!a || l.cost < a.cost ? l : a), null);
    for (const l of this._lanes) {
      this._marks.add(this._line(l.path, l === best ? 0xff3fb0 : 0x6a5a8a, l === best ? 0.2 : 0.14));
      if (l.choke) this._marks.add(this._ring(l.choke.at[0], l.choke.at[1], 1.6, l === best ? 0xff3fb0 : 0xb8a8d8));
    }
  }

  private _siteMarks(kinds: SiteCandidate['kind'][]): void {
    if (!this._marks) return;
    for (const s of this._sites) if (kinds.includes(s.kind)) this._marks.add(this._ring(s.x, s.z, 1.4, s.kind === 'reservoir' || s.kind === 'hydro' ? 0x38d070 : 0xffa020));
  }

  private _clear(): void {
    if (this._mesh) { this._mesh.removeFromParent(); this._mesh.geometry.dispose(); (this._mesh.material as THREE.Material).dispose(); this._mesh = null; }
    if (this._marks) { this._marks.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); }); this._marks.removeFromParent(); this._marks = null; }
  }

  dispose(): void { this._clear(); }
}
