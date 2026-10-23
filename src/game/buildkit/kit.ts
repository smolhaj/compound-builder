/**
 * Build kit — the pieces the player places (GDS §2.2 "kits plus
 * customisation"; modular foundation → walls → roof, each with a material).
 * Pure data + placement rules; geometry lives in cabinGeometry.ts.
 *
 * Grid: structures snap to a 3 m sub-grid (docs/DECISIONS.md) = 0.5 world
 * units. Footprints are in cells; `rot` turns in quarter turns.
 */
import type { KitMaterialId } from './materials';

/** World units per build cell (3 m). */
export const CELL = 0.5;

export interface KitPieceDef {
  id: string;
  name: string;
  /** Footprint in cells, before rotation (x across the gable, z along the ridge). */
  cellsX: number;
  cellsZ: number;
  /** Extra clearance (cells) in front of the door side (+z) — porch and steps. */
  frontCells: number;
  /** Materials per part (the player will choose later). */
  parts: { foundation: KitMaterialId; walls: KitMaterialId; roof: KitMaterialId };
  /** Steepest ground (rise / run) under the footprint before it needs a bigger pad. */
  maxSlope: number;
}

export const TIMBER_CABIN: KitPieceDef = {
  id: 'timber_cabin',
  name: 'Timber cabin',
  cellsX: 2,   // 6 m
  cellsZ: 3,   // 9 m
  frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.35,
};

export const KIT: Record<string, KitPieceDef> = { [TIMBER_CABIN.id]: TIMBER_CABIN };

/** A placed structure (the game state record). */
export interface Placed {
  id: string;
  kind: string;
  /** Centre of the footprint (world units). */
  x: number;
  z: number;
  /** Quarter turns (0..3); 0 = door side facing +z. */
  rot: number;
}

/** Footprint rect (world) of a piece at a centre, including the front clearance. */
export function footprint(def: KitPieceDef, x: number, z: number, rot: number, withFront = true): { x0: number; z0: number; x1: number; z1: number } {
  const q = ((rot % 4) + 4) % 4;
  const hx = def.cellsX * CELL / 2, hz = def.cellsZ * CELL / 2;
  const f = withFront ? def.frontCells * CELL : 0;
  // local rect: x ∈ [-hx, hx], z ∈ [-hz, hz + f]; rotate by q quarter turns
  const corners: Array<[number, number]> = [[-hx, -hz], [hx, -hz], [-hx, hz + f], [hx, hz + f]];
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [lx, lz] of corners) {
    const [wx, wz] = rotQ(lx, lz, q);
    x0 = Math.min(x0, x + wx); x1 = Math.max(x1, x + wx);
    z0 = Math.min(z0, z + wz); z1 = Math.max(z1, z + wz);
  }
  return { x0, z0, x1, z1 };
}

/** Rotate a local offset by q quarter turns (counter-clockwise seen from above, +x → −z). */
export function rotQ(lx: number, lz: number, q: number): [number, number] {
  switch (((q % 4) + 4) % 4) {
    case 0: return [lx, lz];
    case 1: return [lz, -lx];
    case 2: return [-lx, -lz];
    default: return [-lz, lx];
  }
}

/**
 * Snap a cursor point to the build grid so the footprint's cell edges sit on
 * grid lines (odd-sized footprints centre on a cell, even ones on a line).
 */
export function snapCentre(def: KitPieceDef, x: number, z: number, rot: number): [number, number] {
  const odd = (n: number) => n % 2 === 1;
  const q = ((rot % 4) + 4) % 4;
  const nx = q % 2 === 0 ? def.cellsX : def.cellsZ;
  const nz = q % 2 === 0 ? def.cellsZ : def.cellsX;
  const s = (v: number, isOdd: boolean) => isOdd ? (Math.floor(v / CELL) + 0.5) * CELL : Math.round(v / CELL) * CELL;
  return [s(x, odd(nx)), s(z, odd(nz))];
}

export interface SiteQuery {
  /** Natural ground height. */
  height(x: number, z: number): number;
  /** Inside the player's parcel. */
  owned(x: number, z: number): boolean;
  /** Water (creek channel) at (x, z). */
  water(x: number, z: number): boolean;
}

export type PlaceProblem = 'off_parcel' | 'water' | 'too_steep' | 'overlaps';

/** Why a piece can't go here (null = it can). */
export function placementProblem(def: KitPieceDef, x: number, z: number, rot: number, site: SiteQuery, placed: readonly Placed[]): PlaceProblem | null {
  const r = footprint(def, x, z, rot);
  const N = 4;
  const hs: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const px = r.x0 + (r.x1 - r.x0) * i / N, pz = r.z0 + (r.z1 - r.z0) * j / N;
      if (!site.owned(px, pz)) return 'off_parcel';
      if (site.water(px, pz)) return 'water';
      row.push(site.height(px, pz));
    }
    hs.push(row);
  }
  // steepest grade across the footprint along either axis
  let grade = 0;
  for (let j = 0; j <= N; j++) grade = Math.max(grade, Math.abs(hs[N][j] - hs[0][j]) / (r.x1 - r.x0));
  for (let i = 0; i <= N; i++) grade = Math.max(grade, Math.abs(hs[i][N] - hs[i][0]) / (r.z1 - r.z0));
  if (grade > def.maxSlope) return 'too_steep';
  for (const p of placed) {
    const o = footprint(KIT[p.kind], p.x, p.z, p.rot);
    if (r.x0 < o.x1 && r.x1 > o.x0 && r.z0 < o.z1 && r.z1 > o.z0) return 'overlaps';
  }
  return null;
}

export const PROBLEM_TEXT: Record<PlaceProblem, string> = {
  off_parcel: 'Outside your land',
  water: 'In the creek',
  too_steep: 'Too steep — find flatter ground',
  overlaps: 'Overlaps another building',
};
