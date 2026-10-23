import * as THREE from 'three';
import type { Quality, WorldScene } from '../engine/world/WorldScene';
import { TerrainRenderer } from '../engine/world/terrain/TerrainRenderer';
import { regionLookFor, regionWaterY } from '../engine/world/terrain/regionalLandscape';
import { ForestRenderer, FOREST_ASPEN } from '../engine/world/trees/ForestRenderer';
import { FarTreeRenderer } from '../engine/world/trees/FarTreeRenderer';
import { planParcelTrees } from './parcel/parcelTrees';
import { SeasonController, climateFor, type SeasonMode } from '../engine/world/season/seasonState';
import { writeSeasonUniforms } from '../engine/world/season/seasonShader';
import { PARCEL_SIZE, ParcelTerrain } from './parcel/parcelTerrain';

export { PARCEL_SIZE };
/** Person height in world units (≈ 1.7 m). */
export const PERSON_H = 0.28;
/** Climate / region of the M1 parcel. */
export const CLIMATE_ID = 'mountain_west';
/** Parcel trees are planted this far beyond the parcel; regional far trees beyond. */
const TREE_MARGIN = 26;

/**
 * Everything in the world that is Compound Builder's: the parcel terrain set
 * into the regional landscape, seasons, and (later) structures.
 */
export class HomesteadWorld {
  readonly center = new THREE.Vector3(PARCEL_SIZE / 2, 0, PARCEL_SIZE / 2);
  readonly parcel: ParcelTerrain;
  readonly terrain: TerrainRenderer;
  readonly forest: ForestRenderer;
  readonly farTrees: FarTreeRenderer;
  private _clock = 0;
  readonly seasons = new SeasonController();
  private readonly _root = new THREE.Group();
  private readonly _ws: WorldScene;
  private _quality: Quality | null = null;

  constructor(ws: WorldScene, seed: number) {
    this._ws = ws;
    ws.setSite({ x0: 0, z0: 0, x1: PARCEL_SIZE, z1: PARCEL_SIZE });
    this.parcel = new ParcelTerrain(seed);
    this.terrain = new TerrainRenderer(ws.scene);
    this.forest = new ForestRenderer(ws.scene);
    this.farTrees = new FarTreeRenderer(ws.scene);
    const zc = this.parcel.creek.zAt(this.center.x + 3);
    this._root.add(scaleFigure(this.center.x + 3, zc + 4, this.parcel.height(this.center.x + 3, zc + 4)));
    ws.scene.add(this._root);
  }

  /** (Re)build the terrain mesh at a quality tier. */
  setQuality(q: Quality): void {
    if (q === this._quality) return;
    this._quality = q;
    this.terrain.build({
      // the forest floor under the parcel's own trees is a shade, not a dark blot (the trees are the canopy)
      source: { sample: (x, z) => { const t = this.parcel.sample(x, z); const o = Math.max(-x, x - PARCEL_SIZE, -z, z - PARCEL_SIZE, 0); t.forest *= o < TREE_MARGIN ? 0.62 : 1; return t; } },
      kind: 'mountain', cx: this.center.x, cz: this.center.z,
      core: { x: PARCEL_SIZE / 2 + 70, z: PARCEL_SIZE / 2 + 22 }, quality: q, waterY: regionWaterY('mountain'),
    });
    this._plant(q);
    this._ws.invalidateShadows();
  }

  /** Parcel trees (near, detailed) inside the margin; regional far trees beyond it. */
  private _plant(q: Quality): void {
    const margin = TREE_MARGIN;
    const specs = planParcelTrees(this.parcel, { margin, density: q === 'low' ? 0.5 : 1 });
    for (const t of specs) t.y = this.terrain.surfaceAt(t.x, t.z) - 0.03;
    this.forest.build(specs, q, { oval: FOREST_ASPEN, broad: FOREST_ASPEN });
    const inside = (x: number, z: number) => x > -margin && x < PARCEL_SIZE + margin && z > -margin && z < PARCEL_SIZE + margin;
    this.farTrees.build({
      kind: 'mountain', look: regionLookFor('mountain'),
      sample: (x, z) => this.parcel.region.sample(x, z), height: (x, z) => this.parcel.region.height(x, z),
      cx: this.center.x, cz: this.center.z, siteW: PARCEL_SIZE, siteH: PARCEL_SIZE, r0: margin + 2,
      waterY: regionWaterY('mountain'), quality: q, blocked: inside,
    });
  }

  groundAt = (x: number, z: number): number => this.terrain.surfaceAt(x, z);

  /** Per frame: seasons (eased toward the calendar / pinned season) then terrain uniforms. */
  tick(dt: number, doy: number, totalDays: number, mode: SeasonMode): void {
    const p = this.seasons.update({ locationId: CLIMATE_ID, doy, totalDays, mode, dt });
    writeSeasonUniforms(p, climateFor(CLIMATE_ID));
    this.terrain.update();
    this._clock += dt;
    ForestRenderer.setWindTime(this._clock);
  }

  dispose(): void {
    this.terrain.dispose();
    this.forest.dispose();
    this.farTrees.dispose();
    this._ws.scene.remove(this._root);
    this._root.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}

/** A plain human-scale reference figure (QA scale check). */
export function scaleFigure(x: number, z: number, y = 0): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b5b8c, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8a888, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, PERSON_H * 0.62, 4, 8), mat);
  body.position.y = PERSON_H * 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), skin);
  head.position.y = PERSON_H - 0.03;
  for (const m of [body, head]) { m.castShadow = true; g.add(m); }
  g.position.set(x, y, z);
  g.userData.type = 'scale_figure';
  return g;
}
