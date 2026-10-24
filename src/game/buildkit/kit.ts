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
  /** Build-menu group and one-line description. */
  category: 'home' | 'work' | 'food' | 'sanitation' | 'water' | 'power' | 'bunker';
  blurb: string;
  /** Floor height above the pad (walking height inside) and porch depth in front of the +z wall (world units). */
  floorY: number;
  porch: number;
  /** People it sleeps (0 = not a home). */
  sleeps: number;
  /** Interior lamp position (local, above the floor), or null for no lamplight. */
  light: [number, number, number] | null;
  /**
   * Level it occupies (underground.ts): bunker rooms are underground (they
   * don't clash with what stands above them); entrances, wells, cellars and
   * septic fields reach both. Default surface.
   */
  level?: 'surface' | 'underground' | 'both';
  /** People it shelters in an emergency (bunker rooms). */
  shelters?: number;
}

export const TIMBER_CABIN: KitPieceDef = {
  id: 'timber_cabin', name: 'Timber cabin', category: 'home',
  blurb: '6 × 9 m one-room cabin with a bedroom and a kids\' loft, wood stove, porch.',
  cellsX: 2,   // 6 m
  cellsZ: 3,   // 9 m
  frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.35, floorY: 0.09, porch: 0.42, sleeps: 4, light: [-0.2, 0.32, -0.05],
};

export const OUTHOUSE: KitPieceDef = {
  id: 'outhouse', name: 'Outhouse', category: 'sanitation',
  blurb: 'Pit privy with a crescent-moon door. Keep it downhill and well away from the water.',
  cellsX: 1, cellsZ: 1, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.45, floorY: 0.03, porch: 0, sleeps: 0, light: null,
};

export const WORKSHOP: KitPieceDef = {
  id: 'workshop', name: 'Workshop & garage', category: 'work',
  blurb: '9 × 12 m steel-sided shop on a slab: a vehicle bay, workbench, tool wall, forge corner.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0],
};

export const ROOT_CELLAR: KitPieceDef = {
  id: 'root_cellar', name: 'Root cellar', category: 'food',
  blurb: 'Earth-bermed stone vault: cool, dark and steady for potatoes, roots, crocks and canning jars.',
  cellsX: 2, cellsZ: 2, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'fieldstone', roof: 'earth' },
  maxSlope: 0.5, floorY: 0.02, porch: 0, sleeps: 0, light: [0, 0.25, -0.1], level: 'both',
};

