/**
 * regionWorld — how each region (sim/regions.ts) looks and lies: the engine
 * landscape it sits in, its climate for seasons / weather / night sky, the
 * relief of the homestead parcel itself, the trees, shrubs and rocks on
 * it, the county road and the neighbors' line fences. Pure data (tested).
 *
 * Real references (1 unit ≈ 6 m):
 *   mountain_west  Lake Bonneville benches under the Wasatch / Sawtooth front:
 *                  ponderosa / Douglas fir and aspen, sagebrush, barbed wire on
 *                  steel T-posts, gravel county road.
 *   appalachia     an east-Kentucky / Blue Ridge hollow: a creek bottom
 *                  60–100 m wide in hay, the sides rising 30–45 % to rounded
 *                  ridges 50–80 m above it, oak–hickory, tulip poplar,
 *                  hemlock in the coves; sandstone ledges; split-rail (worm)
 *                  fences; a narrow winding blacktop.
 *   desert         a Colorado Plateau ranchette (Concho, St. Johns): a bajada
 *                  of grama grass and bare soil tilting off a mesa, a sandy
 *                  wash, one-seed juniper and pinyon, red sandstone rocks,
 *                  barbed wire on T-posts, a caliche road.
 *   north_woods    northern Minnesota / the Maine woods: low glacial swells,
 *                  a bog, black spruce, balsam fir and paper birch to the edge
 *                  of an old clearing; granite erratics; stone walls in Maine
 *                  (rail fences in Minnesota: stone here); a gravel road.
 *   plains         a Kansas / Nebraska quarter: flat to gently swelling grass
 *                  and wheat, a creek in a shallow draw with cottonwoods,
 *                  barbed wire on T-posts, the gravel section-line road.
 *   pnw            Cascade / Coast Range foothills: rolling hills under
 *                  second-growth Douglas fir, red cedar and bigleaf maple, red
 *                  alder on the creek, mossy basalt; woven wire on wood posts;
 *                  a paved county road.
 *   upper_midwest  Wisconsin moraine: rolling hummocks, a hardwood woodlot on
 *                  the back forty, fields in front, glacial fieldstone; woven
 *                  wire on wood posts; a paved town road.
 */
import type { RegionKind } from '../../engine/world/terrain/regionalLandscape';
import type { ForestKind } from '../../engine/world/trees/ForestRenderer';
import type { RegionId } from '../../sim/regions';

/** How the parcel itself lies (ParcelTerrain). */
export type Relief = 'benches' | 'hollow' | 'bajada' | 'swell' | 'flat' | 'foothill' | 'moraine';
export type RoadStyle = 'gravel' | 'asphalt' | 'caliche';
/** Line fences: barbed wire on steel T-posts, split rail, a fieldstone wall, woven wire on wood posts. */
export type FenceStyle = 'wire' | 'rail' | 'stone' | 'woven';

type Palette = Array<[number, number]>;

export interface TreeMix {
  /** Kind and size of a timber tree (`u` a roll, `wet` near the creek, `thick` in a closed stand). */
  timber: Array<{ kind: ForestKind; w: number; scale: [number, number]; sx?: [number, number]; sy?: [number, number] }>;
  /** Creek-bank trees. */
  riparian: { kind: ForestKind; scale: [number, number] };
  /** Young trees under a closed canopy / at the edge (null: none). */
  under: { thick: ForestKind | null; edge: ForestKind | null };
  /** Crown colors per kind. */
  palettes: Partial<Record<ForestKind, Palette>>;
}

