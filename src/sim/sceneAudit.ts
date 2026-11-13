/**
 * Whole-scene audit (docs/DECISIONS.md, "Scene audit"): individually sound structures that combine badly. Builds a real compound headless on the real
 * ground (the game's own ParcelTerrain, road plan, camp, starter planner, pad rule and what-came-with-the-land placement: no fixtures) and reports what
 * does not fit: footprints on water or off the lot, buildings on each other or on a retaining apron, a building hovering over or buried in its own
 * graded pad, doors that open on a wall, a cliff or the drive, the drive or county road through a building, trees growing through a house, walls across
 * the creek with no crossing, props and livestock inside buildings. Pure and Node-only (no rendering). Used by sceneAudit.test.ts (CI) and by
 * scripts/sceneDump.test.ts-style ad hoc runs (SCENE_DUMP=1).
 */
import { newGame, type GameState } from './state';
import { listings, ANY_WISH, type Site } from './site';
import { makeLotSite } from './lotListing';
import { REGION_IDS, type RegionId } from './regions';
import { ParcelTerrain, PARCEL_SIZE } from '../game/parcel/parcelTerrain';
import { pickCamp, type CampSpot } from '../game/parcel/campSpot';
import { pinSeed } from './lotSeed';
import { roadPlanFor } from './roadState';
import { roadBedOf } from './roadPlan';
import { bedMoves, type RoadBed } from './roadBed';
import { accessFromPlan, distToLine, DRIVE_W, type Access } from '../game/region/access';
import { countyRoad, ROAD_W, type CountyRoad } from '../game/region/countyRoad';
import { ownsAt } from './land';
import { CELL, KIT, footprint, rotQ, snapCenter, type Placed, type SiteQuery } from '../game/buildkit/kit';
import { siteProblem, isUnderground } from '../game/buildkit/underground';
import { padClash } from '../game/buildkit/padRules';
import { sitePad, type SitePad } from '../game/buildkit/sitePad';
import { improvementSpots } from '../game/buildkit/improvementSpots';
import { planProblem, planStructure } from './construction';
import { applyForPermit } from './paperwork';
import { permitAffordable } from './spendGuard';
import { stampHighGround } from './towers';
import { planStarter } from './starterCompound';
import { layPropertyWall } from './propertyWall';
import { RW, wallAt, type Rect } from './retainPlan';
import { integrationProblems, slopeOf, solidSegments, type Problem } from './showcase';
import { PERIMETER, type PerimeterRun } from './perimeter';
import { lengthText } from './units';
import { planParcelTrees } from '../game/parcel/parcelTrees';
import { animalGoal, housesFor, PADDOCK_TRIES, type Home, type StockKind } from '../game/livestock/livestockPlan';

export type Pt = [number, number];

export interface Scene {
  label: string;
  g: GameState;
  site: Site;
  parcel: ParcelTerrain;
  access: Access;
  county: CountyRoad;
  camp: CampSpot;
  query: SiteQuery;
  /** The road's bench and banks as planned. */
  bed: RoadBed;
  /** Pads graded so far, in the order the world grades them (the plan each structure got). */
  pads: Map<string, SitePad>;
}

/** The ground a scene stands on, with no structures: the real parcel, its road plan and bed, the camp. */
export function makeScene(site: Site, seed: number, label: string): Scene {
  const g = newGame(seed, undefined, undefined, { site });
  const ps = pinSeed(site, seed);
  const parcel = new ParcelTerrain(ps, { creek: site.creek, timber: site.timber, region: site.region, lot: site.lot ?? null, home: site.home });
  const plan = roadPlanFor(site, seed, parcel);
  const access = accessFromPlan(plan), camp = pickCamp(parcel, site.home);
  const bed = roadBedOf(plan);
  parcel.setRoadBed(bed);
  const county = countyRoad(site.region, ps);
  const onCamp = (x: number, z: number, pad = 0) => Math.hypot(x - camp.x, z - camp.z) < 1.1 + pad;
  const onAccess = (x: number, z: number, pad = 0): boolean => {
    if (Math.abs(x - county.x(z)) < ROAD_W / 2 + pad) return true;
    const b = access.box, m = DRIVE_W / 2 + pad;
    if (x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m && distToLine(access.driveQ, x, z) < m) return true;
    return Math.hypot(x - access.yard.x, z - access.yard.z) < 0.8 + pad;
  };
  const query: SiteQuery = { height: (x, z) => parcel.natural(x, z).h, owned: (x, z) => ownsAt(g, x, z), water: (x, z) => parcel.isCreek(x, z), blocked: (x, z) => onCamp(x, z) || onAccess(x, z, 0.1) || bedMoves(bed, parcel.natural(x, z).h, x, z) };
  const sc: Scene = { label, g, site, parcel, access, county, camp, query, bed, pads: new Map() };
  return sc;
}

