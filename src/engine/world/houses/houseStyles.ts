/**
 * houseStyles.ts — r16 regional house styles (pure, tested).
 *
 * Which kind of house a town lot gets, by region, and what that kind is made
 * of: siding, windows, shutters, roof form and material, porch, garage, yard.
 * EnvironmentRenderer._houseOnLot reads the spec; the facade shader reads the
 * facade code (`facadeKind`) packed into the house box's floor-height slot.
 *
 *   Southern California — Spanish Colonial Revival (stucco, red barrel tile,
 *     arched picture windows, iron grilles, courtyard walls), Craftsman
 *     bungalows (low front gables, exposed rafters, tapered columns on piers),
 *     mid-century ranches (long low hip / flat roofs, wide eaves, ribbon and
 *     clerestory windows, two-car garage, breeze-block screen). No shutters.
 *   Pacific Northwest — Craftsman bungalows and NW contemporary (cedar
 *     shingle / dark board-and-batten, steep roofs, some mossy, deep porches).
 *   Mountain West — ranches, log houses and timber-accent houses (stone
 *     chimneys, standing-seam metal roofs, xeriscape with boulders, split rails).
 *   New England / Midwest / Deep South / city — the r14 'traditional' path
 *     (colonial / Cape / foursquare / bungalow / Creole …, chosen in the renderer).
 */

export type HouseRegion = 'city' | 'drumlin' | 'plains' | 'bayou' | 'sound' | 'mountain' | 'coast';

export type HouseStyle =
  | 'traditional'      // r14 regional path (colonial, Cape, foursquare, Creole, shotgun …)
  | 'spanish'          // Spanish Colonial Revival
  | 'craftsman'        // Craftsman bungalow
  | 'midcentury'       // mid-century modern ranch
  | 'nw_contemporary'  // Pacific Northwest contemporary
  | 'mtn_ranch'        // Mountain West ranch
  | 'mtn_log'          // log house
  | 'mtn_timber';      // timber-accent mountain house

export type Siding = 'lap' | 'stucco' | 'shingle' | 'board_batten' | 'log';
export type WindowKind = 'sash' | 'arched' | 'craftsman' | 'ribbon' | 'big';
export type RoofForm = 'side_gable' | 'front_gable' | 'hip' | 'flat' | 'shed';
export type RoofMat = 'shingle' | 'tile' | 'metal' | 'shake' | 'moss';
export type PorchKind = 'stoop' | 'full' | 'entry';
export type YardTree = 'broad' | 'oval' | 'conifer' | 'fir' | 'palm' | 'jacaranda' | 'citrus' | 'crepe' | 'magnolia';
export type FenceKind = 'hedge' | 'wood' | 'picket' | 'block' | 'split_rail';

/** Region → house-style weights (each region's mix is non-empty). */
export const STYLE_WEIGHTS: Record<HouseRegion, Partial<Record<HouseStyle, number>>> = {
  coast: { spanish: 0.5, midcentury: 0.3, craftsman: 0.2 },
  sound: { craftsman: 0.6, nw_contemporary: 0.4 },
  mountain: { mtn_ranch: 0.45, mtn_timber: 0.3, mtn_log: 0.25 },
  drumlin: { traditional: 1 },
  plains: { traditional: 1 },
  bayou: { traditional: 1 },
  city: { traditional: 1 },
};

/** A weighted pick for a lot (roll in [0, 1)). */
export function pickHouseStyle(region: string, roll: number): HouseStyle {
  const w = STYLE_WEIGHTS[(region in STYLE_WEIGHTS ? region : 'city') as HouseRegion];
  const entries = Object.entries(w) as Array<[HouseStyle, number]>;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let t = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const [k, v] of entries) { if (t < v) return k; t -= v; }
  return entries[entries.length - 1][0];
}

export interface HouseSpec {
  style: HouseStyle;
  siding: Siding;
  windows: WindowKind;
  /** Shutters allowed beside the windows (the shader still hashes which houses have them). */
  shutters: boolean;
  roof: RoofForm;
  roofMat: RoofMat;
  /** Roof rise = pitch[0] + roll · pitch[1] (world units over the house). */
  pitch: [number, number];
  /** Eave overhang added to each side of the roof (world units). */
  eave: number;
  /** Exposed rafter tails under the eaves. */
  rafters: boolean;
  /** Chance of a second storey. */
  twoStorey: number;
  porch: PorchKind;
  /** Tapered porch columns on masonry piers (Craftsman). */
  piers: boolean;
  /** Garage width in cars (attached beside the house). */
  garageCars: 1 | 2;
  walls: number[];
  roofs: number[];
  /** Trim color (window frames, fascia); null = the shader's white. */
  trim: number | null;
  /** Chimney: chance, and fieldstone rather than brick. */
  chimney: number; stoneChimney: boolean;
  /** Extras. */
  courtyardWall: number; breezeBlock: number; ironGrilles: number;
}

