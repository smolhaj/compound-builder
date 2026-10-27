/**
 * Timber cabin (the first build-kit piece): a 6 × 9 m cabin on a fieldstone
 * foundation, lap-sided walls with corner boards, a steep standing-seam
 * metal gable roof running out over a front porch, a plank door,
 * four-light windows, and a fieldstone chimney on the back gable. Mountain
 * West homestead vernacular.
 *
 * Inside: main room (wood stove corner, kitchen, table), an entry, a
 * bedroom behind a partition, and a sleeping loft for the kids over the
 * back half. Built with the shared gabled shell (shell.ts).
 *
 * Scale (UE SCALE v2): 1 unit ≈ 6 m; door ≈ 0.36 (2.15 m), storey 0.45.
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { Furniture, M } from './interior';
import { Clutter } from './clutter';
import { box, buildGabled, Parts, layerFractions, showStage, BUILD_LAYERS, CUTAWAY_HIDE, CUT_H, XRAY_LAYERS, type BuildLayer, type BuildOpts, type FurnishCtx, type GabledSpec } from './shell';

export { layerFractions, CUTAWAY_HIDE, XRAY_LAYERS, CUT_H };
export type CabinLayer = BuildLayer;
export const CABIN_LAYERS = BUILD_LAYERS;
/** Show a layered building at a construction stage (all buildings share the layers). */
export const showCabinStage = showStage;

/** Cabin dimensions (world units). */
export const CABIN = {
  /** Foundation height above the pad. */
  floor: 0.09,
  wallH: 0.45,
  wallT: 0.035,
  /** Roof rise over half the width (≈ 10:12 pitch). */
  rise: 0.42,
  eave: 0.07,
  gableOver: 0.05,
  porch: 0.42,
  door: { w: 0.16, h: 0.36, x: -0.13 },
  win: { w: 0.17, h: 0.2, sill: 0.17 },
} as const;

export function cabinSpec(def: KitPieceDef): GabledSpec {
  const C = CABIN;
  return {
    W: def.cellsX * CELL, D: def.cellsZ * CELL,
    floor: C.floor, wallH: C.wallH, wallT: C.wallT, rise: C.rise, eave: C.eave, gableOver: C.gableOver, porch: C.porch,
    foundation: 'fieldstone', floorMat: 'deck', outer: 'timber_lap', inner: 'pine_panel', roof: 'metal_roof', trim: 'trim',
    front: [{ kind: 'door', at: C.door.x }, { kind: 'window', at: 0.22 }],
    left: [{ kind: 'window', at: -0.36 }, { kind: 'window', at: 0.3 }],
    right: [{ kind: 'window', at: -0.36 }, { kind: 'window', at: 0.3 }],
    gableWindow: { back: true, w: C.win.w, h: C.win.h, y: 0.05 },
    chimney: { kind: 'stone', x: 0.26 },
    ceiling: 'pine_panel', tieBeams: [0.05, 0.4], corners: 'boards', curtains: 'curtain',
  };
}

/** Bedroom partition position (front right). */
const PX = 0.06, PZ = 0.18;

