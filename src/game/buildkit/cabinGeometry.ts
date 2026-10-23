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
import { box, buildGabled, layerFractions, showStage, BUILD_LAYERS, CUTAWAY_HIDE, CUT_H, XRAY_LAYERS, type BuildLayer, type FurnishCtx, type GabledSpec } from './shell';

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
    ceiling: 'pine_panel', tieBeams: [0.05, 0.4], corners: 'boards',
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
  I({ x: left + 0.05, z: -0.48, rot: Math.PI / 2 }, a => Furniture.counter(a, 2.5, 0.62));
  I({ x: left + 0.02, z: -0.6, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.1, 1.45, 2, 'jars'), false);
  I({ x: -0.3, z: back + 0.03 }, a => Furniture.shelfUnit(a, 1.2, 1.9, 'jars'));
  I({ x: left + 0.05, z: -0.17 }, a => Furniture.barrel(a));
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

/** Evening seats (local x, z, face-toward x, z): table chairs and armchairs. */
export const CABIN_SEATS: ReadonlyArray<[number, number, number, number]> = [[-0.295, -0.08, -0.25, 0.02], [-0.205, 0.12, -0.25, 0.02], [0.11, -0.34, 0.26, -0.62], [0.38, -0.33, 0.26, -0.62]];

/** All layers of the cabin as meshes tagged userData.layer (one per layer × material). */
export function buildCabinLayers(def: KitPieceDef): THREE.Group {
  const { group } = buildGabled(cabinSpec(def), furnishCabin);
  group.userData.seats = CABIN_SEATS;
  return group;
}

/** Chimney top in local coordinates (smoke source). */
export function cabinChimneyTop(def: KitPieceDef): THREE.Vector3 {
  const hd = def.cellsZ * CELL / 2;
  return new THREE.Vector3(0.26, CABIN.floor + CABIN.wallH + CABIN.rise + 0.16, -hd - 0.06);
}