const onAccessOf = (sc: Scene) => (x: number, z: number, pad = 0): boolean => {
  if (Math.abs(x - sc.county.x(z)) < ROAD_W / 2 + pad) return true;
  const b = sc.access.box, m = DRIVE_W / 2 + pad;
  if (x > b[0] - m && x < b[2] + m && z > b[1] - m && z < b[3] + m && distToLine(sc.access.driveQ, x, z) < m) return true;
  return Math.hypot(x - sc.access.yard.x, z - sc.access.yard.z) < 0.8 + pad;
};

/** Grade the pad of every placed structure, in order, the way HomesteadWorld.addStructure does. */
export function gradeAll(sc: Scene): void {
  const { parcel } = sc;
  parcel.setPads([]);
  sc.pads.clear();
  const onAccess = onAccessOf(sc);
  const built: Array<{ p: Placed; rect: Rect; under: boolean }> = [];
  for (const st of sc.g.structures) {
    if (st.unplaced) continue;
    const def = KIT[st.kind];
    if (!def) continue;
    const p: Placed = { id: st.id, kind: st.kind, x: st.x, z: st.z, rot: st.rot };
    const sp = sitePad(def, p, {
      natural: (x, z) => parcel.natural(x, z).h, seen: parcel.height, padHeight: (a, b, c, d) => parcel.padHeight(a, b, c, d),
      isLot: !!parcel.lot,
      touchesAccess: (r, m) => { for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) if (onAccess(r.x0 + (r.x1 - r.x0) * i / 8, r.z0 + (r.z1 - r.z0) * j / 8, m)) return true; return false; },
      waterLevel: x => parcel.lakeY ?? parcel.creek.waterY(x),
      near: built.filter(b => !b.under).map(b => b.rect),
    });
    if (sp.pad) parcel.setPads([...parcel.pads, sp.pad]);
    sc.pads.set(st.id, sp);
    built.push({ p, rect: sp.wall?.rect ?? footprint(def, p.x, p.z, p.rot), under: isUnderground(def) });
  }
}

// ── building the compound ──

/** Place what came with the land, then lay the starter compound ("Place all"), as a first-night player does. */
export function layStarterCompound(sc: Scene, money = 600_000): number {
  const { g } = sc;
  g.money = Math.max(g.money, money);
  const lost = g.structures.filter(x => x.unplaced);
  if (lost.length) {
    const spots = improvementSpots(lost, sc.query, sc.camp, g.structures.filter(x => !x.unplaced).map(x => ({ id: x.id, kind: x.kind, x: x.x, z: x.z, rot: x.rot })));
    for (const st of lost) { const p = spots[st.id]; if (p) { st.x = p.x; st.z = p.z; st.rot = p.rot; st.unplaced = false; } }
    g.structures = g.structures.filter(x => !x.unplaced);
  }
  const geo = { creekZ: (x: number) => sc.parcel.creek.zAt(x), creekHalf: sc.parcel.creek.halfWidth, roadGate: [sc.access.gate.x, sc.access.gate.z] as Pt, drive: sc.access.drive, center: [sc.camp.x, sc.camp.z] as Pt, ground: (x: number, z: number) => sc.parcel.natural(x, z).h };
  const plan = planStarter(g, { query: sc.query, geo });
  let n = 0;
  if (plan.problem) return 0;
  for (const p of plan.pieces.filter(x => !x.later)) {
    if (planProblem(g, p.kind) || !permitAffordable(g, p.kind).ok) continue;
    const st = planStructure(g, p.kind, p.x, p.z, p.rot);
    stampHighGround(st);
    applyForPermit(g, st);
    n++;
  }
  if (plan.yard && !plan.yard.later && layPropertyWall(g, plan.yard.plan, geo) > 0) n++;
  return n;
}