function furnishCabin(c: FurnishCtx): void {
  const { I, L, left, right, front, back, y0, yE, parts } = c;
  // bedroom partitions: along z at x = PX with a doorway, along x at z = PZ
  c.partition(PX, PZ, PX, front, [{ at: 0.025 + 0.065, w: 0.13, sill: 0, h: CABIN.door.h }]);
  c.partition(PX - 0.01, PZ, right, PZ);
  // main room: stove corner, kitchen, table
  I({ x: 0.26, z: back + 0.075 }, a => Furniture.woodStove(a, 1.55, 0.32));
  I({ x: 0.43, z: back + 0.055 }, a => Furniture.woodbox(a));
  I({ x: 0.24, z: -0.36 }, a => Furniture.rug(a, 2.2, 1.5), false);
  I({ x: 0.11, z: -0.34, rot: Math.PI - 0.35 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: 0.38, z: -0.33, rot: Math.PI + 0.35 }, a => Furniture.armchair(a, 'quilt_blue'));
  const o = c.parts.opts;
  I({ x: left + 0.05, z: -0.48, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.5, 0.62, !!o.plumbed));
  I({ x: left + 0.02, z: -0.6, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.1, 1.45, 2, 'jars'), false);
  I({ x: -0.3, z: back + 0.03 }, a => Furniture.shelfUnit(a, 1.2, 1.9, 'food'));      // the pantry: what's stored is drawn on it
  if (o.wired) I({ x: left + 0.065, z: -0.17, rot: Math.PI / 2 }, a => Furniture.fridge(a));
  else I({ x: left + 0.05, z: -0.17 }, a => Furniture.barrel(a));
  if (o.wired) for (const [x, z] of [[-0.25, 0.05], [0.24, 0.4]]) I({ x, z, y: c.yE - 0.03 }, a => Furniture.pendant(a, 0.5), false);
  if (o.plumbed) I({ x: left + 0.01, z: -0.25, y: y0 + 1.5 * M, rot: Math.PI / 2 }, a => { a('enamel', box(0.35 * M, 0.5 * M, 0.2 * M, 0, 0, 0.1 * M)); }, false);
  const tx = -0.25, tz = 0.02;
  I({ x: tx, z: tz }, a => { Furniture.table(a, 1.2, 0.85); Furniture.oilLamp(a, 0, 0.76, 0); });
  for (const sx of [-1, 1]) {
    I({ x: tx + sx * 0.045, z: tz - 0.1 }, a => Furniture.chair(a));
    I({ x: tx + sx * 0.045, z: tz + 0.1, rot: Math.PI }, a => Furniture.chair(a));
  }
  I({ x: left + 0.03, z: 0.1, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 0.9, 1.8, 'books'));
  // entry: boot bench and coat pegs by the door
  I({ x: -0.38, z: front - 0.035, rot: Math.PI }, a => Furniture.bench(a, 0.9));
  I({ x: -0.38, z: front - 0.008, rot: Math.PI }, a => Furniture.coatPegs(a, 0.9), false);
  // bedroom: double bed against the partition, nightstand, dresser
  I({ x: 0.29, z: PZ + 0.01 + 1.0 * M + 0.04 * M }, a => Furniture.bed(a, true, 'quilt_red'));
  I({ x: right - 0.04, z: PZ + 0.05 }, a => Furniture.nightstand(a));
  I({ x: right - 0.045, z: 0.6, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.0));
  I({ x: 0.22, z: 0.6 }, a => Furniture.rug(a, 1.2, 0.8), false);
  // sleeping loft over the back half (kids), ladder up from the main room
  const LZ = -0.16, W = right - left;
  parts.add('deck', box(W, 0.02, LZ - back, 0, yE - 0.02, (LZ + back) / 2), 'loft');
  parts.add('wood_dark', box(W, 0.035, 0.03, 0, yE - 0.055, LZ - 0.015), 'loft');
  L({ x: -0.2975, z: LZ - 0.01 }, a => Furniture.rail(a, 0.335 / M));
  L({ x: 0.2275, z: LZ - 0.01 }, a => Furniture.rail(a, 0.475 / M));
  L({ x: -0.07, z: LZ + 0.094, y: y0 }, a => Furniture.ladder(a, CABIN.wallH / M), true);
  L({ x: -0.2, z: -0.47 }, a => Furniture.mattress(a, 'quilt_blue'));
  L({ x: 0.2, z: -0.47 }, a => Furniture.mattress(a, 'quilt_red'));
  L({ x: 0, z: back + 0.06 }, a => { Furniture.trunk(a); Furniture.oilLamp(a, 0, 0.5, 0); });
}

