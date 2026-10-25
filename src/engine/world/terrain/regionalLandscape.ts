/**
 * regionalLandscape — the land beyond the town: one continuous heightfield
 * per region (Mountain West ranges, SoCal chaparral ridges, Pacific
 * Northwest forested hills + sound + volcano, New England drumlins, Midwest
 * farmland + river, Deep South bayou; Compound Builder adds Appalachian
 * ridges and hollows, the high-desert mesas and washes, the North Woods'
 * lakes and spruce flats, the Upper Midwest's moraine farmland with kettle
 * lakes, and the Great Plains), plus the town footprint each region gets (a
 * big-city downtown only for Urban scenarios).
 *
 * Pure (no Three.js): exercised by regionalLandscape.test.ts and shared by
 * RegionalTerrainRenderer (mesh, trees, water) and EnvironmentRenderer
 * (town extent / building heights).
 *
 * Scale (SCALE v2): 1 unit ≈ 6 m. Mountain West's front-range foothills rise
 * ~60–110 units (350–650 m) a few kilometers west of town and the high
 * peaks ~300–420 units (1.8–2.5 km) behind them; New England drumlins are
 * 5–15 units (30–90 m); the Midwest varies by a couple of units.
 *
 * Heights are relative to the town ground (TOWN_Y). Inside the town the field
 * sits just below the town ground plane; it emerges past the town edge and
 * eases into the regional relief over RAMP units, so streets and blocks are
 * never buried and hills never start as a wall.
 */
import { createNoise2D } from 'simplex-noise';
import { ARROYO_MOUTH_Y, ARROYO_W0, ARROYO_WALL, arroyoJitter, arroyoZ, ARROYO_OFFSETS } from './coastline';

export type RegionKind = 'mountain' | 'coast' | 'sound' | 'drumlin' | 'plains' | 'bayou' | 'city'
  | 'appalachia' | 'desert' | 'north_woods' | 'upper_midwest';

/** Town ground height (the EnvironmentRenderer ground plane). */
export const TOWN_Y = -0.10;
/** Former under-town height; the landscape now forms the town ground itself (kept for callers). */
export const UNDER_TOWN_Y = TOWN_Y;
/** Distance over which the relief eases in past the town edge. */
export const RAMP = 60;

export function regionKindFor(locationId: string | null | undefined, urban = false): RegionKind {
  if (urban) return 'city';
  switch (locationId) {
    case 'mountain_west': return 'mountain';
    case 'southern_california': return 'coast';
    case 'pacific_northwest': return 'sound';
    case 'new_england': return 'drumlin';
    case 'midwest_plains': return 'plains';
    case 'deep_south': return 'bayou';
    default: return 'city';
  }
}

/** Town layout per region (EnvironmentRenderer). */
export interface TownSpec {
  /** Street grid extent beyond the campus edge (world units). */
  ext: number;
  /** Blocks are populated within this distance of the campus. */
  maxD: number;
  /** Skyscraper downtown (Urban scenarios only). */
  towers: boolean;
  /** Mid-rise storey cap. */
  maxStoreys: number;
  /** Distance from the campus where detached houses take over. */
  suburbFrom: number;
  /** How far the planned (non-grid) town reaches beyond the campus; defaults to ext. */
  reach?: number;
}

export function townSpecFor(kind: RegionKind): TownSpec {
  switch (kind) {
    case 'city': return { ext: 204, maxD: 150, towers: true, maxStoreys: 12, suburbFrom: 70 };
    // Puget Sound: a small flat core; contour streets climb the drift uplands beyond it
    case 'sound': return { ext: 34, maxD: 34, towers: false, maxStoreys: 4, suburbFrom: 36, reach: 96 };
    case 'coast': return { ext: 42, maxD: 42, towers: false, maxStoreys: 3, suburbFrom: 26, reach: 96 };
    case 'mountain': return { ext: 96, maxD: 90, towers: false, maxStoreys: 3, suburbFrom: 30 };
    // New England: a small flat apron round the campus; the organic town spreads over the drumlins beyond it
    case 'drumlin': return { ext: 26, maxD: 26, towers: false, maxStoreys: 3, suburbFrom: 32, reach: 96 };
    case 'plains': return { ext: 96, maxD: 88, towers: false, maxStoreys: 3, suburbFrom: 30 };
    case 'bayou': return { ext: 50, maxD: 50, towers: false, maxStoreys: 3, suburbFrom: 28, reach: 90 };
    case 'appalachia': return { ext: 26, maxD: 26, towers: false, maxStoreys: 2, suburbFrom: 20, reach: 70 };
    case 'desert': return { ext: 60, maxD: 60, towers: false, maxStoreys: 2, suburbFrom: 24 };
    case 'north_woods': return { ext: 30, maxD: 30, towers: false, maxStoreys: 2, suburbFrom: 20, reach: 70 };
    case 'upper_midwest': return { ext: 70, maxD: 64, towers: false, maxStoreys: 3, suburbFrom: 28 };
  }
}