/** Pieces a growing homestead adds round the house, tried in this order at the nearest legal spot (hamlet scale). */
export const HAMLET_KINDS: readonly string[] = ['barn', 'workshop', 'guest_house', 'chicken_coop', 'greenhouse', 'orchard', 'cistern', 'water_tower', 'solar_array', 'generator_shed', 'sheep_barn', 'cottage', 'metal_garage', 'forge', 'root_cellar', 'field', 'garden', 'timber_cabin', 'moms_house', 'apiary', 'wood_oven', 'barnyard', 'greenhouse_heated', 'battery_shed'];

/** Add hamlet-scale pieces: each at the nearest spot the placement rules (and the graded-pad clash rule) allow, as a hand placement would find. */
export function layHamlet(sc: Scene, kinds: readonly string[] = HAMLET_KINDS): number {
  const { g } = sc;
  const home = g.structures.find(s => (KIT[s.kind]?.sleeps ?? 0) > 0) ?? { x: sc.camp.x, z: sc.camp.z };
  const placedList = (): Placed[] => g.structures.filter(s => !s.unplaced).map(s => ({ id: s.id, kind: s.kind, x: s.x, z: s.z, rot: s.rot }));
  let n = 0;
  g.money = Math.max(g.money, 5_000_000);
  for (const kind of kinds) {
    const def = KIT[kind];
    if (!def || planProblem(g, kind)) continue;
    let spot: [number, number, number] | null = null;
    for (let r = 2; r <= 20 && !spot; r += 0.75) {
      const steps = Math.max(8, Math.ceil(2 * Math.PI * r / 0.9));
      for (let i = 0; i < steps && !spot; i++) {
        const a = i / steps * Math.PI * 2;
        for (const rot of [0, 1]) {
          const [sx, sz] = snapCenter(def, home.x + Math.cos(a) * r, home.z + Math.sin(a) * r, rot);
          const pl = placedList();
          if (siteProblem(def, sx, sz, rot, sc.query, pl) === null && !padClash(def, sx, sz, rot, sc.query.height, pl) && !wallCrosses(sc, rectOf({ kind, x: sx, z: sz, rot }))) { spot = [sx, sz, rot]; break; }
        }
      }
    }
    if (!spot) continue;
    const st = planStructure(g, kind, spot[0], spot[1], spot[2]);
    stampHighGround(st);
    applyForPermit(g, st);
    n++;
  }
  return n;
}

/** A drawn solid wall runs through this rect (a hand placement would not put a barn across its own fence). */
function wallCrosses(sc: Scene, r: Rect): boolean {
  for (const run of sc.g.perimeter) {
    const d = PERIMETER[run.kind];
    if (!(d.blocks.people >= 0.5) || d.walkway || d.wallTop || run.pts.length < 3) continue;
    for (const [a, b] of solidSegments(run)) if (segHitsRectLocal(a, b, r, -0.15)) return true;
  }
  return false;
}
const segHitsRectLocal = (a: Pt, b: Pt, r: Rect, m: number): boolean => {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.1));
  for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m) return true; }
  return false;
};

// ── checks ──

const rectOf = (st: { kind: string; x: number; z: number; rot: number }, front = true): Rect => footprint(KIT[st.kind], st.x, st.z, st.rot, front);
const overlap = (a: Rect, b: Rect, m = 0): boolean => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;
const inRect = (r: Rect, x: number, z: number, m = 0): boolean => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
const samples = (r: Rect, n = 4): Pt[] => { const o: Pt[] = []; for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) o.push([r.x0 + (r.x1 - r.x0) * i / n, r.z0 + (r.z1 - r.z0) * j / n]); return o; };