export interface RegionWorld {
  /** Engine landscape (regionalLandscape). */
  kind: RegionKind;
  /** Season / weather / sky climate id (seasonState CLIMATES, weatherState REGION_WEATHER / REGION_SKY). */
  climate: string;
  relief: Relief;
  /**
   * Timber cover on the parcel: how much of the land the stands take and how
   * thick they are at the listing's usual timber (1).
   */
  cover: number;
  trees: TreeMix;
  /** Sagebrush on the open ground (density 0–1) and its colors; willow on the creek banks. */
  sage: number;
  sagePalette?: number[];
  willow: number;
  /** Loose rocks and ledges on the parcel: how many (a 40 gets ~ count × 40) and their color. */
  rocks: { count: number; color: number; size: [number, number]; flat: number };
  road: RoadStyle;
  fence: FenceStyle;
}

const CONIFER_DARK: Palette = [[0x2c4a34, 3], [0x31503a, 2], [0x27432f, 2], [0x385a40, 1]];
const SPRUCE: Palette = [[0x24402c, 3], [0x2a4631, 2], [0x203a29, 2], [0x31503a, 1]];
const JUNIPER: Palette = [[0x55634a, 3], [0x4d5a44, 2], [0x606c50, 2], [0x46523e, 1]];
const ASPEN: Palette = [[0x5f8a38, 3], [0x6a9040, 2], [0x557f36, 2]];
const BIRCH: Palette = [[0x5f8a3e, 3], [0x67903f, 2], [0x587e3a, 2]];
const HARDWOOD: Palette = [[0x3a6327, 3], [0x47702c, 3], [0x506f29, 2], [0x31582c, 2]];
const COTTONWOOD: Palette = [[0x5a8236, 3], [0x648a3a, 2], [0x52783a, 2]];