/** Surface look parameters (RegionalTerrainRenderer shader). Heights in world units above TOWN_Y. */
export interface RegionLook {
  /** Above this the ground is alpine (scree / tundra, no trees). */
  treeLine: number;
  /** Snow line in summer / in winter (Infinity = never). */
  snowLine: number;
  snowLineWinter: number;
  /** 0..1 golden dry-grass share (SoCal chaparral). */
  dry: number;
  /** Rock tint (hex). */
  rock: number;
  /** Forest canopy tint (hex) as seen from afar. */
  forest: number;
  /** Farmland patchwork strength 0..1 and field size (units). */
  farm: number;
  fieldSize: number;
  /** Field boundaries drawn as stone walls (New England) instead of hedgerows. */
  stoneWalls: boolean;
  /** Evergreen share of the far trees (0..1). */
  evergreen: number;
  /** Ground color overriding the location tint (semi-arid regions). */
  grass?: number;
  dryGrass?: number;
  /**
   * Field layout: 'plss' axis-aligned 1-mile sections on the town grid
   * (Midwest / Mountain West), 'irregular' jittered stone-walled or
   * hedged fields (New England, Deep South, PNW clearings), 'orchard'
   * valley orchards and row crops (SoCal).
   */
  fieldMode: 'plss' | 'irregular' | 'orchard';
  /** Kudzu draped over the wood edges (Deep South). */
  kudzu?: boolean;
  /** Center-pivot irrigation circles in some quarter sections. */
  pivots?: boolean;
  /** French long lots perpendicular to the river near it. */
  longLots?: boolean;
  /** Slope (1 - n.y) where bare rock starts showing: high for rounded, soil-mantled hills. */
  rockSlope: number;
}

export function regionLookFor(kind: RegionKind): RegionLook {
  const base: RegionLook = { treeLine: 1e9, snowLine: 1e9, snowLineWinter: 1e9, dry: 0, rock: 0x7a7468, forest: 0x2f4a2a, farm: 0, fieldSize: 40, stoneWalls: false, evergreen: 0.3, fieldMode: 'irregular', rockSlope: 0.30 };
  switch (kind) {
    case 'mountain': return { ...base, treeLine: 205, snowLine: 265, snowLineWinter: 8, rock: 0x7f6b5a, forest: 0x1f3320, evergreen: 0.95, dry: 0.22, grass: 0x6c7550, dryGrass: 0x928866, farm: 0.7, fieldSize: 44, fieldMode: 'plss', pivots: true };
    // rounded chaparral-mantled ranges: rock only on the steepest sandstone faces
    case 'coast': return { ...base, dry: 0.75, rock: 0x8a7a62, forest: 0x343c22, evergreen: 0.15, grass: 0x7d7a48, dryGrass: 0xa58c5c, farm: 0.75, fieldSize: 36, fieldMode: 'orchard', rockSlope: 0.6 };
    case 'sound': return { ...base, treeLine: 260, snowLine: 210, snowLineWinter: 120, rock: 0x6a665f, forest: 0x203a26, evergreen: 0.9, farm: 0.15, fieldSize: 22 };
    case 'drumlin': return { ...base, snowLine: 1e9, snowLineWinter: -8, forest: 0x34492a, farm: 0.6, fieldSize: 26, stoneWalls: true, evergreen: 0.35, rockSlope: 0.62 };
    // Great Plains: wheat, sorghum and native grass on the section grid, cottonwoods only on the creeks; center pivots
    case 'plains': return { ...base, snowLineWinter: -15, forest: 0x34502c, farm: 1, fieldSize: 52, evergreen: 0.05, fieldMode: 'plss', pivots: true, dry: 0.3, grass: 0x6f7a44, dryGrass: 0xa39a68 };
    case 'bayou': return { ...base, forest: 0x2f4426, farm: 0.45, fieldSize: 40, evergreen: 0.35, longLots: true, kudzu: true };
    case 'city': return { ...base, farm: 0.2, fieldSize: 40, fieldMode: 'plss' };
    // oak–hickory / tulip-poplar cove forest, hay in the bottoms, sandstone ledges on the steep faces
    case 'appalachia': return { ...base, snowLineWinter: 30, forest: 0x2d4a26, evergreen: 0.2, rock: 0x8a8070, grass: 0x557a36, farm: 0.4, fieldSize: 18, rockSlope: 0.55 };
    // Colorado Plateau: tan grama grass and bare red-brown soil, pinyon–juniper on the mesas, red sandstone cliffs
    case 'desert': return { ...base, dry: 0.92, rock: 0x9c5f45, forest: 0x46553a, evergreen: 0.97, grass: 0x8c8458, dryGrass: 0xb39a72, farm: 0, fieldSize: 60, rockSlope: 0.28 };
    // spruce–fir and pine on the flats, birch and aspen in the burns, lakes and open bog
    case 'north_woods': return { ...base, snowLineWinter: -15, forest: 0x1d3424, evergreen: 0.75, rock: 0x6e6c66, grass: 0x5c6e40, farm: 0.05, fieldSize: 24, rockSlope: 0.45 };
    // dairy country: 40-acre fields on the survey grid, hardwood woodlots, kettle lakes
    case 'upper_midwest': return { ...base, snowLineWinter: -15, forest: 0x2f4a28, evergreen: 0.2, grass: 0x5f7a3c, farm: 0.9, fieldSize: 34, fieldMode: 'plss', rockSlope: 0.6 };
  }
}

/** Regional water level (lakes, rivers, sound, bayou); null = none. */
export function regionWaterY(kind: RegionKind): number | null {
  switch (kind) {
    case 'mountain': return TOWN_Y - 0.9;
    case 'sound': return TOWN_Y - 0.9;
    case 'drumlin': return TOWN_Y - 4.6;
    case 'plains': return TOWN_Y - 9.5;
    case 'bayou': return TOWN_Y - 0.25;
    case 'appalachia': return TOWN_Y - 3.2;
    case 'north_woods': return TOWN_Y - 1.1;
    case 'upper_midwest': return TOWN_Y - 2.2;
    default: return null;
  }
}