/** Kinds that stand on, in or across water or the drive by design. */
const WET_OK = new Set(['boat_dock', 'marina', 'pond', 'reservoir', 'micro_hydro', 'aquaponics']);
const ON_DRIVE_OK = new Set(['gate_garage', 'motor_court', 'vehicle_yard', 'equipment_yard']);
/** Pieces whose footprint is ground (beds, fields, orchards, ponds), not a roofed building: a bed may touch a bed. */
const GROUND_PIECES = /^(garden|field|orchard|pond|reservoir|terrace_|helipad|barnyard|solar_farm|solar_array|equipment_yard|vehicle_yard|motor_court)/;

export interface SceneProblem extends Problem { scene: string }

/** Everything the scene audit looks for. `trees`: also plant the parcel's trees and test them against the buildings (slow). */
export function sceneProblems(sc: Scene, opts: { trees?: boolean; rawPaddock?: boolean } = {}): SceneProblem[] {
  gradeAll(sc);
  const out: SceneProblem[] = [];
  const add = (what: string, detail: string) => out.push({ scene: sc.label, what, detail });
  const { g, parcel } = sc;
  const surface = g.structures.filter(st => !st.unplaced && KIT[st.kind] && !isUnderground(KIT[st.kind]) && KIT[st.kind].level !== 'both');
  const onAccess = onAccessOf(sc);
  const name = (st: { kind: string; id: string }) => `${st.kind} ${st.id}`;
  for (const st of surface) {
    const def = KIT[st.kind], body = rectOf(st, false), full = rectOf(st);
    const sp = sc.pads.get(st.id);
    // on water / off the lot
    if (!WET_OK.has(st.kind) && !def.waterside) for (const [x, z] of samples(body)) if (parcel.isCreek(x, z)) { add('structure stands in water', `${name(st)} at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`); break; }
    for (const [x, z] of samples(full)) if (!ownsAt(g, x, z)) { add('structure stands off the lot', `${name(st)} at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`); break; }
    // the road's cut banks and fill slopes: a pad graded onto them is buried in the cut or strands over the fill
    if (!ON_DRIVE_OK.has(st.kind) && !def.climbs && !def.waterside && sp?.pad) {
      const pr = sp.pad;
      for (const [x, z] of samples({ x0: pr.x0, z0: pr.z0, x1: pr.x1, z1: pr.z1 }, 8)) if (bedMoves(sc.bed, parcel.natural(x, z).h, x, z)) { add('structure stands on the road\'s cut or fill', `${name(st)} at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`); break; }
    }
    // the drive, the county road, the camp
    if (!ON_DRIVE_OK.has(st.kind)) {
      for (const [x, z] of samples(body, 6)) if (onAccess(x, z, 0)) { add('drive or road runs through a structure', `${name(st)} at ${st.x.toFixed(1)}, ${st.z.toFixed(1)}`); break; }
      if (inRect(full, sc.camp.x, sc.camp.z, 0.3)) add('structure stands on the camp', name(st));
    }
    // hovering over / buried in its own graded pad
    if (sp?.pad && !def.stilts && !def.waterside && !def.climbs) {
      let hi = -Infinity, lo = Infinity, at: Pt = [0, 0];
      for (const [x, z] of samples(body, 6)) { const d = parcel.height(x, z) - sp.y; if (d > hi) { hi = d; at = [x, z]; } lo = Math.min(lo, d); }
      if (hi > HOVER_TOL) add('structure buried: ground rises above its floor', `${name(st)} ground ${lengthText(hi * RW.M)} over the pad near ${at[0].toFixed(1)}, ${at[1].toFixed(1)}`);
      if (lo < -HOVER_TOL) add('structure hovers: ground falls away under its floor', `${name(st)} ground ${lengthText(-lo * RW.M)} under the pad`);
    }
    // the door: it opens at local +z (rot 0). The porch rect in front of it must be clear of other buildings, walls on the ground and the retaining apron
    if (def.sleeps > 0 || def.frontCells > 0) {
      const [dx, dz] = rotQ(0, def.cellsZ * CELL / 2 + Math.min(0.4, def.frontCells * CELL * 0.8), st.rot);
      const door: Pt = [st.x + dx, st.z + dz];
      if (!ownsAt(g, door[0], door[1])) add('door opens off the lot', name(st));
      if (parcel.isCreek(door[0], door[1]) && !WET_OK.has(st.kind)) add('door opens onto water', name(st));
      for (const o of surface) if (o !== st && inRect(rectOf(o, false), door[0], door[1], 0.05)) { add('door opens onto another building', `${name(st)} -> ${name(o)}`); break; }
      for (const [oid, op] of sc.pads) { if (oid === st.id || !op.wall) continue; if (wallAt(op.wall, door[0], door[1], 0.05) > RW.MIN_H) { add('door opens onto a retaining wall', `${name(st)} -> wall of ${oid}`); break; } }
      const slope = slopeOf((x, z) => parcel.height(x, z), door[0], door[1]);
      if (slope > 1.0) add('door opens onto a cliff', `${name(st)} slope ${(slope * 100).toFixed(0)} %`);
    }
  }
  // buildings on each other / on another's retaining apron
  for (let i = 0; i < surface.length; i++) for (let j = i + 1; j < surface.length; j++) {
    const a = surface[i], b = surface[j];
    const ga = GROUND_PIECES.test(a.kind), gb = GROUND_PIECES.test(b.kind);
    if (overlap(rectOf(a, false), rectOf(b, false), 0.1) && !(ga && gb)) add('structures overlap', `${name(a)} and ${name(b)}`);
    for (const [x, y] of [[a, b], [b, a]] as const) {
      const w = sc.pads.get(y.id)?.wall;
      if (!w || GROUND_PIECES.test(x.kind)) continue;
      // the slab of the neighbour's retaining wall runs through this building's body
      {
        // (the wall is the plan the world drew; the placement rule judges from the natural ground, so a sliver of a corner is tolerated: 6 of 81 samples)
        let n = 0, at: Pt = [0, 0];
        for (const [px, pz] of samples(rectOf(x, false), 8)) if (wallAt(w, px, pz, 0) >= RW.MIN_H) { if (!n) at = [px, pz]; n++; }
        if (n >= 6) add('structure stands in another building\'s retaining wall', `${name(x)} in the wall of ${name(y)} near ${at[0].toFixed(1)}, ${at[1].toFixed(1)}`);
      }
    }
  }
  // livestock: the paddock in front of each barn, coop and barnyard (the spots the herd is sent to) is not inside another building, the creek or the road
  const homes: Home[] = surface.filter(st => ['barn', 'barnyard', 'sheep_barn', 'chicken_coop'].includes(st.kind)).map(st => ({ id: st.id, kind: st.kind, x: st.x, z: st.z, rot: st.rot, w: KIT[st.kind].cellsX * CELL, d: KIT[st.kind].cellsZ * CELL, depth: 0 }));
  let self = '';
  const ground = (x: number, z: number): string | null => {
    for (const o of surface) if (inRect(rectOf(o, false), x, z, 0.02) && !(o.id === self)) return `inside ${name(o)}`;
    if (parcel.isCreek(x, z)) return 'in the water';
    if (onAccess(x, z, 0)) return 'on the road';
    return null;
  };
  for (const h of homes) for (const kind of (h.kind === 'chicken_coop' ? ['hen'] : ['cow', 'goat', 'sheep', 'pig']) as StockKind[]) {
    if (!housesFor(kind).includes(h.kind)) continue;
    const bad = new Map<string, number>();
    self = h.id;
    for (let i = 0; i < 24; i++) {
      const goal = animalGoal({ id: `${kind}${i % 8}`, kind }, [h], { hour: 12, raided: false, storm: false, house: [h.x, h.z], clock: i * 0.7 }, undefined, opts.rawPaddock ? undefined : (x, z) => ground(x, z) === null);
      const why = ground(goal.x, goal.z), at = Math.sin(h.rot * Math.PI / 2) * (h.d / 2 + 0.12) + h.x, atz = Math.cos(h.rot * Math.PI / 2) * (h.d / 2 + 0.12) + h.z;
      // (the herd stands at the door when the whole paddock is taken: a door onto water or a wall is reported on its own)
      if (why && Math.hypot(goal.x - at, goal.z - atz) > 0.5) bad.set(why, (bad.get(why) ?? 0) + 1);
    }
    for (const [why, n] of bad) add('livestock turned out into a building, the water or the road', `${kind} of ${h.kind} ${h.id}: ${n} of 24 spots ${why}`);
  }
  void PADDOCK_TRIES;
  // the drive and the county road keep their own levels: a pad (or its skirt) graded across them would hump or dip the road
  {
    const line: Pt[] = [...sc.access.drive, ...Array.from({ length: 40 }, (_, k) => [sc.county.x(k * 1.7), k * 1.7] as Pt)];
    const pads = parcel.pads;
    parcel.setPads([]);
    const base = line.map(([x, z]) => parcel.height(x, z));
    parcel.setPads(pads);
    const worst = new Map<number, { d: number; at: Pt }>();
    line.forEach(([x, z], i) => {
      const d = Math.abs(parcel.height(x, z) - base[i]);
      if (d > 0.06) {
        const k = pads.findIndex(p => x > p.x0 - p.skirt && x < p.x1 + p.skirt && z > p.z0 - p.skirt && z < p.z1 + p.skirt);
        const w = worst.get(k); if (!w || d > w.d) worst.set(k, { d, at: [x, z] });
      }
    });
    const ids = [...sc.pads.entries()].filter(([, v]) => v.pad).map(([id]) => id);
    for (const [k, w] of worst) add('a pad is graded across the drive or the road', `${ids[k] ?? 'pad ' + k}: the road moves ${lengthText(w.d * RW.M)} near ${w.at[0].toFixed(1)}, ${w.at[1].toFixed(1)}`);
  }
  // walls / fences
  const gnd = (x: number, z: number) => parcel.height(x, z);
  // (the showcase's pad-vs-pad rule is stricter than the placement rule: a step under 45 cm is a graded edge, so the pad check is made here at the placement tool's own threshold)
  for (const p of integrationProblems(g, sc.access.drive, (x, z) => parcel.natural(x, z).h)) if (p.what !== 'graded pads overlap at different levels') add(p.what, p.detail);
  const padded = surface.filter(st => sc.pads.get(st.id)?.pad && !KIT[st.kind].climbs);
  for (let i = 0; i < padded.length; i++) for (let j = i + 1; j < padded.length; j++) {
    const a = sc.pads.get(padded[i].id)!, b = sc.pads.get(padded[j].id)!;
    if (overlap(a.pad!, b.pad!, 0.0001) && Math.abs(a.y - b.y) >= RW.MIN_H) add('graded pads overlap at different levels', `${name(padded[i])} (${a.y.toFixed(2)}) and ${name(padded[j])} (${b.y.toFixed(2)})`);
  }
  for (const r of g.perimeter) crossCreek(sc, r, add);
  // trees
  if (opts.trees) treeProblems(sc, surface, add);
  void gnd; void PARCEL_SIZE; void REGION_IDS;
  return out;
}