export const CHICKEN_COOP: KitPieceDef = {
  id: 'chicken_coop', name: 'Chicken coop & run', category: 'food',
  blurb: 'Raised coop with roosts and nest boxes, a covered wire run for a dozen hens.',
  cellsX: 2, cellsZ: 2, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.4, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const GARDEN: KitPieceDef = {
  id: 'garden', name: 'Kitchen garden', category: 'food',
  blurb: 'Six raised beds inside a deer fence, compost bins and a rain barrel.',
  cellsX: 3, cellsZ: 3, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const FIELD: KitPieceDef = {
  id: 'field', name: 'Field plot', category: 'food',
  blurb: 'A quarter acre in potatoes, dry beans and wheat inside a deer fence: the calories a garden can\'t grow.',
  cellsX: 10, cellsZ: 10, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.0, porch: 0, sleeps: 0, light: null,
};

export const LOG_HOUSE: KitPieceDef = {
  id: 'log_house', name: 'Log house', category: 'home',
  blurb: '9 × 15 m house of your own logs: great room with a glass gable and stone fireplace, bath, three bedrooms.',
  cellsX: 3, cellsZ: 5, frontCells: 1,
  parts: { foundation: 'fieldstone', walls: 'log_wall', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.1, porch: 0.45, sleeps: 6, light: [0, 0.34, 0],
};

/** What comes with improved land (sim/improvements.ts); the barn is also in the build menu. */
export const FARMHOUSE: KitPieceDef = {
  id: 'farmhouse', name: 'Old farmhouse', category: 'home',
  blurb: 'A two-storey 9 × 12 m farmhouse from the last century: front porch, kitchen and parlor, bedrooms up, a basement.',
  cellsX: 3, cellsZ: 4, frontCells: 1,
  parts: { foundation: 'concrete', walls: 'timber_lap', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.12, porch: 0.4, sleeps: 6, light: [0, 0.32, 0],
};
export const TRAILER: KitPieceDef = {
  id: 'trailer', name: 'Manufactured home', category: 'home',
  blurb: 'A 1990s manufactured home on piers: kitchen, living room, two bedrooms and a bath.',
  cellsX: 2, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'metal_siding', roof: 'metal_roof' },
  maxSlope: 0.3, floorY: 0.13, porch: 0, sleeps: 4, light: [0, 0.3, 0],
};
export const BARN: KitPieceDef = {
  id: 'barn', name: 'Barn', category: 'work',
  blurb: '12 × 18 m board-and-batten barn: big doors at both ends, stalls for stock, a hay loft under a steep metal roof.',
  cellsX: 4, cellsZ: 6, frontCells: 0,
  parts: { foundation: 'fieldstone', walls: 'board_batten', roof: 'metal_roof' },
  maxSlope: 0.25, floorY: 0.03, porch: 0, sleeps: 0, light: [0, 0.4, 0],
};

const DEEP = new Set(['well_hand', 'well_drilled', 'septic']);
const util = (id: string, name: string, category: 'water' | 'power' | 'sanitation', cx: number, cz: number, blurb: string, light: [number, number, number] | null = null): KitPieceDef => ({
  id, name, category, blurb, cellsX: cx, cellsZ: cz, frontCells: 0, parts: { foundation: 'concrete', walls: 'board_batten', roof: 'metal_roof' }, maxSlope: 0.35, floorY: 0.02, porch: 0, sleeps: 0, light,
  level: DEEP.has(id) ? 'both' : 'surface',
});
export const UTILITY_KIT: KitPieceDef[] = [
  util('well_hand', 'Hand-dug well', 'water', 1, 1, 'A stone-lined well with a hand pump. ≈ 900 L a day, carried by bucket: no pressure, no plumbing.'),
  util('well_drilled', 'Drilled well & pump house', 'water', 1, 1, 'A 60 m bore (contractor) with a submersible pump and pressure tank: running water, but the pump needs power.', [0, 0.25, 0]),
  util('cistern', 'Rain cistern', 'water', 1, 1, '10,000 L tank fed by the gutters of every roof on its water line. Storage for dry spells.'),
  util('water_tower', 'Water tower', 'water', 1, 1, 'A 4,000 L tank on a timber stand: gravity pressure with no pump, and a lookout deck.'),
  util('solar_array', 'Solar array', 'power', 3, 2, '12 × 400 W panels on ground racks: ≈ 12 kWh a summer day, 6 in December.'),
  util('battery_shed', 'Battery & inverter shed', 'power', 1, 1, '20 kWh of batteries, an inverter and charge controller: power through the night.', [0, 0.28, 0]),
  util('generator_shed', 'Generator shed', 'power', 1, 1, 'A 7 kW generator and fuel rack. Backup for dark weeks; burns ≈ 0.45 L a kWh.', [0, 0.28, 0]),
  util('septic', 'Septic system', 'sanitation', 2, 2, 'Septic tank and leach field. Lets plumbed houses have flush toilets.'),
];

// ── Underground (GDS §2.2; underground.ts) ──
const room = (id: string, name: string, cx: number, cz: number, blurb: string, shelters = 0, level: 'underground' | 'both' = 'underground'): KitPieceDef => ({
  id, name, category: 'bunker', blurb, cellsX: cx, cellsZ: cz, frontCells: 0,
  parts: { foundation: 'concrete', walls: 'concrete', roof: 'concrete' },
  maxSlope: level === 'both' ? 0.3 : 9, floorY: 0, porch: 0, sleeps: 0, light: [0, 0.24, 0], level, shelters,
});
export const BUNKER_KIT: KitPieceDef[] = [
  room('bunker_hatch', 'Bunker hatch', 1, 1, 'The way down: a steel hatch in a concrete collar, a ladder down a 5 m shaft, a blast door at the bottom. Easy to hide under a woodpile.', 0, 'both'),
  room('bunker_stairs', 'Bunker stairwell', 1, 3, 'A stair down from a little headhouse on the surface to a blast door 5 m below. Carries stores and the old and young.', 0, 'both'),
  room('bunker_corridor', 'Tunnel', 1, 2, 'A 3 × 6 m concrete passage between rooms.'),
  room('bunker_container', 'Buried container', 1, 4, 'A 40 ft shipping container in a gravel bed, braced and waterproofed: the cheap first bunker. Bunks, a table, a pantry.', 4),
  room('bunker_dorm', 'Bunkroom', 2, 2, 'Bunks for eight, lockers, a rug and the family pictures: somewhere to sleep through a bad week.', 8),
  room('bunker_galley', 'Galley', 2, 2, 'Kitchen counter, two-burner stove, a table for eight and shelves of food.', 2),
  room('bunker_stores', 'Storeroom', 2, 2, 'Rows of shelving: cans, rice and beans in buckets, water drums, medicine, seed.', 0),
  room('bunker_plant', 'Plant room', 2, 2, 'Air: an NBC filter and blast valves. Power: a battery bank and a vented generator. Water: a 2,000 L tank.', 0),
  room('bunker_medical', 'Medical bay', 2, 2, 'An exam table, a cot, a sink, cabinets of supplies and an oxygen bottle.', 1),
  room('bunker_comms', 'Comms & armory', 1, 2, 'Radios and maps on one wall, a gun safe and ammunition on the other.', 1),
];
/** Underground menu order. */
export const BUNKER_ORDER: readonly string[] = BUNKER_KIT.map(d => d.id);

export const KIT: Record<string, KitPieceDef> = Object.fromEntries([TIMBER_CABIN, LOG_HOUSE, FARMHOUSE, TRAILER, BARN, OUTHOUSE, WORKSHOP, ROOT_CELLAR, CHICKEN_COOP, GARDEN, FIELD, ...UTILITY_KIT, ...BUNKER_KIT].map(d => [d.id, d]));
/** Build-menu order. */
export const KIT_ORDER: readonly string[] = ['timber_cabin', 'log_house', 'outhouse', 'garden', 'field', 'chicken_coop', 'root_cellar', 'workshop', 'barn'];
/** Water & power menu order. */
export const UTILITY_ORDER: readonly string[] = ['well_hand', 'well_drilled', 'cistern', 'water_tower', 'septic', 'solar_array', 'battery_shed', 'generator_shed'];

/** A placed structure (the game state record). */
export interface Placed {
  id: string;
  kind: string;
  /** Center of the footprint (world units). */
  x: number;
  z: number;
  /** Quarter turns (0..3); 0 = door side facing +z. */
  rot: number;
}

/** Footprint rect (world) of a piece at a center, including the front clearance. */
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
 * grid lines (odd-sized footprints center on a cell, even ones on a line).
 */
export function snapCenter(def: KitPieceDef, x: number, z: number, rot: number): [number, number] {
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
  /** Something already there that isn't a kit piece (the camp). */
  blocked?(x: number, z: number): boolean;
}

export type PlaceProblem = 'off_parcel' | 'water' | 'too_steep' | 'overlaps' | 'not_connected' | 'thin_cover' | 'too_deep';

const levelOf = (d: KitPieceDef) => d.level ?? 'surface';
/** Do pieces at these levels compete for the same ground? (Bunker rooms go under the yard and houses.) */
const levelsMeet = (a: KitPieceDef, b: KitPieceDef) => levelOf(a) === 'both' || levelOf(b) === 'both' || levelOf(a) === levelOf(b);

/** Why a piece can't go here (null = it can). Underground pieces also need underground.ts's rules. */
export function placementProblem(def: KitPieceDef, x: number, z: number, rot: number, site: SiteQuery, placed: readonly Placed[]): PlaceProblem | null {
  const below = levelOf(def) === 'underground';
  const r = footprint(def, x, z, rot, !below);
  const N = 4;
  const hs: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const row: number[] = [];
    for (let j = 0; j <= N; j++) {
      const px = r.x0 + (r.x1 - r.x0) * i / N, pz = r.z0 + (r.z1 - r.z0) * j / N;
      if (!site.owned(px, pz)) return 'off_parcel';
      if (site.water(px, pz)) return 'water';
      if (!below && site.blocked?.(px, pz)) return 'overlaps';
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
    const od = KIT[p.kind];
    if (!levelsMeet(def, od)) continue;
    const o = footprint(od, p.x, p.z, p.rot, levelOf(od) !== 'underground');
    if (r.x0 < o.x1 && r.x1 > o.x0 && r.z0 < o.z1 && r.z1 > o.z0) return 'overlaps';
  }
  return null;
}

export const PROBLEM_TEXT: Record<PlaceProblem, string> = {
  off_parcel: 'Outside your land',
  water: 'In the creek',
  too_steep: 'Too steep — find flatter ground',
  overlaps: 'Overlaps another building',
  not_connected: 'Start a bunker at a hatch or stairwell, then add rooms wall to wall',
  thin_cover: 'Too little earth over it — the ground is too low here',
  too_deep: 'Too deep below the ground here to dig',
};
