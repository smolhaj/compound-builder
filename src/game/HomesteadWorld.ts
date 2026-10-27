import * as THREE from 'three';
import { mulberry32 } from '../sim/rng';
import { ShrubField, SAGE, WILLOW, type ShrubSpec } from '../engine/world/trees/ShrubField';
import type { Quality, WorldScene } from '../engine/world/WorldScene';
import { TerrainRenderer } from '../engine/world/terrain/TerrainRenderer';
import { regionLookFor, regionWaterY } from '../engine/world/terrain/regionalLandscape';
import { ForestRenderer } from '../engine/world/trees/ForestRenderer';
import { FarTreeRenderer } from '../engine/world/trees/FarTreeRenderer';
import { planParcelTrees, planUnderstory, type ParcelTree } from './parcel/parcelTrees';
import { buildWoods, fallHeading, trunkRadius } from './forestry/woodsGeometry';
import type { Forestry } from '../sim/state';
import { plant, serviceOf } from '../sim/utilities';
import { StreamRenderer } from '../engine/world/water/StreamRenderer';
import { RegionalWaterRenderer } from '../engine/world/water/RegionalWaterRenderer';
import { updateWaterGlobals } from '../engine/world/water/waterShading';
import { seasonState } from '../engine/world/season/seasonState';
import { RegionalProps } from '../engine/world/houses/regionalProps';
import { buildFarmstead, type FarmTree } from '../engine/world/houses/regionalFarmsteads';
import { onFarmstead, type Farmstead } from '../engine/world/houses/farmstead';
import { planNeighbors } from './region/neighbors';
import { buildCamp, flickerCampfire } from './props/campGeometry';
import { FamilyRenderer } from './people/FamilyRenderer';
import type { GoalCtx, Site } from './people/peopleGoals';
import { CELL, type KitPieceDef } from './buildkit/kit';
import type { GameState } from '../sim/state';
import type { WearSeason } from '../engine/world/people/crowdWear';
import type { TourBuildingInfo } from '../engine/world/camera/TourController';
import { footprint, KIT, placementProblem, rotQ, type Placed, type SiteQuery } from './buildkit/kit';
import { showStage, CUTAWAY_HIDE, XRAY_LAYERS, type BuildLayer as CabinLayer, type BuildOpts } from './buildkit/shell';
import { datums, doorsOf, DEPTH, isEntry, isUnderground, tunnelDoorsOf, tunnelStart, type Side } from './buildkit/underground';
import { floorAt, tunnelPath, tunnelProblem, TUNNEL_PROBLEM_TEXT, VAULT_W, type PathSample } from './buildkit/tunnelPath';
import { buildTunnel } from './perimeter/tunnelGeometry';
import { SHAFT_HALF, stairProfile } from './buildkit/bunkerBuildings';
import { buildExcavator, drapeSoil, spoilHeap } from './props/digSite';
import { kitMaterial } from './buildkit/materials';
import { orchardBearing, orchardFrost, ORCHARD_PICK } from '../sim/greenhouse';
import { buildLayers, type Seat } from './buildkit/buildings';
import { hashStr } from './buildkit/clutter';
import { buildRun, solidSpans } from './perimeter/perimeterGeometry';
import { PERIMETER, runGrowth, runProgress, wallLength, type PerimeterRun } from '../sim/perimeter';
import { closestOnLine, earthworkReach, type Earthwork } from './parcel/parcelTerrain';
import { exposure, Sight, type Observer, type SightWorld } from './sightlines/visibility';
import { hitsColliders, M, type Collider } from './buildkit/interior';
import type { BuildingView } from '../store/worldStore';
import type { Structure } from '../sim/state';
import { calendarOf } from '../sim/state';
import { REGIONS, seasons } from '../sim/regions';
import { BLUEPRINTS } from '../sim/blueprints';
import { SmokePlume } from '../engine/world/fx/SmokePlume';
import type { Pad, Pit } from './parcel/parcelTerrain';
import { pitReach } from './parcel/parcelTerrain';
import { SeasonController, climateFor, type SeasonMode } from '../engine/world/season/seasonState';
import { writeSeasonUniforms } from '../engine/world/season/seasonShader';
import { PARCEL_SIZE, ParcelTerrain } from './parcel/parcelTerrain';
import { CLASSIC, type Site as LandSite } from '../sim/site';
import { DRIVE_W, ROAD_W, distToLine, planAccess, roadLine, roadX, type Access } from './region/access';
import { buildRibbon } from '../engine/world/roads/RoadRibbon';
import { gravelMaterial, roadMaterial } from '../engine/world/roads/roadTextures';
import { RockField, type RockSpec } from '../engine/world/terrain/RockField';
import { buildLineFences, buildPowerline, planLineFences } from './region/lineFences';
import type { RegionWorld } from './region/regionWorld';
import { buildGate } from './props/gateGeometry';
import { buildStockpile } from './props/stockpileGeometry';
import { DeliveryTruck } from './DeliveryTruck';
import { MATERIAL_IDS, emptyStock } from '../sim/materials';
import { pantryRows } from '../sim/pantry';
import { needOf } from '../sim/needs';
import { FoodShelfRenderer, type ShownPlace } from './props/FoodShelfRenderer';
import { planShelves, propsWanted, splitInUse } from './props/foodShelfPlan';
import type { FoodSlot } from './buildkit/shell';

/** The order the stores take their turns: the buried storeroom, the root cellar, the bunker's galley and container, then the house pantries. */
const FOOD_ORDER: Record<string, number> = { bunker_stores: 0, root_cellar: 1, bunker_galley: 2, bunker_container: 3 };

