import * as THREE from 'three';
import type { Quality, WorldScene } from '../engine/world/WorldScene';
import { TerrainRenderer } from '../engine/world/terrain/TerrainRenderer';
import { regionLookFor, regionWaterY } from '../engine/world/terrain/regionalLandscape';
import { ForestRenderer, FOREST_ASPEN } from '../engine/world/trees/ForestRenderer';
import { FarTreeRenderer } from '../engine/world/trees/FarTreeRenderer';
import { planParcelTrees, type ParcelTree } from './parcel/parcelTrees';
import { buildWoods, fallHeading, trunkRadius } from './forestry/woodsGeometry';
import type { Forestry } from '../sim/state';
import { StreamRenderer } from '../engine/world/water/StreamRenderer';
import { RegionalWaterRenderer } from '../engine/world/water/RegionalWaterRenderer';
import { updateWaterGlobals } from '../engine/world/water/waterShading';
import { seasonState } from '../engine/world/season/seasonState';
import { RegionalProps } from '../engine/world/houses/regionalProps';
import { buildFarmstead, type FarmTree } from '../engine/world/houses/regionalFarmsteads';
import { onFarmstead, type Farmstead } from '../engine/world/houses/farmstead';
import { planNeighbours } from './region/neighbours';
import { buildCamp, flickerCampfire } from './props/campGeometry';
import { FamilyRenderer } from './people/FamilyRenderer';
import type { GoalCtx, Site } from './people/peopleGoals';
import { CELL } from './buildkit/kit';
import type { GameState } from '../sim/state';
import type { WearSeason } from '../engine/world/people/crowdWear';
import type { TourBuildingInfo } from '../engine/world/camera/TourController';
import { footprint, KIT, type Placed } from './buildkit/kit';
import { showStage, CUTAWAY_HIDE, XRAY_LAYERS, type BuildLayer as CabinLayer } from './buildkit/shell';
import { buildLayers, type Seat } from './buildkit/buildings';
import { hashStr } from './buildkit/clutter';
import { hitsColliders, type Collider } from './buildkit/interior';
import type { BuildingView } from '../store/worldStore';
import type { Structure } from '../sim/state';
import { BLUEPRINTS } from '../sim/blueprints';
import { SmokePlume } from '../engine/world/fx/SmokePlume';
import type { Pad } from './parcel/parcelTerrain';
import { SeasonController, climateFor, type SeasonMode } from '../engine/world/season/seasonState';
import { writeSeasonUniforms } from '../engine/world/season/seasonShader';
import { PARCEL_SIZE, ParcelTerrain } from './parcel/parcelTerrain';
import { DRIVE_W, ROAD_W, distToLine, planAccess, roadLine, roadX, type Access } from './region/access';
import { buildRibbon } from '../engine/world/roads/RoadRibbon';
import { gravelMaterial } from '../engine/world/roads/roadTextures';
import { buildGate } from './props/gateGeometry';
import { buildStockpile } from './props/stockpileGeometry';
import { DeliveryTruck } from './DeliveryTruck';
import { MATERIAL_IDS, emptyStock } from '../sim/materials';

export { PARCEL_SIZE };
/** Person height in world units (≈ 1.7 m). */
export const PERSON_H = 0.28;
/** Climate / region of the M1 parcel. */
export const CLIMATE_ID = 'mountain_west';
/** Parcel trees are planted this far beyond the parcel; regional far trees beyond. */
const TREE_MARGIN = 26;

interface Built {
  placed: Placed;
  group: THREE.Group;
  /** Wood smoke from the chimney / stovepipe (null: no stove). */
  smoke: SmokePlume | null;
  key: string;
  finished: boolean;
  /** Floor level of the pad the building stands on. */
  padY: number;
  /** Lamplight inside (warm point light, brighter at night). */
  light: THREE.PointLight | null;
}

/** See-through variants of the kit materials (x-ray view), shared. */
const _xray = new Map<THREE.Material, THREE.Material>();
function xrayOf(m: THREE.Material): THREE.Material {
  let x = _xray.get(m);
  if (!x) {
    x = m.clone();
    x.transparent = true;
    x.opacity = 0.16;
    x.depthWrite = false;
    _xray.set(m, x);
  }
  return x;
}

