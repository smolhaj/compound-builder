/**
 * ForestRenderer — near trees on the terrain: instanced, three distance LODs
 * per kind (InstancedLodSet: per-instance frustum culling), the shared
 * vegetation material (wind sway, leaf flutter, clump speckle, GPU seasons:
 * per-tree fall colour, leaf drop, spring flush), branch shadows in winter.
 *
 * From UE HeightmapTerrainRenderer's forest (planForestTrees → instanced sets);
 * placement is the caller's (any list of ForestTreeSpec on any ground).
 */
import * as THREE from 'three';
import {
  applyVegetationDepth, buildConiferTree, buildDeciduousTree, buildTallCrownTree, createVegetationMaterial,
  VEG_WIND, type TreeLod, type VegDetail,
} from './treeGeometry';
import { InstancedLodSet } from './instancedLod';
import type { Quality } from '../WorldScene';

export type ForestKind = 'conifer' | 'broad' | 'oval' | 'longleaf';

export interface ForestTreeSpec {
  x: number;
  /** Ground height at the trunk. */
  y: number;
  z: number;
  kind: ForestKind;
  scale: number;
  /** Horizontal / vertical stretch so instances of one geometry differ. */
  sx: number;
  sy: number;
  rotY: number;
  /** Stable random draws: palette slot, hue / lightness / saturation jitter. */
  cr: [number, number, number, number];
}

/** Forest trees closer than this use the detailed close-up shell (LOD 0). */
const NEAR_DIST = 24;
const LOD_DIST = 60;

// Forest foliage palettes (sRGB, [hex, weight]) — woodland crowns are denser
// and more shaded than garden trees. Deciduous crowns take their autumn /
// winter look on the GPU (season uniforms); these are the summer greens.
type Palette = Array<[number, number]>;
export const FOREST_CONIFER: Palette = [[0x3f6a4a, 3], [0x365f43, 2], [0x4a7248, 2], [0x46705f, 1.2], [0x52723e, 1]];
export const FOREST_DECID: Palette = [[0x3a6327, 3], [0x47702c, 3], [0x506f29, 2], [0x31582c, 2]];
/** Aspen / cottonwood: lighter, yellower summer green (they blaze gold in fall). */
export const FOREST_ASPEN: Palette = [[0x5f8a38, 3], [0x6a9040, 2], [0x557f36, 2]];

function pick(p: Palette, u: number): number {
  let total = 0;
  for (const [, w] of p) total += w;
  let t = u * total;
  for (const [hex, w] of p) { if ((t -= w) < 0) return hex; }
  return p[p.length - 1][0];
}

export class ForestRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _sets: InstancedLodSet[] = [];
  private readonly _geos = new Map<string, THREE.BufferGeometry>();
  private _matEver: THREE.MeshStandardMaterial | null = null;
  private _matDecid: THREE.MeshStandardMaterial | null = null;
  private readonly _bark = { value: new THREE.Color(0x5f5042) };
  private readonly _leafFill = { value: 1 };

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  /** Every mesh drawn (raycast / QA). */
  get meshes(): THREE.InstancedMesh[] { return this._sets.flatMap(s => s.meshes); }

  build(specs: readonly ForestTreeSpec[], quality: Quality, palettes: Partial<Record<ForestKind, Palette>> = {}): void {
    this.clear();
    if (specs.length === 0) return;
    const detail: VegDetail = 'low';
    this._matEver = createVegetationMaterial({ detail: quality, leafFill: { value: 1 }, barkColor: this._bark, evergreen: true });
    this._matDecid = createVegetationMaterial({ detail: quality, leafFill: this._leafFill, barkColor: this._bark });
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    const hsl = { h: 0, s: 0, l: 0 };
    for (const kind of ['conifer', 'broad', 'oval', 'longleaf'] as ForestKind[]) {
      const list = specs.filter(t => t.kind === kind);
      if (list.length === 0) continue;
      const levels = ([0, 1, 2] as TreeLod[]).map(lod => {
        const key = `${kind}:${detail}:${lod}`;
        let geo = this._geos.get(key);
        if (!geo) {
          geo = kind === 'conifer' ? buildConiferTree(detail, 17, lod)
            : kind === 'longleaf' ? buildTallCrownTree('longleaf', detail, 31, lod)
            : buildDeciduousTree(kind === 'broad' ? 0 : 1, detail, kind === 'broad' ? 41 : 63, lod);
          this._geos.set(key, geo);
        }
        return { geometry: geo, maxDist: lod === 0 ? NEAR_DIST : lod === 1 ? LOD_DIST : Infinity };
      });
      const mats = list.map(t => {
        dummy.position.set(t.x, t.y, t.z);
        dummy.rotation.set(0, t.rotY, 0);
        dummy.scale.set(t.scale * t.sx, t.scale * t.sy, t.scale * t.sx);
        dummy.updateMatrix();
        return dummy.matrix.clone();
      });
      const evergreen = kind === 'conifer' || kind === 'longleaf';
      const mat = evergreen ? this._matEver : this._matDecid;
      const inst = new InstancedLodSet(this._scene, levels, mat, mats, {
        name: `forest_${kind}`,
        userData: { type: `forest_${kind}` },
        castShadow: quality !== 'low',
        shadowMargin: 10,
        noSSAOFromLevel: 1,
      });
      applyVegetationDepth(inst.meshes, mat); // bare winter crowns cast branch shadows
      const pal = palettes[kind] ?? (evergreen ? FOREST_CONIFER : FOREST_DECID);
      list.forEach((t, i) => {
        const [u, jh, jl, js] = t.cr;
        c.setHex(pick(pal, u));
        c.getHSL(hsl);
        c.setHSL(hsl.h + (jh - 0.5) * 0.03, Math.min(1, hsl.s * (0.85 + js * 0.3)), Math.min(1, Math.max(0.03, hsl.l * (0.8 + jl * 0.32))));
        inst.setColorAt(i, c);
      });
      this._sets.push(inst);
    }
  }

  /** Wind clock (seconds) shared by every vegetation material. */
  static setWindTime(t: number): void { VEG_WIND.value = t; }

  clear(): void {
    for (const s of this._sets) s.dispose();
    this._sets.length = 0;
    this._matEver?.dispose();
    this._matDecid?.dispose();
    this._matEver = this._matDecid = null;
  }

  dispose(): void {
    this.clear();
    for (const g of this._geos.values()) g.dispose();
    this._geos.clear();
  }
}