export { PARCEL_SIZE };
/** Person height in world units (≈ 1.7 m). */
export const PERSON_H = 0.28;
/** Climate of the original (Mountain West) parcel; each world has its region's (`HomesteadWorld.climate`). */
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
  /** Services the interior was built with ('pws' bits). */
  services: string;
  /** What the geometry was built with (services, and for bunker rooms their doorways and depth). */
  opts: BuildOpts;
  /** Bunker rooms: floor level (the bunker's datum) and the doorway / depth key they were built for. */
  under: { datum: number; key: string } | null;
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
  readonly sage: ShrubField;
  readonly willow: ShrubField;
  readonly rocks: RockField;
  readonly farTrees: FarTreeRenderer;
  /** The region's look and lie (game/region/regionWorld.ts). */
  readonly regionWorld: RegionWorld;
  /** Season / weather / night-sky climate id of the region. */
  readonly climate: string;
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
  /** Neighboring farmsteads (seeded). */
  readonly farms: Farmstead[];
  /** The family's camp (until a home stands; it stays as the work yard). */
  readonly camp: { x: number; z: number; rot: number };
  private readonly _campGroup: THREE.Group;
  readonly family: FamilyRenderer;
  /** County road, driveway, gate and stockpile yard. */
  readonly access: Access;
  private readonly _roads = new THREE.Group();
  truck: DeliveryTruck;
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

  /** The place the family bought (its rect on the survey grid). */
  readonly home: { x0: number; z0: number; x1: number; z1: number };

  constructor(ws: WorldScene, seed: number, site: LandSite = CLASSIC) {
    this._ws = ws;
    ws.setSite({ x0: 0, z0: 0, x1: PARCEL_SIZE, z1: PARCEL_SIZE });
    this.home = { ...site.home };
    this.parcel = new ParcelTerrain(seed, { creek: site.creek, timber: site.timber, region: site.region });
    this.regionWorld = this.parcel.world;
    this.climate = this.regionWorld.climate;
    this.farms = planNeighbors(this.parcel);
    this.camp = this._pickCamp();
    this.access = planAccess(this.camp, Math.max(4, this.home.z0 + 3), Math.min(PARCEL_SIZE - 4, this.home.z1 - 3));
    this.terrain = new TerrainRenderer(ws.scene);
    this.forest = new ForestRenderer(ws.scene);
    this.sage = new ShrubField(ws.scene, 'sagebrush', this.regionWorld.sagePalette ?? SAGE, 1);
    this.rocks = new RockField(ws.scene);
    this.willow = new ShrubField(ws.scene, 'willow', WILLOW, 1);
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
    this._drive = site.improvements?.drive ?? true;
    this.truck = new DeliveryTruck(ws.scene, this._truckRoute(), this.groundAt);
  }

  /** A gravel drive in to the yard (else a two-track, and the truck stops at the gate). */
  private _drive = true;
  private _roadside: THREE.Group | null = null;
  private _roadsideKey = '';
  private _truckRoute(): Array<[number, number]> {
    if (this._drive) return this.access.drive;
    const inside = this.access.drive.filter(([x]) => x >= PARCEL_SIZE - 2.5);
    return inside.length >= 2 ? inside : this.access.drive.slice(0, 3);
  }

  /** The drive went in (or the place has none yet): redraw it and send the truck the new way. */
  setDrive(on: boolean): void {
    if (on === this._drive) return;
    this._drive = on;
    this._buildRoads();
    this.truck.dispose();
    this.truck = new DeliveryTruck(this._ws.scene, this._truckRoute(), this.groundAt);
  }

  /**
   * Spots for what came with the land (house, barn, well, septic): the house
   * by the camp facing the drive, the rest round it on open, level ground
   * that's the family's own and clear of the creek, the drive and each other.
   */
  siteImprovements(list: ReadonlyArray<{ id: string; kind: string }>, query: SiteQuery): Record<string, { x: number; z: number; rot: number }> {
    const out: Record<string, { x: number; z: number; rot: number }> = {};
    const placed: Placed[] = [...this._built.values()].map(b => b.placed);
    const order = ['farmhouse', 'trailer', 'timber_cabin', 'log_house', 'well_drilled', 'septic', 'barn'];
    const items = [...list].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
    let house: { x: number; z: number } | null = null;
    for (const it of items) {
      const real = KIT[it.kind];
      if (!real) continue;
      // a cell (3 m) of yard all round, so nothing is built hard against anything else
      const def = { ...real, cellsX: real.cellsX + 2, cellsZ: real.cellsZ + 2 };
      // the house beside the camp; the well and septic near the house; the barn a little way off
      const c: { x: number; z: number } = house ?? { x: this.camp.x - 1.5, z: this.camp.z - 2.5 };
      const [r0, r1]: [number, number] = it.kind === 'barn' ? [6, 16] : house ? [2.5, 8] : [0, 8];
      let best: { x: number; z: number; rot: number } | null = null, bestD = Infinity;
      for (let r: number = r0; r <= r1 && !best; r += 0.5) {
        for (let a = 0; a < 24; a++) {
          const th = a / 24 * Math.PI * 2;
          const x: number = c.x + Math.cos(th) * r, z: number = c.z + Math.sin(th) * r;
          for (const rot of [0, 1]) {
            if (placementProblem(def, x, z, rot, query, placed)) continue;
            // septic behind the house, away from the well
            const d = it.kind === 'septic' && house ? -Math.hypot(x - c.x, z - c.z) * 0.1 + (z > c.z ? 2 : 0) : r;
            if (d < bestD) { bestD = d; best = { x, z, rot }; }
          }
        }
      }
      if (!best) continue;
      out[it.id] = best;
      placed.push({ id: it.id, kind: it.kind, x: best.x, z: best.z, rot: best.rot });
      if (!house && ['farmhouse', 'trailer', 'timber_cabin', 'log_house'].includes(it.kind)) house = best;
    }
    return out;
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
    // the county road the region's way (gravel, blacktop, caliche); the drive is gravel (caliche in the desert)
    const mat = (this.regionWorld.drive ?? (this.regionWorld.road === 'caliche' ? 'caliche' : 'gravel')) === 'caliche' ? roadMaterial('caliche') : gravelMaterial();
    const road = new THREE.Mesh(buildRibbon(roadLine(1), ROAD_W, this.groundAt, 0.02, 6), roadMaterial(this.regionWorld.road));
    const track = this._drive ? mat : (() => { const m = mat.clone(); m.color = new THREE.Color(0x8a7a5c); return m; })();
    const drive = new THREE.Mesh(buildRibbon(this.access.drive, this._drive ? DRIVE_W : DRIVE_W * 0.55, this.groundAt, this._drive ? 0.024 : 0.012, 4), track);
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
    // deliveries left at the road (no drive yet), by the gate
    const rs = emptyStock();
    for (const r of game.roadside ?? []) for (const l of r.lines) rs[l.material] += l.qty * (1 - r.done / r.hours);
    const rsKey = MATERIAL_IDS.map(m => Math.min(Math.ceil(rs[m]), 40)).join(',');
    if (rsKey !== this._roadsideKey) {
      this._roadsideKey = rsKey;
      if (this._roadside) { this._root.remove(this._roadside); this._roadside.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this._roadside = null; }
      if (MATERIAL_IDS.some(m => rs[m] > 0)) {
        for (const m of MATERIAL_IDS) rs[m] = Math.ceil(rs[m]);
        const g = buildStockpile(rs), gp = this.access.gate;
        g.position.set(gp.x - 1.2, this.groundAt(gp.x - 1.2, gp.z - 1.4), gp.z - 1.4);
        this._roadside = g;
        this._root.add(g);
      }
    }
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
      kind: this.regionWorld.kind, cx: this.center.x, cz: this.center.z,
      core: { x: PARCEL_SIZE / 2 + 70, z: PARCEL_SIZE / 2 + 22 }, quality: q, waterY: regionWaterY(this.regionWorld.kind),
    });
    this._plant(q);
    this._water(q);
    this._buildRoads();
    this._ws.invalidateShadows();
  }

  /** Parcel trees (near, detailed) inside the margin; regional far trees beyond it. */
  private _plant(q: Quality): void {
    const margin = TREE_MARGIN;
    const inHome = (x: number, z: number) => x > -margin && x < PARCEL_SIZE + margin && z > -margin && z < PARCEL_SIZE + margin;
    const blocked = (x: number, z: number) => this.onBuilding(x, z, 0.6) || this.onCamp(x, z, 0.6) || this.onAccess(x, z, 0.5) || this.onPerimeterLine(x, z, 0.25);
    // the home square, then each bought neighbor parcel (its own id range; the home square's ids never change)
    const plantAll = (density: number, block: (x: number, z: number) => boolean) => [
      ...planParcelTrees(this.parcel, { margin, density, blocked: block }),
      ...planUnderstory(this.parcel, { margin, density, blocked: block }),
      ...this._ownedLand.flatMap((r, k) => {
        const o = { margin, density, rect: r, idBase: 1_000_000 * (k + 1), blocked: (x: number, z: number) => inHome(x, z) || block(x, z) };
        return [...planParcelTrees(this.parcel, o), ...planUnderstory(this.parcel, o)];
      }),
    ];
    const specs = plantAll(q === 'low' ? 0.5 : 1, blocked);
    for (const t of specs) t.y = this.terrain.surfaceAt(t.x, t.z) - 0.03;
    this._planted = specs;
    // lookups cover every tree a full-density plan has (marks made on High survive a switch to Low)
    const all = q === 'low' ? plantAll(1, (x, z) => this.onBuilding(x, z, 0.6) || this.onCamp(x, z, 0.6) || this.onAccess(x, z, 0.5)) : specs;
    this._treeById = new Map(all.map(t => [t.id, t]));
    this._plantForest();
    this._plantShrubs(q, inHome, blocked);
    const inside = (x: number, z: number) => inHome(x, z) || this._inOwned(x, z);
    // Neighboring farmsteads (houses, hay barns, corrals, poplar windbreaks)
    this._props?.dispose();
    const kind = this.regionWorld.kind, wy = regionWaterY(kind);
    const props = new RegionalProps(this._ws.scene, kind);
    const farmTrees: FarmTree[] = [];
    const slope = (x: number, z: number) => this.parcel.region.slope(x, z);
    for (const f of this.farms) buildFarmstead(f, kind, props, this.groundAt, slope, t => farmTrees.push(t));
    // the neighbors' line fences, the region's way (wire on T-posts, split rail, stone walls, woven wire)
    const creek = this.parcel.creek;
    buildLineFences(planLineFences(roadX, ROAD_W / 2, -330, PARCEL_SIZE + 330), this.regionWorld.fence, props, this.groundAt,
      (x, z) => onFarmstead(this.farms, x, z, 1.5) || Math.abs(z - creek.zAt(x)) < 2.2 || (wy !== null && this.parcel.region.height(x, z) < wy + 0.15) || inside(x, z),
      (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); });
    if (this.regionWorld.powerline) buildPowerline(props, this.groundAt, (x, z) => onFarmstead(this.farms, x, z, 4) || (wy !== null && this.parcel.region.height(x, z) < wy + 0.3) || inside(x, z));
    props.finish();
    this._props = props;
    this.farTrees.build({
      extra: farmTrees.map(t => ({ x: t.x, y: this.groundAt(t.x, t.z) - 0.05, z: t.z, h: t.h, sp: t.sp })),
      // (the regions other than the Mountain West carry their own lie and woods out past the place: the far trees stand on it)
      kind, look: regionLookFor(kind),
      sample: (x, z) => this.parcel.relief === 'benches' ? this.parcel.region.sample(x, z) : this.parcel.natural(x, z),
      height: (x, z) => this.parcel.relief === 'benches' ? this.parcel.region.height(x, z) : this.parcel.natural(x, z).h,
      cx: this.center.x, cz: this.center.z, siteW: PARCEL_SIZE, siteH: PARCEL_SIZE, r0: margin + 2,
      waterY: wy, quality: q,
      blocked: (x, z) => inside(x, z) || onFarmstead(this.farms, x, z, 2.5) || this.onAccess(x, z, 1.2),
    });
  }

  private _planted: ParcelTree[] = [];

  /**
   * Sagebrush on the dry, open benches and willow thickets on the creek
   * banks (landscape audit: the two shrubs that make Mountain West ground
   * read as itself). Seeded per cell; clear of buildings, the camp, the
   * drive, fences and the timber.
   */
  private _plantShrubs(q: Quality, inHome: (x: number, z: number) => boolean, blocked: (x: number, z: number) => boolean): void {
    const sage: ShrubSpec[] = [], willow: ShrubSpec[] = [];
    const rects = [{ x0: -TREE_MARGIN, z0: -TREE_MARGIN, x1: PARCEL_SIZE + TREE_MARGIN, z1: PARCEL_SIZE + TREE_MARGIN }, ...this._ownedLand];
    const keep = q === 'low' ? 0.35 : q === 'medium' ? 0.7 : 1;
    const creek = this.parcel.creek, rw = this.regionWorld;
    const rocks: RockSpec[] = [];
    rects.forEach((r, k) => {
      const rnd = mulberry32(this.parcel.seed * 7703 + k * 97 + 5);
      const C = 0.75;
      for (let z = r.z0; z < r.z1; z += C) for (let x = r.x0; x < r.x1; x += C) {
        const px = x + rnd() * C, pz = z + rnd() * C, roll = rnd(), sR = rnd(), rot = rnd() * 6.283, tone = rnd();
        if (k > 0 && inHome(px, pz)) continue;
        if (roll > keep) continue;
        const s = this.parcel.natural(px, pz), dz = Math.abs(pz - creek.zAt(px)), hw = creek.halfWidth;
        if (s.h < creek.waterY(px) + 0.05) continue;
        // willow on the banks: a dense band just above the water
        if (dz > hw + 0.25 && dz < hw + 2.6) {
          if (roll / keep < (0.55 * (1 - (dz - hw) / 2.6) + 0.12) * rw.willow && !blocked(px, pz)) willow.push({ x: px, y: this.groundAt(px, pz) - 0.02, z: pz, s: 0.8 + sR * 0.6, rot, tone });
          continue;
        }
        // rocks: ledges and loose stone, more on the steep and wooded ground (one chance in a few hundred cells)
        if (rw.rocks.count > 0 && (tone * 997) % 1 < rw.rocks.count / 4000 * (1 + 3 * Math.min(1, this.parcel.region.slope(px, pz) * 4 + s.forest * 0.5)) && dz > hw + 1.5 && !blocked(px, pz)) {
          const [r0, r1] = rw.rocks.size;
          rocks.push({ x: px, y: this.groundAt(px, pz), z: pz, s: r0 + (r1 - r0) * sR * sR, flat: (tone * 31.7) % 1 < rw.rocks.flat ? 1 : 0, rot, tone: (tone * 13.3) % 1 });
        }
        // sage on the open benches, thinning into the timber's edge
        if (s.forest > 0.25 || dz < hw + 5) continue;
        if (roll / keep < 0.36 * rw.sage * (1 - s.forest / 0.25) && !blocked(px, pz)) sage.push({ x: px, y: this.groundAt(px, pz) - 0.01, z: pz, s: 0.8 + sR * 0.45, rot, tone });
      }
    });
    this.sage.build(sage, q);
    this.willow.build(willow, q);
    this.rocks.build(rocks, rw.rocks.color, q);
  }
  /** Neighbor parcels the family has bought (their trees are planted near and detailed, markable). */
  private _ownedLand: Array<{ x0: number; z0: number; x1: number; z1: number }> = [];
  private _inOwned(x: number, z: number): boolean { return this._ownedLand.some(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1); }

  /** Land bought: replant so its trees are near ones (markable, fellable), and mark its corners. */
  setOwnedLand(rects: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }>): void {
    const key = JSON.stringify(rects);
    if (key === JSON.stringify(this._ownedLand)) return;
    this._ownedLand = rects.map(r => ({ ...r }));
    if (this._quality) this._plant(this._quality);
    this._buildCornerPins();
  }

  /**
   * What each neighbor parcel is, measured from the land: timber where the
   * trees are thick, creek bottom where the creek runs through, hay ground on
   * the level flats along it, dry grazing on the rest.
   */
  surveyLand(parcels: ReadonlyArray<{ id: string; rect: { x0: number; z0: number; x1: number; z1: number } }>): Record<string, 'timber' | 'creek_bottom' | 'hay' | 'grazing'> {
    const out: Record<string, 'timber' | 'creek_bottom' | 'hay' | 'grazing'> = {};
    for (const p of parcels) {
      const r = p.rect;
      let forest = 0, creek = 0, flat = 0, n = 0;
      for (let x = r.x0 + 3; x < r.x1; x += 6) for (let z = r.z0 + 3; z < r.z1; z += 6) {
        const s = this.parcel.natural(x, z);
        forest += s.forest; n++;
        if (Math.abs(z - this.parcel.creek.zAt(x)) < 8) creek++;
        if (this.parcel.region.slope(x, z) < 0.06) flat++;
      }
      out[p.id] = creek / n > 0.08 ? 'creek_bottom' : forest / n > 0.3 ? 'timber' : flat / n > 0.6 ? 'hay' : 'grazing';
    }
    return out;
  }

  /** Wildfire: trees standing within ≈ 24 m of each building (defensible space is the ground you've cleared). */
  fuelNear(list: ReadonlyArray<{ id: string; x: number; z: number }>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const st of list) {
      let n = 0;
      for (const t of this.treeSpecs) if (Math.abs(t.x - st.x) < 4 && Math.abs(t.z - st.z) < 4 && Math.hypot(t.x - st.x, t.z - st.z) < 4) n++;
      out[st.id] = n;
    }
    return out;
  }

  private _pins: THREE.Group | null = null;
  /** Survey pins at the corners of the land you own: an iron pin in a cap, a lath with orange flagging. */
  private _buildCornerPins(): void {
    if (this._pins) { this._ws.scene.remove(this._pins); this._pins.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
    const g = new THREE.Group();
    const corners = new Set<string>();
    for (const r of [this.home, ...this._ownedLand]) for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) corners.add(`${x},${z}`);
    const lath = new THREE.MeshStandardMaterial({ color: 0xd8c39a, roughness: 0.9 }), flag = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7, side: THREE.DoubleSide });
    for (const c of corners) {
      const [x, z] = c.split(',').map(Number);
      if (x === PARCEL_SIZE) continue;                         // the road side
      const y = this.groundAt(x, z);
      const stake = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.2, 0.004), lath); stake.position.set(x, y + 0.1, z); g.add(stake);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.012), flag); f.position.set(x + 0.02, y + 0.19, z); g.add(f);
    }
    this._ws.scene.add(g);
    this._pins = g;
  }

  /** (Re)build the near forest from the planted trees, less the ones the family has cut. */
  private _plantForest(): void {
    if (!this._quality) return;
    this.treeSpecs = this._planted.filter(t => !this._down.has(t.id));
    this.forest.build(this.treeSpecs, this._quality, this.regionWorld.trees.palettes);
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

  // ── Perimeter ─────────────────────────────────────────────────────────
  private _runs: readonly PerimeterRun[] = [];
  private readonly _runGroups = new Map<string, { key: string; group: THREE.Group }>();
  private _runIds = '';
  private _tunnelKey = '';
  private _worksKey = '';

  /** Is (x, z) within `pad` of a planned perimeter line (trees are cleared off fence lines)? */
  onPerimeterLine(x: number, z: number, pad = 0): boolean {
    for (const r of this._runs) {
      // a tunnel goes under the trees; only its exit hatch needs a clear spot
      if (r.kind === 'escape_tunnel') { const e = r.pts[r.pts.length - 1]; if (Math.hypot(e[0] - x, e[1] - z) < 0.18 + pad) return true; continue; }
      if (closestOnLine(r.pts, x, z).d < pad) return true;
    }
    return false;
  }

  /** The bunker room a tunnel starts from, and so its floor level. */
  private _tunnelDatum(r: PerimeterRun): number {
    const [x, z] = r.pts[0];
    for (const b of this._built.values()) {
      if (!b.under) continue;
      const f = footprint(KIT[b.placed.kind], b.placed.x, b.placed.z, b.placed.rot, false);
      if (x > f.x0 - 0.03 && x < f.x1 + 0.03 && z > f.z0 - 0.03 && z < f.z1 + 0.03) return b.under.datum;
    }
    return this._naturalH(x, z) - DEPTH;
  }

  /** Escape tunnel tool: where a tunnel clicked at (x, z) would leave its room (a free wall), or why it can't. */
  tunnelStartAt(x: number, z: number): { pt: [number, number] } | { problem: string } {
    const placed = [...this._built.values()].map(b => b.placed);
    const starts = this._runs.filter(r => r.kind === 'escape_tunnel').map(r => r.pts[0]);
    const inRoom = placed.some(p => isUnderground(KIT[p.kind]) && (() => { const f = footprint(KIT[p.kind], p.x, p.z, p.rot, false); return x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1; })());
    const s = tunnelStart(x, z, placed, starts);
    if (!s) return { problem: TUNNEL_PROBLEM_TEXT[inRoom ? 'no_wall' : 'no_room'] };
    return { pt: s.pt };
  }

  /** Floor level of a tunnel starting at pts[0] (its bunker's; QA poses). */
  tunnelFloorAt(pts: ReadonlyArray<[number, number]>, s = 0): number {
    const datum = this._tunnelDatum({ pts } as unknown as PerimeterRun);
    return s <= 0 ? datum : floorAt(tunnelPath(pts, datum, this._naturalH).samples, s);
  }

  /** Water a tunnel can't pass under: the creek channel (its line, with a margin, on and off the parcel) and the stream. */
  private readonly _underWater = (x: number, z: number): boolean =>
    Math.abs(z - this.parcel.creek.zAt(x)) < this.parcel.creek.halfWidth + 0.45 || this.parcel.isCreek(x, z) || this.stream.depthAt(x, z) > 0;

  /** Escape tunnel tool: why this route won't do (null = it will). */
  tunnelRouteProblem(pts: ReadonlyArray<[number, number]>): string | null {
    if (pts.length < 2) return null;
    const placed = [...this._built.values()].map(b => b.placed);
    const p = tunnelProblem(pts, this._tunnelDatum({ pts: pts as [number, number][] } as PerimeterRun), this._naturalH, this._underWater, placed);
    return p ? TUNNEL_PROBLEM_TEXT[p] : null;
  }

  /**
   * A long tunnel has dozens of bulbs; a few real lights follow the eye
   * through it, sitting in the nearest bulbs (dim, warm), so it reads as
   * pools of light with dark between at the cost of four lights.
   */
  private readonly _tLights: THREE.PointLight[] = [];
  private _poolTunnelLights(): void {
    if (!this._tLights.length) for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffdcb0, 0, 1.5, 1.7); l.castShadow = false; this._tLights.push(l); this._ws.scene.add(l); }
    const cam = this._ws.camera.position;
    const below = cam.y < this.groundAt(cam.x, cam.z) - 0.12;
    const near: THREE.Vector3[] = [];
    if (below) for (const [id, g] of this._runGroups) {
      if (this._runs.find(r => r.id === id)?.kind !== 'escape_tunnel') continue;
      for (const p of (g.group.userData.lamps ?? []) as THREE.Vector3[]) if (Math.abs(p.x - cam.x) < 6 && Math.abs(p.z - cam.z) < 6) near.push(p);
    }
    near.sort((a, b) => a.distanceToSquared(cam) - b.distanceToSquared(cam));
    this._tLights.forEach((l, i) => { const p = near[i]; l.intensity = p ? 0.32 : 0; if (p) l.position.copy(p); });
  }

  /** A tunnel's graded floor along its route (cached; depends on its bunker's floor and the land). */
  private readonly _paths = new Map<string, { key: string; samples: PathSample[] }>();
  /** Tree cover at a tunnel's exit (how it is hidden). */
  private _exitWoods(r: PerimeterRun): number { const e = r.pts[r.pts.length - 1]; return this.tunnelExitWoods(e[0], e[1]); }

  /** How wooded a tunnel exit's spot is (0–1), from the trees actually standing round it. */
  tunnelExitWoods(x: number, z: number): number {
    let n = 0;
    for (const t of this.treeSpecs) if (Math.abs(t.x - x) < 1.6 && Math.abs(t.z - z) < 1.6 && Math.hypot(t.x - x, t.z - z) < 1.6) n++;   // within ≈ 10 m
    return Math.min(1, n / 5);
  }

  private _pathOf(r: PerimeterRun): PathSample[] {
    const datum = this._tunnelDatum(r), key = `${datum.toFixed(3)}|${r.pts.join(';')}`;
    const c = this._paths.get(r.id);
    if (c?.key === key) return c.samples;
    const samples = tunnelPath(r.pts, datum, this._naturalH).samples;
    this._paths.set(r.id, { key, samples });
    return samples;
  }

  /** Underground view: the vault's top comes off so the tunnel shows cut open. */
  private _applyTunnelView(g: THREE.Group): void {
    for (const o of g.children) if (o.userData.part === 'upper') o.visible = !this._under;
  }

  /** Fences, hedges and walls drawn as built (hedges by growth); berms and ditches shape the terrain. */
  syncPerimeter(runs: readonly PerimeterRun[], t: number): void {
    this._runs = runs;
    const ids = runs.map(r => r.id).join(',');
    for (const r of runs) {
      const key = `${Math.round(runProgress(r) * 60)}:${Math.round(runGrowth(r, t) * 40)}:${r.finishedAt === null ? 0 : 1}:${r.gates.length}`;
      const cur = this._runGroups.get(r.id);
      if (cur?.key === key) continue;
      if (cur) { this._root.remove(cur.group); cur.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
      const tunnel = r.kind === 'escape_tunnel';
      const group = tunnel
        ? buildTunnel(this._pathOf(r), this.groundAt, r.finishedAt !== null ? 1 : runProgress(r), this._exitWoods(r))
        : buildRun(r, this.groundAt, t, (x, z) => this.onBuilding(x, z, 0.02, false));
      if (tunnel) this._applyTunnelView(group);
      this._root.add(group);
      this._runGroups.set(r.id, { key, group });
      this._ws.invalidateShadows();
    }
    // earthworks (berms raise, ditches cut) as they are dug
    const works: Earthwork[] = runs.filter(r => r.kind === 'earth_berm' || r.kind === 'ditch').map(r => ({ pts: r.pts, gates: r.gates, height: PERIMETER[r.kind].height, k: r.finishedAt !== null ? 1 : runProgress(r) }));
    // a tunnel is cut and covered: an open trench along it while the culvert goes in
    for (const r of runs) if (r.kind === 'escape_tunnel' && r.finishedAt === null && (r.supplied || r.done > 0)) works.push({ pts: r.pts.slice(), gates: [], height: -0.33, k: 1 });
    const wk = works.map(w => `${w.pts.length}:${Math.round(w.k * 20)}`).join('|');
    if (wk !== this._worksKey) {
      this._worksKey = wk;
      this.parcel.setEarthworks(works);
      for (const w of works) {
        const pad = earthworkReach(w) + 0.5;
        const xs = w.pts.map(p => p[0]), zs = w.pts.map(p => p[1]);
        this.terrain.refresh(this._terrainSource, Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad);
      }
      for (const g of this._runGroups.values()) g.key = '';
      this._ws.invalidateShadows();
    }
    // tunnels open doorways (with blast doors) in the rooms they start from
    const tk = runs.filter(r => r.kind === 'escape_tunnel').map(r => `${r.pts[0][0]},${r.pts[0][1]}`).join('|');
    if (tk !== this._tunnelKey) { this._tunnelKey = tk; this._syncUnderground(); }
    // a new line clears the trees off it
    if (ids !== this._runIds) {
      const before = this._runIds;
      this._runIds = ids;
      for (const [id, g] of this._runGroups) if (!runs.some(r => r.id === id)) { this._root.remove(g.group); this._runGroups.delete(id); }
      if (before !== '' || ids !== '') { if (this._quality) this._plant(this._quality); }
    }
  }

  /** Walk / people collision with built perimeter runs (gates and unbuilt stretches are open). */
  private _perimeterBlocked(x: number, z: number, r: number): boolean {
    for (const run of this._runs) {
      if (run.kind === 'escape_tunnel') continue;
      const th = run.kind === 'container_wall' ? 0.21 : run.kind === 'thorn_hedge' ? 0.15 * runGrowth(run, this._simT) : run.kind === 'log_palisade' ? 0.03 : run.kind === 'earth_berm' || run.kind === 'ditch' ? 0 : 0.01;
      if (th < 0.01) continue;
      const { d, s } = closestOnLine(run.pts, x, z);
      if (d > th + r) continue;
      const built = run.finishedAt !== null ? wallLength(run) : wallLength(run) * runProgress(run);
      if (solidSpans(run, built).some(([a, b]) => s >= a - 0.01 && s <= b + 0.01)) return true;
    }
    return false;
  }
  private _simT = 0;
  /** Sim time for growth-dependent checks (set by the canvas). */
  set simTime(t: number) { this._simT = t; }

  // ── Sightlines ────────────────────────────────────────────────────────
  /** What blocks sight now: terrain, standing trees, the regional forest, grown hedges / walls, buildings. */
  sightWorld(): SightWorld {
    // bunker rooms are under the ground (an entrance's hatch or headhouse is too small to count)
    const boxes = [...this._built.values()].filter(b => !b.under).map(b => {
      const box = new THREE.Box3().setFromObject(b.group);
      return { x0: box.min.x, z0: box.min.z, x1: box.max.x, z1: box.max.z, top: box.max.y };
    });
    const walls = this._runs.filter(r => r.kind !== 'earth_berm' && r.kind !== 'ditch' && PERIMETER[r.kind].sight > 0).map(r => {
      const g = runGrowth(r, this._simT);
      return { pts: r.pts, top: PERIMETER[r.kind].height * (r.kind === 'thorn_hedge' ? g : 1), cut: PERIMETER[r.kind].sight * (r.kind === 'thorn_hedge' ? g : r.finishedAt !== null ? 1 : runProgress(r)), gates: r.gates };
    });
    const inside = (x: number, z: number) => (x > -TREE_MARGIN && z > -TREE_MARGIN && x < PARCEL_SIZE + TREE_MARGIN && z < PARCEL_SIZE + TREE_MARGIN) || this._inOwned(x, z);
    return { ground: this.groundAt, trees: this.treeSpecs, forestAt: (x, z) => this.parcel.region.sample(x, z).forest, inside, walls, boxes };
  }

  /** Who looks: people driving / walking the county road, or someone up on the ridge to the west. */
  observers(kind: 'road' | 'ridge'): Observer[] {
    if (kind === 'road') {
      const out: Observer[] = [];
      for (let z = -12; z <= PARCEL_SIZE + 12; z += 5) out.push({ x: roadX(z), z, eye: 0.3 });
      return out;
    }
    // the highest ground in a band 40–90 units west of the parcel
    const cand: Array<Observer & { h: number }> = [];
    // open high points only (a spotter picks bare rock or a clearing, not the middle of the timber)
    for (let x = -90; x <= -30; x += 4) for (let z = -30; z <= PARCEL_SIZE + 30; z += 6) if (this.parcel.region.sample(x, z).forest < 0.3) cand.push({ x, z, eye: 0.3, h: this.groundAt(x, z) });
    cand.sort((a, b) => b.h - a.h);
    const picked: Observer[] = [];
    for (const c of cand) { if (picked.every(p => Math.hypot(p.x - c.x, p.z - c.z) > 18)) picked.push({ x: c.x, z: c.z, eye: 0.3 }); if (picked.length >= 6) break; }
    return picked;
  }

  /** Lit windows at night (finished buildings with a lamp, and the campfire until a home stands). */
  nightLights(): Array<{ x: number; z: number; h: number; k: number }> {
    const out = [...this._built.values()].filter(b => b.finished && KIT[b.placed.kind].light && !b.under).map(b => ({ x: b.placed.x, z: b.placed.z, h: KIT[b.placed.kind].floorY + 0.25, k: KIT[b.placed.kind].sleeps > 0 ? 1 : 0.6 }));
    if (!out.some(l => l.k === 1)) out.push({ x: this.camp.x, z: this.camp.z, h: 0.15, k: 0.8 });
    return out;
  }

  /** Share of the county road that can see each building (its windows, ≈ 1.5 m up). */
  buildingExposure(): Record<string, number> {
    const s = new Sight(this.sightWorld()), obs = this.observers('road'), out: Record<string, number> = {};
    for (const b of this._built.values()) if (!b.under) out[b.placed.id] = exposure(s, { ground: this.groundAt }, b.placed.x, b.placed.z, KIT[b.placed.kind].floorY + 0.25, obs);
    return out;
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
    // a dry desert place: the channel off the place is a dry wash too (no running water drawn)
    if (this.parcel.relief === 'bajada' && !this.parcel.creekHome) this.stream.clear();
    else this.stream.build({
      x0: this.center.x - 62, x1: this.center.x + 62, zAt: c.zAt, waterY: c.waterY, band: 3,
      site: {
        ground: this.groundAt,
        blocked: (x, z, r, tree) => tree && this.treeClearance(x, z) < r,
      },
      quality: q, season: seasonState.plants, seed: this.parcel.seed,
    });
    const kind = this.regionWorld.kind, wy = regionWaterY(kind);
    if (wy !== null) {
      this.lakes.build({
        kind, height: (x, z) => this.parcel.region.height(x, z), waterY: wy,
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
    const p = this.parcel, h = this.home;
    // inside the home forty part of the place (the 80's west forty is the back forty)
    const x0 = Math.max(h.x0, 0) + 6, x1 = h.x1 - 6, z0 = h.z0 + 6, z1 = h.z1 - 6;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let best: { x: number; z: number; rot: number } | null = null, bestScore = Infinity;
    for (let pass = 0; pass < 2 && !best; pass++) {
      for (let x = x0; x <= x1; x += 1) {
        for (let z = z0; z <= z1; z += 1) {
          const dc = Math.abs(z - p.creek.zAt(x));
          // by the creek when it runs through (water), else anywhere open; the second pass takes whatever is level
          if (p.creekHome && pass === 0 && (dc < 5 || dc > 14)) continue;
          if (dc < 5) continue;
          const s = p.natural(x, z);
          if (s.forest > (pass === 0 ? 0.05 : 0.3)) continue;
          const slope = Math.hypot(p.height(x + 1, z) - p.height(x - 1, z), p.height(x, z + 1) - p.height(x, z - 1)) / 2;
          if (slope > (pass === 0 ? 0.08 : 0.16)) continue;
          const score = Math.hypot(x - cx, z - cz) + slope * 40;
          if (score < bestScore) {
            bestScore = score;
            // tent door toward the creek (or the road)
            best = { x, z, rot: p.creekHome ? Math.atan2(0, p.creek.zAt(x) - z) : Math.PI / 2 };
          }
        }
      }
    }
    return best ?? { x: cx, z: cz, rot: 0 };
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
    const below = isUnderground(def);
    let y = this.parcel.padHeight(r.x0, r.z0, r.x1, r.z1);
    // bunker rooms take no pad (the yard above stays as it is); an entrance's hatch or headhouse gets a small one
    const pad: Pad | null = !below || isEntry(def) ? { x0: r.x0 - 0.05, z0: r.z0 - 0.05, x1: r.x1 + 0.05, z1: r.z1 + 0.05, y, skirt: below ? 0.4 : 0.9 } : null;
    if (below && p.kind === 'bunker_stairs') {
      // the stairwell's headhouse is at its top (+z) end: grade only there
      const [hx, hz] = rotQ(0, def.cellsZ * CELL / 2 - 0.25, p.rot);
      const t = footprint({ ...def, cellsZ: 1 }, p.x + hx, p.z + hz, p.rot);
      Object.assign(pad!, { x0: t.x0 - 0.05, z0: t.z0 - 0.05, x1: t.x1 + 0.05, z1: t.z1 + 0.05, y: y = this.parcel.padHeight(t.x0, t.z0, t.x1, t.z1) });
    }
    if (pad) this.parcel.setPads([...this.parcel.pads, pad]);
    const opts: BuildOpts = {};
    let under: Built['under'] = null;
    if (below) {
      const placed = [...[...this._built.values()].map(b => b.placed), p];
      const datum = datums(placed, this._naturalH).get(p.id) ?? this._naturalH(p.x, p.z) - DEPTH;
      under = { datum, key: '' };
      Object.assign(opts, this._underOpts(p, placed, datum));
      under.key = JSON.stringify(opts);
      y = datum;
    }
    const group = buildLayers(def, hashStr(p.id + ':' + this.parcel.seed), opts);
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
      // reach about the room (point lights cast no shadows here, so a long reach would light the yard through the walls)
      light = new THREE.PointLight(0xffc27a, 0, Math.hypot(def.cellsX, def.cellsZ) * CELL * 0.6 + 0.1, 2);
      light.position.set(def.light[0], def.floorY + def.light[1], def.light[2]);
      light.visible = false;
      group.add(light);
    }
    // a plan nobody has started is laid out in lime on the ground, so it reads from the air (the stakes alone don't)
    if (!below) group.add(planMark(def));
    this._built.set(p.id, { placed: p, group, smoke, key: '', finished: false, padY: y, light, services: '000', opts, under });
    if (pad) this.terrain.refresh(this._terrainSource, pad.x0 - pad.skirt - 1, pad.z0 - pad.skirt - 1, pad.x1 + pad.skirt + 1, pad.z1 + pad.skirt + 1);
    if (below) this._syncUnderground();
    if (this._quality) this._plant(this._quality);
    this._applyView(this._built.get(p.id)!);
    this._ws.invalidateShadows();
  }

  private readonly _naturalH = (x: number, z: number) => this.parcel.natural(x, z).h;

  /** A bunker room's doorways (its neighbors) and the ground above its surface point. */
  /** Hardening fitted per bunker room (from the sim), and its key. */
  private readonly _harden = new Map<string, { key: string; tiers: NonNullable<Structure['hardening']> }>();

  private _underOpts(p: Placed, placed: readonly Placed[], datum: number): BuildOpts {
    const def = KIT[p.kind];
    // the surface point: the stairwell's top end, otherwise the middle
    const [sx, sz] = p.kind === 'bunker_stairs' ? rotQ(0, def.cellsZ * CELL / 2 - 0.25, p.rot) : [0, 0];
    const ground = this.parcel.sample(p.x + sx, p.z + sz).h;
    // escape tunnels leave through a blast door, barred from the room side
    const starts = this._runs.filter(r => r.kind === 'escape_tunnel').map(r => r.pts[0]);
    const tunnelDoors = tunnelDoorsOf(p, starts);
    const blast = Object.keys(tunnelDoors) as Side[];
    const harden = this._harden.get(p.id)?.tiers;
    return { doors: { ...doorsOf(p, placed), ...tunnelDoors }, depth: Math.round((ground - datum) * 1000) / 1000, ...(blast.length ? { blast } : {}), ...(harden && Object.keys(harden).length ? { harden } : {}) };
  }

  /** New neighbors open new doorways: rebuild the bunker rooms whose doorways changed. */
  private _syncUnderground(): void {
    const placed = [...this._built.values()].map(b => b.placed);
    for (const b of this._built.values()) {
      if (!b.under) continue;
      const u = this._underOpts(b.placed, placed, b.under.datum);
      const key = JSON.stringify(u);
      if (key === b.under.key) continue;
      b.under.key = key;
      this._rebuild(b, { ...b.opts, ...u });
    }
  }

  // ── Food on the shelves ───────────────────────────────────────────────
  readonly food = new FoodShelfRenderer();
  private _foodKey = '';
  /**
   * Draw the pantry on the shelves and pallets of every finished storeroom,
   * cellar and pantry, filled by quantity (props/foodShelfPlan). Cheap when
   * nothing changed; the shelves of a ghosted building (underground view)
   * stay reserved but aren't drawn.
   */
  syncFood(game: GameState): void {
    // nothing that matters changed since the last frame: skip (the game object is only replaced when the sim steps or the player acts)
    const finished = this._finishedCount();
    if (game.pantry === this._foodPantry && game.stock === this._foodStock && this._foodCheap === `${this._under}|${this._built.size}|${finished}`) return;
    this._foodPantry = game.pantry; this._foodStock = game.stock; this._foodCheap = `${this._under}|${this._built.size}|${finished}`;
    const all = [...this._built.values()].filter(b => b.finished && (b.group.userData.foodSlots as FoodSlot[] | undefined)?.length)
      .sort((a, b) => (FOOD_ORDER[a.placed.kind] ?? 9) - (FOOD_ORDER[b.placed.kind] ?? 9) || a.placed.id.localeCompare(b.placed.id));
    // the house pantries hold what's in use (two to three weeks); the storeroom, cellar and bunker the rest (props/foodShelfPlan splitInUse)
    const isStore = (b: Built) => b.placed.kind in FOOD_ORDER;
    const stores = all.filter(isStore), homes = all.filter(b => !isStore(b));
    const need = game.people.reduce((a, p, i) => a + (game.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
    const split = splitInUse(pantryRows(game, 1).map(r => ({ id: r.id, units: r.units })), need, stores.length > 0 && homes.length > 0);
    const wHome = propsWanted(homes.length ? split.house : []), wStore = propsWanted(homes.length ? split.store : split.house);
    const key = `${wHome.map(w => w.id + w.n).join()}|${wStore.map(w => w.id + w.n).join()}|${all.map(b => b.group.uuid).join()}|${this._under}`;
    if (key === this._foodKey) return;
    this._foodKey = key;
    if (!this.food.group.parent) this._ws.scene.add(this.food.group);
    const shown: ShownPlace[] = [];
    for (const [group, wants] of [[homes, wHome], [stores, wStore]] as const) {
      // board by board in turn round the buildings, so each has its share (and empties with the rest);
      // within one: the pallets and the freezer, then the boards nearest eye height (≈ 1.2 m) on every unit before the high and low ones
      const lists = group.map(b => (b.group.userData.foodSlots as FoodSlot[]).map(slot => ({ b, slot }))
        .sort((x, y) => +(y.slot.floor || y.slot.freezer) - +(x.slot.floor || x.slot.freezer) || Math.round(Math.abs(x.slot.o[1] - 1.2 * M) / (0.2 * M)) - Math.round(Math.abs(y.slot.o[1] - 1.2 * M) / (0.2 * M))));
      const slots: Array<{ b: Built; slot: FoodSlot }> = [];
      for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) slots.push(l[i]);
      const places = planShelves(wants, slots.map(({ slot }) => ({ len: slot.len / M, dep: slot.dep / M, clear: slot.clear / M, floor: slot.floor, freezer: slot.freezer })));
      for (const b of group) b.group.updateMatrixWorld(true);
      for (const p of places) if (!(this._under && !slots[p.slot].b.under)) shown.push({ place: p, slot: slots[p.slot].slot, world: slots[p.slot].b.group.matrixWorld });
    }
    this.food.update(shown);
  }
  private _foodPantry: unknown = null;
  private _foodStock: unknown = null;
  private _foodCheap = '';
  private _finishedCount(): number { let n = 0; for (const b of this._built.values()) if (b.finished) n++; return n; }

  // ── Underground ───────────────────────────────────────────────────────
  private _under = false;
  private _earth: THREE.Mesh | null = null;
  /** The underground view: the ground goes see-through, trees hide, surface buildings ghost, bunker rooms show cut open. */
  setUnderground(on: boolean): void {
    if (on === this._under) return;
    this._under = on;
    this.terrain.setOpacity(on ? 0.3 : 1);
    this.forest.visible = !on;
    this.sage.visible = !on;
    this.willow.visible = !on;
    this.rocks.visible = !on;
    this.stream.setEdgesVisible(!on);
    for (const [id, g] of this._runGroups) if (this._runs.find(r => r.id === id)?.kind === 'escape_tunnel') this._applyTunnelView(g.group);
    // a bed of dark earth under the bunkers, so the see-through ground reads as a cut-away section, not sky
    if (on) {
      const floors = [...this._built.values()].filter(b => b.under).map(b => b.under!.datum);
      const y = (floors.length ? Math.min(...floors) : this.groundAt(this.camp.x, this.camp.z) - DEPTH) - 0.08;
      this._earth ??= new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_SIZE + 60, PARCEL_SIZE + 60).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2e241a, roughness: 1 }));
      this._earth.position.set(PARCEL_SIZE / 2, y, PARCEL_SIZE / 2);
      this._earth.receiveShadow = true;
      this._ws.scene.add(this._earth);
    } else if (this._earth) this._ws.scene.remove(this._earth);
    for (const b of this._built.values()) { b.key = ''; this._applyView(b); }
    this._ws.invalidateShadows();
  }
  get underground(): boolean { return this._under; }

  /** Open digs over bunker rooms under construction (the terrain is cut, then backfilled). */
  private _pitKey = '';
  private _dig: THREE.Group | null = null;
  private _soilMat: THREE.Material | null = null;
  private _syncPits(list: readonly Structure[]): void {
    const pits: Pit[] = [];
    /** Per open dig: the spoil on its heap (m³) and whether the excavator is working it. */
    const sites: Array<{ pit: Pit; spoil: number; machine: boolean }> = [];
    for (const st of list) {
      const b = this._built.get(st.id);
      if (!b?.under) continue;
      const stages = BLUEPRINTS[st.kind].stages, done = st.stage >= stages.length;
      const f = done ? 0 : st.supplied ? st.done / stages[st.stage].hours : 0;
      // dug out through the dig stage, open while the walls go up, backfilled in the second half of the roof stage
      const k = done ? 0 : st.stage === 1 ? Math.min(1, f * 1.6) : st.stage === 2 ? 1 : st.stage === 3 ? (f < 0.5 ? 1 : 1 - (f - 0.5) / 0.5) : 0;
      if (st.stage === 0 && !done) continue;
      const r = footprint(KIT[st.kind], st.x, st.z, st.rot, false);
      const pit = { x0: r.x0 - 0.08, z0: r.z0 - 0.08, x1: r.x1 + 0.08, z1: r.z1 + 0.08, floor: b.under.datum - 0.06, k: Math.round(k * 20) / 20 };
      pits.push(pit);
      const full = BLUEPRINTS[st.kind].stages.reduce((a, s) => a + (s.yields?.spoil ?? 0), 0) * 2.2;   // the gross dig (backfill goes back in)
      if (!done && st.stage >= 1 && st.stage <= 3) sites.push({ pit, spoil: Math.round(full * pit.k), machine: (st.stage === 1 && pit.k < 1) || (st.stage === 3 && f > 0.5) || (st.stage === 1 && st.supplied) });
    }
    const key = JSON.stringify(pits);
    if (key === this._pitKey) return;
    const before = this.parcel.pits;
    this._pitKey = key;
    this.parcel.setPits(pits);
    // refresh the ground over every pit that changed
    for (const p of [...before, ...pits]) {
      const reach = pitReach(1.6);
      this.terrain.refresh(this._terrainSource, p.x0 - reach - 0.5, p.z0 - reach - 0.5, p.x1 + reach + 0.5, p.z1 + reach + 0.5);
    }
    this._buildDigs(sites);
    if (this._quality) this._plant(this._quality);
    this._ws.invalidateShadows();
  }

  /** Bare earth over each open dig, the spoil heap beside it, the excavator at its edge. */
  private _buildDigs(sites: Array<{ pit: Pit; spoil: number; machine: boolean }>): void {
    if (this._dig) { this._root.remove(this._dig); this._dig.traverse(o => { if ((o as THREE.Mesh).isMesh && o.userData.own) (o as THREE.Mesh).geometry.dispose(); }); }
    this._dig = new THREE.Group();
    if (!this._soilMat) {
      const m = (kitMaterial('soil') as THREE.MeshStandardMaterial).clone();
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      this._soilMat = m;
    }
    for (const { pit, spoil, machine } of sites) {
      if (pit.k <= 0) continue;
      const reach = pitReach(Math.max(0, this._naturalH((pit.x0 + pit.x1) / 2, (pit.z0 + pit.z1) / 2) - pit.floor)) * pit.k + 0.06;   // the batter, from the uncut ground
      const soil = new THREE.Mesh(drapeSoil(pit.x0 - reach, pit.z0 - reach, pit.x1 + reach, pit.z1 + reach, this.groundAt), this._soilMat);
      soil.receiveShadow = true; soil.userData.own = true;
      this._dig.add(soil);
      // the heap on the long side, clear of the batter
      const alongX = pit.x1 - pit.x0 >= pit.z1 - pit.z0;
      const len = alongX ? pit.x1 - pit.x0 : pit.z1 - pit.z0;
      const hx = alongX ? (pit.x0 + pit.x1) / 2 : pit.x1 + reach + 0.3, hz = alongX ? pit.z1 + reach + 0.3 : (pit.z0 + pit.z1) / 2;
      const rowG = spoilHeap(spoil, len);
      if (!alongX) rowG.rotateY(Math.PI / 2);
      const heap = new THREE.Mesh(rowG.translate(hx, this.groundAt(hx, hz) - 0.02, hz), kitMaterial('soil'));
      heap.castShadow = heap.receiveShadow = true; heap.userData.own = true;
      this._dig.add(heap);
      if (machine) {
        // parked at the edge opposite the heap, facing in, bucket down in the hole
        const ex = alongX ? (pit.x0 + pit.x1) / 2 + 0.2 : pit.x0 - reach - 0.28, ez = alongX ? pit.z0 - reach - 0.28 : (pit.z0 + pit.z1) / 2 - 0.1;
        const g = buildExcavator(Math.max(0.1, this.groundAt(ex, ez) - pit.floor) * 0.6);
        g.position.set(ex, this.groundAt(ex, ez), ez);
        g.rotation.y = alongX ? 0 : Math.PI / 2;
        g.traverse(o => { o.userData.own = true; });
        this._dig.add(g);
      }
    }
    this._root.add(this._dig);
  }

  /** Sync with the game's structures (adds new ones). */
  syncStructures(list: readonly Placed[]): void {
    for (const p of list) this.addStructure(p);
  }

  /** Show each structure at its construction stage (scaffold → frame → roof → siding). */
  syncProgress(list: readonly Structure[]): void {
    // bunker hardening fitted: rebuild those rooms with their fittings
    let hardened = false;
    for (const st of list) {
      const k = st.hardening ? JSON.stringify(st.hardening) : '';
      if (k === (this._harden.get(st.id)?.key ?? '')) continue;
      this._harden.set(st.id, { key: k, tiers: st.hardening ?? {} });
      hardened = true;
    }
    if (hardened) this._syncUnderground();
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
      const mark = b.group.getObjectByName('planMark');
      if (mark) mark.visible = st.stage === 0;
      if (done !== b.finished) { b.finished = done; if (b.light) b.light.visible = done; this._ws.invalidateShadows(); }
      this._applyView(b);
    }
    this._syncPits(list);
  }

  /**
   * Services changed (plumbed / wired / septic): rebuild those buildings so
   * their interiors match (faucets, lights, fridge, flush toilet), and
   * warm lamplight turns to electric light.
   */
  syncServices(game: GameState): void {
    const p = plant(game);
    for (const b of this._built.values()) {
      if (!b.finished) continue;
      const sv = serviceOf(game, p, b.placed.id);
      const opts = { plumbed: sv.plumbed, wired: sv.wired, septic: sv.septic };
      // wired but no power yesterday (a blackout, a flat battery): back to lamplight
      const powered = sv.wired && game.utilities.lit.includes(b.placed.id);
      const key = `${+opts.plumbed}${+opts.wired}${+opts.septic}${+powered}`;
      if (key === b.services) continue;
      const geo = key.slice(0, 3) !== (b.services ?? '000').slice(0, 3);
      b.services = key;
      if (b.light && !b.under) b.light.color.set(powered ? 0xfff0d8 : 0xffc27a);
      if (!geo || (key.startsWith('000') && !b.group.userData.opts?.plumbed && !b.group.userData.opts?.wired)) continue;
      this._rebuild(b, { ...b.opts, ...opts });
      if (b.light && !b.under) b.light.color.set(powered ? 0xfff0d8 : 0xffc27a);
    }
  }

  private _rebuild(b: Built, opts: BuildOpts): void {
    const def = KIT[b.placed.kind];
    b.opts = opts;
    const g = buildLayers(def, hashStr(b.placed.id + ':' + this.parcel.seed), opts);
    Object.assign(g.userData, { type: 'building', buildingId: b.placed.id });
    g.position.copy(b.group.position);
    g.rotation.copy(b.group.rotation);
    if (b.light) { b.group.remove(b.light); g.add(b.light); }
    this._ws.scene.remove(b.group);
    b.group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    b.group = g;
    this._ws.scene.add(g);
    b.key = '';
    showStage(g, b.finished ? 5 : 0, 0);
    this._applyView(b);
    this._ws.invalidateShadows();
  }

  /** The building a screen ray hits (click to select), or null. */
  pickBuilding(ray: THREE.Ray): string | null {
    const rc = new THREE.Raycaster(ray.origin, ray.direction);
    let best: { id: string; d: number } | null = null;
    for (const b of this._built.values()) {
      if (this._under && !b.under) continue;
      // from above ground, a bunker room is picked only by what shows above the grass (hatch, vents, headhouse)
      const hit = rc.intersectObject(b.group, true).find(h => !b.under || this._under || h.point.y > this.groundAt(h.point.x, h.point.z) - 0.02);
      if (hit && (!best || hit.distance < best.d)) best = { id: b.placed.id, d: hit.distance };
    }
    return best?.id ?? null;
  }

  /** Cutaway (walls cut at waist height, roof and loft off) / x-ray (see-through shell) / full. */
  setBuildingView(v: BuildingView): void {
    if (v === this._view) return;
    this._view = v;
    for (const b of this._built.values()) { b.key = ''; this._applyView(b); }
    this._ws.invalidateShadows();
  }

  private _applyView(b: Built): void {
    // underground view: bunker rooms are shown cut open, everything on the surface is a ghost
    const v = this._under ? (b.under ? 'cutaway' : 'ghost') : this._view;
    for (const o of b.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const layer = m.userData.layer as CabinLayer;
      const ud = m.userData as { baseMat?: THREE.Material };
      ud.baseMat ??= m.material as THREE.Material;
      // x-ray: the shell goes see-through, the furniture stays solid
      const see = v === 'ghost' || (v === 'xray' && XRAY_LAYERS.includes(layer));
      m.material = see ? xrayOf(ud.baseMat) : ud.baseMat;
      m.castShadow = !see && !['kit_glass', 'kit_glow', 'kit_string'].includes(ud.baseMat.name);
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
      // bunker rooms are lit by their bulkhead lamps day and night
      if (b.under) {
        // scaled to the room: the same lamps light a small vestibule and a big bunkroom alike
        const def = KIT[b.placed.kind], area = def.cellsX * def.cellsZ / 4;
        // warm, low lamplight (incandescent-ish), not a bright work light
        b.light.intensity = (this._under ? 0.25 : 0.48) * Math.min(1, 0.2 + 0.8 * area);
        b.light.color.set(0xffd49e);
        continue;
      }
      // homes are lit in the evening; sheds and shops keep a dim work light
      const home = KIT[b.placed.kind].sleeps > 0;
      b.light.intensity = (this._view === 'full' ? 0.25 : 0.12) + (home ? (lit ? night * 1.25 : night * 0.25) : night * 0.1);
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
    // crops stand in the ground from planting (mid-May) to the last of the harvest (late October); bare soil the rest of the year
    const doy = calendarOf(game.clock).doy, [c0, c1] = seasons(REGIONS[game.site.region]).crops, growing = doy >= c0 && doy < c1;
    // the orchard: leaves from blossom to a month past the first frost, fruit in late summer once the trees bear (and no late frost took it)
    const [fr0, fr1] = REGIONS[game.site.region].frost, cal = calendarOf(game.clock);
    const leafy = doy >= fr0 - 15 && doy < fr1 + 25, picking = doy >= ORCHARD_PICK[0] - 25 && doy < ORCHARD_PICK[1] && !orchardFrost(game.seed, cal.year);
    for (const b of this._built.values()) {
      if (b.placed.kind === 'orchard') {
        const st = game.structures.find(x => x.id === b.placed.id);
        const fruit = picking && b.finished && orchardBearing((game.clock.t - (st?.finishedAt ?? game.clock.t)) / 365) > 0;
        for (const o of b.group.children) {
          const name = ((o as THREE.Mesh).userData.baseMat as THREE.Material | undefined)?.name ?? ((o as THREE.Mesh).material as THREE.Material | undefined)?.name;
          if (o.userData.layer === 'interior' && (name === 'kit_hedge' || name === 'kit_hedge2')) o.visible = leafy && b.finished;
          if (o.userData.layer === 'decor') o.visible = fruit && leafy;
        }
        continue;
      }
      if (b.placed.kind !== 'garden' && b.placed.kind !== 'field') continue;
      for (const o of b.group.children) {
        const name = ((o as THREE.Mesh).userData.baseMat as THREE.Material | undefined)?.name ?? ((o as THREE.Mesh).material as THREE.Material | undefined)?.name;
        if (name === 'kit_crop' || name === 'kit_grain' || (b.placed.kind === 'field' && name === 'kit_straw')) o.visible = growing && (o.userData.layer !== 'interior' || b.finished);
      }
    }
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
      if (b.under) continue;                 // bunker rooms are below the walker (going down is a later step)
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
      // a building whose floor is its graded pad (greenhouse gravel, a garage slab): stand on the pad, not the raw slope under it
      if (Math.abs(lx) < hw && Math.abs(lz) < hd && def.category !== 'bunker' && (def.category !== 'food' || b.placed.kind === 'greenhouse')) return b.padY + Math.max(0, def.floorY);
    }
    return this.groundAt(x, z);
  };

  // ── Walking below (walk mode) ─────────────────────────────────────────
  /** The walk camera is down in a bunker. */
  private _below = false;
  /** The stairwell whose headhouse the walker is in (only from there do the stairs lead down). */
  private _house: string | null = null;
  get walkingBelow(): boolean { return this._below; }

  /** The finished bunker room under (x, z), with (x, z) in its frame. */
  private _roomAt(x: number, z: number, pad = 0): { b: Built; lx: number; lz: number } | null {
    for (const b of this._built.values()) {
      if (!b.under || !b.finished) continue;
      const def = KIT[b.placed.kind];
      const [lx, lz] = this._local(b, x, z);
      if (Math.abs(lx) < def.cellsX * CELL / 2 - pad && Math.abs(lz) < def.cellsZ * CELL / 2 - pad) return { b, lx, lz };
    }
    return null;
  }

  /** A finished escape tunnel the walker is in (below ground): its floor, and how near the exit ladder. */
  private _tunnelAt(x: number, z: number): { floor: number; toExit: number; run: PerimeterRun } | null {
    for (const r of this._runs) {
      if (r.kind !== 'escape_tunnel' || r.finishedAt === null) continue;
      const { d, s } = closestOnLine(r.pts, x, z);
      if (d >= VAULT_W / 2 - 0.03) continue;
      const path = this._pathOf(r);
      return { floor: floorAt(path, s), toExit: path[path.length - 1].s - s, run: r };
    }
    return null;
  }

  /** Walk-mode floor: down in the bunker, its floor (the stair's treads in a stairwell); up top, the surface. */
  tourHeight = (x: number, z: number): number => {
    if (this._below) { const t = this._tunnelAt(x, z); if (t && !this._roomAt(x, z)) return t.floor; }
    const r = this._roomAt(x, z);
    if (r && r.b.placed.kind === 'bunker_stairs') {
      const pr = stairProfile(KIT.bunker_stairs, r.b.opts.depth ?? DEPTH);
      if (this._below || r.lz > pr.zHouse || this._house === r.b.placed.id) return r.b.under!.datum + pr.yAt(r.lz);
    }
    if (this._below) return r ? r.b.under!.datum : this.groundAt(x, z) - DEPTH;
    return this.walkHeight(x, z);
  };

  /** Walk mode: below, only bunker rooms are floor (walls and furniture block); up top, the usual. */
  tourBlocked = (x: number, z: number, r: number): boolean => {
    if (!this._below) {
      // a stairwell's headhouse has walls to walk in through the door
      for (const b of this._built.values()) {
        if (b.placed.kind !== 'bunker_stairs' || !b.finished) continue;
        const [lx, lz] = this._local(b, x, z);
        const zh = stairProfile(KIT.bunker_stairs, b.opts.depth ?? DEPTH).zHouse, hw = KIT.bunker_stairs.cellsX * CELL / 2;
        if (hitsColliders((b.group.userData.colliders as Collider[]).filter(c => c.z1 > zh - 0.01), lx, lz, Math.min(r, INDOOR_R))) return true;
        // the headhouse's back wall stops anyone coming over the buried stair from behind
        if (this._house !== b.placed.id && Math.abs(lx) < hw + r && lz > zh - 0.04 - r && lz < zh + 0.03) return true;
      }
      return this.walkBlocked(x, z, r);
    }
    const here = this._roomAt(x, z, 0.0);
    if (!here) return !this._tunnelAt(x, z);       // below ground: rooms and escape tunnels are all there is
    for (const b of this._built.values()) {
      if (!b.under || !b.finished) continue;
      const def = KIT[b.placed.kind], reach = Math.max(def.cellsX, def.cellsZ) * CELL + 0.3;
      if (Math.abs(x - b.placed.x) > reach || Math.abs(z - b.placed.z) > reach) continue;
      const [lx, lz] = this._local(b, x, z);
      if (hitsColliders(b.group.userData.colliders as Collider[], lx, lz, Math.min(r, INDOOR_R))) return true;
    }
    return false;
  };

  /** Level changes: down a stairwell past its headhouse, or down / up a hatch's ladder. */
  tourPortal = (x: number, z: number): { x: number; z: number } | null => {
    // the escape tunnel's ladder: up and out from below, and only from below (from outside the hatch is just woods floor)
    if (this._below) {
      const t = this._tunnelAt(x, z);
      if (t && t.toExit < 0.05) {
        const p = t.run.pts, [ex, ez] = p[p.length - 1], [px, pz] = p[p.length - 2], l = Math.hypot(ex - px, ez - pz);
        this._below = false;
        return { x: ex + (ex - px) / l * 0.18, z: ez + (ez - pz) / l * 0.18 };
      }
    }
    const r = this._roomAt(x, z);
    if (!r || r.b.placed.kind !== 'bunker_stairs') this._house = null;
    if (!r) return null;
    const kind = r.b.placed.kind, b = r.b;
    const toWorld = (lx: number, lz: number) => { const p = b.group.localToWorld(new THREE.Vector3(lx, 0, lz)); return { x: p.x, z: p.z }; };
    if (kind === 'bunker_stairs') {
      const pr = stairProfile(KIT.bunker_stairs, b.opts.depth ?? DEPTH);
      if (!this._below && this._house === b.placed.id && r.lz < pr.zHouse - 0.02) this._below = true;
      else if (this._below && r.lz > pr.zHouse + 0.02) this._below = false;
      this._house = r.lz > pr.zHouse - 0.06 || this._below ? b.placed.id : null;
      return null;
    }
    if (kind === 'bunker_hatch') {
      const inShaft = Math.abs(r.lx) < SHAFT_HALF * 0.8 && Math.abs(r.lz) < SHAFT_HALF * 0.8;
      if (!inShaft) return null;
      // climb down to the foot of the ladder, or up and out in front of the collar
      this._below = !this._below;
      return this._below ? toWorld(0, 0.13) : toWorld(0, KIT.bunker_hatch.cellsZ * CELL / 2 + 0.1);
    }
    return null;
  };

  /** Walk mode: can a body of radius r stand at (x, z)? Creek water and tree trunks block. */
  walkBlocked = (x: number, z: number, r: number): boolean => {
    if (this.stream.depthAt(x, z) > 0.04) return true;
    if (this._buildingBlocked(x, z, r)) return true;
    if (this._perimeterBlocked(x, z, Math.min(r, INDOOR_R))) return true;
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
    this._poolTunnelLights();
    // underground (walking in a bunker, a QA pose inside a room): no daylight, only the lamps
    const cam = this._ws.camera.position;
    const below = cam.y < this.groundAt(cam.x, cam.z) - 0.12;
    this._ws.outdoorLight += ((below ? 0.04 : 1) - this._ws.outdoorLight) * Math.min(1, dt * 6);
    const p = this.seasons.update({ locationId: this.climate, doy, totalDays, mode, dt });
    writeSeasonUniforms(p, climateFor(this.climate));
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
    this.rocks.dispose();
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

const LIME = new THREE.MeshBasicMaterial({ color: 0xece8d8, transparent: true, opacity: 0.85, depthWrite: false });
/** Lime lines round a footprint (local coordinates), about 25 cm wide, just above the ground. */
function planMark(def: KitPieceDef): THREE.Group {
  const g = new THREE.Group();
  g.name = 'planMark';
  const hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2, w = 0.04, y = 0.012;
  const strip = (sx: number, sz: number, x: number, z: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz).rotateX(-Math.PI / 2), LIME);
    m.position.set(x, y, z);
    m.renderOrder = 1;
    g.add(m);
  };
  strip(2 * hx + w, w, 0, -hz); strip(2 * hx + w, w, 0, hz);
  strip(w, 2 * hz - w, -hx, 0); strip(w, 2 * hz - w, hx, 0);
  return g;
}