function makeRng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Mountain West canyon positions along the range front (z relative to the campus center). */
const CANYONS = [-560, -230, 150, 470, 820];
/** SoCal marine terrace risers: [distance inland from the campus center, riser height]. */
const TERRACES: Array<[number, number]> = [[190, 5], [380, 6], [620, 7]];
/** Midwest oxbow lakes: [x, z offset from the valley axis, open-side angle]. */
const OXBOWS: Array<[number, number, number]> = [[-520, 30, 1.6], [-160, -34, -1.4], [280, 28, 1.7], [640, -30, -1.5]];

function hash2(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Nearest scattered kettle (one chance per cell): distance to its center and its radius, or null. */
function kettle(x: number, z: number, cell: number, chance: number, seed: number): { d: number; r: number } | null {
  const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
  let best: { d: number; r: number } | null = null;
  for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
    if (hash2(i, j, seed) > chance) continue;
    const kx = (i + 0.2 + 0.6 * hash2(i, j, seed + 1)) * cell, kz = (j + 0.2 + 0.6 * hash2(i, j, seed + 2)) * cell;
    const r = 10 + 12 * hash2(i, j, seed + 3);
    const d = Math.hypot(x - kx, z - kz);
    if (d < r + 30 && (!best || d - r < best.d - best.r)) best = { d, r };
  }
  return best;
}

export interface RegionalFieldOptions {
  kind: RegionKind;
  /** Campus size in world units. */
  cW: number;
  cH: number;
  /** Town street extent (TownSpec.ext). */
  townExt: number;
  /** SoCal: x of the coast bluff line (land is east of it). */
  coastW?: number;
  /** v69: land graded flat for a district beyond the town apron (the medical district): the relief starts past it. */
  flat?: Array<{ x0: number; x1: number; z0: number; z1: number }>;
}

/** One sample of the regional field. */
export interface RegionSample {
  /** Ground height (world y). */
  h: number;
  /** Forest density 0..1. */
  forest: number;
  /** Farmland 0..1. */
  field: number;
}

/**
 * The regional heightfield. Coordinates are world x/z; the campus occupies
 * [0, cW] × [0, cH].
 */
export class RegionalField {
  readonly kind: RegionKind;
  readonly cx: number;
  readonly cz: number;
  readonly waterY: number | null;
  /** Town edge (Chebyshev distance from the campus rectangle) where the relief starts. */
  readonly edge: number;
  private readonly n1: (x: number, y: number) => number;
  private readonly n2: (x: number, y: number) => number;
  private readonly n3: (x: number, y: number) => number;
  private readonly o: RegionalFieldOptions;

  constructor(o: RegionalFieldOptions) {
    this.o = o;
    this.kind = o.kind;
    this.cx = o.cW / 2;
    this.cz = o.cH / 2;
    this.waterY = regionWaterY(o.kind);
    this.edge = o.townExt + 6;
    const seed = { mountain: 11, coast: 23, sound: 37, drumlin: 41, plains: 53, bayou: 67, city: 71, appalachia: 79, desert: 83, north_woods: 89, upper_midwest: 97 }[o.kind];
    this.n1 = createNoise2D(makeRng(seed));
    this.n2 = createNoise2D(makeRng(seed + 100));
    this.n3 = createNoise2D(makeRng(seed + 200));
  }

  /** Chebyshev distance outside the campus rectangle. */
  rectDist(x: number, z: number): number {
    const dx = Math.max(-x, x - this.o.cW, 0);
    const dz = Math.max(-z, z - this.o.cH, 0);
    return Math.max(dx, dz);
  }

  /** Town-edge ramp 0 (town) … 1 (open country), with a wandering start. */
  ramp(x: number, z: number): number {
    const warp = 5 * (this.n3(x * 0.006, z * 0.006) + 1);   // 0..10, outward only
    let t = sstep(this.edge, this.edge + RAMP, this.rectDist(x, z) - warp);
    // v69: a district graded flat out past the apron (the hills start again beyond it)
    for (const r of this.o.flat ?? []) {
      if (t <= 0) break;
      const d = Math.max(r.x0 - x, x - r.x1, r.z0 - z, z - r.z1, 0);
      t = Math.min(t, sstep(6, 6 + RAMP, d - warp));
    }
    return t;
  }