export const REGION_WORLD: Record<RegionId, RegionWorld> = {
  mountain_west: {
    kind: 'mountain', climate: 'mountain_west', relief: 'benches', cover: 1,
    trees: {
      timber: [{ kind: 'oval', w: 0.35, scale: [0.6, 0.9] }, { kind: 'conifer', w: 0.65, scale: [0.75, 1.3] }],
      riparian: { kind: 'broad', scale: [0.8, 1.2] },
      under: { thick: 'conifer', edge: 'oval' },
      palettes: { oval: ASPEN, broad: ASPEN },
    },
    sage: 1, willow: 1,
    rocks: { count: 0, color: 0x8a8174, size: [0.08, 0.25], flat: 0.7 },
    road: 'gravel', fence: 'wire',
  },
  appalachia: {
    kind: 'appalachia', climate: 'appalachia', relief: 'hollow', cover: 0.95,
    trees: {
      timber: [
        { kind: 'broad', w: 0.5, scale: [1.0, 1.5] },                                // white / chestnut oak, hickory
        { kind: 'oval', w: 0.32, scale: [1.0, 1.4], sy: [1.25, 1.5] },              // tulip poplar, sugar maple
        { kind: 'conifer', w: 0.18, scale: [0.9, 1.3] },                            // eastern hemlock, white pine
      ],
      riparian: { kind: 'broad', scale: [1.0, 1.4] },                                // sycamore, river birch
      under: { thick: 'oval', edge: 'oval' },                                         // dogwood, redbud, sourwood
      palettes: { broad: HARDWOOD, oval: HARDWOOD, conifer: CONIFER_DARK },
    },
    sage: 0, willow: 0.5,
    rocks: { count: 22, color: 0x8c8474, size: [0.1, 0.4], flat: 0.55 },             // sandstone ledges and slabs
    road: 'asphalt', fence: 'rail',
  },
  desert: {
    kind: 'desert', climate: 'desert_southwest', relief: 'bajada', cover: 3.5,
    trees: {
      timber: [{ kind: 'conifer', w: 1, scale: [0.28, 0.45], sx: [1.25, 1.6], sy: [0.7, 0.9] }],   // one-seed juniper, pinyon
      riparian: { kind: 'broad', scale: [0.9, 1.2] },                                 // Fremont cottonwood
      under: { thick: null, edge: null },
      palettes: { conifer: JUNIPER, broad: COTTONWOOD },
    },
    sage: 0.55, sagePalette: [0x8a8c74, 0x94957c, 0x7f826a, 0x9c9a82, 0x878a70], willow: 0.3,
    rocks: { count: 30, color: 0x9a5c44, size: [0.1, 0.45], flat: 0.6 },              // red sandstone
    road: 'caliche', fence: 'wire',
  },
  north_woods: {
    kind: 'north_woods', climate: 'north_woods', relief: 'swell', cover: 1,
    trees: {
      timber: [
        { kind: 'conifer', w: 0.7, scale: [0.8, 1.2], sx: [0.65, 0.8], sy: [1.05, 1.3] },   // black / white spruce, balsam fir
        { kind: 'oval', w: 0.3, scale: [0.7, 1.0], sy: [1.2, 1.45] },                       // paper birch, quaking aspen
      ],
      riparian: { kind: 'oval', scale: [0.6, 0.9] },                                   // speckled alder, black ash
      under: { thick: 'conifer', edge: 'oval' },
      palettes: { conifer: SPRUCE, oval: BIRCH },
    },
    sage: 0, willow: 1,
    rocks: { count: 16, color: 0x7c7a74, size: [0.12, 0.5], flat: 0.85 },           // granite erratics
    road: 'gravel', fence: 'stone',
  },
  plains: {
    kind: 'plains', climate: 'great_plains', relief: 'flat', cover: 0,
    trees: {
      timber: [{ kind: 'broad', w: 1, scale: [1.0, 1.4] }],
      riparian: { kind: 'broad', scale: [1.1, 1.6] },                                  // plains cottonwood, hackberry
      under: { thick: null, edge: null },
      palettes: { broad: COTTONWOOD },
    },
    sage: 0, willow: 0.6,
    rocks: { count: 0, color: 0x9a8e78, size: [0.08, 0.2], flat: 0.7 },
    road: 'gravel', fence: 'wire',
  },
  pnw: {
    kind: 'sound', climate: 'pacific_northwest', relief: 'foothill', cover: 1,
    trees: {
      timber: [
        { kind: 'conifer', w: 0.82, scale: [1.2, 1.75] },                              // Douglas fir, western red cedar, hemlock
        { kind: 'broad', w: 0.18, scale: [0.9, 1.3] },                                 // bigleaf maple
      ],
      riparian: { kind: 'oval', scale: [0.8, 1.1] },                                   // red alder
      under: { thick: 'conifer', edge: 'oval' },                                        // hemlock, vine maple
      palettes: { conifer: CONIFER_DARK, oval: HARDWOOD },
    },
    sage: 0, willow: 0.8,
    rocks: { count: 10, color: 0x5e6a52, size: [0.1, 0.35], flat: 0.75 },            // mossy basalt
    road: 'asphalt', fence: 'woven',
  },
  upper_midwest: {
    kind: 'upper_midwest', climate: 'upper_midwest', relief: 'moraine', cover: 1,
    trees: {
      timber: [
        { kind: 'broad', w: 0.55, scale: [1.0, 1.4] },                                 // red / white oak
        { kind: 'oval', w: 0.3, scale: [1.0, 1.3], sy: [1.2, 1.4] },                   // sugar maple, basswood
        { kind: 'conifer', w: 0.15, scale: [1.0, 1.4] },                               // white pine
      ],
      riparian: { kind: 'broad', scale: [0.9, 1.3] },                                  // silver maple, willow, box elder
      under: { thick: 'oval', edge: 'oval' },
      palettes: { broad: HARDWOOD, oval: HARDWOOD },
    },
    sage: 0, willow: 1,
    rocks: { count: 8, color: 0x88827a, size: [0.1, 0.3], flat: 0.8 },              // fieldstone piles at the field edges
    road: 'asphalt', fence: 'woven',
  },
};

export const regionWorld = (id: RegionId | undefined): RegionWorld => REGION_WORLD[id ?? 'mountain_west'] ?? REGION_WORLD.mountain_west;
