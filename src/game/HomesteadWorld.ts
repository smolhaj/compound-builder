import { setGroundProbe } from '../sim/towers';
import { RetainWallLayer } from './terrain/RetainWalls';
import { WALLLESS, planPad, type PadPlan } from '../sim/retainPlan';
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
import { goodsKey, houseGoods } from '../sim/evenings';
import { plant, serviceOf } from '../sim/utilities';
import { StreamRenderer } from '../engine/world/water/StreamRenderer';
import { RegionalWaterRenderer } from '../engine/world/water/RegionalWaterRenderer';
import { updateWaterGlobals } from '../engine/world/water/waterShading';
import { seasonState } from '../engine/world/season/seasonState';
import { RegionalProps } from '../engine/world/houses/regionalProps';
import { buildFarmstead, type FarmTree } from '../engine/world/houses/regionalFarmsteads';
import { onFarmstead, type Farmstead } from '../engine/world/houses/farmstead';
import { planNeighbors } from './region/neighbors';
import { buildCamp } from './props/campGeometry';
import { Atmosphere, type AtmosBuilding, type AtmosFrame } from './atmosphere/Atmosphere';
import { PathLayer } from './paths/PathLayer';
import { LivedLayer } from './lived/LivedLayer';
import type { Mode } from './lived/livedPlan';
import { lightsOutNow } from '../sim/blackout';
import type { NetWorld } from './paths/pathNet';
import { WALK_CLIFF, walkRoute } from './paths/walkRoute';
import type { PathExtras } from '../sim/paths';
import { walkFactor } from '../sim/paths';
import { useWorldStore } from '../store/worldStore';
import { fenceLean } from './atmosphere/aging';
import { LEANS, leanRun } from './atmosphere/fenceAging';
import { FamilyRenderer } from './people/FamilyRenderer';
import { BunkerFolk, type WorldSpot } from './people/BunkerFolk';
import { bunkerOccupants, hatchOpen } from '../sim/bunkerLife';
import { DogRenderer } from './people/DogRenderer';
import { FleetRenderer, inCarBox, type CarBox, type FleetCtx } from './props/FleetRenderer';
import type { DogCtx } from './people/dogGoals';
import { WildlifeRenderer } from './wildlife/WildlifeRenderer';
import { buildYard, type Yard } from './props/yardGeometry';
import { dailyCtx, wallGate, yardFx } from './people/dailyScene';
import type { GoalCtx, Site } from './people/peopleGoals';
import { CELL, type KitPieceDef } from './buildkit/kit';
import type { GameState } from '../sim/state';
import type { WearSeason } from '../engine/world/people/crowdWear';
import type { TourBuildingInfo } from '../engine/world/camera/TourController';
import { floorHatchHost, footprint, KIT, placementProblem, rotQ, type Placed, type SiteQuery } from './buildkit/kit';
import { showStage, CUTAWAY_HIDE, XRAY_LAYERS, type BuildLayer as CabinLayer, type BuildOpts } from './buildkit/shell';
import { bunkerRoots, datums, doorsOf, DEPTH, isEntry, isUnderground, tunnelDoorsOf, tunnelStart, type Side } from './buildkit/underground';
import { updateScreens, updateSiteMap } from './buildkit/screenFeeds';
import { powered as gearPowered } from '../sim/gear';
import { floorAt, tunnelPath, tunnelProblem, TUNNEL_PROBLEM_TEXT, VAULT_W, type PathSample } from './buildkit/tunnelPath';
import { buildTunnel } from './perimeter/tunnelGeometry';
import { SHAFT_HALF, setHatchLid, stairProfile, type RoomSpot } from './buildkit/bunkerBuildings';
import { FLIGHT_W, hatchPlan } from './buildkit/bunkerHatchPlan';
import { buildDumpTruck, buildExcavator, buildFormwork, buildTubeSegments, drapeSoil, earthMound, spoilHeap } from './props/digSite';
import { kitMaterial } from './buildkit/materials';
import { FRUITS, fruitLook, isOrchard, type Fruit } from '../sim/orchard';
import { buildLayers, type Seat } from './buildkit/buildings';
import { farHiddenLayers, isFar } from './buildkit/buildingLod';
import { LIGHT_BUDGET, pickLights, type LightCandidate } from './lightPool';
import { hashStr } from './buildkit/clutter';
import { buildRun, solidSpans } from './perimeter/perimeterGeometry';
import { PERIMETER, hasSkirt, runGrowth, runProgress, underground, wallLength, type PerimeterRun } from '../sim/perimeter';
import { closestOnLine, earthworkReach, type Earthwork } from './parcel/parcelTerrain';
import { exposure, Sight, type Observer, type SightWorld } from './sightlines/visibility';
import { hitsColliders, M, type Collider } from './buildkit/interior';
import type { BuildingView } from '../store/worldStore';
import type { Structure } from '../sim/state';
import { calendarOf } from '../sim/state';
import { seasons } from '../sim/regions';
import { blueprintOf } from '../sim/construction';
import { BLUEPRINTS } from '../sim/blueprints';
import { SmokePlume } from '../engine/world/fx/SmokePlume';
import type { Pad, Pit } from './parcel/parcelTerrain';
import { pitReach } from './parcel/parcelTerrain';
import { SeasonController, climateFor, type SeasonMode } from '../engine/world/season/seasonState';
import { writeSeasonUniforms } from '../engine/world/season/seasonShader';
import { PARCEL_SIZE, ParcelTerrain } from './parcel/parcelTerrain';
import { CLASSIC, type Site as LandSite } from '../sim/site';
import { pickCamp } from './parcel/campSpot';
import { DRIVE_W, accessFromPlan, distToLine, type Access } from './region/access';
import { ROAD_W, countyRoad, roadLine, type CountyRoad } from './region/countyRoad';
import { buildRoadWorks } from './region/roadWorks';
import { roadPlanFor } from '../sim/roadState';
import { roadBedOf, type RoadPlan } from '../sim/roadPlan';
import { buildRibbon } from '../engine/world/roads/RoadRibbon';
import { gravelMaterial, roadMaterial } from '../engine/world/roads/roadTextures';
import { RockField, type RockSpec } from '../engine/world/terrain/RockField';
import { regionFor } from '../sim/climate';
import { buildLineFences, buildPowerline, planLineFences } from './region/lineFences';
import type { RegionWorld } from './region/regionWorld';
import { buildGate } from './props/gateGeometry';
import { buildStockpile } from './props/stockpileGeometry';
import { DeliveryTruck } from './DeliveryTruck';
import { MATERIAL_IDS, emptyStock } from '../sim/materials';
import { pantryRows } from '../sim/pantry';
import { needOf } from '../sim/needs';
import { FoodShelfRenderer, type ShownPlace } from './props/FoodShelfRenderer';
import { TentsRenderer, tentSpots } from './props/TentsRenderer';
import { sleepSpotFor, tentsPitched } from '../sim/housing';
import { planShelves, propsWanted, splitInUse } from './props/foodShelfPlan';
import type { FoodSlot, SickSlot } from './buildkit/shell';
import { sickbayPlan, type BedSlot } from './people/sickbayPlan';

/** The order the stores take their turns: the buried storeroom, the root cellar, the bunker's galley and container, then the house pantries. */
const FOOD_ORDER: Record<string, number> = { bunker_stores: 0, root_cellar: 1, bunker_galley: 2, bunker_container: 3, bunker_corridor: 4 };

export { PARCEL_SIZE };
/** Person height in world units (≈ 1.7 m). */
export const PERSON_H = 0.28;
/** Climate of the original (Mountain West) parcel; each world has its region's (`HomesteadWorld.climate`). */
export const CLIMATE_ID = 'mountain_west';
/** Parcel trees are planted this far beyond the parcel; regional far trees beyond. */
const TREE_MARGIN = 26;