// ── Palettes ─────────────────────────────────────────────────────────────────
const STUCCO = [0xf0e6d2, 0xeadcc0, 0xe8d2b0, 0xf2dcc4, 0xf4f0e6, 0xe6cba6, 0xefd9bd];  // cream, sand, peach, white
const BARREL_TILE = [0xb4532e, 0xa84a2a, 0xbe5f36, 0x9e4a2c, 0xc0683e];
const EARTH = [0x7a6a4e, 0x6a5a3e, 0x8a7656, 0x5e6a4e, 0x8c6e4c, 0xa48a62, 0x6e5040];     // olive, umber, ochre, moss green
const MC_WALLS = [0xe8e4d8, 0xd8cbb0, 0xc9cfc8, 0xb8a888, 0xece6d6, 0x9ab0a8, 0xd4b48c];   // pale stucco, sand, sage, turquoise-gray
const PNW_CEDAR = [0x8a6a4a, 0x7a5c40, 0x9a7a58, 0x6e5640, 0x5e5a4e, 0x7e8478, 0x6a6e66];  // cedar, weathered gray
const PNW_DARK = [0x2e3234, 0x3a4038, 0x2a3a34, 0x4a4a48, 0x26282a, 0x3e4a52];             // charcoal, black-green, slate blue
const MTN_LOG = [0x8a6440, 0x7a5636, 0x9a7048, 0xa47a50];
const MTN_TIMBER = [0x7a5a3c, 0x6e5a48, 0xb8ab92, 0x8a7a64, 0x5e5448, 0xc8bca4];
const MTN_METAL = [0x3e4a3c, 0x5a3a2e, 0x4a4e52, 0x6e4a32, 0x2e3438, 0x7a3a2a];
const PNW_ROOF = [0x2e3236, 0x3a3e42, 0x4a4e52, 0x3e4a3c];
const SHINGLE_BROWN = [0x5a4a40, 0x4a4038, 0x6a5444, 0x3e3a36];

/** The full spec for a style (roll in [0, 1) picks within the style's variants). */
export function houseSpec(style: HouseStyle, region: string, roll: number): HouseSpec {
  const base: HouseSpec = {
    style, siding: 'lap', windows: 'sash', shutters: true, roof: 'side_gable', roofMat: 'shingle',
    pitch: [0.4, 0.25], eave: 0.05, rafters: false, twoStorey: 0.5, porch: 'stoop', piers: false, garageCars: 1,
    walls: [], roofs: [], trim: null, chimney: 0.35, stoneChimney: false, courtyardWall: 0, breezeBlock: 0, ironGrilles: 0,
  };
  switch (style) {
    case 'spanish':
      return { ...base, siding: 'stucco', windows: 'arched', shutters: false, roof: roll < 0.55 ? 'side_gable' : 'hip', roofMat: 'tile',
        pitch: [0.36, 0.1], eave: 0.075, twoStorey: 0.3, porch: 'entry', walls: STUCCO, roofs: BARREL_TILE, trim: 0x5a3a26,
        chimney: 0.35, courtyardWall: 0.35, ironGrilles: 0.6 };
    case 'craftsman': {
      const pnw = region === 'sound';
      return { ...base, siding: pnw ? (roll < 0.6 ? 'shingle' : 'lap') : 'lap', windows: 'craftsman', shutters: false, roof: 'front_gable',
        roofMat: pnw ? (roll < 0.45 ? 'moss' : 'shingle') : 'shingle',
        pitch: pnw ? [0.48, 0.22] : [0.3, 0.1], eave: 0.16, rafters: true, twoStorey: pnw ? 0.35 : 0.1, porch: 'full', piers: true,
        walls: pnw ? PNW_CEDAR : EARTH, roofs: pnw ? PNW_ROOF : SHINGLE_BROWN, trim: pnw ? 0xe6dfcc : 0xe4d8b8, chimney: 0.45 };
    }
    case 'midcentury':
      return { ...base, siding: 'stucco', windows: 'ribbon', shutters: false, roof: roll < 0.5 ? 'hip' : 'flat', roofMat: roll < 0.3 ? 'tile' : 'shingle',
        pitch: [0.16, 0.06], eave: 0.22, twoStorey: 0, porch: 'entry', garageCars: 2, walls: MC_WALLS,
        roofs: roll < 0.3 ? BARREL_TILE : [0x6a6058, 0x5a5650, 0x7a7068, 0x4e4a46], trim: 0x3a3632, chimney: 0.25, breezeBlock: 0.55 };
    case 'nw_contemporary':
      return { ...base, siding: 'board_batten', windows: 'big', shutters: false, roof: roll < 0.5 ? 'shed' : 'front_gable', roofMat: 'metal',
        pitch: [0.62, 0.25], eave: 0.12, twoStorey: 0.6, porch: 'entry', walls: PNW_DARK, roofs: [0x2a2c2e, 0x3a3e40, 0x4a4e50, 0x5a5e5c], trim: 0x1a1a1a,
        chimney: 0.15 };
    case 'mtn_ranch':
      return { ...base, siding: roll < 0.5 ? 'board_batten' : 'lap', windows: 'sash', shutters: false, roof: 'side_gable', roofMat: 'metal',
        pitch: [0.24, 0.1], eave: 0.12, twoStorey: 0, porch: 'full', garageCars: roll < 0.5 ? 2 : 1, walls: MTN_TIMBER, roofs: MTN_METAL,
        trim: 0x4a3a2a, chimney: 0.6, stoneChimney: true };
    case 'mtn_log':
      return { ...base, siding: 'log', windows: 'sash', shutters: false, roof: 'side_gable', roofMat: 'metal',
        pitch: [0.42, 0.18], eave: 0.14, twoStorey: 0.35, porch: 'full', walls: MTN_LOG, roofs: MTN_METAL, trim: 0x3a2a1c,
        chimney: 0.85, stoneChimney: true };
    case 'mtn_timber':
      return { ...base, siding: roll < 0.5 ? 'board_batten' : 'shingle', windows: 'big', shutters: false, roof: 'front_gable', roofMat: 'metal',
        pitch: [0.56, 0.22], eave: 0.14, twoStorey: 0.55, porch: 'entry', walls: MTN_TIMBER, roofs: MTN_METAL, trim: 0x3a2a1c,
        chimney: 0.7, stoneChimney: true };
    default:
      return base;
  }
}