/** A ground tolerance (u) for floor against graded ground: the smallest step the pad rules call a wall (45 cm); less is a graded edge. */
export const HOVER_TOL = RW.MIN_H;

function crossCreek(sc: Scene, r: PerimeterRun, add: (w: string, d: string) => void): void {
  const def = PERIMETER[r.kind];
  if (!(def.blocks.people >= 0.1) || def.walkway || def.wallTop || r.kind === 'creek_bars' || r.kind === 'covered_bridge' || r.kind === 'tunnel_bridge' || r.kind === 'moat' || r.kind === 'ditch' || r.kind === 'water_pipe' || r.kind === 'power_cable' || r.kind === 'drain_channel' || r.kind === 'escape_tunnel' || r.kind === 'underground_passage' || r.kind === 'slope_tunnel' || r.kind === 'rock_tunnel' || r.kind === 'earth_berm') return;
  let wet = 0, at: Pt | null = null;
  const bars = sc.g.perimeter.filter(q => q.kind === 'creek_bars').map(q => q.pts);
  const { parcel } = sc;
  // open water: the lake, or the channel itself (a low pocket of a hillside lot below the creek's level is a dip in the ground, not water)
  const water = (x: number, z: number) => parcel.isCreek(x, z) && (!!parcel.lakeY || Math.abs(z - parcel.creek.zAt(x)) < parcel.creek.halfWidth + 0.6);
  for (const [a, b] of solidSegments(r)) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.15));
    for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (water(x, z) && !bars.some(pts => distToLine(pts, x, z) < 0.6)) { wet++; at ??= [x, z]; } }
  }
  if (wet > 1) add('fence or wall runs through the water with no crossing', `${r.kind} ${r.id}: ${wet} samples in the channel near ${at![0].toFixed(1)}, ${at![1].toFixed(1)}`);
}