const RW_ACCESS_MARGIN = 0.5;

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
  /** Layers hidden while the camera is far away (studs, furniture, loft of an enclosed building; buildkit/buildingLod). */
  lod: string[];
  /** The inside is hidden now (finished, far from the camera, full view). */
  far: boolean;
  /** The footprint with its porch / steps, and the body alone (computed once: hit tests run per tree, per animal, per frame). */
  fpPorch: Rect4;
  fpBody: Rect4;
  /** The plan of the retaining wall round its graded pad (sim/retainPlan.ts), null when the pad is gentle. */
  wall: PadPlan | null;
}
interface Rect4 { x0: number; z0: number; x1: number; z1: number }

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
/** One open bunker dig and what the crew has at it (see _buildDigs). */
interface DigSite { pit: Pit; spoil: number; machine: boolean; stage: number; f: number; kind: string; rot: number; datum: number; x: number; z: number }

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
  /** The home + owned-land test the last build used (a rebuild of the farms after a fire reuses it). */
  private _insideHome: (x: number, z: number) => boolean = () => false;
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
  /** The chore yard round the camp (sim/daily.ts). */
  private readonly _yard: Yard;
  readonly family: FamilyRenderer;
  /** The people down in the bunker (seats, bunks, the console): game/people/BunkerFolk. */
  readonly bunkerFolk: BunkerFolk;
  readonly dogs: DogRenderer;
  /** The fleet (sim/vehicles.ts): parked in the garages and the yard, driving out on runs. */
  readonly fleet: FleetRenderer;
  /** Native wildlife (sim/wildlife.ts): deer, turkeys, bears and the rest, drawn as instanced animals. */
  readonly wildlife: WildlifeRenderer;
  /** Night life, weathering and the deeper seasons (atmosphere/). */
  readonly atmos: Atmosphere;
  /** The footpaths between the stops on the place, worn and laid (game/paths). */
  readonly paths: PathLayer;
  /** The dry-stack retaining walls round graded pads, with their stairs (game/terrain/RetainWalls). */
  readonly walls = new RetainWallLayer();
  private _wallVer = 0;
  /** What people leave lying about (game/lived): mats, pots, bales, swings, a mailbox at the road. */
  readonly lived: LivedLayer;
  /** Mud, lying snow and rain right now (the footing under the walkers). */
  private _underfoot = { mud: 0, snow: 0, rain: 0 };
  /** County road, driveway, gate and stockpile yard. */
  /** The county road past the place, the region's way (game/region/countyRoad.ts). */
  readonly county: CountyRoad;
  /** The planned way in: curves, switchbacks, crossings, a bore (sim/roadPlan.ts); the sim reads the very same plan. */
  readonly plan: RoadPlan;
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
    this.parcel = new ParcelTerrain(seed, { creek: site.creek, timber: site.timber, region: site.region, lot: site.lot ?? null, home: site.home });
    setGroundProbe((x, z) => this.parcel.natural(x, z).h);
    this.regionWorld = this.parcel.world;
    this.climate = this.regionWorld.climate;
    this.farms = planNeighbors(this.parcel);
    this.camp = this._pickCamp();
    this.county = countyRoad(site.region, seed);
    this.plan = roadPlanFor(site, seed, this.parcel);
    this.access = accessFromPlan(this.plan);
    this.terrain = new TerrainRenderer(ws.scene);
    this.forest = new ForestRenderer(ws.scene);
    this.sage = new ShrubField(ws.scene, 'sagebrush', this.regionWorld.sagePalette ?? SAGE, 1);
    this.rocks = new RockField(ws.scene);
    this.willow = new ShrubField(ws.scene, 'willow', WILLOW, 1);
    this.farTrees = new FarTreeRenderer(ws.scene);
    this.stream = new StreamRenderer(ws.scene);
    this.lakes = new RegionalWaterRenderer(ws.scene);
    this.family = new FamilyRenderer(ws.scene);
    this.bunkerFolk = new BunkerFolk(ws.scene);
    this.dogs = new DogRenderer(ws.scene);
    this.fleet = new FleetRenderer(ws.scene);
    this.wildlife = new WildlifeRenderer(ws.scene);
    this._campGroup = buildCamp({ fire: false });
    this._campGroup.position.set(this.camp.x, this.parcel.height(this.camp.x, this.camp.z), this.camp.z);
    this._campGroup.rotation.y = this.camp.rot;
    this._root.add(this._campGroup);
    this._yard = buildYard();
    this._yard.group.position.copy(this._campGroup.position);
    this._yard.group.rotation.y = this.camp.rot;
    this._root.add(this._yard.group);
    this._root.add(this.walls.group);
    const zc = this.parcel.creek.zAt(this.center.x + 3);
    this._root.add(scaleFigure(this.center.x + 3, zc + 4, this.parcel.height(this.center.x + 3, zc + 4)));
    ws.scene.add(this._root);
    this.atmos = new Atmosphere({
      scene: ws.scene, groundAt: this.groundAt, camp: this.camp, family: this.family,
      buildings: () => this._atmosBuildings(),
      runs: () => this._runs.flatMap(run => { const g = this._runGroups.get(run.id); return g ? [{ run, group: g.group }] : []; }),
      blocked: (x, z) => this.onBuilding(x, z, 0.02, false) || this.onAccess(x, z, 0.1) || this.onCamp(x, z, 0.2),
    });
    this.paths = new PathLayer({
      scene: ws.scene, groundAt: this.groundAt, makeWorld: () => this._pathWorld(), extras: g => this._pathExtras(g),
      look: () => this._pathLook(), publish: sum => useWorldStore.getState().setPathNet(sum),
      wallStair: (x, z) => this.walls.atStair(x, z),
    });
    this.lived = new LivedLayer({
      scene: ws.scene, groundAt: this.groundAt, floorAt: this.walkHeight,
      blocked: (x, z, r, self, mode) => this._livedBlocked(x, z, r, self, mode), pathDist: this.paths.distTo, pathVersion: () => this.paths.version,
      doors: () => this.paths.network.nodes.filter(n => !n.ring).map(n => [n.ax, n.az] as const),
      gate: () => this._livedGate(), landing: g => { const c = this._pathExtras(g).creek; return c ? { x: c.x, z: c.z, face: this.parcel.creek.zAt(c.x) > c.z ? 0 : Math.PI } : null; },
      look: () => ({ season: seasonState.visual, snow: seasonState.params.snow > 0.25, mud: this.atmos.mud > 0.4, quality: this._quality ?? 'high' }),
      aprons: (list, key) => this.paths.renderer.setAprons([...list, ...this._driveApron()], this.groundAt, key + '|' + this._drive),
      changed: () => this._ws.invalidateShadows(),
      skirts: (list, key) => this.paths.renderer.setSkirts(list, this.groundAt, this._pathLook(), key),
    });
    this._drive = site.improvements?.drive ?? true;
    // a built drive is benched into the ground (cut banks, fill slopes, banked curves): before the terrain mesh and the trees are made
    this.parcel.setRoadBed(this._drive ? roadBedOf(this.plan) : null);
    this.truck = new DeliveryTruck(ws.scene, this._truckRoute(), this.groundAt, this.county.x, (x, z) => this._driveY(x, z));
  }

  private *_atmosBuildings(): Iterable<AtmosBuilding> {
    for (const b of this._built.values()) yield { id: b.placed.id, kind: b.placed.kind, x: b.placed.x, z: b.placed.z, rot: b.placed.rot, group: b.group, finished: b.finished, under: !!b.under };
  }

  /** Night life, weathering, mud, frost, drifts (after tick, once the season is eased). */
  updateAtmosphere(f: AtmosFrame, game: GameState, doy: number): void {
    this.atmos.update(f, game, doy);
    this._underfoot = { mud: this.atmos.mud, snow: f.snow, rain: f.rain };
    this.lived.update(game, performance.now(), { night: f.night, lightsOut: lightsOutNow(game) });
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

  /** QA: a scale figure standing on the road (or its deck) at (x, z). */
  qaFigure(x: number, z: number): void { this._root.add(scaleFigure(x, z, this._driveY(x, z) ?? this.groundAt(x, z))); }

  private _bridgeDown = false;
  /** The bridge on the way in comes down (or goes back up): redraw the road without its deck and rails. */
  setBridgeDown(on: boolean): void {
    if (on === this._bridgeDown) return;
    this._bridgeDown = on;
    if (this._quality) this._buildRoads();
  }

  /** The road's own height where it leaves the ground: on a bridge deck (null elsewhere, and while there is no drive). */
  private _driveY(x: number, z: number): number | null {
    if (!this._drive || this._bridgeDown) return null;
    let best = 0.32 * 0.32, y: number | null = null;
    for (const sx of this.plan.structures) {
      if (sx.kind !== 'bridge1' && sx.kind !== 'bridge') continue;
      for (const p of this.plan.pts) {
        if (p.s < sx.s0 - 1e-6 || p.s > sx.s1 + 1e-6) continue;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) { best = d; y = p.y; }
      }
    }
    return y;
  }

  /** The drive went in (or the place has none yet): redraw it and send the truck the new way. */
  setDrive(on: boolean): void {
    if (on === this._drive) return;
    this._drive = on;
    // the bench goes into the ground (or, if the drive is gone, comes out): redraw the land along it, replant the banks, redraw the road
    const bed = on ? roadBedOf(this.plan) : null, b = (roadBedOf(this.plan)).bbox;
    this.parcel.setRoadBed(bed);
    if (this._quality) {
      this.terrain.refresh(this._terrainSource, b[0], b[1], b[2], b[3]);
      this._plant(this._quality);
    }
    this._buildRoads();
    this.truck.dispose();
    this.truck = new DeliveryTruck(this._ws.scene, this._truckRoute(), this.groundAt, this.county.x, (x, z) => this._driveY(x, z));
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

  /** Does the access (county road, driveway, yard) come within `m` of this rectangle? */
  private _touchesAccess(r: { x0: number; z0: number; x1: number; z1: number }, m: number): boolean {
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) if (this.onAccess(r.x0 + (r.x1 - r.x0) * i / 8, r.z0 + (r.z1 - r.z0) * j / 8, m)) return true;
    return false;
  }

  /** Is (x, z) on the county road or the driveway (plus `pad`)? */
  onAccess(x: number, z: number, pad = 0): boolean {
    if (Math.abs(x - this.county.x(z)) < ROAD_W / 2 + pad) return true;
    const a = this.access, b = a.box, m = DRIVE_W / 2 + pad;
    if (x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m && distToLine(a.driveQ, x, z) < m) return true;
    return Math.hypot(x - a.yard.x, z - a.yard.z) < 0.8 + pad;
  }

  /** Road + driveway ribbons draped on the rendered terrain, and the gate. */
  private _buildRoads(): void {
    this._roads.traverse(o => { if (o !== this._roads) (o as THREE.Mesh).geometry?.dispose(); });
    this._roads.clear();
    // the county road the region's way (gravel, blacktop, caliche); the drive is gravel (caliche in the desert)
    const mud = <M extends THREE.Material>(m: M): M => { m.defines = { ...m.defines, SEA_MUD: '', SEA_MUD_UV: '' }; return m; };   // mud season: the surface goes soft and the tire tracks hold water (season patch)
    const mat = mud((this.regionWorld.drive ?? (this.regionWorld.road === 'caliche' ? 'caliche' : 'gravel')) === 'caliche' ? roadMaterial('caliche') : gravelMaterial());
    const road = new THREE.Mesh(buildRibbon(roadLine(this.county, 1), ROAD_W, this.groundAt, 0.02, 6), mud(roadMaterial(this.regionWorld.road)));
    const track = this._drive ? mat : (() => { const m = mat.clone(); m.color = new THREE.Color(0x8a7a5c); return mud(m); })();
    road.receiveShadow = true; this._roads.add(road);
    // the way in: a curved ribbon on the benched ground, with its banks, rails, culverts, crossings and portals (game/region/roadWorks.ts)
    this._roads.add(buildRoadWorks(this.plan, this.groundAt, { built: this._drive, bridgeDown: this._bridgeDown, surface: mat, track, driveW: DRIVE_W, natural: (x, z) => this.parcel.natural(x, z).h }));
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
    this.atmos.setQuality(q);
    this.paths.setQuality(q);
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
    // (a lot with relief carries about twice the classic parcel's trees: Low plants a third of them, Medium most)
    const specs = plantAll(this.parcel.lot ? (q === 'low' ? 0.35 : q === 'medium' ? 0.85 : 1) : q === 'low' ? 0.5 : 1, blocked);
    for (const t of specs) t.y = this.terrain.surfaceAt(t.x, t.z) - 0.03;
    this._planted = specs;
    // lookups cover every tree a full-density plan has (marks made on High survive a switch to Low)
    const all = q === 'low' ? plantAll(1, (x, z) => this.onBuilding(x, z, 0.6) || this.onCamp(x, z, 0.6) || this.onAccess(x, z, 0.5)) : specs;
    this._treeById = new Map(all.map(t => [t.id, t]));
    this._plantForest();
    this._plantShrubs(q, inHome, blocked);
    const inside = (x: number, z: number) => inHome(x, z) || this._inOwned(x, z);
    // Neighboring farmsteads (houses, hay barns, corrals, poplar windbreaks)
    const kind = this.regionWorld.kind, wy = regionWaterY(kind);
    const farmTrees: FarmTree[] = [];
    this._insideHome = inside;
    this._buildFarms(t => farmTrees.push(t), inside);
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

  /** The neighbors' farmsteads, their line fences and the power line: rebuilt whole when a farm burns. */
  private _buildFarms(tree: (t: FarmTree) => void = () => {}, insideHome: (x: number, z: number) => boolean = this._insideHome): void {
    this._props?.dispose();
    const kind = this.regionWorld.kind, wy = regionWaterY(kind);
    const props = new RegionalProps(this._ws.scene, kind);
    const slope = (x: number, z: number) => this.parcel.region.slope(x, z);
    for (const f of this.farms) buildFarmstead(f, kind, props, this.groundAt, slope, tree);
    // the neighbors' line fences, the region's way (wire on T-posts, split rail, stone walls, woven wire)
    const creek = this.parcel.creek;
    buildLineFences(planLineFences(this.county.x, ROAD_W / 2, -330, PARCEL_SIZE + 330), this.regionWorld.fence, props, this.groundAt,
      (x, z) => onFarmstead(this.farms, x, z, 1.5) || Math.abs(z - creek.zAt(x)) < 2.2 || (wy !== null && this.parcel.region.height(x, z) < wy + 0.15) || insideHome(x, z),
      (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); });
    if (this.regionWorld.powerline) buildPowerline(props, this.groundAt, (x, z) => onFarmstead(this.farms, x, z, 4) || (wy !== null && this.parcel.region.height(x, z) < wy + 0.3) || insideHome(x, z));
    props.finish();
    this._props = props;
  }

  /** Neighbor farms that have burned (sim/neighborLife.burnedFarms, in farm order): rebuild their props charred. */
  setBurnedFarms(flags: readonly boolean[]): void {
    let changed = false;
    this.farms.forEach((f, i) => { const b = !!flags[i]; if (!!f.burned !== b) { f.burned = b; changed = true; } });
    if (!changed) return;
    this._buildFarms();
    this._ws.invalidateShadows();
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
        if (s.h < creek.waterY(px) + 0.05 || (this.parcel.lot?.lake && this.parcel.isCreek(px, pz))) continue;
        // willow on the banks: a dense band just above the water
        if (dz > hw + 0.25 && dz < hw + 2.6) {
          if (roll / keep < (0.55 * (1 - (dz - hw) / 2.6) + 0.12) * rw.willow && !blocked(px, pz)) willow.push({ x: px, y: this.groundAt(px, pz) - 0.02, z: pz, s: 0.8 + sR * 0.6, rot, tone });
          continue;
        }
        // rocks: ledges and loose stone, more on the steep and wooded ground (one chance in a few hundred cells)
        if (rw.rocks.count > 0 && (tone * 997) % 1 < rw.rocks.count / 4000 * (1 + 3 * Math.min(1, (this.parcel.lot ? this.parcel.lotSlope(px, pz) : this.parcel.region.slope(px, pz)) * 4 + s.forest * 0.5) + (this.parcel.lot ? 14 * this.parcel.lot.rock(px, pz) : 0)) && dz > hw + 1.5 && !blocked(px, pz)) {
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
      if (underground(r.kind)) { for (const e of r.kind === 'escape_tunnel' ? [r.pts[r.pts.length - 1]] : [r.pts[0], r.pts[r.pts.length - 1]]) if (Math.hypot(e[0] - x, e[1] - z) < (PERIMETER[r.kind].bore ? 0.9 : 0.18) + pad) return true; continue; }
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
      if (!['escape_tunnel', 'underground_passage'].includes(this._runs.find(r => r.id === id)?.kind ?? '')) continue;
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
    // a passage is hidden: from above only the covers of its hatches show; the vault is drawn in the underground view
    for (const o of g.children) { if (g.userData.passage && o.userData.part !== 'surface') o.visible = this._under; else if (o.userData.part === 'upper') o.visible = !this._under; }
  }

  /** Fences, hedges and walls drawn as built (hedges by growth); berms and ditches shape the terrain. */
  syncPerimeter(runs: readonly PerimeterRun[], t: number, opts: { lit?: boolean; sensors?: boolean } = {}): void {
    this._runs = runs;
    const lit = opts.lit ?? true, sensors = opts.sensors ?? false;
    const hostOf = (r: PerimeterRun) => (PERIMETER[r.kind].wallTop ? runs.find(x => x.id === r.hostId)?.kind ?? '' : '');
    const ids = runs.map(r => r.id).join(',');
    for (const r of runs) {
      // old posts lean and rails sag (atmosphere/aging): rebuilt as the lean steps
      const lean = LEANS.has(r.kind) && r.finishedAt !== null ? Math.round(fenceLean((t - r.finishedAt) / 365) * 10) / 10 : 0;
      const key = `${Math.round(runProgress(r) * 60)}:${Math.round(runGrowth(r, t) * 40)}:${r.finishedAt === null ? 0 : 1}:${r.gates.length}:${lean}:${hasSkirt(r, t) ? 1 : 0}:${lit ? 1 : 0}:${sensors ? 1 : 0}:${hostOf(r)}:${r.razor ? 1 : 0}`;
      const cur = this._runGroups.get(r.id);
      if (cur?.key === key) continue;
      if (cur) { this._root.remove(cur.group); cur.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); }
      const tunnel = r.kind === 'escape_tunnel' || r.kind === 'underground_passage';
      const group = tunnel
        ? buildTunnel(this._pathOf(r), this.groundAt, r.finishedAt !== null ? 1 : runProgress(r), this._exitWoods(r), r.kind === 'underground_passage' ? { woodsStart: this.tunnelExitWoods(r.pts[0][0], r.pts[0][1]) } : undefined)
        : buildRun(r, this.groundAt, t, (x, z) => this.onBuilding(x, z, 0.02, false), { lit, sensors, hostKind: PERIMETER[r.kind].wallTop ? runs.find(x => x.id === r.hostId)?.kind : undefined });
      if (tunnel) this._applyTunnelView(group);
      if (lean > 0) leanRun(group, lean, hashStr(r.id) % 997, this.groundAt);
      this._root.add(group);
      this._runGroups.set(r.id, { key, group });
      this._ws.invalidateShadows();
    }
    // earthworks (berms raise, ditches cut) as they are dug
    const works: Earthwork[] = runs.filter(r => r.kind === 'earth_berm' || r.kind === 'ditch').map(r => ({ pts: r.pts, gates: r.gates, height: PERIMETER[r.kind].height, k: r.finishedAt !== null ? 1 : runProgress(r) }));
    // a tunnel is cut and covered: an open trench along it while the culvert goes in
    for (const r of runs) if ((r.kind === 'escape_tunnel' || r.kind === 'underground_passage') && r.finishedAt === null && (r.supplied || r.done > 0)) works.push({ pts: r.pts.slice(), gates: [], height: -0.33, k: 1 });
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
    if (this._under && this._earth) this._earth.position.y = this._earthY();
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
      if (underground(run.kind)) continue;
      const th = run.kind === 'container_wall' || run.kind === 'container_stack' ? 0.21 : run.kind === 'stone_wall' ? 0.15 : run.kind === 'concrete_wall' ? 0.15 : run.kind === 'thorn_hedge' ? 0.15 * runGrowth(run, this._simT) : run.kind === 'log_palisade' ? 0.03 : run.kind === 'earth_berm' || run.kind === 'ditch' ? 0 : 0.01;
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
      for (let z = -12; z <= PARCEL_SIZE + 12; z += 5) out.push({ x: this.county.x(z), z, eye: 0.3 });
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
    if ((this.parcel.relief === 'bajada' && !this.parcel.creekHome) || !this.parcel.hasStream) this.stream.clear();
    else this.stream.build({
      x0: this.center.x - 62, x1: this.center.x + 62, zAt: c.zAt, waterY: c.waterY, band: 3,
      site: {
        ground: this.groundAt,
        blocked: (x, z, r, tree) => tree && this.treeClearance(x, z) < r,
      },
      quality: q, season: seasonState.plants, seed: this.parcel.seed,
    });
    const kind = this.regionWorld.kind, lakeY = this.parcel.lakeY, wy = lakeY ?? regionWaterY(kind);
    if (wy !== null) {
      // a lot with a lake (the bluff, the island) has its own shore: the water follows the lot's ground, not the region's
      this.lakes.build({
        kind, height: lakeY !== null ? (x, z) => this.parcel.natural(x, z).h : (x, z) => this.parcel.region.height(x, z), waterY: wy,
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
  private _pickCamp(): { x: number; z: number; rot: number } { return pickCamp(this.parcel, this.home); }

  // ── Footpaths (game/paths) ────────────────────────────────────────────
  /** The tests the path router uses now: buildings (padded, not below ground), the creek and its banks, the camp, the delivery yard, walls, trunks, land that is not ours. */
  private _pathWorld(): NetWorld {
    const trees = new Map<number, Array<[number, number, number]>>();
    for (const t of this.treeSpecs) {
      const k = Math.floor(t.x) * 4099 + Math.floor(t.z);
      (trees.get(k) ?? trees.set(k, []).get(k)!).push([t.x, t.z, 0.07 * t.scale + 0.07]);
    }
    const boxes = [...this._built.values()].filter(b => !b.under && KIT[b.placed.kind].level !== 'underground').map(b => footprint(KIT[b.placed.kind], b.placed.x, b.placed.z, b.placed.rot, false));
    const cars = this._cars, yard = this.access.yard, hasCreek = this.parcel.creekHome, half = this.parcel.creek.halfWidth;
    const own = (x: number, z: number) => (x > this.home.x0 && x < this.home.x1 && z > this.home.z0 && z < this.home.z1) || this._inOwned(x, z);
    const g = this.groundAt;
    const slope = (x: number, z: number): number => (Math.abs(g(x + 0.25, z) - g(x - 0.25, z)) + Math.abs(g(x, z + 0.25) - g(x, z - 0.25))) / 0.5;
    // what a straight walk cannot cross: a building, the built wall, the creek, and cliff ground (a rock face, a cutbank)
    const hard = (x: number, z: number): boolean => {
      for (const r of boxes) if (x > r.x0 - 0.14 && x < r.x1 + 0.14 && z > r.z0 - 0.14 && z < r.z1 + 0.14) return true;
      if (hasCreek && Math.abs(z - this.parcel.creek.zAt(x)) < half + 0.25) return true;
      if (this._perimeterBlocked(x, z, 0.08)) return true;
      if (this.walls.blocks(x, z)) return true;     // a retaining wall: over only at its stairs
      return slope(x, z) > WALK_CLIFF && !this.walls.atStair(x, z);
    };
    const blocked = (x: number, z: number): boolean => {
      if (!own(x, z)) return true;
      if (hard(x, z)) return true;
      if (Math.hypot(x - this.camp.x, z - this.camp.z) < 1.2 || Math.hypot(x - yard.x, z - yard.z) < 0.95) return true;
      for (const c of cars) if (inCarBox(c, x, z, 0.12)) return true;
      const cx = Math.floor(x), cz = Math.floor(z);
      for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const [tx, tz, r] of trees.get(i * 4099 + j) ?? []) if ((tx - x) ** 2 + (tz - z) ** 2 < r * r) return true;
      return false;
    };
    // steep ground and the unlevel: a path takes the easy way round
    const cost = (x: number, z: number): number => (this.walls.atStair(x, z) ? 1.4 : 1 + 6 * Math.max(0, slope(x, z) - 0.1));
    return { blocked, cost, hard };
  }

  /** The people's route finding world, rebuilt when the paths are (the layout, the cars, the wear). */
  private _walkCache: { key: string; w: NetWorld } | null = null;
  private _walkWorld(): NetWorld {
    const key = `${this.paths.version}|${this._carKey}|${this.treeSpecs.length}|${this._runs.length}|${this.walls.version}`;
    if (this._walkCache?.key !== key) this._walkCache = { key, w: this._pathWorld() };
    return this._walkCache.w;
  }

  /** The way person `from` walks to `to`: the trails when they lead there, round buildings, the wall and cliffs when the straight line crosses them, else straight ([]). */
  private _walkVia(fx: number, fz: number, tx: number, tz: number): Array<[number, number]> {
    const w = this._walkWorld();
    if (!w.hard) return this.paths.via(fx, fz, tx, tz);
    return walkRoute([fx, fz], [tx, tz], { blocked: w.blocked, hard: w.hard, cost: w.cost }, detour => this.paths.via(fx, fz, tx, tz, detour));
  }

  /** What the world adds to the stops: the camp, the delivery yard, the compound's own gate (when the drive does not go through it), a landing on the creek bank. */
  private _pathExtras(game: GameState): PathExtras {
    const done = game.structures.filter(s => !s.unplaced && s.stage >= 5);
    const home = done.filter(s => (KIT[s.kind]?.sleeps ?? 0) > 0).sort((a, b) => KIT[b.kind].sleeps - KIT[a.kind].sleeps)[0];
    const ex: PathExtras = { camp: this.camp, yard: this.access.yard };
    const garage = done.find(s => s.kind === 'gate_garage');
    if (!garage) {
      const g = wallGate(game);
      if (g && distToLine(this.access.driveQ, g.x, g.z) > 1.2) ex.gate = g;
    }
    if (this.parcel.creekHome && home) {
      const cz = this.parcel.creek.zAt(home.x), side = Math.sign(home.z - cz) || 1, half = this.parcel.creek.halfWidth;
      if (Math.abs(home.z - cz) < 22) ex.creek = { x: home.x - 1.5, z: this.parcel.creek.zAt(home.x - 1.5) + side * (half + 0.55) };
    }
    return ex;
  }

  // ── Lived-in (game/lived) ─────────────────────────────────────────────
  private _treeCells: { for: readonly ParcelTree[]; cells: Map<number, Array<[number, number, number]>> } | null = null;
  private _trunks(): Map<number, Array<[number, number, number]>> {
    if (this._treeCells?.for !== this.treeSpecs) {
      const cells = new Map<number, Array<[number, number, number]>>();
      for (const t of this.treeSpecs) { const k = Math.floor(t.x) * 4099 + Math.floor(t.z); (cells.get(k) ?? cells.set(k, []).get(k)!).push([t.x, t.z, 0.07 * t.scale + 0.03]); }
      this._treeCells = { for: this.treeSpecs, cells };
    }
    return this._treeCells.cells;
  }

  /**
   * Is a prop of radius r at (x, z) in the way of something fixed? 'out': nothing of another building's body or front yard, the camp, the
   * yard, the drive; a prop may touch its own building. 'porch': only bodies, water, walls and trunks (a mat on a porch, the mailbox at the
   * road). 'inside': as 'out' but inside the building's own plot (a garden gate, a scarecrow in the field).
   */
  private _livedBlocked(x: number, z: number, r: number, self: string, mode: Mode): boolean {
    const inHome = x > this.home.x0 && x < this.home.x1 && z > this.home.z0 && z < this.home.z1;
    if (!inHome && !this._inOwned(x, z) && mode !== 'porch') return true;
    if (this.parcel.creekHome && Math.abs(z - this.parcel.creek.zAt(x)) < this.parcel.creek.halfWidth + 0.2 + r * 0.3) return true;
    for (const b of this._built.values()) {
      const def = KIT[b.placed.kind];
      if (b.under || def.level === 'underground') continue;
      const body = footprint(def, b.placed.x, b.placed.z, b.placed.rot, false);
      if (b.placed.id === self) {
        if (mode !== 'inside' && x > body.x0 && x < body.x1 && z > body.z0 && z < body.z1) return true;
        continue;
      }
      const f = mode === 'porch' ? body : footprint(def, b.placed.x, b.placed.z, b.placed.rot, true), pad = r + 0.04;
      if (x > f.x0 - pad && x < f.x1 + pad && z > f.z0 - pad && z < f.z1 + pad) return true;
    }
    if (this._perimeterBlocked(x, z, r * 0.8) || this.walls.blocks(x, z)) return true;   // (a retaining wall is no place for a prop or a pet either)
    const cells = this._trunks(), cx = Math.floor(x), cz = Math.floor(z);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) for (const [tx, tz, tr] of cells.get(i * 4099 + j) ?? []) if ((tx - x) ** 2 + (tz - z) ** 2 < (tr + r * 0.6) ** 2) return true;
    if (mode === 'porch') return false;
    if (this.onCamp(x, z, r) || Math.hypot(x - this.access.yard.x, z - this.access.yard.z) < 0.9 + r) return true;
    if (mode === 'out' && this.onAccess(x, z, r)) return true;
    const tank = this.atmos.tankSpot;
    if (tank && Math.hypot(x - tank.x, z - tank.z) < 0.4 + r) return true;
    for (const t of this._tentPos) if (Math.hypot(x - t.x, z - t.z) < 0.35 + r) return true;
    for (const c of this._cars) if (inCarBox(c, x, z, r + 0.06)) return true;
    return false;
  }

  /** The mailbox at the mouth of the drive (road side, facing the road) and the sign just inside the gate. */
  private _livedGate(): { mail: { x: number; z: number; rot: number }; sign: { x: number; z: number; rot: number } } | null {
    if (!this._drive) return null;
    const gz = this.access.gate.z;
    return {
      mail: { x: this.county.x(gz) - ROAD_W / 2 - 0.2, z: gz + DRIVE_W / 2 + 0.24, rot: Math.PI / 2 },
      sign: { x: PARCEL_SIZE - 0.8, z: gz - DRIVE_W / 2 - 0.45, rot: Math.PI / 2 },
    };
  }

  /** A flared gravel apron where the drive leaves the road (the truck's turn, the wheel-worn mouth). */
  private _driveApron(): Array<{ x: number; z: number; w: number; d: number; rot: number }> {
    if (!this._drive) return [];
    const gz = this.access.gate.z;
    return [{ x: this.county.x(gz) - ROAD_W / 2 - 0.5, z: gz, w: DRIVE_W + 0.6, d: 0.95, rot: Math.PI / 2 }];
  }

  /** The tint the tracks wear through: the region's grass, its bare earth. */
  private _pathLook(): { grass: number; soil: number } {
    const look = regionLookFor(this.regionWorld.kind);
    const lerp = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
    return { grass: look.grass !== undefined && look.dryGrass !== undefined ? lerp(look.grass, look.dryGrass, 0.5) : (look.grass ?? 0x6c7550), soil: lerp(0x6b5a43, 0xa38d65, Math.min(1, look.dry * 0.8 + 0.2)) };
  }

  /** Is (x, z) on the camp (plus `pad`)? */
  onCamp(x: number, z: number, pad = 0): boolean {
    return Math.hypot(x - this.camp.x, z - this.camp.z) < 1.1 + pad;
  }

  /** Is (x, z) within `pad` of a built footprint (porch included)? */
  onBuilding(x: number, z: number, pad = 0, withPorch = true): boolean {
    for (const b of this._built.values()) {
      const r = withPorch ? b.fpPorch : b.fpBody;
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
    let pad: Pad | null = !below || (isEntry(def) && p.kind !== 'bunker_floorhatch') ? { x0: r.x0 - 0.05, z0: r.z0 - 0.05, x1: r.x1 + 0.05, z1: r.z1 + 0.05, y, skirt: below ? 0.4 : 0.9 } : null;
    // a pad cut into a slope is held by a dry-stack wall (sim/retainPlan): a flat apron round the building on the walled sides, the terrain eased only over the wall
    let wall: PadPlan | null = null;
    if (!below && pad && this.parcel.lot && !WALLLESS.test(p.kind)) {
      const near = [...this._built.values()].filter(b => !b.under && b.placed.id !== p.id).map(b => b.wall?.rect ?? b.fpPorch);
      // the ground as it is now (earlier pads and the road bed included), so a wall never floats over or sinks into what they graded
      wall = planPad(r, this._naturalH, near, this.parcel.height);
      // a drive or the county road crossing the pad leaves it with the old gentle skirt: no wall may stand across a way in
      if (wall.runs.length && this._touchesAccess(wall.rect, RW_ACCESS_MARGIN)) wall = null;
      if (wall && wall.runs.length) pad = { x0: wall.rect.x0, z0: wall.rect.z0, x1: wall.rect.x1, z1: wall.rect.z1, y: wall.y, skirt: wall.skirt };
      else wall = null;
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
      light = new THREE.PointLight(def.floodlit ? 0xfff4e4 : 0xffc27a, 0, def.floodlit ? 5 : Math.hypot(def.cellsX, def.cellsZ) * CELL * 0.6 + 0.1, def.floodlit ? 1.6 : 2);
      light.position.set(def.light[0], def.floorY + def.light[1], def.light[2]);
      light.visible = false;
      group.add(light);
    }
    // a plan nobody has started is laid out in lime on the ground, so it reads from the air (the stakes alone don't)
    if (!below) group.add(planMark(def));
    this._built.set(p.id, { placed: p, group, smoke, key: '', finished: false, padY: y, light, services: '000', opts, under, lod: below ? [] : this._lodLayers(group), far: false, fpPorch: r, fpBody: footprint(def, p.x, p.z, p.rot, false), wall });
    if (pad) this.terrain.refresh(this._terrainSource, pad.x0 - pad.skirt - 1, pad.z0 - pad.skirt - 1, pad.x1 + pad.skirt + 1, pad.z1 + pad.skirt + 1);
    if (below) this._syncUnderground();
    if (this._batchDepth > 0) this._plantDirty = true; else if (this._quality) this._plant(this._quality);
    this._applyView(this._built.get(p.id)!);
    this._ws.invalidateShadows();
  }

  private _batchDepth = 0;
  /**
   * Hold the tree re-plant back while `fn` runs and do it once at the end (a bulk placement of a hundred pieces re-planted the whole
   * forest, the far woods, the shrubs and the farms after every piece: seconds of main thread for the same final picture).
   */
  bulk<T>(fn: () => T): T {
    this._batchDepth++;
    try { return fn(); } finally {
      this._batchDepth--;
      if (this._batchDepth === 0 && this._plantDirty) { this._plantDirty = false; if (this._quality) this._plant(this._quality); }
    }
  }
  private _plantDirty = false;
  private readonly _naturalH = (x: number, z: number) => this.parcel.natural(x, z).h;

  /** A bunker room's doorways (its neighbors) and the ground above its surface point. */
  /** Hardening fitted per bunker room (from the sim), and its key. */
  private readonly _harden = new Map<string, { key: string; tiers: NonNullable<Structure['hardening']> }>();

  private _underOpts(p: Placed, placed: readonly Placed[], datum: number): BuildOpts {
    const def = KIT[p.kind];
    // the surface point: the stairwell's top end, otherwise the middle
    const [sx, sz] = p.kind === 'bunker_stairs' ? rotQ(0, def.cellsZ * CELL / 2 - 0.25, p.rot) : [0, 0];
    // a floor hatch: its top is the floor of the house it is in
    const host = p.kind === 'bunker_floorhatch' ? this._hostOf(p) : null;
    // (a lodge's hatch opens in its basement slab, a few cm over the pad; any other house's in its floor)
    const ground = host ? host.padY + (KIT[host.placed.kind].walkoutFall ? 0.012 : KIT[host.placed.kind].floorY) : this.parcel.sample(p.x + sx, p.z + sz).h;
    // escape tunnels leave through a blast door, barred from the room side
    const starts = this._runs.filter(r => r.kind === 'escape_tunnel').map(r => r.pts[0]);
    const tunnelDoors = tunnelDoorsOf(p, starts);
    const blast = Object.keys(tunnelDoors) as Side[];
    const harden = this._harden.get(p.id)?.tiers;
    const root = bunkerRoots(placed).get(p.id) ?? null;
    return {
      doors: { ...doorsOf(p, placed), ...tunnelDoors }, depth: Math.round((ground - datum) * 1000) / 1000, ...(blast.length ? { blast } : {}), ...(harden && Object.keys(harden).length ? { harden } : {}),
      ...(root && this._air.has(root) ? { air: true } : {}), ...(this._power ? { power: true } : {}), ...(this._morale ? { morale: this._morale } : {}),
    };
  }

  /** The built house a floor hatch is in (the host of its opening), or null. */
  private _hostOf(p: Placed): Built | null {
    const h = floorHatchHost(p.x, p.z, [...this._built.values()].filter(b => !b.under).map(b => b.placed));
    return (h && this._built.get(h.id)) || null;
  }

  // ── Floor hatches: the opening in the house's floor, the lid swinging ──
  /** QA: hold every floor hatch's lid at this opening (0 shut, 1 open) at once; null = the game's own state. */
  qaLid: number | null = null;
  private readonly _lid = new Map<string, number>();
  private _lidT = -1;
  /** Walking down through a hatch holds its lid open until the walker is back up. */
  private _walkHatch: string | null = null;
  private _hatchKey = '';
  private _syncHatches(game: GameState, t: number): void {
    const dt = this._lidT < 0 ? 0 : Math.min(0.1, Math.max(0, t - this._lidT));
    this._lidT = t;
    const hatches = [...this._built.values()].filter(b => b.placed.kind === 'bunker_floorhatch');
    // openings cut in the floors of the houses that have a finished hatch
    const key = hatches.map(b => `${b.placed.id}:${b.finished ? 1 : 0}`).join();
    if (key !== this._hatchKey) {
      this._hatchKey = key;
      const holes = new Map<string, Array<{ x0: number; z0: number; x1: number; z1: number }>>();
      const ground: Array<[number, number, number, number]> = [];
      for (const b of hatches) {
        if (!b.finished) continue;
        const host = this._hostOf(b.placed); if (!host) continue;
        const plan = hatchPlan(b.opts.depth ?? 0.89), q = (((b.placed.rot - host.placed.rot) % 4) + 4) % 4, th = b.placed.rot * Math.PI / 2;
        // the hole's middle in the world, then in the host's frame
        const cxl = (plan.hole.x0 + plan.hole.x1) / 2, czl = (plan.hole.z0 + plan.hole.z1) / 2;
        const [lx, lz] = this._local(host, b.placed.x + cxl * Math.cos(th) + czl * Math.sin(th), b.placed.z - cxl * Math.sin(th) + czl * Math.cos(th));
        const hx = (plan.hole.x1 - plan.hole.x0) / 2, hz = (plan.hole.z1 - plan.hole.z0) / 2, [ex, ez] = q % 2 ? [hz, hx] : [hx, hz];
        const list = holes.get(host.placed.id) ?? []; list.push({ x0: lx - ex, x1: lx + ex, z0: lz - ez, z1: lz + ez }); holes.set(host.placed.id, list);
        // and the ground under the opening is cut clean through, so the stairwell shows
        const wx = b.placed.x + cxl * Math.cos(th) + czl * Math.sin(th), wz = b.placed.z - cxl * Math.sin(th) + czl * Math.cos(th), gq = (b.placed.rot % 2 + 2) % 2;
        const [gx, gz] = gq ? [hz, hx] : [hx, hz];
        ground.push([wx - gx, wz - gz, wx + gx, wz + gz]);
      }
      this.terrain.setHoles(ground);
      for (const host of this._built.values()) {
        if (host.under) continue;
        const next = holes.get(host.placed.id), cur = host.opts.hatches;
        if (JSON.stringify(next ?? null) === JSON.stringify(cur ?? null)) continue;
        this._rebuild(host, { ...host.opts, hatches: next });
      }
    }
    // the lids: open while the family goes down (an alert) or somebody is walking through, shut otherwise
    const alert = hatchOpen(game);
    for (const b of hatches) {
      if (!b.finished) continue;
      const want = this.qaLid ?? (alert || this._walkHatch === b.placed.id ? 1 : 0), cur = this._lid.get(b.placed.id) ?? 0;
      const next = this.qaLid !== null ? want : cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), dt * 1.4);
      if (Math.abs(next - cur) > 1e-4 || !this._lid.has(b.placed.id) || b.group.userData.lidK !== next) { this._lid.set(b.placed.id, next); b.group.userData.lidK = next; setHatchLid(b.group, next); }
    }
  }

  // ── Bunker life: air from the plant room, power, the family's evenings, the control room's screens ──
  /** Bunkers (by root id) whose plant room is built: their rooms get ducts, and the air handler's lamp goes green. */
  private _air = new Set<string>();
  private _power = false;
  private _morale: { games: boolean; music: boolean; books: boolean } | undefined;
  private _belowSeen = false;
  private _belowCam = false;
  private _bunkerKey = '';
  private _screensKey = '';
  /** Per frame: refresh what the bunker rooms show (rebuilding the ones whose look changed), and redraw the screens while they can be seen. */
  syncBunker(game: GameState, t: number, hour: number): void {
    const key = `${this._built.size}|${this._finishedCount()}|${gearPowered(game) ? 1 : 0}|${(game.stock.games ?? 0) > 0 ? 1 : 0}${(game.stock.instrument ?? 0) > 0 ? 1 : 0}${(game.stock.novels ?? 0) > 0 ? 1 : 0}`;
    if (key !== this._bunkerKey) {
      this._bunkerKey = key;
      const placed = [...this._built.values()].map(b => b.placed), roots = bunkerRoots(placed), air = new Set<string>();
      for (const b of this._built.values()) if (b.under && b.finished && b.placed.kind === 'bunker_plant') { const r = roots.get(b.placed.id); if (r) air.add(r); }
      const power = gearPowered(game), morale = { games: (game.stock.games ?? 0) > 0, music: (game.stock.instrument ?? 0) > 0, books: (game.stock.novels ?? 0) > 0 };
      const mk = JSON.stringify([...air].sort()) + power + JSON.stringify(morale);
      if (mk !== this._screensKey) {
        this._screensKey = mk; this._air = air; this._power = power; this._morale = morale;
        this._syncUnderground();
      }
    }
    // walking down (or back up), or any camera under the ground, changes which rooms can be seen: draw only those
    const cam = this._ws.camera.position, belowCam = cam.y < this.groundAt(cam.x, cam.z) - 0.12;
    if (this._belowSeen !== (this._below || belowCam)) { this._belowSeen = this._below || belowCam; this._belowCam = belowCam; for (const b of this._built.values()) if (b.under) this._applyView(b); }
    // the screens (the control room's wall, the bunkroom's TV): only while one could be on screen (underground view, walking below, or the cutaway)
    const screens = [...this._built.values()].some(b => b.finished && (b.placed.kind === 'bunker_comms' || b.placed.kind === 'bunker_dorm'));
    if (screens && (this._under || this._below || this._view === 'cutaway')) { updateSiteMap(game); updateScreens(game, t, hour); }
    this._syncHatches(game, t);
    this.bunkerFolk.update(game.people, bunkerOccupants(game), this._bunkerSpots(), 'summer');
  }

  /** Every finished room's seats, beds and console chair, in the world. */
  private _bunkerSpots(): WorldSpot[] {
    const out: WorldSpot[] = [];
    for (const b of this._built.values()) {
      if (!b.under || !b.finished) continue;
      const spots = b.group.userData.spots as RoomSpot[] | undefined;
      if (!spots?.length) continue;
      const th = b.placed.rot * Math.PI / 2, c = Math.cos(th), s = Math.sin(th);
      for (const sp of spots) out.push({ ...sp, wx: b.placed.x + sp.x * c + sp.z * s, wz: b.placed.z - sp.x * s + sp.z * c, wy: b.under.datum, face: sp.face + th, room: b.placed.kind });
    }
    return out;
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

  // ── Dome tents in the yard (sim/housing.ts) ───────────────────────────
  readonly tents = new TentsRenderer();
  private _tentPos: Array<{ x: number; z: number; rot: number }> = [];
  /** Pitch a dome tent round the camp for each one somebody sleeps in tonight. */
  syncTents(game: GameState): void {
    const n = tentsPitched(game);
    if (n === 0 && this.tents.group.children.length === 0) { this._tentPos = []; return; }
    if (!this.tents.group.parent) this._ws.scene.add(this.tents.group);
    this._tentPos = tentSpots(this.camp, n, (x, z) => this.onBuilding(x, z, 0.4, false) || this.onAccess(x, z, 0.3) || this.onPerimeterLine(x, z, 0.2));
    this.tents.sync(this._tentPos, this.groundAt);
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
    // the tracks and the yard clutter lie on the ground, not in the cut-away section
    this.paths.enabled = !on;
    this.lived.enabled = !on;
    this.stream.setEdgesVisible(!on);
    for (const [id, g] of this._runGroups) if (['escape_tunnel', 'underground_passage'].includes(this._runs.find(r => r.id === id)?.kind ?? '')) this._applyTunnelView(g.group);
    // a bed of dark earth under the bunkers, so the see-through ground reads as a cut-away section, not sky
    if (on) {
      const y = this._earthY();
      this._earth ??= new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_SIZE + 60, PARCEL_SIZE + 60).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x2e241a, roughness: 1 }));
      this._earth.position.set(PARCEL_SIZE / 2, y, PARCEL_SIZE / 2);
      this._earth.receiveShadow = true;
      this._ws.scene.add(this._earth);
    } else if (this._earth) this._ws.scene.remove(this._earth);
    for (const b of this._built.values()) { b.key = ''; this._applyView(b); }
    this._ws.invalidateShadows();
  }
  /** Height of the earth bed: just under the deepest bunker room or passage (a passage built after the view went on moves it down). */
  private _earthY(): number {
    const floors = [...this._built.values()].filter(b => b.under).map(b => b.under!.datum);
    for (const r of this._runs) if (r.kind === 'underground_passage' && r.pts.length > 1) floors.push(Math.min(...this._pathOf(r).map(p => p.floor)));
    return (floors.length ? Math.min(...floors) : this.groundAt(this.camp.x, this.camp.z) - DEPTH) - 0.08;
  }
  get underground(): boolean { return this._under; }

  /** Open digs over bunker rooms under construction (the terrain is cut, then backfilled). */
  private _pitKey = '';
  private _dig: THREE.Group | null = null;
  private _soilMat: THREE.Material | null = null;
  private _syncPits(list: readonly Structure[]): void {
    const pits: Pit[] = [];
    /** Per open dig: the spoil on its heap (m³) and whether the excavator is working it. */
    const sites: DigSite[] = [];
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
      if (!done && st.stage >= 1 && st.stage <= 4) sites.push({ pit, spoil: Math.round(full * pit.k), machine: st.stage <= 3 && ((st.stage === 1 && pit.k < 1) || (st.stage === 3 && f > 0.5) || (st.stage === 1 && st.supplied)), stage: st.stage, f: Math.round(f * 20) / 20, kind: st.kind, rot: st.rot, datum: b.under.datum, x: st.x, z: st.z });
    }
    // what stands round an open dig changes with the stage: the pit, but also the trucks, formwork, tubes and the fresh mound
    const key = JSON.stringify([pits, sites.map(s => [s.stage, s.f, s.machine])]);
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

  /**
   * The rest of the crew's site: a tipper truck at the edge while the earth goes out (stage 1) and comes back
   * (backfill, tipping its bed), plywood formwork and rebar cages standing in the pit while the walls are poured
   * (stage 2, stripped as the pour finishes), culvert tube lengths on cribbing beside a trench for the tunnel (stage 2).
   */
  private _digCrew(site: DigSite, alongX: boolean, reach: number): void {
    const { pit, stage, f } = site, d = this._dig!;
    const cx = (pit.x0 + pit.x1) / 2, cz = (pit.z0 + pit.z1) / 2;
    const place = (g: THREE.Object3D, x: number, z: number, yaw: number) => { g.position.set(x, this.groundAt(x, z), z); g.rotation.y = yaw; g.traverse(o => { o.userData.own = true; }); d.add(g); };
    if (stage === 1 || (stage === 3 && f > 0.5)) {
      // the truck waits at the end of the pit's long side, nose away from it
      const tx = alongX ? pit.x1 + reach + 0.5 : pit.x1 + reach + 0.45, tz = alongX ? pit.z0 - reach - 0.4 : pit.z0 - reach - 0.1;
      place(buildDumpTruck(stage === 3 ? Math.min(1, (f - 0.5) * 4) % 1 : 0, stage === 1), alongX ? tx : tx, alongX ? tz : tz, alongX ? Math.PI / 2 : 0);
    }
    if (stage === 2 && f < 0.92 && pit.k >= 0.99) {
      const w = pit.x1 - pit.x0 - 0.16, dd = pit.z1 - pit.z0 - 0.16, h = Math.max(0.05, 0.4 * Math.min(1, f * 1.15 + 0.15));
      const fw = buildFormwork(w, dd, h); fw.position.set(cx, site.datum, cz); fw.traverse(o => { o.userData.own = true; }); d.add(fw);
    }
    if (stage === 2 && site.kind === 'bunker_corridor') {
      const tubes = buildTubeSegments(2);
      place(tubes, alongX ? cx : pit.x0 - reach - 1.5, alongX ? pit.z1 + reach + 1.5 : cz, alongX ? Math.PI / 2 : 0);
    }
  }

  /** Bare earth over each open dig, the spoil heap beside it, the excavator at its edge. */
  private _buildDigs(sites: DigSite[]): void {
    if (this._dig) { this._root.remove(this._dig); this._dig.traverse(o => { if ((o as THREE.Mesh).isMesh && o.userData.own) (o as THREE.Mesh).geometry.dispose(); }); }
    this._dig = new THREE.Group();
    if (!this._soilMat) {
      const m = (kitMaterial('soil') as THREE.MeshStandardMaterial).clone();
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      this._soilMat = m;
    }
    for (const site of sites) {
      const { pit, spoil, machine } = site;
      // the backfill mound: over the roof slab while the second half of the roof stage and the fit-out go on (the earth is on, the room is not done)
      if (site.stage === 4 || (site.stage === 3 && site.f > 0.5)) {
        const cx = (pit.x0 + pit.x1) / 2, cz = (pit.z0 + pit.z1) / 2, up = site.stage === 4 ? 1 : Math.min(1, (site.f - 0.5) * 2);
        const mound = new THREE.Mesh(earthMound(pit.x1 - pit.x0 - 0.16, pit.z1 - pit.z0 - 0.16, 0.07 * up).translate(cx, this.groundAt(cx, cz) - 0.01, cz), kitMaterial('soil'));
        mound.castShadow = mound.receiveShadow = true; mound.userData.own = true;
        this._dig.add(mound);
      }
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
      this._digCrew(site, alongX, reach);
    }
    this._root.add(this._dig);
  }

  /** Sync with the game's structures (adds new ones). */
  syncStructures(list: readonly Placed[]): void {
    // a batch of new buildings re-plants the trees once, not once each
    this.bulk(() => { for (const p of list) this.addStructure(p); });
    // one that is gone (an upgraded tower comes down when the new tier is up)
    if (this._built.size > list.length) {
      const keep = new Set(list.map(p => p.id));
      for (const id of [...this._built.keys()]) if (!keep.has(id)) this.removeStructure(id);
    }
  }

  /** Mains power is on (a lit building or the grid): floodlights on the towers shine at night. Set each frame from the game. */
  powered = false;
  /** Towers whose floodlights are lit now (sim/lights.ts: power, mode, blackout, threat). Set each frame from the game. */
  litTowers: ReadonlySet<string> = new Set();

  /** Take a structure down: its scene group, smoke and light. */
  removeStructure(id: string): void {
    const b = this._built.get(id);
    if (!b) return;
    this._ws.scene.remove(b.group);
    b.group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    if (b.smoke) this._ws.scene.remove(b.smoke.points);
    this._built.delete(id);
    this.walls.remove(id);
    this._harden.delete(id);
    if (b.under) this._syncUnderground();
    this._ws.invalidateShadows();
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
      const stages = blueprintOf(st).stages;   // (the slope's and the local material's bill: its hours, not the plain blueprint's)
      const done = st.stage >= stages.length;
      const f = done ? 0 : st.done / stages[st.stage].hours;
      const key = `${st.stage}:${Math.round(f * 200)}:${st.supplied ? 1 : 0}:${st.slumpedAt === undefined ? 0 : 1}`;
      if (key === b.key) continue;
      b.key = key;
      if (b.wall) {
        // the wall behind a graded pad goes up with the foundation (the stage that pays the fieldstone: sim/slope.ts)
        const fi = Math.max(0, stages.findIndex(x => x.id === 'foundation'));
        this.walls.set(st.id, b.wall, st.slumpedAt !== undefined ? 0.375 : done || st.stage > fi ? 1 : st.stage === fi ? f : 0, hashStr(st.id + ':wall'));   // a fallen wall is a heap at the foot (a third of its height)
      }
      showStage(b.group, done ? 5 : st.stage, f, st.supplied);
      const mark = b.group.getObjectByName('planMark');
      if (mark) mark.visible = st.stage === 0;
      if (done !== b.finished) { b.finished = done; if (b.light && !done) b.light.visible = false; this._ws.invalidateShadows(); }
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
    // the evenings' goods (cards, music, paperbacks, toys) show on the table of the main home only: the biggest finished home
    const mainId = [...this._built.values()].filter(b => b.finished && KIT[b.placed.kind].sleeps > 0).sort((a, b) => KIT[b.placed.kind].sleeps - KIT[a.placed.kind].sleeps)[0]?.placed.id, goods = houseGoods(game), gk = goodsKey(goods);
    for (const b of this._built.values()) {
      if (!b.finished) continue;
      const sv = serviceOf(game, p, b.placed.id);
      const opts = { plumbed: sv.plumbed, wired: sv.wired, septic: sv.septic };
      // wired but no power yesterday (a blackout, a flat battery): back to lamplight
      const powered = sv.wired && game.utilities.lit.includes(b.placed.id);
      const mine = b.placed.id === mainId && gk !== '000000' ? gk : '';
      const key = `${+opts.plumbed}${+opts.wired}${+opts.septic}${+powered}${mine}`;
      if (key === b.services) continue;
      const geo = key.slice(0, 3) !== (b.services ?? '000').slice(0, 3) || key.slice(4) !== (b.services ?? '').slice(4);
      b.services = key;
      if (b.light && !b.under) b.light.color.set(powered ? 0xfff0d8 : 0xffc27a);
      if (!geo || (key.startsWith('000') && !mine && !b.group.userData.opts?.plumbed && !b.group.userData.opts?.wired && !b.group.userData.opts?.goods)) continue;
      this._rebuild(b, { ...b.opts, ...opts, goods: mine ? goods : undefined });
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
    b.lod = b.under ? [] : this._lodLayers(g);
    b.far = false;
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
    // a finished bunker room is drawn only where somebody can see it (the underground view, walking below): from the surface the earth hides it, so skip its draw calls
    // (an entrance stays: its shaft or stairwell is part of the yard)
    if (b.under) b.group.visible = !b.finished || this._under || this._below || this._belowCam || isEntry(KIT[b.placed.kind]);
    for (const o of b.group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const layer = m.userData.layer as CabinLayer;
      const ud = m.userData as { baseMat?: THREE.Material };
      ud.baseMat ??= m.material as THREE.Material;
      // x-ray: the shell goes see-through, the furniture stays solid
      const see = v === 'ghost' || (v === 'xray' && XRAY_LAYERS.includes(layer));
      m.material = see ? xrayOf(ud.baseMat) : ud.baseMat;
      m.castShadow = !see && !['kit_glass', 'kit_string'].includes(ud.baseMat.name) && !ud.baseMat.name.startsWith('kit_glow');
      if (layer === 'cutwalls') m.visible = v === 'cutaway' && b.finished;
      else if (v === 'cutaway' && CUTAWAY_HIDE.includes(layer) && (b.finished || layer !== 'walls')) m.visible = false;
      // seen from far off, the inside of an enclosed building is hidden (no draw, no shadow); only in the plain exterior view
      else if (b.far && v === 'full' && b.lod.includes(layer)) m.visible = false;
    }
  }

  /** The layers an enclosed building can drop when far (see buildkit/buildingLod). */
  private _lodLayers(group: THREE.Group): string[] {
    const meshes = group.children.filter(o => (o as THREE.Mesh).isMesh).map(o => {
      const m = o as THREE.Mesh;
      return { layer: m.userData.layer as string, material: ((m.userData.baseMat as THREE.Material | undefined) ?? (m.material as THREE.Material)).name };
    });
    return farHiddenLayers(meshes, (group.userData.keep ?? []) as string[]);
  }

  private _lodClock = 0;
  /** Every few frames: buildings far from the camera lose their hidden layers; near ones get them back. */
  private _updateBuildingLod(dt: number): void {
    this._lodClock -= dt;
    if (this._lodClock > 0) return;
    this._lodClock = 0.15;
    const cam = this._ws.camera.position, tier = this._quality ?? 'medium';
    for (const b of this._built.values()) {
      if (!b.lod.length) continue;
      const far = b.finished && !b.under && this._view === 'full' && !this._under && isFar(Math.hypot(cam.x - b.group.position.x, cam.y - b.group.position.y, cam.z - b.group.position.z), b.far, tier);
      if (far === b.far) continue;
      b.far = far;
      // back to near: re-show every layer at the building's stage (the next syncProgress), far: hide now
      b.key = '';
      if (far) this._applyView(b);
    }
  }

  /** Lamplight inside finished buildings: a low fill by day, warm lamps at night. */
  /** The building lights that were on in the last pick (the budget in game/lightPool keeps the best few). */
  private _litNow = new Set<string>();
  private _lightClock = 0;
  private _updateLights(dt: number): void {
    const night = 1 - this.air.daylight;
    const lit = this.air.hour > 5.5 && this.air.hour < 23;
    // who is on is picked a few times a second; the intensities are set every frame
    this._lightClock -= dt;
    const pick = this._lightClock <= 0;
    if (pick) this._lightClock = 0.2;
    const cands: LightCandidate[] = [];
    const cam = this._ws.camera.position;
    const above = cam.y > this.groundAt(cam.x, cam.z) - 0.12;
    for (const b of this._built.values()) {
      if (!b.finished || !b.light) continue;
      // bunker rooms are lit by their bulkhead lamps day and night
      if (b.under) {
        // scaled to the room: the same lamps light a small vestibule and a big bunkroom alike
        const def = KIT[b.placed.kind], area = def.cellsX * def.cellsZ / 4;
        // warm, low lamplight (incandescent-ish), not a bright work light
        b.light.intensity = (this._under ? 0.25 : 0.48) * Math.min(1, 0.2 + 0.8 * area);
        b.light.color.set(0xffd49e);
        if (pick) this._noteLight(cands, b, above);
        continue;
      }
      // a tower's floodlights: hard white over the approach at night, only with power (the lenses glow with them)
      if (KIT[b.placed.kind].floodlit) {
        const on = this.litTowers.has(b.placed.id) && night > 0.35;
        b.light.intensity = on ? 8 * night : 0;
        const bulb = b.group.getObjectByName('bldg_interior_bulb');
        if (bulb) bulb.visible = on;
        if (pick) this._noteLight(cands, b, above);
        continue;
      }
      // the room as the household keeps it tonight (atmosphere/nightLife: up, asleep, on watch, away)
      const room = this.atmos.room(b.placed.id);
      const home = KIT[b.placed.kind].sleeps > 0;
      const fill = this._view === 'full' ? 0.25 : 0.12;
      b.light.intensity = room !== undefined ? fill * (0.3 + 0.7 * this.air.daylight) + room * 1.4 * night : fill + (home ? (lit ? night * 1.25 : night * 0.25) : night * 0.1);
      if (pick) this._noteLight(cands, b, above);
    }
    // only the lights that can matter stay on (every light costs every lit pixel); a fixed count, so no recompiles
    if (!pick) return;
    const on = pickLights(cands, LIGHT_BUDGET[this._quality ?? 'medium']);
    for (const b of this._built.values()) if (b.light && b.finished) b.light.visible = on.has(b.placed.id);
    this._litNow = on;
  }
  /** One building's light as a candidate for the budget. A bunker room seen from above ground, or a house seen from the underground view, cannot be seen. */
  private _noteLight(cands: LightCandidate[], b: Built, above: boolean): void {
    const cam = this._ws.camera.position;
    const weight = b.under ? (above && !this._under ? 0.03 : 1) : (this._under ? 0.15 : 1);
    cands.push({ id: b.placed.id, intensity: b.light!.intensity, dist: Math.hypot(cam.x - b.group.position.x, cam.y - b.group.position.y, cam.z - b.group.position.z), was: this._litNow.has(b.placed.id), weight });
  }

  /** Vehicles: in their bays and the yard, and out the gate on a run. */
  updateFleet(dt: number, game: GameState, speedK: number): void {
    const ctx: FleetCtx = {
      host: id => { const b = this._built.get(id); return b ? { x: b.placed.x, z: b.placed.z, rot: b.placed.rot, kind: b.placed.kind } : null; },
      yard: this.camp,
      drive: this.access.drive,
      ground: this.groundAt,
    };
    this.fleet.update(dt, game, ctx, speedK);
    // the cars in the open yard are in the way of walks and yard props (re-found only when the fleet changes)
    const key = (game.vehicles ?? []).map(v => `${v.id}${v.kind}${v.away ? 'a' : ''}`).join() + `|${[...this._built.keys()].length}`;
    if (key !== this._carKey) { this._carKey = key; this._cars = this.fleet.openBoxes(game, ctx); this.paths.invalidate(); }
  }
  private _cars: CarBox[] = [];
  private _carKey = '';

  /** Wildlife: the animals the sim says live here, grazing, wandering and bolting from people (and dogs). */
  updateWildlife(dt: number, game: GameState, speedK: number): void {
    const threats: Array<[number, number]> = this.family.positions().filter(p => this.family.shown.has(p.id)).map(p => [p.x, p.z] as [number, number]);
    for (const d of this.dogPositions()) threats.push(d);
    const creek = this.parcel.creekHome ? this.parcel.creek : null;
    this.wildlife.update(dt, game, game.clock.t, {
      ground: this.groundAt,
      blocked: (x, z) => this.onBuilding(x, z, 0.25) || this.onCamp(x, z, 0.5) || this.onAccess(x, z, 0.3),
      creek,
      threats,
      cam: { x: this._ws.camera.position.x, z: this._ws.camera.position.z },
    }, speedK);
  }
  /** Where dogs are (animals bolt from them too); none until the dogs renderer exists. */
  dogPositions(): Array<[number, number]> { return this.dogs.positions().map(d => [d.x, d.z] as [number, number]); }

  private _bedKey = '';
  private _beds: BedSlot[] = [];
  /**
   * The beds the sick can be put in, in world units (game/people/sickbayPlan): every marked bed of every finished building,
   * with which sides of it have room to stand. Worked out again only when a building is finished, rebuilt or taken away.
   */
  private _bedSlots(): BedSlot[] {
    const withBeds = [...this._built.values()].filter(b => b.finished && (b.group.userData.sickSlots as SickSlot[] | undefined)?.length);
    const key = withBeds.map(b => b.group.uuid).join();
    if (key === this._bedKey) return this._beds;
    this._bedKey = key;
    const out: BedSlot[] = [];
    // the home with the most beds first (the home), then the rest by id; the bunker's medical corner is flagged
    withBeds.sort((a, b) => KIT[b.placed.kind].sleeps - KIT[a.placed.kind].sleeps || a.placed.id.localeCompare(b.placed.id));
    for (const b of withBeds) {
      b.group.updateMatrixWorld(true);
      const cs = (b.group.userData.colliders as Collider[] | undefined) ?? [];
      (b.group.userData.sickSlots as SickSlot[]).forEach((s, n) => {
        const o = new THREE.Vector3(...s.o).applyMatrix4(b.group.matrixWorld);
        const f = new THREE.Vector3(...s.foot).transformDirection(b.group.matrixWorld), sd = new THREE.Vector3(...s.side).transformDirection(b.group.matrixWorld);
        const clear = (k: number) => !hitsColliders(cs, s.o[0] + s.side[0] * k * 0.19, s.o[2] + s.side[2] * k * 0.19, 0.03);
        out.push({ key: `${b.placed.id}:${n}`, bay: b.placed.kind === 'bunker_medical', x: o.x, y: o.y, z: o.z, fx: f.x, fz: f.z, sx: sd.x, sz: sd.z, floorY: o.y - 0.58 * M, openA: clear(1), openB: clear(-1) });
      });
    }
    this._beds = out;
    return out;
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
    const refs = [...this._built.values()].filter(b => b.finished).map(b => ({ kind: b.placed.kind, site: site(b.placed.id)! }));
    this.paths.update(game, performance.now());
    const ctx: GoalCtx = {
      camp: this.camp, site, home: homeB ? site(homeB.placed.id) : null, tree, yard: this.access.yard, sleepAt: i => sleepSpotFor(game, i), tentAt: n => this._tentPos[n],
      footing: (x, z) => walkFactor(this.paths.surfaceAt(x, z), this._underfoot), via: (fx, fz, tx, tz) => this._walkVia(fx, fz, tx, tz),
      ...dailyCtx(refs, game, this.access.yard, seasonState.params.cold < 0.35),
    };
    const fx = yardFx(game, hour);
    this._yard.update(this._clock, fx.lights, fx.smoke);
    const season = (seasonState.visual === 'winter' && !seasonState.climate.freeze ? 'fall' : seasonState.visual) as WearSeason;
    this.family.update(dt, game.people, game.personState, hour, game.clock.t, ctx, this.walkHeight, season, speedK, sickbayPlan(game, this._bedSlots()));
    const dctx: DogCtx = {
      home: ctx.home, camp: this.camp, gate: this.access.gate, yard: this.access.yard, atGate: !!game.gate.pending,
      person: id => (this.family.shown.has(id) ? this.family.poseOf(id) : null),
      via: (fx, fz, tx, tz) => this._walkVia(fx, fz, tx, tz),
    };
    this.dogs.update(dt, game, hour, game.clock.t, dctx, this.walkHeight, speedK);
    // crops stand in the ground from planting (mid-May) to the last of the harvest (late October); bare soil the rest of the year
    const doy = calendarOf(game.clock).doy, [c0, c1] = seasons(regionFor(game.site)).crops, growing = doy >= c0 && doy < c1;
    const cal = calendarOf(game.clock);
    for (const b of this._built.values()) {
      if (isOrchard(b.placed.kind)) {
        // the orchard (sim/orchard.ts `fruitLook`): each kind leafs out before its own bloom, blossoms in its own days (a hard frost on the open blossom
        // browns it), and shows ripe fruit around its picking weeks once the trees bear and the frost left a crop
        const st = game.structures.find(x => x.id === b.placed.id);
        const look = new Map<Fruit, ReturnType<typeof fruitLook>>();
        for (const f of FRUITS) look.set(f, st && b.finished ? fruitLook(game, st, f, doy, cal.year) : { leaf: false, bloom: false, fruit: false });
        const leafy = [...look.values()].some(l => l.leaf);
        for (const o of b.group.children) {
          const name = ((o as THREE.Mesh).userData.baseMat as THREE.Material | undefined)?.name ?? ((o as THREE.Mesh).material as THREE.Material | undefined)?.name;
          if (o.userData.layer === 'interior' && (name === 'kit_hedge' || name === 'kit_hedge2')) o.visible = leafy && b.finished;
          if (o.userData.layer !== 'decor') continue;
          const fruitOf: Record<string, Fruit> = { kit_fruit: 'apple', kit_paint_yellow: 'pear', kit_fruit_cherry: 'cherry', kit_fruit_plum: 'plum' };
          const bloomOf: Record<string, Fruit> = { kit_blossom_apple: 'apple', kit_blossom_pear: 'pear', kit_blossom_cherry: 'cherry', kit_blossom_plum: 'plum' };
          const fr = name ? fruitOf[name] : undefined, bl = name ? bloomOf[name] : undefined;
          if (fr) o.visible = look.get(fr)!.fruit && look.get(fr)!.leaf;
          else if (bl) o.visible = look.get(bl)!.bloom;
        }
        continue;
      }
      if (b.placed.kind === 'pond') { this._pondLife(b, game); continue; }
      if (b.placed.kind === 'sheep_barn') { this._flock(b, game); continue; }
      if (b.placed.kind !== 'garden' && b.placed.kind !== 'field') continue;
      for (const o of b.group.children) {
        const name = ((o as THREE.Mesh).userData.baseMat as THREE.Material | undefined)?.name ?? ((o as THREE.Mesh).material as THREE.Material | undefined)?.name;
        if (name === 'kit_crop' || name === 'kit_grain' || (b.placed.kind === 'field' && name === 'kit_straw')) o.visible = growing && (o.userData.layer !== 'interior' || b.finished);
      }
    }
    // the fire pit (camp cookfire, evenings sat out) is lit by the atmosphere (atmosphere/nightLife.firePitLit)
  }

  /** The pond's fish and crayfish: shown in proportion to the stock (the first meshes in each draw order show first). */
  private _pondLife(b: Built, game: GameState): void {
    const p = game.farm?.ponds?.[b.placed.id];
    const trout = b.finished && p ? Math.min(1, p.trout / 400) : 0, cray = b.finished && p ? Math.min(1, p.crayfish / 1200) : 0;
    for (const o of b.group.children) {
      const m = o as THREE.Mesh, name = (m.material as THREE.Material | undefined)?.name;
      if (name !== 'kit_fish' && name !== 'kit_crayfish') continue;
      const k = name === 'kit_fish' ? trout : cray, n = m.userData.vertexCount as number;
      m.visible = k > 0.001;
      // whole fish only: each trout is 4 triangles (12 vertices), each crayfish 2 spheres, so round to a fish
      const per = name === 'kit_fish' ? 12 : n / 14;
      m.geometry.setDrawRange(0, Math.max(1, Math.round(n * k / per)) * per);
    }
  }

  /** The flock in the sheep barn's paddock: ten sheep drawn, shown by head count (1 per 3 head, a pasture sheep for each). */
  private _flock(b: Built, game: GameState): void {
    const head = b.finished ? Math.floor(game.stock.sheep ?? 0) : 0;
    for (const o of b.group.children) {
      const m = o as THREE.Mesh, name = (m.material as THREE.Material | undefined)?.name;
      if (m.userData.layer !== 'decor' || (name !== 'kit_sheepwool' && name !== 'kit_wood_dark')) continue;
      m.visible = head > 0;
      const n = m.userData.vertexCount as number, shown = Math.min(10, Math.ceil(head / 3)) / 10;
      const per = name === 'kit_sheepwool' ? n / 30 : n / 60;
      m.geometry.setDrawRange(0, Math.max(1, Math.round(n * shown / per)) * per);
    }
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
      if (Math.abs(lx) < hw && Math.abs(lz) < hd && def.category !== 'bunker' && (def.category !== 'food' || b.placed.kind === 'greenhouse' || b.placed.kind === 'greenhouse_heated' || b.placed.kind === 'sheep_barn')) return b.padY + Math.max(0, def.floorY);
    }
    return this._driveY(x, z) ?? this.groundAt(x, z);
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
      if ((r.kind !== 'escape_tunnel' && r.kind !== 'underground_passage') || r.finishedAt === null) continue;
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
    if (kind === 'bunker_floorhatch') {
      // down through the opening in the house floor (the lid swings up as you step on it), up from the foot of the last flight
      const plan = hatchPlan(b.opts.depth ?? 0.89), [fx, fz] = plan.foot, f = plan.flights[2];
      if (!this._below) {
        if (r.lx > plan.hole.x0 && r.lx < plan.hole.x1 && r.lz > plan.hole.z0 && r.lz < plan.hole.z1) { this._below = true; this._walkHatch = b.placed.id; return toWorld(fx, fz - 0.05); }
      } else if (Math.abs(r.lx - f.x) < FLIGHT_W / 2 && r.lz > plan.flights[2].zTo - 0.012) {
        this._below = false; this._walkHatch = null;
        return toWorld(plan.top[0], plan.top[1]);
      }
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
    this._updateLights(dt);
    this._updateBuildingLod(dt);
    this.walls.update(this._ws.camera.position, this._quality ?? 'medium', this.groundAt, dt);
    if (this.walls.version !== this._wallVer) { this._wallVer = this.walls.version; this.paths.invalidate(); }
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
    this.bunkerFolk.dispose();
    this.dogs.dispose();
    this.fleet.dispose();
    this.wildlife.dispose();
    this._yard.dispose();
    this.atmos.dispose();
    this.paths.dispose();
    this.lived.dispose();
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
  const f = b.fpBody;
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