/** Life in the cabin: dishes, books, boots, toys, the dog by the stove, pictures, the woodpile outside. */
function dressCabin(c: FurnishCtx): void {
  const { C, y0, left, right, front, back } = c;
  const tableY = y0 + 0.004 + 0.76 * M, counterY = y0 + 0.004 + 0.9 * M, stoveY = y0 + 0.004 + 0.88 * M;
  const tx = -0.25, tz = 0.02;
  // table: supper things, a book, the mail, a game or the kids' drawing
  C({ x: tx - 0.04, z: tz - 0.035, y: tableY }, a => Clutter.plate(a), 0.8);
  C({ x: tx + 0.04, z: tz + 0.035, y: tableY, rot: 2 }, a => Clutter.plate(a), 0.6);
  C({ x: tx + 0.06, z: tz - 0.04, y: tableY }, a => Clutter.mug(a), 0.9);
  C({ x: tx - 0.07, z: tz + 0.04, y: tableY, rot: 1 }, a => Clutter.mug(a, 'crockery'), 0.5);
  const tableTop = c.rnd();
  if (tableTop < 0.33) C({ x: tx + 0.02, z: tz + 0.01, y: tableY, rot: 0.3 }, a => Clutter.openBook(a), 1);
  else if (tableTop < 0.66) C({ x: tx + 0.03, z: tz, y: tableY }, a => Clutter.checkers(a), 1);
  else C({ x: tx - 0.01, z: tz + 0.01, y: tableY, rot: -0.2 }, a => Clutter.crayons(a), 1);
  C({ x: tx - 0.075, z: tz - 0.045, y: tableY }, a => Clutter.mail(a), 0.6);
  if (c.rnd() < 0.5) C({ x: tx + 0.08, z: tz + 0.005, y: tableY }, a => Clutter.fruitBowl(a), 1);
  else C({ x: tx + 0.075, z: tz + 0.005, y: tableY }, a => Clutter.vaseFlowers(a), 1);
  // kitchen: bread, cutting board with the veg, dishes in the sink, jars, a pot on the stove
  C({ x: left + 0.05, z: -0.66, y: counterY, rot: Math.PI / 2 }, a => Clutter.bread(a), 0.85);
  C({ x: left + 0.05, z: -0.35, y: counterY, rot: Math.PI / 2 + 0.2 }, a => Clutter.cuttingBoard(a), 0.85);
  C({ x: left + 0.05, z: -0.53, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  C({ x: 0.24, z: back + 0.075, y: stoveY }, a => Clutter.potOnStove(a), 0.7);
  C({ x: left + 0.03, z: -0.3, y: counterY + 0.02 }, a => Clutter.herbsPot(a), 0.6);
  // sitting corner: the dog by the stove, the cat in a chair, a book on the arm
  C({ x: 0.05, z: -0.56 }, a => Clutter.dogBed(a, true), 0.85);
  C({ x: 0.11, z: -0.34, y: y0 + 0.004 + 0.36 * M, rot: Math.PI - 0.35 }, a => Clutter.cat(a), 0.5);
  C({ x: 0.38, z: -0.31, y: y0 + 0.004 + 0.4 * M, rot: 0.6 }, a => Clutter.bookStack(a), 0.5);
  C({ x: left + 0.05, z: 0.3, rot: Math.PI / 2 }, a => Clutter.guitar(a), 0.5);
  C({ x: -0.05, z: 0.3, rot: 0.7 }, a => Clutter.toys(a), 0.8);
  C({ x: -0.295, z: -0.08 }, a => Clutter.jacketOnChair(a, c.rnd() < 0.5 ? 'quilt_red' : 'paint_green'), 0.6);
  // entry: boots and a fishing rod by the door, the rifle over the pegs
  C({ x: -0.28, z: front - 0.06, rot: 0.3 }, a => Clutter.boots(a), 0.95);
  C({ x: -0.43, z: front - 0.08, rot: -0.5 }, a => Clutter.boots(a, 'paint_green'), 0.6);
  C({ x: -0.455, z: front - 0.03 }, a => Clutter.fishingRod(a), 0.5);
  C({ x: -0.38, z: front - 0.005, y: y0 + 2.1 * M, rot: Math.PI }, a => Clutter.riflePegs(a), 0.6);
  // walls: pictures, the calendar, a clock, the kids' drawings
  // homey: a painting, the family photos, the trail map, the sampler, antlers over the door, flowers, a plant
  const art = (['art_mountains', 'art_sunset', 'art_lake'] as const)[Math.floor(c.rnd() * 3)];
  C({ x: right - 0.002, z: -0.12, y: y0 + 1.25 * M, rot: -Math.PI / 2 }, a => Clutter.picture(a, 0.6, 0.45, art), 1);
  C({ x: 0.02, z: back + 0.002, y: y0 + 1.2 * M }, a => Clutter.poster(a, 0.6, 0.75, c.rnd() < 0.5 ? 'poster_map' : 'poster_seeds'), 0.9);
  C({ x: left + 0.03, z: 0.1, y: y0 + 1.82 * M, rot: Math.PI / 2 }, a => Clutter.photoFrames(a), 0.95);
  C({ x: -0.13, z: front - 0.002, y: y0 + 2.25 * M, rot: Math.PI }, a => Clutter.antlers(a), 0.6);
  C({ x: -0.3, z: c.hd + 0.004, y: y0 + 1.35 * M }, a => Clutter.wreath(a), 0.5);
  C({ x: 0.43, z: 0.08 }, a => Clutter.plant(a), 0.75);
  C({ x: 0.048, z: 0.4, y: y0 + 0.95 * M, rot: -Math.PI / 2 }, a => Clutter.picture(a, 0.3, 0.38, 'sampler', 'wood_mid'), 0.7);
  C({ x: -0.1, z: back + 0.002, y: y0 + 1.4 * M }, a => Clutter.calendar(a), 0.9);
  C({ x: 0.048, z: 0.5, y: y0 + 1.7 * M, rot: -Math.PI / 2 }, a => Clutter.clock(a), 0.7);
  C({ x: 0.048, z: 0.28, y: y0 + 1.15 * M, rot: -Math.PI / 2 }, a => Clutter.drawings(a), 0.8);
  // bedroom: unmade bed, slippers, the laundry basket, a picture over the bed, a towel
  C({ x: 0.29, z: 0.36, y: y0 + 0.004 + 0.55 * M }, a => Clutter.rumple(a, 'quilt_red'), 0.7);
  C({ x: 0.13, z: 0.25, rot: -0.4 }, a => Clutter.slippers(a), 0.7);
  C({ x: 0.17, z: 0.64 }, a => Clutter.laundryBasket(a), 0.7);
  C({ x: 0.29, z: 0.18 + 0.012, y: y0 + 1.15 * M }, a => Clutter.picture(a, 0.7, 0.5, c.rnd() < 0.5 ? 'photo_couple' : 'art_lake'), 0.95);
  C({ x: right - 0.045, z: 0.6, y: y0 + 0.004 + 0.89 * M, rot: -Math.PI / 2 }, a => Clutter.photoFrames(a), 0.9);
  C({ x: right - 0.002, z: 0.55, y: y0 + 0.95 * M, rot: -Math.PI / 2 }, a => Clutter.wallQuilt(a, 'quilt_blue'), 0.4);
  C({ x: right - 0.002, z: 0.48, y: y0 + 1.6 * M, rot: -Math.PI / 2 }, a => Clutter.towel(a, 'quilt_blue'), 0.5);
  // outside: woodpile along the west wall, chopping block, porch rockers, a kid's bike, a bucket
  const hw = c.hw, hd = c.hd;
  C({ x: -hw - 0.05, z: -0.25, y: 0.004, rot: -Math.PI / 2 }, a => Clutter.woodpile(a, 4.0, 1.3), 1);
  C({ x: -hw - 0.15, z: 0.45, y: 0.004 }, a => Clutter.choppingBlock(a), 0.9);
  C({ x: 0.25, z: hd + 0.22, y: y0, rot: 0.3 }, a => Clutter.rocker(a), 0.9);
  C({ x: 0.4, z: hd + 0.2, y: y0, rot: -0.2 }, a => Clutter.rocker(a), 0.6);
  C({ x: -0.3, z: hd + 0.32, y: y0, rot: 0.6 }, a => Clutter.boots(a, 'wood_dark'), 0.6);
  C({ x: hw + 0.08, z: 0.7, y: 0.004, rot: 1.3 }, a => Clutter.bike(a), 0.6);
  C({ x: hw + 0.06, z: -0.5, y: 0.004 }, a => Clutter.bucket(a), 0.6);
}

/** Evening seats (local x, z, face-toward x, z): table chairs and armchairs. */
export const CABIN_SEATS: ReadonlyArray<[number, number, number, number]> = [[-0.295, -0.08, -0.25, 0.02], [-0.205, 0.12, -0.25, 0.02], [0.11, -0.34, 0.26, -0.62], [0.38, -0.33, 0.26, -0.62]];

/** All layers of the cabin as meshes tagged userData.layer (one per layer × material). */
export function buildCabinLayers(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const { group } = buildGabled(cabinSpec(def), c => { furnishCabin(c); dressCabin(c); }, new Parts(seed, opts));
  group.userData.seats = CABIN_SEATS;
  return group;
}

/** Chimney top in local coordinates (smoke source). */
export function cabinChimneyTop(def: KitPieceDef): THREE.Vector3 {
  const hd = def.cellsZ * CELL / 2;
  return new THREE.Vector3(0.26, CABIN.floor + CABIN.wallH + CABIN.rise + 0.16, -hd - 0.06);
}