/** Body radius used inside buildings (doorways are ≈ 1 m wide). */
const INDOOR_R = 0.04;

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
  readonly stream: StreamRenderer;
  readonly lakes: RegionalWaterRenderer;
  private _plantSeason = '';
  private _props: RegionalProps | null = null;
  /** Built structures by id (scene groups tagged userData.type = 'building'). */
  private readonly _built = new Map<string, Built>();
  /** Current building view (cutaway / x-ray toggle). */
  private _view: BuildingView = 'full';
  /** Atmosphere for the frame (set by the canvas before tick). */
  readonly air = { hour: 12, wind: 0.2, daylight: 1, viewportH: 800 };
  /** Neighbouring farmsteads (seeded). */
  readonly farms: Farmstead[];
  /** The family's camp (until a home stands; it stays as the work yard). */
  readonly camp: { x: number; z: number; rot: number };
  private readonly _campGroup: THREE.Group;
  readonly family: FamilyRenderer;
  /** County road, driveway, gate and stockpile yard. */
  readonly access: Access;
  private readonly _roads = new THREE.Group();
  readonly truck: DeliveryTruck;
  private _stockpile: THREE.Group | null = null;
  private _stockKey = '';
  private readonly _seenOrders = new Set<string>();
  /** Planted parcel trees (QA: clear eye-level spots). */
  treeSpecs: readonly ParcelTree[] = [];
  /** Every planned parcel tree by id (standing or not), for marks, stumps and goals. */
  private _treeById = new Map<number, ParcelTree>();
  /** Trees no longer standing (felled, bucked or hauled). */
  private _down = new Set<number>();
  private _woods: THREE.Group | null = null;
  private _woodsKey = '';
  private _clock = 0;
  readonly seasons = new SeasonController();
  private readonly _root = new THREE.Group();
  private readonly _ws: WorldScene;
  private _quality: Quality | null = null;

  constructor(ws: WorldScene, seed: number) {
    this._ws = ws;
    ws.setSite({ x0: 0, z0: 0, x1: PARCEL_SIZE, z1: PARCEL_SIZE });
    this.parcel = new ParcelTerrain(seed);
    this.farms = planNeighbours(this.parcel);
    this.camp = this._pickCamp();
    this.access = planAccess(this.camp);
    this.terrain = new TerrainRenderer(ws.scene);
    this.forest = new ForestRenderer(ws.scene);
    this.farTrees = new FarTreeRenderer(ws.scene);
    this.stream = new StreamRenderer(ws.scene);
    this.lakes = new RegionalWaterRenderer(ws.scene);
    this.family = new FamilyRenderer(ws.scene);
    this._campGroup = buildCamp();
    this._campGroup.position.set(this.camp.x, this.parcel.height(this.camp.x, this.camp.z), this.camp.z);
    this._campGroup.rotation.y = this.camp.rot;
    this._root.add(this._campGroup);
    const zc = this.parcel.creek.zAt(this.center.x + 3);
    this._root.add(scaleFigure(this.center.x + 3, zc + 4, this.parcel.height(this.center.x + 3, zc + 4)));
    ws.scene.add(this._root);
    this.truck = new DeliveryTruck(ws.scene, this.access.drive, this.groundAt);
  }

  /** Is (x, z) on the county road or the driveway (plus `pad`)? */
  onAccess(x: number, z: number, pad = 0): boolean {
    if (Math.abs(x - roadX(z)) < ROAD_W / 2 + pad) return true;
    const a = this.access;
    if (x < PARCEL_SIZE + 2 && Math.abs(z - a.gate.z) < 12 + pad && distToLine(a.drive, x, z) < DRIVE_W / 2 + pad) return true;
    return Math.hypot(x - a.yard.x, z - a.yard.z) < 0.8 + pad;
  }

  /** Road + driveway ribbons draped on the rendered terrain, and the gate. */
  private _buildRoads(): void {
    this._roads.traverse(o => { if (o !== this._roads) (o as THREE.Mesh).geometry?.dispose(); });
    this._roads.clear();
    const mat = gravelMaterial();
    const road = new THREE.Mesh(buildRibbon(roadLine(1), ROAD_W, this.groundAt, 0.02, 6), mat);
    const drive = new THREE.Mesh(buildRibbon(this.access.drive, DRIVE_W, this.groundAt, 0.024, 4), mat);
    for (const m of [road, drive]) { m.receiveShadow = true; this._roads.add(m); }
    const gate = buildGate(DRIVE_W);
    const { gate: gp } = this.access;
    gate.position.set(gp.x, this.groundAt(gp.x, gp.z), gp.z);
    this._roads.add(gate);
    if (!this._roads.parent) this._ws.scene.add(this._roads);
  }

  /**
   * Deliveries: a newly delivered order sends the truck in; the stockpile at
   * the yard shows what is in stock less what is still on the truck.
   */
  updateDeliveries(dt: number, game: GameState, speedK: number): void {
    for (const o of game.orders) {
      if (o.status !== 'delivered' || this._seenOrders.has(o.id)) continue;
      this._seenOrders.add(o.id);
      // orders already delivered when the world loads don't replay
      if (this._clock > 0.5) this.truck.enqueue(o.lines);
    }
    this.truck.update(dt, speedK);
    const pending = this.truck.onTruck(), shown = emptyStock();
    for (const m of MATERIAL_IDS) shown[m] = Math.max(0, game.stock[m] - pending[m]);
    const key = MATERIAL_IDS.map(m => Math.min(shown[m], 40)).join(',');
    if (key === this._stockKey) return;
    this._stockKey = key;
    if (this._stockpile) { this._root.remove(this._stockpile); this._stockpile.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    const y = this.access.yard;
    const g = buildStockpile(shown);
    // beside the truck's stopping place (it pulls up along the yard's camp side)
    g.position.set(y.x - 0.4, this.groundAt(y.x, y.z - 1), y.z - 1.35);
    this._stockpile = g;
    this._root.add(g);
    this._ws.invalidateShadows();
  }

  /** (Re)build the terrain mesh at a quality tier. */
  setQuality(q: Quality): void {
    if (q === this._quality) return;
    this._quality = q;
    this.terrain.build({
      source: this._terrainSource,
      kind: 'mountain', cx: this.center.x, cz: this.center.z,
      core: { x: PARCEL_SIZE / 2 + 70, z: PARCEL_SIZE / 2 + 22 }, quality: q, waterY: regionWaterY('mountain'),
    });
    this._plant(q);
    this._water(q);
    this._buildRoads();
    this._ws.invalidateShadows();
  }

  /** Parcel trees (near, detailed) inside the margin; regional far trees beyond it. */
  private _plant(q: Quality): void {
    const margin = TREE_MARGIN;
    const specs = planParcelTrees(this.parcel, { margin, density: q === 'low' ? 0.5 : 1, blocked: (x, z) => this.onBuilding(x, z, 0.6) || this.onCamp(x, z, 0.6) || this.onAccess(x, z, 0.5) });
    for (const t of specs) t.y = this.terrain.surfaceAt(t.x, t.z) - 0.03;
    this._planted = specs;
    // lookups cover every tree a full-density plan has (marks made on High survive a switch to Low)
    const all = q === 'low' ? planParcelTrees(this.parcel, { margin, blocked: (x, z) => this.onBuilding(x, z, 0.6) || this.onCamp(x, z, 0.6) || this.onAccess(x, z, 0.5) }) : specs;
    this._treeById = new Map(all.map(t => [t.id, t]));
    this._plantForest();
    const inside = (x: number, z: number) => x > -margin && x < PARCEL_SIZE + margin && z > -margin && z < PARCEL_SIZE + margin;
    // Neighbouring farmsteads (houses, hay barns, corrals, poplar windbreaks)
    this._props?.dispose();
    const props = new RegionalProps(this._ws.scene, 'mountain');
    const farmTrees: FarmTree[] = [];
    const slope = (x: number, z: number) => this.parcel.region.slope(x, z);
    for (const f of this.farms) buildFarmstead(f, 'mountain', props, this.groundAt, slope, t => farmTrees.push(t));
    props.finish();
    this._props = props;
    this.farTrees.build({
      extra: farmTrees.map(t => ({ x: t.x, y: this.groundAt(t.x, t.z) - 0.05, z: t.z, h: t.h, sp: t.sp })),
      kind: 'mountain', look: regionLookFor('mountain'),
      sample: (x, z) => this.parcel.region.sample(x, z), height: (x, z) => this.parcel.region.height(x, z),
      cx: this.center.x, cz: this.center.z, siteW: PARCEL_SIZE, siteH: PARCEL_SIZE, r0: margin + 2,
      waterY: regionWaterY('mountain'), quality: q,
      blocked: (x, z) => inside(x, z) || onFarmstead(this.farms, x, z, 2.5) || this.onAccess(x, z, 1.2),
    });
  }

  private _planted: ParcelTree[] = [];

  /** (Re)build the near forest from the planted trees, less the ones the family has cut. */
  private _plantForest(): void {
    if (!this._quality) return;
    this.treeSpecs = this._planted.filter(t => !this._down.has(t.id));
    this.forest.build(this.treeSpecs, this._quality, { oval: FOREST_ASPEN, broad: FOREST_ASPEN });
  }

  /** A parcel tree by id (standing or not). */
  treeById(id: number): ParcelTree | undefined {
    return this._treeById.get(id);
  }

  /**
   * The standing tree a ray points at: the trunk (or the lower crown) passing
   * nearest the ray, nearest the eye first. Null if none within reach.
   */
  pickTree(ray: THREE.Ray): ParcelTree | null {
    let best: ParcelTree | null = null, bestD = Infinity;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), onRay = new THREE.Vector3(), onSeg = new THREE.Vector3();
    for (const t of this.treeSpecs) {
      if (t.x < -0.5 || t.z < -0.5 || t.x > PARCEL_SIZE + 0.5 || t.z > PARCEL_SIZE + 0.5) continue;
      const hgt = 3 * t.scale * t.sy;
      a.set(t.x, t.y, t.z); b.set(t.x, t.y + hgt * 0.75, t.z);
      ray.distanceSqToSegment(a, b, onRay, onSeg);
      const d = onRay.distanceTo(onSeg), reach = trunkRadius(t.scale, t.kind) + 0.25 * t.scale * Math.min(1, (onSeg.y - t.y) / (hgt * 0.4));
      if (d > reach) continue;
      const along = onRay.distanceTo(ray.origin);
      if (along < bestD) { bestD = along; best = t; }
    }
    return best;
  }

  /** Show the woods at work: paint marks, felled and bucked trees, stumps; cut trees leave the forest. */
  syncForestry(f: Forestry): void {
    const key = f.jobs.map(j => `${j.treeId}${j.stage[0]}`).join(',') + '|' + f.cleared.length;
    if (key === this._woodsKey) return;
    this._woodsKey = key;
    const down = new Set<number>(f.cleared);
    for (const j of f.jobs) if (j.stage !== 'marked') down.add(j.treeId);
    if (down.size !== this._down.size || [...down].some(id => !this._down.has(id))) {
      this._down = down;
      this._plantForest();
      this._ws.invalidateShadows();
    }
    if (this._woods) { this._root.remove(this._woods); this._woods.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
    this._woods = buildWoods({ jobs: f.jobs, cleared: f.cleared, tree: id => this._treeById.get(id), ground: this.groundAt });
    this._root.add(this._woods);
  }

  /** The creek (sloped stream) and the regional reservoir. */
  private _water(q: Quality): void {
    const c = this.parcel.creek;
    this.stream.build({
      x0: this.center.x - 62, x1: this.center.x + 62, zAt: c.zAt, waterY: c.waterY, band: 3,
      site: {
        ground: this.groundAt,
        blocked: (x, z, r, tree) => tree && this.treeClearance(x, z) < r,
      },
      quality: q, season: seasonState.plants, seed: this.parcel.seed,
    });
    const wy = regionWaterY('mountain');
    if (wy !== null) {
      this.lakes.build({
        kind: 'mountain', height: (x, z) => this.parcel.region.height(x, z), waterY: wy,
        cx: this.center.x, cz: this.center.z, reedInner: PARCEL_SIZE, quality: q, season: seasonState.plants,
      });
    }
  }

  groundAt = (x: number, z: number): number => this.terrain.surfaceAt(x, z);

  /** What the terrain mesh draws: the parcel with its pads; the forest floor under the parcel's own trees is a shade, not a dark blot. */
  private readonly _terrainSource = {
    sample: (x: number, z: number) => {
      const t = this.parcel.sample(x, z);
      const o = Math.max(-x, x - PARCEL_SIZE, -z, z - PARCEL_SIZE, 0);
      t.forest *= o < TREE_MARGIN ? 0.62 : 1;
      return t;
    },
  };

  /** Buildings the cinematic tour may visit (boxes come from the scene's 'building' groups). */
  describeBuildings(): Array<Omit<TourBuildingInfo, 'box'>> {
    return [...this._built.values()].map(({ placed }, i) => ({
      id: placed.id, defId: placed.kind, name: KIT[placed.kind].name, typeName: KIT[placed.kind].name,
      tier: 1, builtDay: i + 1, historic: i === 0, solid: !this._built.get(placed.id)?.finished, highlight: i === 0 ? 'The homestead' : undefined,
    }));
  }

  /**
   * The camp: open, level, dry ground a short walk from the creek (water),
   * nearest the middle of the parcel. Deterministic per seed.
   */
  private _pickCamp(): { x: number; z: number; rot: number } {
    const p = this.parcel;
    let best: { x: number; z: number; rot: number } | null = null, bestScore = Infinity;
    for (let x = 8; x <= PARCEL_SIZE - 8; x += 1) {
      for (let z = 8; z <= PARCEL_SIZE - 8; z += 1) {
        const dc = Math.abs(z - p.creek.zAt(x));
        if (dc < 5 || dc > 14) continue;
        const s = p.natural(x, z);
        if (s.forest > 0.05) continue;
        const slope = Math.hypot(p.height(x + 1, z) - p.height(x - 1, z), p.height(x, z + 1) - p.height(x, z - 1)) / 2;
        if (slope > 0.08) continue;
        const score = Math.hypot(x - PARCEL_SIZE / 2, z - PARCEL_SIZE / 2) + slope * 40;
        if (score < bestScore) {
          bestScore = score;
          // tent door toward the creek
          best = { x, z, rot: Math.atan2(0, p.creek.zAt(x) - z) };
        }
      }
    }
    return best ?? { x: PARCEL_SIZE / 2, z: PARCEL_SIZE / 2, rot: 0 };
  }

  /** Is (x, z) on the camp (plus `pad`)? */
  onCamp(x: number, z: number, pad = 0): boolean {
    return Math.hypot(x - this.camp.x, z - this.camp.z) < 1.1 + pad;
  }

  /** Is (x, z) within `pad` of a built footprint (porch included)? */
  onBuilding(x: number, z: number, pad = 0, withPorch = true): boolean {
    for (const { placed } of this._built.values()) {
      const r = footprint(KIT[placed.kind], placed.x, placed.z, placed.rot, withPorch);
      if (x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
    }
    return false;
  }

  /**
   * Build a placed structure: grade a pad under it (the ground eases back to
   * natural over a short skirt), clear the trees off the site, stand the
   * building on the pad.
   */
  addStructure(p: Placed): void {
    if (this._built.has(p.id)) return;
    const def = KIT[p.kind];
    const r = footprint(def, p.x, p.z, p.rot);
    const y = this.parcel.padHeight(r.x0, r.z0, r.x1, r.z1);
    const pad: Pad = { x0: r.x0 - 0.05, z0: r.z0 - 0.05, x1: r.x1 + 0.05, z1: r.z1 + 0.05, y, skirt: 0.9 };
    this.parcel.setPads([...this.parcel.pads, pad]);
    const group = buildLayers(def, hashStr(p.id + ':' + this.parcel.seed));
    showStage(group, 0, 0);
    group.position.set(p.x, y, p.z);
    group.rotation.y = p.rot * Math.PI / 2;
    // keep the builder's userData (colliders, seats, chimney) and tag it for the tour camera
    Object.assign(group.userData, { type: 'building', buildingId: p.id });
    this._ws.scene.add(group);
    group.updateMatrixWorld(true);
    const top = group.userData.chimneyTop as THREE.Vector3 | null;
    const smoke = top ? new SmokePlume(group.localToWorld(top.clone())) : null;
    if (smoke) this._ws.scene.add(smoke.points);
    let light: THREE.PointLight | null = null;
    if (def.light) {
      light = new THREE.PointLight(0xffc27a, 0, def.cellsX * CELL * 1.4 + 0.6, 2);
      light.position.set(def.light[0], def.floorY + def.light[1], def.light[2]);
      light.visible = false;
      group.add(light);
    }
    this._built.set(p.id, { placed: p, group, smoke, key: '', finished: false, padY: y, light });
    this.terrain.refresh(this._terrainSource, pad.x0 - pad.skirt - 1, pad.z0 - pad.skirt - 1, pad.x1 + pad.skirt + 1, pad.z1 + pad.skirt + 1);
    if (this._quality) this._plant(this._quality);
    this._ws.invalidateShadows();
  }

  /** Sync with the game's structures (adds new ones). */
  syncStructures(list: readonly Placed[]): void {
    for (const p of list) this.addStructure(p);
  }

  /** Show each structure at its construction stage (scaffold → frame → roof → siding). */
  syncProgress(list: readonly Structure[]): void {
    for (const st of list) {
      const b = this._built.get(st.id);
      if (!b) continue;
      const stages = BLUEPRINTS[st.kind].stages;
      const done = st.stage >= stages.length;
      const f = done ? 0 : st.done / stages[st.stage].hours;
      const key = `${st.stage}:${Math.round(f * 200)}:${st.supplied ? 1 : 0}`;
      if (key === b.key) continue;
      b.key = key;
      showStage(b.group, done ? 5 : st.stage, f, st.supplied);
      if (done !== b.finished) { b.finished = done; if (b.light) b.light.visible = done; this._ws.invalidateShadows(); }
      this._applyView(b);
    }
  }

  /** Cutaway (walls cut at waist height, roof and loft off) / x-ray (see-through shell) / full. */
  setBuildingView(v: BuildingView): void {
    if (v === this._view) return;
    this._view = v;
    for (const b of this._built.values()) { b.key = ''; this._applyView(b); }
    this._ws.invalidateShadows();
  }

  private _applyView(b: Built): void {
    const v = this._view;
    for (const o of b.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const layer = m.userData.layer as CabinLayer;
      const ud = m.userData as { baseMat?: THREE.Material };
      ud.baseMat ??= m.material as THREE.Material;
      // x-ray: the shell goes see-through, the furniture stays solid
      m.material = v === 'xray' && XRAY_LAYERS.includes(layer) ? xrayOf(ud.baseMat) : ud.baseMat;
      m.castShadow = !(v === 'xray' && XRAY_LAYERS.includes(layer)) && ud.baseMat.name !== 'kit_glass' && ud.baseMat.name !== 'kit_string';
      if (layer === 'cutwalls') m.visible = v === 'cutaway' && b.finished;
      else if (v === 'cutaway' && CUTAWAY_HIDE.includes(layer) && (b.finished || layer !== 'walls')) m.visible = false;
    }
  }

  /** Lamplight inside finished buildings: a low fill by day, warm lamps at night. */
  private _updateLights(): void {
    const night = 1 - this.air.daylight;
    const lit = this.air.hour > 5.5 && this.air.hour < 23;
    for (const b of this._built.values()) {
      if (!b.finished || !b.light) continue;
      b.light.intensity = (this._view === 'full' ? 0.25 : 0.12) + (lit ? night * 1.6 : night * 0.25);
    }
  }

  /** People: walk the family to their tasks; tend the campfire. */
  updatePeople(dt: number, game: GameState, hour: number, speedK: number): void {
    const site = (id: string): Site | null => {
      const b = this._built.get(id);
      if (!b) return null;
      const def = KIT[b.placed.kind];
      return { x: b.placed.x, z: b.placed.z, rot: b.placed.rot * Math.PI / 2, w: def.cellsX * CELL, d: def.cellsZ * CELL, seats: b.group.userData.seats as Seat[] };
    };
    // home: the finished house that sleeps the most
    const homeB = [...this._built.values()].filter(b => b.finished && KIT[b.placed.kind].sleeps > 0).sort((a, b) => KIT[b.placed.kind].sleeps - KIT[a.placed.kind].sleeps)[0];
    const tree = (jobId: string) => {
      const j = game.forestry.jobs.find(x => x.id === jobId);
      const t = j && this._treeById.get(j.treeId);
      return j && t ? { x: t.x, z: t.z, scale: t.scale, stage: j.stage, fall: fallHeading(t.id), len: 2.6 * t.scale * t.sy } : null;
    };
    const ctx: GoalCtx = { camp: this.camp, site, home: homeB ? site(homeB.placed.id) : null, tree, yard: this.access.yard };
    const season = (seasonState.visual === 'winter' && !seasonState.climate.freeze ? 'fall' : seasonState.visual) as WearSeason;
    this.family.update(dt, game.people, game.personState, hour, game.clock.t, ctx, this.walkHeight, season, speedK);
    // fire lit at mealtimes and evenings, and on cold days, while the camp is home
    const meals = (hour > 5.5 && hour < 8.5) || (hour > 11.8 && hour < 13) || (hour > 17 && hour < 22.5);
    flickerCampfire(this._clock, !homeB && (meals || seasonState.params.cold > 0.4) ? 1 : 0);
  }

  /** A point in a building's local frame (y above its floor) in world coordinates (QA camera poses). */
  localToWorld(id: string, lx: number, ly: number, lz: number): { x: number; y: number; z: number } | null {
    const b = this._built.get(id);
    if (!b) return null;
    const v = new THREE.Vector3(lx, ly + KIT[b.placed.kind].floorY, lz).applyEuler(new THREE.Euler(0, b.placed.rot * Math.PI / 2, 0));
    return { x: b.placed.x + v.x, y: b.padY + v.y, z: b.placed.z + v.z };
  }

  /** A world point in a building's local frame. */
  private _local(b: Built, x: number, z: number): [number, number] {
    const th = b.placed.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
    const dx = x - b.placed.x, dz = z - b.placed.z;
    return [dx * c - dz * s, dx * s + dz * c];
  }

  /** Finished buildings: walls (between doorways), partitions and furniture block; unfinished ones block their footprint. */
  private _buildingBlocked(x: number, z: number, r: number): boolean {
    for (const b of this._built.values()) {
      const def = KIT[b.placed.kind];
      const reach = Math.max(def.cellsX, def.cellsZ) * CELL + 1;
      if (Math.abs(x - b.placed.x) > reach || Math.abs(z - b.placed.z) > reach) continue;
      const cs = b.group.userData.colliders as Collider[] | undefined;
      if (b.finished && cs) {
        const [lx, lz] = this._local(b, x, z);
        if (hitsColliders(cs, lx, lz, Math.min(r, INDOOR_R))) return true;
      } else if (this.onBuilding(x, z, r, false) && footprintHas(b, x, z, r)) return true;
    }
    return false;
  }

  /**
   * Walking height: the floor inside (and on the porch of) a finished
   * building, the ground elsewhere.
   */
  walkHeight = (x: number, z: number): number => {
    for (const b of this._built.values()) {
      if (!b.finished) continue;
      const def = KIT[b.placed.kind];
      const [lx, lz] = this._local(b, x, z);
      const hw = def.cellsX * CELL / 2, hd = def.cellsZ * CELL / 2;
      if (Math.abs(lx) < hw && lz > -hd && lz < hd + def.porch && def.floorY > 0.02) return b.padY + def.floorY;
    }
    return this.groundAt(x, z);
  };

  /** Walk mode: can a body of radius r stand at (x, z)? Creek water and tree trunks block. */
  walkBlocked = (x: number, z: number, r: number): boolean => {
    if (this.stream.depthAt(x, z) > 0.04) return true;
    if (this._buildingBlocked(x, z, r)) return true;
    if (Math.hypot(x - this.camp.x, z - this.camp.z) < 0.4 + r) return true;
    for (const t of this.treeSpecs) {
      const dx = t.x - x, dz = t.z - z;
      const tr = r + 0.07 * t.scale;
      if (dx * dx + dz * dz < tr * tr) return true;
    }
    return false;
  };

  /** Is the point inside a parcel tree's crown (camera keep-out)? */
  crownAt = (x: number, y: number, z: number): boolean => {
    for (const t of this.treeSpecs) {
      const r = (t.kind === 'conifer' ? 0.78 : 0.9) * t.scale * t.sx + 0.12;
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz > r * r) continue;
      const top = t.y + 3 * t.scale * t.sy;
      if (y > t.y + 0.25 * t.scale && y < top + 0.1) return true;
    }
    return false;
  };

  /** Distance from (x, z) to the nearest parcel tree crown edge (≈ 0.8 × scale crown radius). */
  treeClearance(x: number, z: number): number {
    let best = Infinity;
    for (const t of this.treeSpecs) best = Math.min(best, Math.hypot(t.x - x, t.z - z) - 0.8 * t.scale);
    return best;
  }

  /**
   * QA: an open eye-level spot near (x, z) — out of the creek and at least
   * `clear` from any crown — searched in a growing spiral.
   */
  openSpotNear(x: number, z: number, clear = 1.5): [number, number] {
    for (let r = 0; r < 30; r += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += 0.4) {
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.parcel.isCreek(px, pz) || Math.abs(pz - this.parcel.creek.zAt(px)) < 1.5) continue;
        if (this.treeClearance(px, pz) > clear) return [px, pz];
      }
    }
    return [x, z];
  }

  /** Per frame: seasons (eased toward the calendar / pinned season) then terrain uniforms. */
  tick(dt: number, doy: number, totalDays: number, mode: SeasonMode): void {
    const p = this.seasons.update({ locationId: CLIMATE_ID, doy, totalDays, mode, dt });
    writeSeasonUniforms(p, climateFor(CLIMATE_ID));
    this.terrain.update();
    this._clock += dt;
    ForestRenderer.setWindTime(this._clock);
    updateWaterGlobals(this._ws.scene, this._clock);
    // Wood smoke: the stove is lit when it's cold, and for cooking morning and evening
    const a = this.air, h = a.hour;
    const cooking = (h > 5.5 && h < 8.5) || (h > 17 && h < 21) ? 0.55 : 0;
    const heating = Math.min(1, p.cold * 1.2 + p.snow * 0.5 + (seasonState.visual === 'summer' ? 0 : 0.25));
    const fire = Math.max(cooking, heating * (h > 23 || h < 5 ? 0.5 : 1));
    const wx = 0.08 + a.wind * 0.45, wz = 0.03 + a.wind * 0.12;   // prevailing westerlies off the range
    this._updateLights();
    for (const { smoke, finished } of this._built.values()) smoke?.update(this._clock, finished ? fire : 0, wx, wz, a.daylight, a.viewportH);
    if (seasonState.plants !== this._plantSeason) {
      this._plantSeason = seasonState.plants;
      this.stream.setSeason(this._plantSeason);
      this.lakes.setSeason(this._plantSeason);
    }
  }

  dispose(): void {
    this.terrain.dispose();
    for (const { group, smoke } of this._built.values()) {
      this._ws.scene.remove(group);
      if (smoke) { this._ws.scene.remove(smoke.points); smoke.dispose(); }
      group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    }
    this._built.clear();
    this.truck.dispose();
    this._ws.scene.remove(this._roads);
    this._roads.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    this.forest.dispose();
    this.farTrees.dispose();
    this._props?.dispose();
    this.stream.dispose();
    this.family.dispose();
    this.lakes.dispose();
    this._ws.scene.remove(this._root);
    this._root.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}

/** Is (x, z) inside this building's footprint (plus r)? */
function footprintHas(b: Built, x: number, z: number, r: number): boolean {
  const f = footprint(KIT[b.placed.kind], b.placed.x, b.placed.z, b.placed.rot, false);
  return x > f.x0 - r && x < f.x1 + r && z > f.z0 - r && z < f.z1 + r;
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