function treeProblems(sc: Scene, surface: GameState['structures'], add: (w: string, d: string) => void): void {
  const { parcel } = sc;
  const onAccess = onAccessOf(sc);
  const blockedBy = (x: number, z: number): boolean => surface.some(st => inRect(rectOf(st), x, z, 0.6)) || Math.hypot(x - sc.camp.x, z - sc.camp.z) < 1.7 || onAccess(x, z, 0.5);
  const trees = planParcelTrees(parcel, { margin: 8, density: 1, blocked: blockedBy });
  for (const st of surface) {
    const body = rectOf(st, false), pad = sc.pads.get(st.id)?.wall?.rect;
    for (const t of trees) {
      if (inRect(body, t.x, t.z, 0.05) || (pad && inRect(pad, t.x, t.z, 0.0))) { add('tree grows through a structure', `${st.kind} ${st.id}: ${t.kind} at ${t.x.toFixed(1)}, ${t.z.toFixed(1)}`); break; }
    }
  }
}

// ── the corpus ──

export interface SceneSpec { label: string; site: Site; seed: number }

/** Every region's six listings for a seed (real market ground), plus each lot archetype forced on each lot-bearing region at steep relief. */
export function corpus(seeds: readonly number[], regions: readonly RegionId[] = REGION_IDS): SceneSpec[] {
  const out: SceneSpec[] = [];
  for (const seed of seeds) for (const region of regions) {
    listings(seed, region, ANY_WISH, 6, 5_000_000).forEach((site, k) => out.push({ label: `${region}#${seed}.${k} ${site.lot?.kind ?? 'classic'} ${site.acres}ac`, site, seed }));
  }
  return out;
}