/**
 * Facade code k (the house box carries ±(10k + storey height); the sign is the
 * door side): 1 lap + shutters (traditional), 2 stucco, 3 lap without shutters,
 * 4 Spanish stucco + arched windows, 5 Craftsman lap, 6 mid-century stucco +
 * ribbon windows, 7 cedar shingle, 8 board-and-batten + big windows, 9 log.
 */
export function facadeKind(spec: HouseSpec): number {
  if (spec.style === 'spanish') return 4;
  if (spec.style === 'midcentury') return 6;
  if (spec.siding === 'log') return 9;
  if (spec.siding === 'board_batten') return 8;
  if (spec.siding === 'shingle') return 7;
  if (spec.style === 'craftsman') return 5;
  if (spec.siding === 'stucco') return 2;
  return spec.shutters ? 1 : 3;
}

/** Facade codes whose shader branch can draw shutters. */
export const SHUTTER_CODES: readonly number[] = [1];

/** Roof material code for the roof shader (aKind): + 10 marks exposed rafters on the soffit. */
export function roofKind(spec: HouseSpec): number {
  const m = spec.roofMat === 'tile' ? 1 : spec.roofMat === 'metal' ? 2 : spec.roofMat === 'shake' ? 3 : spec.roofMat === 'moss' ? 4 : 0;
  return m + (spec.rafters ? 10 : 0);
}

export interface YardSpec {
  /** Chance the front yard is gravel / decomposed granite rather than lawn. */
  gravel: number;
  /** A small lawn patch kept on a gravel yard. */
  lawnPatch: number;
  /** Succulents / agave / boulders on a gravel yard (counts per lot). */
  succulents: number; agave: number; boulders: number;
  /** Yard tree weights. */
  trees: Partial<Record<YardTree, number>>;
  /** Rear / side lot-line fence weights. */
  fences: Partial<Record<FenceKind, number>>;
}

/** Regions whose yards r16 restyles (the others keep the r14 yards). */
export const YARD_SPECS: Partial<Record<HouseRegion, YardSpec>> = {
  coast: { gravel: 0.6, lawnPatch: 0.7, succulents: 9, agave: 2, boulders: 2, trees: { palm: 0.35, jacaranda: 0.35, citrus: 0.3 }, fences: { block: 1 } },
  sound: { gravel: 0, lawnPatch: 0, succulents: 0, agave: 0, boulders: 0, trees: { fir: 0.6, broad: 0.2, oval: 0.2 }, fences: { wood: 0.6, hedge: 0.4 } },
  mountain: { gravel: 0.6, lawnPatch: 0.3, succulents: 1, agave: 0, boulders: 4, trees: { conifer: 0.55, oval: 0.25, broad: 0.2 }, fences: { split_rail: 0.7, wood: 0.3 } },
  bayou: { gravel: 0, lawnPatch: 0, succulents: 0, agave: 0, boulders: 0, trees: { broad: 0.4, crepe: 0.3, magnolia: 0.3 }, fences: { hedge: 0.5, wood: 0.5 } },
};

/** Weighted pick from a weight table (roll in [0, 1)). */
export function pickWeighted<K extends string>(w: Partial<Record<K, number>>, roll: number): K {
  const entries = Object.entries(w) as Array<[K, number]>;
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let t = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const [k, v] of entries) { if (t < v) return k; t -= v; }
  return entries[entries.length - 1][0];
}