  private fbm(n: (x: number, y: number) => number, x: number, z: number, oct: number, lac = 2.03, gain = 0.5): number {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * n(x * f, z * f);
      norm += a;
      a *= gain; f *= lac;
    }
    return s / norm;
  }

  /** Ridged multifractal in 0..~1: sharp crests, smooth valleys, detail concentrated on the ridges. */
  private ridged(x: number, z: number, oct: number): number {
    let s = 0, f = 1, a = 0.5, w = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      let r = 1 - Math.abs(this.n2(x * f, z * f));
      r *= r;
      r *= w;
      w = Math.min(1, Math.max(0, r * 2));
      s += r * a;
      norm += a;
      f *= 2.1; a *= 0.5;
    }
    return s / norm;
  }

  /** Relief above the town datum (may be negative where water is carved). */
  relief(x: number, z: number): { rel: number; forest: number; field: number } {
    const px = x - this.cx, pz = z - this.cz;
    const d = Math.hypot(px, pz);
    const n1 = this.n1, n3 = this.n3;
    switch (this.kind) {
      case 'mountain': {
        // Front Range at Boulder: a smooth alluvial fan / high plain tilting
        // up ~1.5 % toward the west, then an ABRUPT range front (no foothill
        // belt) climbing ~1.2–1.6 km within 3–5 km. The base of the front is
        // faced with tilted sandstone flatirons; V-shaped canyons cut the
        // range and each canyon mouth feeds a low fan onto the plain.
        const F = 360 + 45 * n1(pz * 0.0016, 3.3) + 12 * n3(pz * 0.006, 1.1);
        const xw = -px - F;                                      // + west of the range front
        const xs = 0.5 * (xw + Math.sqrt(xw * xw + 64));         // smooth knee at the front
        const fan = 1.4 + 0.022 * Math.max(0, Math.min(-px, F) + 200) + 0.9 * this.fbm(n1, px * 0.004, pz * 0.004, 3);
        const crest = 0.85 + 0.3 * this.fbm(n1, pz * 0.0012, 0.5, 2);
        let H = 270 * crest * (1 - Math.exp(-xs / 330))
          + 150 * sstep(40, 600, xs) * Math.pow(this.ridged(px * 0.0016 + 7.1, pz * 0.0016 - 3.7, 4), 1.5);
        // Flatirons: triangular slabs on the lower front separated by ravines
        // pitch wanders 60–140 units along the front; only two stretches carry slabs
        const fz = (pz + 38 * n3(pz * 0.006, 4)) / (100 + 40 * n1(pz * 0.0021, 9.4));
        const fi = Math.floor(fz);
        const c = 1 - Math.abs(2 * (fz - fi) - 1);
        const zone = Math.max(Math.exp(-Math.pow((pz + 120) / 170, 2)), 0.8 * Math.exp(-Math.pow((pz - 330) / 120, 2)));
        const slabH = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(fi * 12.9898 + 4.1));
        const facet = sstep(xs / 95 - 0.12, xs / 95 + 0.05, c);
        const fmask = sstep(0, 8, xs) * (1 - sstep(70, 105, xs));
        H -= (1 - facet) * Math.min(H * 0.45, 22) * fmask * zone;
        // ...and the slabs themselves stand proud of the slope: a steep bare
        // east face rising to a sharp crest, a short drop behind it
        const slabK = zone * slabH;
        const slab = facet * fmask * 30 * slabK * sstep(6, 50, xs) * (1 - sstep(50, 78, xs));
        H += slab;
        // V-shaped canyons; fans at their mouths
        let mouths = 0;
        for (let i = 0; i < CANYONS.length; i++) {
          const zc = CANYONS[i];
          const dz = pz - zc - 30 * Math.sin(xs * 0.008 + i) - 8 * Math.sin(xs * 0.03 + i * 2);
          const D = Math.min(0.55 * H, 25 + 0.25 * xs) * sstep(-10, 30, xs);
          const v = Math.max(0, 1 - Math.abs(dz) / (18 + 0.18 * xs));
          H -= D * v;
          if (xw < 0) mouths += 5 * Math.exp(-Math.hypot(xw, (pz - zc) * 0.8) / 70);
        }
        let rel = fan + mouths + Math.max(0, H);
        // Creeks leave each canyon mouth and wander east across the fan,
        // lined with cottonwoods
        let creek = 0;
        if (xw < 0) for (let i = 0; i < CANYONS.length; i++) {
          const dzc = Math.abs(pz - CANYONS[i] - 25 * Math.sin(px * 0.01 + i) - 9 * Math.sin(px * 0.037 + 2 * i));
          rel -= 1.2 * (1 - sstep(2, 10, dzc)) * sstep(0, 60, -xw + 0);
          creek = Math.max(creek, 1 - sstep(3, 12, dzc));
        }
        // Reservoir on the plain to the south-east
        const lk = Math.hypot((px - 330) / 1.6, pz - 260) + 25 * n3(px * 0.02, pz * 0.02);
        if (lk < 95) rel = Math.min(rel, -2.2 + 2.5 * sstep(55, 95, lk));
        // Grass / sage on the fan, ponderosa + Douglas fir from the range
        // front up, irrigated fields in patches on the plain
        const forest = Math.max(sstep(-5, 25, xs) * sstep(4, 20, H) * (0.78 + 0.3 * n3(px * 0.015, pz * 0.015)) * (1 - 0.85 * Math.min(1, slab / 18)), 0.85 * creek);
        const field = (1 - sstep(-90, -10, xw)) * sstep(-0.15, 0.15, n3(px * 0.004 + 7, pz * 0.004 - 3)) * (1 - creek);
        return { rel, forest, field };
      }
      case 'coast': {
        // Stepped marine terraces (uplifted wave-cut platforms): flat treads
        // rising inland in ~20 m risers, cut by arroyos and canyons that
        // drain west to the bluff, then chaparral hills and a coastal range
        // (600–1200 m) 5–9 km inland.
        const cw = this.o.coastW ?? 0;
        const e = px + 35 * n1(pz * 0.003, 1.7) + 10 * n3(pz * 0.012, 0.4);
        let rel = 0.6 + 0.008 * Math.max(0, e);
        for (const [e0, hgt] of TERRACES) rel += hgt * sstep(e0 - 6, e0 + 6, e);
        rel += 1.6 * (this.fbm(n1, px * 0.008, pz * 0.008, 3) + 0.3) * sstep(100, 220, e);
        rel += sstep(650, 900, e) * 28 * this.ridged(px * 0.006, pz * 0.006, 3);
        // Coastal range: old, chaparral-mantled — broad rounded ridges and
        // spurs (Santa Ynez / Santa Monica), not alpine spires
        const range = sstep(850, 1500, e);
        rel += range * (75 + 135 * (this.fbm(n1, px * 0.0011 + 3, pz * 0.0011, 2, 2.03, 0.4) + 0.5) + 10 * Math.pow(this.ridged(px * 0.0018 + 3, pz * 0.0018, 2), 2));
        // Ease down to town grade toward the bluff line
        rel *= sstep(cw + 2, cw + 40, x);
        // Arroyos: flat-floored, steep-walled canyons draining west. The
        // gully floor slopes down to the beach and the canyon runs out
        // through a notch in the bluff (coastline.arroyoNotch), straight
        // for its last stretch so the two meet exactly.
        let canyon = 0;
        const head = 1 - sstep(750, 950, e);
        const xc = x - cw;                                        // inland of the bluff line
        const mouth = ARROYO_MOUTH_Y - TOWN_Y - 0.05;             // just under the strip's notch floor
        for (let i = 0; i < ARROYO_OFFSETS.length; i++) {
          const zc = arroyoZ(i, this.o.cH) - this.cz;
          const wander = sstep(20, 120, xc) * (25 * Math.sin(px * 0.011 + i) + 10 * Math.sin(px * 0.031 + i * 2));
          const dz = pz - zc - wander;
          const w0 = ARROYO_W0 + 0.012 * Math.max(0, e);
          const tread = 0.3 + 0.006 * Math.max(0, e);
          const floor = mouth + (tread - mouth) * sstep(12, 160, xc);
          const rag = arroyoJitter(z) + sstep(12, 60, xc) * 1.5 * n3(px * 0.06, pz * 0.06);
          const cut = floor + Math.max(0, Math.abs(dz) - w0 + rag) * ARROYO_WALL;
          if (cut < rel) rel += (cut - rel) * head;
          canyon = Math.max(canyon, head * (1 - sstep(w0, w0 + 22, Math.abs(dz))));
        }
        // Chaparral: dark shrub patches on golden grass, denser in the folds; oak / sycamore in the canyons
        // Orchards and row crops on the flat terrace treads between the town and the range
        const field = 0.9 * sstep(230, 300, e) * (1 - sstep(760, 860, e)) * (1 - canyon) * sstep(-0.1, 0.25, n3(px * 0.003 + 5, pz * 0.003));
        const forest = Math.max(0.75 * sstep(-0.15, 0.45, n3(px * 0.012, pz * 0.012) + 0.25 * this.fbm(n1, px * 0.03, pz * 0.03, 2)) * (1 - field), 0.85 * canyon,
          0.9 * range * sstep(-0.5, 0.0, n3(px * 0.006, pz * 0.006)));
        return { rel, forest, field };
      }
      case 'sound': {
        // Puget lowland: N–S glacial drift uplands (60–130 m) with steep
        // sides, separated by troughs the sound floods as long narrow bays.
        const wx = px + 70 * this.fbm(n1, pz * 0.0022, 0.7, 2) + 0.1 * pz;
        const upl = sstep(-0.45, 0.35, Math.sin(wx * 0.0115 + 0.65));
        let rel = -14 + 36 * upl + 4 * this.fbm(n1, px * 0.006, pz * 0.006, 3) * upl + 3 * this.ridged(px * 0.012, pz * 0.012, 2);
        // The main sound to the north-west: the same drift ridges sink under
        // it, so its islands and peninsulas run long and N–S (Vashon, Bainbridge)
        const nw = (-px - pz) * 0.7071;
        const s = nw - 230 + 110 * this.fbm(n3, px * 0.0032, pz * 0.0032, 3);
        rel = Math.max(-40, rel - 34 * sstep(-80, 220, s) - 0.04 * Math.max(0, s - 220));
        // Olympic Mountains rising beyond the sound to the west
        const oly = sstep(1150, 1600, -px + 0.2 * pz) * (70 + 200 * this.ridged(px * 0.0025, pz * 0.0025, 4));
        if (oly > 1) rel = Math.max(rel, oly);
        // A Rainier-like stratovolcano dominating the south-east skyline
        const vx = px - 1250, vz = pz - 1150;
        const vd = Math.hypot(vx, vz);
        const ang = Math.atan2(vz, vx);
        const gullies = 1 - 0.1 * Math.pow(Math.abs(Math.sin(ang * 9 + 1.3 * Math.sin(ang * 4))), 3) * sstep(30, 200, vd);
        const cone = 430 * Math.exp(-Math.pow(vd / 300, 1.45)) * gullies;
        if (cone > 1) rel = Math.max(rel, cone);
        // Douglas fir / cedar / hemlock nearly everywhere; a few clearings
        const forest = 0.95 * sstep(-0.6, -0.1, n3(px * 0.01, pz * 0.01) + 0.3);
        const field = 0.45 * sstep(0.45, 0.65, n3(px * 0.004 + 9, pz * 0.004));
        return { rel, forest: forest * (1 - field), field };
      }
      case 'drumlin': {
        // Glaciated New England: the town on a river terrace; NNW–SSE
        // drumlins (15–40 m high, 0.5–1 km long), ledgy granite knobs,
        // kettle ponds, wooded hills of 150–300 m beyond, and old rounded
        // mountains on the north-west horizon.
        const rx = -(this.cx + 150) + 45 * Math.sin(pz / 140 + 0.6) + 18 * Math.sin(pz / 47 + 2.1);
        const ad = Math.abs(px - rx);
        // valley: channel, floodplain, terrace riser up to the town terrace
        let rel = ad < 30 ? -3.6 + 0.3 * this.fbm(n3, px * 0.02, pz * 0.02, 2) : -3.6 + 4.2 * sstep(30, 44, ad);
        if (ad < 6 + 2 * n3(pz * 0.01, 3)) rel = Math.min(rel, -5.6);
        // drumlins on the upland, long axis NNW (north = -z)
        const ca = Math.cos(0.39), sa = Math.sin(0.39);
        const u = -px * sa - pz * ca, v = px * ca - pz * sa;
        const up = sstep(50, 95, ad);
        const drum = 12 * Math.pow(Math.max(0, this.fbm(n1, u * 0.0045, v * 0.013, 2) + 0.12), 1.15);
        // ledgy knobs: ridged bumps stepped into benches
        const kr = this.ridged(px * 0.011, pz * 0.011, 2);
        const kh = 8 * sstep(0.5, 0.85, kr) * sstep(0.1, 0.4, n3(px * 0.003 + 6, pz * 0.003)) * sstep(90, 170, d);
        const q = kh / 1.8, fq = Math.floor(q);
        const knob = (fq + sstep(0.45, 1, q - fq)) * 1.8;
        // wooded hills rising away from the valley, and the far mountains
        const hills = 60 * sstep(200, 560, ad) * (0.55 + 0.45 * this.fbm(n3, px * 0.0018, pz * 0.0018, 3));
        const far = sstep(750, 1400, (-px - pz) * 0.7071);
        rel += up * (0.4 + drum + knob + 1.2 * this.fbm(n3, px * 0.01, pz * 0.01, 2) + 2.2 * (this.fbm(n1, px * 0.005 + 9, pz * 0.005, 2) + 0.5)) + hills
          + far * 105 * Math.pow(Math.max(0, this.fbm(n3, px * 0.0013 + 2, pz * 0.0013, 2) + 0.45), 1.15);
        // kettle ponds: steep-sided, flat-bottomed pits scattered on the upland
        const kp = kettle(px, pz, 160, 0.4, 41);
        if (kp && up > 0.9) rel = Math.min(rel, -5.6 + 0.6 * Math.max(0, kp.d - kp.r));
        // r7: a brook south of the town, meandering west to the river in a
        // shallow wooded valley — the kind of stream New England back roads
        // cross on covered bridges (West Cornwall on the Housatonic, the
        // Cornish–Windsor and Taftsville bridges, Mill Brook in Vermont)
        const bkz = this.cz + 185 + 28 * Math.sin(px / 95 + 0.4) + 9 * Math.sin(px / 33 + 1.1);
        const bkd = Math.abs(pz - bkz);
        // (channel ~6 units across, steep 2 m banks, then a gentle valley floor rising to the upland)
        const bed = -5.6 + 0.6 * Math.max(0, Math.min(bkd, 4) - 2) + 0.1 * Math.max(0, Math.min(bkd, 50) - 4) + 0.6 * Math.max(0, bkd - 50);
        rel = Math.min(rel, bed + 30 * (1 - sstep(rx + 5, rx + 25, px)));
        // Forest: hills, knobs, patchy woodlots; drumlins + floodplain hay / pasture
        const forest = Math.max(0.7 * (1 - sstep(5, 16, bkd)) * sstep(rx + 5, rx + 25, px),sstep(8, 25, hills), 0.9 * sstep(1, 3, kh), 0.85 * sstep(-0.05, 0.25, n3(px * 0.009 + 3, pz * 0.009)) * (1 - 0.6 * sstep(3, 8, drum)), 0.9 * far, 0.8 * (1 - sstep(8, 14, ad)));
        return { rel, forest, field: 1 - forest };
      }
      case 'plains': {
        // Till plain: broad swells of a few meters; to the north a river
        // valley ~35 m deep with a wide floodplain, a strongly meandering
        // channel, oxbow lakes and steep wooded bluffs cut by ravines.
        const upland = 0.8 + 2.4 * (this.fbm(n1, px * 0.0022, pz * 0.0022, 3) + 0.5);
        const zr = -(this.cz + 310) + 60 * Math.sin(px / 260) + 25 * n3(px * 0.002, 2);
        const dv = Math.abs(pz - zr);
        const fp = -8.6 + 0.4 * this.fbm(n3, px * 0.01, pz * 0.01, 2);
        const bluff = sstep(68, 98, dv + 6 * n1(px * 0.02, 7));
        let rel = fp + (upland - fp) * bluff;
        // ravines notching the bluffs
        rel -= 4 * Math.pow(Math.max(0, Math.sin(px * 0.045 + 2 * n3(px * 0.01, 9))), 8) * bluff * (1 - sstep(100, 130, dv));
        const zc = zr + 42 * Math.sin(px / 55 + 0.4) + 14 * Math.sin(px / 19);
        const dc = Math.abs(pz - zc);
        if (dc < 6) rel = Math.min(rel, -10.4);
        // oxbow lakes: cut-off meander loops on the floodplain
        for (const ox of OXBOWS) {
          const ocz = zr + ox[1];
          const dd = Math.hypot(px - ox[0], pz - ocz);
          const oa = Math.atan2(pz - ocz, px - ox[0]);
          if (Math.abs(dd - 26) < 3.5 && Math.cos(oa - ox[2]) > -0.2 && dv < 64) rel = Math.min(rel, -10.1);
        }
        const riparian = 1 - sstep(8, 24, dc);
        const bluffs = sstep(60, 72, dv) * (1 - sstep(100, 118, dv));
        // Great Plains: no upland woods, a farmstead shelterbelt here and there (regionalFarmsteads)
        const wood = sstep(0.62, 0.72, n3(px * 0.006, pz * 0.006));
        const forest = Math.max(riparian * 0.9, bluffs * 0.7, wood * 0.55);
        return { rel, forest, field: 1 - forest };
      }
      case 'bayou': {
        // Lower Mississippi coastal plain: a big river to the west between
        // natural levees (live oaks, cane fields on the crest), backswamp
        // cypress behind them, and bayous winding through low ground.
        let rel = 0.5 + 0.7 * (this.fbm(n1, px * 0.003, pz * 0.003, 3) + 0.4);
        const ch = Math.abs(this.fbm(n3, px * 0.0042, pz * 0.0042, 3));
        if (ch < 0.035) rel = Math.min(rel, -0.9);
        else if (ch < 0.07) rel = Math.min(rel, -0.9 + (ch - 0.035) * 40);
        const swamp = sstep(0.15, 0.35, this.fbm(n1, px * 0.002 + 5, pz * 0.002, 2));
        rel = rel * (1 - swamp) + swamp * Math.min(rel, -0.05 + 0.4 * n3(px * 0.03, pz * 0.03));
        // the river: channel, levee crest, long back-slope into the backswamp
        const rx = -(this.cx + 260) + 70 * Math.sin(pz / 300) + 30 * n3(pz * 0.002, 1);
        const ad = Math.abs(px - rx);
        const river = ad < 24 ? -1.5 : ad < 34 ? -1.5 + 3.1 * sstep(24, 34, ad) : 1.6 - 1.9 * sstep(34, 130, ad) + 0.2 * n3(px * 0.03, pz * 0.03);
        const wr = 1 - sstep(140, 260, ad);
        rel = rel + (river - rel) * wr;
        const back = sstep(70, 120, ad) * wr;
        const forest = Math.max(0.85 * swamp, 0.9 * back, 0.55 * sstep(34, 60, ad) * (1 - sstep(60, 90, ad)), 0.5 * sstep(0.0, 0.3, n3(px * 0.008, pz * 0.008)));
        return { rel, forest, field: (1 - forest) * 0.7 };
      }
      case 'appalachia': {
        // Dissected plateau / Blue Ridge: rounded ridges 150–450 m above
        // V-shaped hollows (billowed noise: creases are the hollows), a
        // higher range on the east skyline, the home creek running west →
        // east down its hollow, and a river (TVA lake) in the big valley to
        // the south.
        const wx = px + 40 * n3(pz * 0.004, 2.1), wz = pz + 40 * n3(px * 0.004, 7.3);
        let bill = 0, a = 1, f = 0.0042, nrm = 0;
        for (let i = 0; i < 4; i++) { bill += a * Math.abs(n1(wx * f, wz * f)); nrm += a; a *= 0.5; f *= 2.05; }
        bill /= nrm;                                               // 0 in the creases … ~0.7 on the knobs
        let rel = 4 + 70 * Math.pow(bill, 1.05) + 55 * sstep(500, 1100, px + 0.3 * pz) * (0.6 + 0.4 * this.fbm(n3, px * 0.0015, pz * 0.0015, 2));
        // the home hollow continues off the parcel both ways
        const hz = Math.abs(pz - 8 * Math.sin(px / 60) - 4 * n3(px * 0.02, 1));
        rel = Math.min(rel, 1.2 + 0.32 * Math.max(0, hz - 8) + 0.002 * Math.max(0, hz - 8) ** 2);
        // the river valley: flat bottom, steep wooded sides
        const rz = pz - 330 - 40 * Math.sin(px / 210) - 20 * n3(px * 0.003, 4);
        const ad = Math.abs(rz);
        if (ad < 120) rel = Math.min(rel, ad < 30 ? -4.5 : -4.5 + 0.12 * (ad - 30) ** 1.25);
        const bottom = 1 - sstep(2, 9, rel);
        const field = 0.85 * bottom * sstep(-0.2, 0.25, n3(px * 0.01 + 4, pz * 0.01));
        const forest = Math.max(0.92 * (1 - field), 0) * (rel < -3 ? 0 : 1);
        return { rel, forest, field };
      }
      case 'desert': {
        // Colorado Plateau high desert: a broad basin of grama grass and
        // bare soil cut by sandy washes, flat-topped mesas and buttes with
        // a sandstone caprock (cliff over a talus slope, 60–200 m high),
        // a far volcanic range on the south skyline.
        let rel = 0.6 + 0.0035 * Math.max(0, -px) + 1.2 * (this.fbm(n1, px * 0.004, pz * 0.004, 3) + 0.4);
        const m = this.fbm(n1, px * 0.0021 + 3.3, pz * 0.0021 - 1.7, 3) + 0.25 * n3(px * 0.009, pz * 0.009);
        // two caprock tiers: risers are short and steep, treads flat
        // (the nearest mesa stands a kilometer or so off: the place is on the open bajada)
        const far = sstep(150, 280, d);
        const tier1 = sstep(0.16, 0.2, m) * far, tier2 = sstep(0.36, 0.39, m) * far;
        const talus = sstep(0.04, 0.16, m) * far;
        rel += 6 * talus + 24 * tier1 + 16 * tier2;
        const range = sstep(900, 1500, pz - 0.2 * px) * (40 + 120 * this.ridged(px * 0.002, pz * 0.002, 3));
        rel = Math.max(rel, range);
        // washes: dendritic sandy channels on the flats
        const w = Math.abs(this.fbm(n3, px * 0.003 + 9, pz * 0.003, 3));
        if (talus < 0.5) rel -= 0.9 * (1 - sstep(0.012, 0.03, w));
        // pinyon–juniper on the talus and mesa tops, scattered juniper on the flats
        const pj = sstep(-0.2, 0.3, n3(px * 0.02, pz * 0.02));
        const forest = Math.max(0.62 * talus * (0.5 + 0.5 * pj), 0.5 * tier1 * pj, 0.48 * pj * sstep(0.1, 0.5, n1(px * 0.006 + 1, pz * 0.006)));
        return { rel, forest, field: 0 };
      }
      case 'north_woods': {
        // Laurentian shield / Maine lowland: low glacial swells and eskers,
        // lakes everywhere (kettles and scoured basins), open sphagnum bogs
        // in the low spots, spruce–fir forest on the rest.
        let rel = 1.2 + 4.5 * (this.fbm(n1, px * 0.0035, pz * 0.0035, 4) + 0.45) + 2.5 * Math.pow(this.ridged(px * 0.006, pz * 0.006, 2), 2);
        const kp = kettle(px, pz, 150, 0.55, 89);
        if (kp && d > 120) rel = Math.min(rel, -2.2 + 0.25 * Math.max(0, kp.d - kp.r * 1.6));
        // a big lake to the north-west
        const lk = Math.hypot((px + 420) / 1.8, pz + 380) + 40 * n3(px * 0.006, pz * 0.006);
        if (lk < 260) rel = Math.min(rel, -3 + 4 * sstep(200, 260, lk));
        const bog = sstep(0.2, 0.32, this.fbm(n3, px * 0.004 + 5, pz * 0.004, 2)) * (1 - sstep(1, 3, rel));
        const forest = 0.94 * (1 - bog) * (rel < -1 ? 0 : 1);
        return { rel: rel - 0.6 * bog, forest, field: 0.05 * (1 - forest) };
      }
      case 'upper_midwest': {
        // End moraine and outwash: rolling hills of 10–40 m, kettle lakes,
        // a hardwood woodlot on most quarter sections, the rest in hay,
        // corn and pasture on the survey grid.
        let rel = 1 + 5.5 * (this.fbm(n1, px * 0.0045, pz * 0.0045, 3) + 0.45) + 3 * this.fbm(n3, px * 0.012, pz * 0.012, 2);
        const kp = kettle(px, pz, 190, 0.45, 97);
        if (kp && d > 110) rel = Math.min(rel, -3.6 + 0.35 * Math.max(0, kp.d - kp.r));
        const cell = 67, ci = Math.floor(px / cell), cj = Math.floor(pz / cell);
        const lot = hash2(ci, cj, 97) < 0.3 ? 1 : 0;
        // (and wooded draws and kettle rims the plow never took)
        const draws = sstep(0.5, 0.7, n3(px * 0.008 + 3, pz * 0.008 - 5));
        const forest = Math.max(0.88 * lot, 0.8 * draws) * (rel < -2 ? 0 : 1);
        return { rel, forest, field: 1 - forest };
      }
      case 'city':
      default: {
        const rel = 3 + 14 * (this.fbm(n1, px * 0.003, pz * 0.003, 4) + 0.4);
        void d;
        return { rel, forest: 0.4 * sstep(0, 0.4, n3(px * 0.01, pz * 0.01)), field: 0.2 };
      }
    }
  }

  /** Ground height, forest and farmland at (x, z). */
  sample(x: number, z: number): RegionSample {
    const t = this.ramp(x, z);
    // Inside the town the landscape is the flat town ground (one material, no seam)
    if (t <= 0) {
      // Planned towns (New England village, Deep South / Pacific NW towns):
      // unbuilt land inside the town's reach stays woods, pasture and fields
      // — Oxford MS / Athens GA sit in pine woods and pasture, Corvallis /
      // Bellingham in fir woods and fields — not in a mown lawn (trees keep
      // off the lots / roads when planted)
      if (this.kind === 'drumlin' || this.kind === 'bayou' || this.kind === 'sound') {
        const r0 = this.relief(x, z), a = sstep(6, 20, this.rectDist(x, z));
        return { h: TOWN_Y, forest: r0.forest * a, field: r0.field * a };
      }
      return { h: TOWN_Y, forest: 0, field: 0 };
    }
    const r = this.relief(x, z);
    // Water / valleys only well clear of the town
    const deep = sstep(this.edge + RAMP * 0.6, this.edge + RAMP * 1.6, this.rectDist(x, z));
    let rel = r.rel >= 0.4 ? r.rel : 0.4 + (r.rel - 0.4) * deep;
    // Big relief builds up over a longer run so the first hills are not a wall
    if (rel > 10) rel = 10 + (rel - 10) * sstep(this.edge, this.edge + RAMP * 3, this.rectDist(x, z));
    let h = TOWN_Y + rel * t;
    if (this.waterY !== null && deep > 0) {
      // keep ground off the water line: banks at least ~0.3 above it, beds 0.3 below
      const d = h - this.waterY;
      if (Math.abs(d) < 1) h += ((Math.sign(d) || 1) * (0.3 + 0.7 * Math.abs(d)) - d) * deep;
    }
    const wet = this.waterY !== null && h < this.waterY + 0.05;
    return { h, forest: wet ? 0 : r.forest * t, field: wet ? 0 : r.field * sstep(0.45, 1, t) };
  }

  /** World x of the main N–S river's center line at z (New England, Deep South), else null. */
  riverAxisX(z: number): number | null {
    const pz = z - this.cz;
    if (this.kind === 'drumlin') return -150 + 45 * Math.sin(pz / 140 + 0.6) + 18 * Math.sin(pz / 47 + 2.1);
    if (this.kind === 'bayou') return -260 + 70 * Math.sin(pz / 300) + 30 * this.n3(pz * 0.002, 1);
    return null;
  }

  /** Slope (rise / run) of the field at (x, z). */
  slope(x: number, z: number, e = 2): number {
    return Math.hypot(this.height(x + e, z) - this.height(x - e, z), this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
  }

  height(x: number, z: number): number {
    return this.sample(x, z).h;
  }
}