export const STEEP_LOTS: ReadonlyArray<{ region: RegionId; kind: Parameters<typeof makeLotSite>[0]['kind']; relief: number; seed: number; creek?: boolean }> = [
  { region: 'mountain_west', kind: 'hillside', relief: 14, seed: 3, creek: true },
  { region: 'mountain_west', kind: 'gorge', relief: 12, seed: 4 },
  { region: 'mountain_west', kind: 'ridge', relief: 12, seed: 5 },
  { region: 'mountain_west', kind: 'mesa', relief: 12, seed: 6 },
  { region: 'mountain_west', kind: 'saddle', relief: 10, seed: 7 },
  { region: 'mountain_west', kind: 'bench', relief: 10, seed: 8 },
  { region: 'mountain_west', kind: 'bluff', relief: 10, seed: 9 },
  { region: 'mountain_west', kind: 'island', relief: 8, seed: 10 },
  { region: 'appalachia', kind: 'hillside', relief: 12, seed: 11, creek: true },
  { region: 'appalachia', kind: 'gorge', relief: 12, seed: 12 },
  { region: 'pnw', kind: 'hillside', relief: 10, seed: 13, creek: true },
  { region: 'pnw', kind: 'bluff', relief: 9, seed: 14 },
  { region: 'north_woods', kind: 'bluff', relief: 6, seed: 15 },
  { region: 'north_woods', kind: 'island', relief: 6, seed: 16 },
];
