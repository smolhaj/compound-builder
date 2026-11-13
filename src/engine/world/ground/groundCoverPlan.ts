/**
 * groundCoverPlan — where the near-camera ground cover stands (pure, no
 * Three.js; tested by groundCoverPlan.test.ts).
 *
 * The ground cover is the little stuff that makes a terrain stop reading as a
 * flat painted sheet: grass tufts, tall seed-head grass, wildflowers, ferns,
 * sage and cactus, bramble, low plants (card tiles); fallen leaves, needles,
 * twigs, gravel and worn-dirt scuffs (flat decal tiles); loose stones (3D).
 * It only exists around the camera's focus, in square chunks that are planned
 * lazily, cached and re-planned when the host says the place changed.
 *
 * A chunk plan is a pure function of (chunk, region profile, quality, sampler),
 * so the same patch of ground always grows the same plants (nothing shuffles
 * when the camera comes back), and the sampler is where "no growth through
 * buildings, paths, crops, fence lines or pens" lives: it returns a 0..1
 * `density` for the spot (0 = built on / blocked) and a 0..1 `worn` for trodden
 * ground (paths, doors, paddocks).
 *
 * SCALE v2: 1 unit ≈ 6 m, a person is 0.28 tall. A tuft is 0.07–0.09 tall
 * (≈ 45 cm), tall grass 0.14 (≈ 85 cm), a fern 0.13, sage 0.10, a stone 0.012–0.03.
 */
import type { RegionKind } from '../terrain/regionalLandscape';
import type { Quality } from '../WorldScene';

/** Card tiles (the atlas in groundAtlas.ts paints these; the order is the tile index). */
export const CARD = { TUFT: 0, TALL: 1, STRAW: 2, FERN: 3, DAISY: 4, SPIKE: 5, SCRUB: 6, CACTUS: 7, YUCCA: 8, CLOVER: 9, BRAMBLE: 10, LOW: 11 } as const;
export type CardTile = (typeof CARD)[keyof typeof CARD];
/** Flat litter tiles. */
export const LIT = { OAK: 0, MAPLE: 1, NEEDLES: 2, TWIGS: 3, GRAVEL: 4, SCUFF: 5, CONES: 6, THATCH: 7 } as const;
export type LitterTile = (typeof LIT)[keyof typeof LIT];

/** Card size (world units): width, height at scale 1. */
export const CARD_SIZE: Record<number, readonly [number, number]> = {
  [CARD.TUFT]: [0.13, 0.075], [CARD.TALL]: [0.14, 0.14], [CARD.STRAW]: [0.12, 0.1], [CARD.FERN]: [0.22, 0.13],
  [CARD.DAISY]: [0.12, 0.09], [CARD.SPIKE]: [0.1, 0.12], [CARD.SCRUB]: [0.2, 0.1], [CARD.CACTUS]: [0.1, 0.075],
  [CARD.YUCCA]: [0.13, 0.1], [CARD.CLOVER]: [0.1, 0.035], [CARD.BRAMBLE]: [0.2, 0.12], [CARD.LOW]: [0.1, 0.04],
};

type Weights = ReadonlyArray<readonly [number, number]>;

export interface GroundProfile {
  /** Tile weights on open ground / under trees (they blend by how wooded the spot is). */
  open: Weights;
  wood: Weights;
  /** Density of the cover on open ground / in woods (1 = the quality tier's full density). */
  openDensity: number;
  woodDensity: number;
  /** Height multiplier for the grass tiles (the plains' tall grass). */
  grassHeight: number;
  /** Wildflower colors (sRGB hex); one drift of flowers is one color. */
  flowers: readonly number[];
  /** Flowers show in spring only (the desert's bloom after the rains) instead of spring through summer. */
  springFlowers: boolean;
  /** Ferns stay green through the winter (sword fern, PNW). */
  evergreenFern: boolean;
  litterOpen: Weights;
  litterWood: Weights;
  /** Litter density (flat decals) in the open / in woods, 1 = full. */
  litterOpenDensity: number;
  litterWoodDensity: number;
  /** Leaf colors (sRGB hex) for the oak / maple litter tiles. */
  oakLeaves: readonly number[];
  mapleLeaves: readonly number[];
  /** Loose stones: color (sRGB hex) and density (0..1 of the tier's stones). */
  stoneColor: number;
  stoneDensity: number;
  /** Bare soil colour of the worn scuffs (sRGB hex). */
  soil: number;
}

const OAK = [0x7a5a2c, 0x8d6a30, 0x5f3f1f, 0xa07a3a, 0x6b4a26];
const MAPLE = [0xb5381a, 0xd2681a, 0xd9a21e, 0x9c2a14, 0xe0b52a];

const DEFAULT: GroundProfile = {
  open: [[CARD.TUFT, 0.5], [CARD.TALL, 0.12], [CARD.STRAW, 0.06], [CARD.DAISY, 0.07], [CARD.SPIKE, 0.03], [CARD.CLOVER, 0.14], [CARD.SCRUB, 0.02]],
  wood: [[CARD.TUFT, 0.25], [CARD.FERN, 0.2], [CARD.CLOVER, 0.15], [CARD.BRAMBLE, 0.12], [CARD.LOW, 0.15], [CARD.STRAW, 0.08]],
  openDensity: 1, woodDensity: 0.6, grassHeight: 1,
  flowers: [0xf2efe6, 0xe9c32a, 0xb0589a, 0xd0452c], springFlowers: false, evergreenFern: false,
  litterOpen: [[LIT.THATCH, 0.4], [LIT.TWIGS, 0.25], [LIT.GRAVEL, 0.2], [LIT.OAK, 0.1], [LIT.MAPLE, 0.05]],
  litterWood: [[LIT.OAK, 0.3], [LIT.MAPLE, 0.15], [LIT.TWIGS, 0.3], [LIT.NEEDLES, 0.1], [LIT.CONES, 0.05], [LIT.GRAVEL, 0.1]],
  litterOpenDensity: 0.6, litterWoodDensity: 1,
  oakLeaves: OAK, mapleLeaves: MAPLE, stoneColor: 0x7a7468, stoneDensity: 0.5, soil: 0x5a4630,
};

/** The ground cover each region grows (the seven playable regions are tuned; the rest blend the default). */
export function groundProfileFor(kind: RegionKind): GroundProfile {
  const d = DEFAULT;
  switch (kind) {
    // Mountain West: bunchgrass and sage on the benches, lupine, balsamroot and paintbrush, needles under the pines
    case 'mountain': return { ...d,
      open: [[CARD.TUFT, 0.36], [CARD.TALL, 0.14], [CARD.STRAW, 0.1], [CARD.DAISY, 0.05], [CARD.SPIKE, 0.08], [CARD.SCRUB, 0.14], [CARD.CLOVER, 0.08]],
      wood: [[CARD.TUFT, 0.26], [CARD.STRAW, 0.12], [CARD.FERN, 0.06], [CARD.CLOVER, 0.16], [CARD.BRAMBLE, 0.1], [CARD.LOW, 0.3]],
      flowers: [0x7a5fc0, 0xe9b82a, 0xf2efe6, 0xc8412c], woodDensity: 0.5,
      litterOpen: [[LIT.THATCH, 0.4], [LIT.TWIGS, 0.2], [LIT.GRAVEL, 0.3], [LIT.NEEDLES, 0.06], [LIT.MAPLE, 0.04]],
      litterWood: [[LIT.NEEDLES, 0.5], [LIT.TWIGS, 0.22], [LIT.CONES, 0.14], [LIT.GRAVEL, 0.1], [LIT.MAPLE, 0.04]],
      mapleLeaves: [0xd9a21e, 0xe0b52a, 0xc98a1a], stoneColor: 0x7f6b5a, stoneDensity: 0.8, soil: 0x6a5238 };
    // Southern California: dry golden grass, sage, yucca, poppies
    case 'coast': return { ...d,
      open: [[CARD.TUFT, 0.3], [CARD.STRAW, 0.28], [CARD.TALL, 0.1], [CARD.SCRUB, 0.16], [CARD.YUCCA, 0.04], [CARD.DAISY, 0.06], [CARD.SPIKE, 0.04], [CARD.CLOVER, 0.02]],
      wood: [[CARD.TUFT, 0.2], [CARD.STRAW, 0.2], [CARD.SCRUB, 0.3], [CARD.BRAMBLE, 0.2], [CARD.LOW, 0.1]],
      flowers: [0xe98a14, 0xe9c32a, 0x7a5fc0], springFlowers: true, litterOpen: [[LIT.THATCH, 0.5], [LIT.GRAVEL, 0.3], [LIT.TWIGS, 0.2]],
      litterWood: [[LIT.OAK, 0.4], [LIT.TWIGS, 0.3], [LIT.THATCH, 0.2], [LIT.GRAVEL, 0.1]], soil: 0x7a5e3c, stoneColor: 0x8a7a62 };
    // Pacific Northwest: lush grass, sword fern under the firs, bramble, moss mounds, cones and needles
    case 'sound': return { ...d,
      open: [[CARD.TUFT, 0.5], [CARD.TALL, 0.14], [CARD.CLOVER, 0.14], [CARD.FERN, 0.06], [CARD.BRAMBLE, 0.06], [CARD.SPIKE, 0.05], [CARD.DAISY, 0.05]],
      wood: [[CARD.FERN, 0.52], [CARD.BRAMBLE, 0.1], [CARD.LOW, 0.2], [CARD.TUFT, 0.1], [CARD.CLOVER, 0.08]],
      woodDensity: 1.0, evergreenFern: true, flowers: [0xb0589a, 0xf2efe6, 0xe9c32a, 0x8a5cc0],
      litterOpen: [[LIT.NEEDLES, 0.3], [LIT.TWIGS, 0.3], [LIT.MAPLE, 0.15], [LIT.CONES, 0.1], [LIT.GRAVEL, 0.15]],
      litterWood: [[LIT.NEEDLES, 0.4], [LIT.TWIGS, 0.28], [LIT.CONES, 0.14], [LIT.MAPLE, 0.14], [LIT.GRAVEL, 0.04]],
      mapleLeaves: [0xd2a21e, 0xc98a1a, 0xb87418], litterWoodDensity: 1.2, stoneColor: 0x6a665f, stoneDensity: 0.5, soil: 0x3c3022 };
    // Appalachia: oak and maple leaf litter over everything, fern, bramble, black-eyed Susan
    case 'appalachia': return { ...d,
      open: [[CARD.TUFT, 0.46], [CARD.TALL, 0.14], [CARD.CLOVER, 0.14], [CARD.DAISY, 0.08], [CARD.SPIKE, 0.04], [CARD.BRAMBLE, 0.08], [CARD.FERN, 0.04], [CARD.STRAW, 0.02]],
      wood: [[CARD.FERN, 0.34], [CARD.BRAMBLE, 0.12], [CARD.LOW, 0.2], [CARD.TUFT, 0.16], [CARD.CLOVER, 0.12], [CARD.STRAW, 0.06]],
      woodDensity: 0.85, flowers: [0xe9b214, 0xf2efe6, 0xb0589a, 0xd8d04a],
      litterOpen: [[LIT.OAK, 0.3], [LIT.MAPLE, 0.15], [LIT.TWIGS, 0.25], [LIT.THATCH, 0.2], [LIT.GRAVEL, 0.1]],
      litterWood: [[LIT.OAK, 0.46], [LIT.MAPLE, 0.2], [LIT.TWIGS, 0.22], [LIT.CONES, 0.04], [LIT.GRAVEL, 0.08]], litterWoodDensity: 1.5, litterOpenDensity: 0.8,
      stoneColor: 0x8a8070, stoneDensity: 0.7, soil: 0x4e3a26 };
    // North woods: needle duff, twigs and cones, mounded low plants and bracken, fireweed, granite
    case 'north_woods': return { ...d,
      open: [[CARD.TUFT, 0.38], [CARD.TALL, 0.1], [CARD.LOW, 0.2], [CARD.SPIKE, 0.1], [CARD.FERN, 0.08], [CARD.STRAW, 0.08], [CARD.CLOVER, 0.06]],
      wood: [[CARD.LOW, 0.34], [CARD.FERN, 0.3], [CARD.TUFT, 0.12], [CARD.BRAMBLE, 0.08], [CARD.STRAW, 0.1], [CARD.CLOVER, 0.06]],
      woodDensity: 0.85, flowers: [0xc8509c, 0xf2efe6, 0xe9c32a],
      litterOpen: [[LIT.NEEDLES, 0.34], [LIT.TWIGS, 0.28], [LIT.THATCH, 0.18], [LIT.CONES, 0.08], [LIT.GRAVEL, 0.12]],
      litterWood: [[LIT.NEEDLES, 0.52], [LIT.TWIGS, 0.26], [LIT.CONES, 0.14], [LIT.MAPLE, 0.04], [LIT.GRAVEL, 0.04]], litterWoodDensity: 1.4, litterOpenDensity: 0.9,
      mapleLeaves: [0xd9a21e, 0xe0b52a, 0xb5381a], stoneColor: 0x6e6c66, stoneDensity: 1.0, soil: 0x4a3a28 };
    // Desert Southwest: sparse dry bunchgrass, sage and desert shrub, prickly pear, yucca, gravel and red stones, spring bloom
    case 'desert': return { ...d,
      open: [[CARD.SCRUB, 0.34], [CARD.STRAW, 0.18], [CARD.TUFT, 0.16], [CARD.CACTUS, 0.12], [CARD.YUCCA, 0.08], [CARD.DAISY, 0.06], [CARD.SPIKE, 0.06]],
      wood: [[CARD.SCRUB, 0.4], [CARD.STRAW, 0.2], [CARD.TUFT, 0.12], [CARD.CACTUS, 0.1], [CARD.YUCCA, 0.1], [CARD.LOW, 0.08]],
      openDensity: 0.5, woodDensity: 0.45, flowers: [0xe9b214, 0xe98a14, 0xc8509c, 0xf2efe6], springFlowers: true,
      litterOpen: [[LIT.GRAVEL, 0.6], [LIT.THATCH, 0.2], [LIT.TWIGS, 0.2]], litterWood: [[LIT.GRAVEL, 0.5], [LIT.TWIGS, 0.3], [LIT.NEEDLES, 0.1], [LIT.THATCH, 0.1]],
      litterOpenDensity: 0.9, litterWoodDensity: 0.9, stoneColor: 0x9c5f45, stoneDensity: 1.6, soil: 0x8a5a3a };
    // Great Plains: tall native grass, seed heads, coneflower and black-eyed Susan, straw thatch
    case 'plains': return { ...d,
      open: [[CARD.TALL, 0.44], [CARD.TUFT, 0.24], [CARD.STRAW, 0.1], [CARD.DAISY, 0.08], [CARD.SPIKE, 0.08], [CARD.CLOVER, 0.06]],
      wood: [[CARD.TALL, 0.3], [CARD.TUFT, 0.2], [CARD.BRAMBLE, 0.15], [CARD.CLOVER, 0.15], [CARD.FERN, 0.1], [CARD.STRAW, 0.1]],
      grassHeight: 1.25, openDensity: 1.15, woodDensity: 0.7, flowers: [0xe9b214, 0xb0589a, 0xf2efe6, 0xd0452c],
      litterOpen: [[LIT.THATCH, 0.55], [LIT.TWIGS, 0.2], [LIT.GRAVEL, 0.15], [LIT.OAK, 0.1]], litterWood: [[LIT.OAK, 0.4], [LIT.TWIGS, 0.3], [LIT.THATCH, 0.2], [LIT.MAPLE, 0.1]],
      litterOpenDensity: 0.7, stoneColor: 0x8a8272, stoneDensity: 0.3, soil: 0x5e4630 };
    case 'upper_midwest': return { ...d,
      open: [[CARD.TALL, 0.3], [CARD.TUFT, 0.34], [CARD.STRAW, 0.06], [CARD.DAISY, 0.1], [CARD.SPIKE, 0.06], [CARD.CLOVER, 0.14]],
      wood: [[CARD.FERN, 0.26], [CARD.TUFT, 0.2], [CARD.BRAMBLE, 0.14], [CARD.CLOVER, 0.14], [CARD.LOW, 0.16], [CARD.STRAW, 0.1]],
      grassHeight: 1.1, woodDensity: 0.8, flowers: [0xe9b214, 0xb0589a, 0xf2efe6, 0x8a5cc0],
      litterWood: [[LIT.OAK, 0.4], [LIT.MAPLE, 0.25], [LIT.TWIGS, 0.25], [LIT.NEEDLES, 0.05], [LIT.GRAVEL, 0.05]], litterWoodDensity: 1.3,
      stoneColor: 0x8a8478, stoneDensity: 0.5, soil: 0x4e3a26 };
    case 'hill_country': return { ...d,
      open: [[CARD.TUFT, 0.3], [CARD.STRAW, 0.22], [CARD.TALL, 0.12], [CARD.SCRUB, 0.14], [CARD.CACTUS, 0.06], [CARD.YUCCA, 0.04], [CARD.DAISY, 0.06], [CARD.SPIKE, 0.06]],
      wood: [[CARD.SCRUB, 0.3], [CARD.STRAW, 0.2], [CARD.TUFT, 0.2], [CARD.BRAMBLE, 0.15], [CARD.LOW, 0.15]], openDensity: 0.75, springFlowers: true,
      flowers: [0x3a5fc0, 0xd0452c, 0xe9c32a, 0xf2efe6], litterOpen: [[LIT.GRAVEL, 0.4], [LIT.THATCH, 0.35], [LIT.TWIGS, 0.25]], stoneColor: 0xc4bba4, stoneDensity: 1.2, soil: 0x8a7a5c };
    case 'ozarks': case 'rust_belt': return { ...d, wood: [[CARD.FERN, 0.3], [CARD.BRAMBLE, 0.14], [CARD.LOW, 0.16], [CARD.TUFT, 0.18], [CARD.CLOVER, 0.12], [CARD.STRAW, 0.1]],
      litterWood: [[LIT.OAK, 0.44], [LIT.MAPLE, 0.2], [LIT.TWIGS, 0.26], [LIT.GRAVEL, 0.1]], litterWoodDensity: 1.4, stoneColor: 0x9c968a, stoneDensity: 0.7 };
    default: return d;
  }
}

/** What the host knows about a spot of ground. */
export interface CoverSample {
  /** Forest share 0..1 (the terrain's forest mask: trees stand here, so it is woods floor). */
  forest: number;
  /** Cropland share 0..1 (nothing wild grows in a crop field). */
  field: number;
  /** 0 = built on / road / fence line / pen / water; 1 = free ground. Fractions thin the cover (path shoulders). */
  density: number;
  /** 0..1 trodden bare ground (paths, doors, paddocks): scuffs of soil, no grass. */
  worn: number;
}

export interface CoverSampler {
  /** The drawn ground height. */
  height(x: number, z: number): number;
  at(x: number, z: number): CoverSample;
}

export interface QualityDensity { cards: number; litter: number; stones: number; scuffs: number }
/** Planned items per square world unit at full density (the quality tier). */
export const DENSITY: Record<Quality, QualityDensity> = {
  high: { cards: 11.5, litter: 12, stones: 0.5, scuffs: 6 },
  medium: { cards: 7.5, litter: 7, stones: 0.28, scuffs: 3.5 },
  low: { cards: 3.2, litter: 2.2, stones: 0.08, scuffs: 1.2 },
};

/** Radius (world units) the cover reaches from the focus: it fades to nothing at `fadeEnd`. */
export const REACH: Record<Quality, { fadeStart: number; fadeEnd: number }> = {
  high: { fadeStart: 6.5, fadeEnd: 10.5 },
  medium: { fadeStart: 5, fadeEnd: 8 },
  low: { fadeStart: 3.5, fadeEnd: 5.5 },
};

export const CHUNK = 4;

// ── Pure helpers ─────────────────────────────────────────────────────────────

export function srgbToLinear(c: number): number { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function hexLinear(hex: number): [number, number, number] {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}

/** Integer hash to [0, 1). */
export function hash2(ix: number, iz: number, salt = 0): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function rng(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/** Smooth value noise (one octave) in [0, 1). */
export function vnoise(x: number, z: number, salt = 0): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt), c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function pick(ws: Weights, scale: (tile: number) => number, r: number): number {
  let total = 0;
  for (const [t, w] of ws) total += w * scale(t);
  if (total <= 0) return -1;
  let x = r * total;
  for (const [t, w] of ws) { x -= w * scale(t); if (x <= 0) return t; }
  return ws[ws.length - 1][0];
}

function blend(a: Weights, b: Weights, k: number): Array<[number, number]> {
  const m = new Map<number, number>();
  for (const [t, w] of a) m.set(t, (m.get(t) ?? 0) + w * (1 - k));
  for (const [t, w] of b) m.set(t, (m.get(t) ?? 0) + w * k);
  return [...m.entries()];
}

/** Card stride: x, y, z, rot, width, height, tile, rand, r, g, b (r g b: a flower's color; 1 1 1 elsewhere). */
export const CARD_STRIDE = 11;
/** Litter stride: x, y, z, rot, size, tile, rand, r, g, b, nx, nz. */
export const LITTER_STRIDE = 12;
/** Stone stride: x, y, z, rot, size, squash, r, g, b. */
export const STONE_STRIDE = 9;

export interface ChunkPlan {
  cards: Float32Array; litter: Float32Array; stones: Float32Array;
}

export interface PlanOptions {
  /** Cap on items from one chunk (a runaway density can't blow a buffer). */
  maxPerChunk?: number;
  /** Density of the whole cover, 0..1 (the user's slider; 1 = full). */
  amount?: number;
}

/**
 * Plan one chunk (CHUNK × CHUNK world units, origin at (ix, iz) × CHUNK): the
 * same inputs always give the same plants.
 */
export function planChunk(ix: number, iz: number, profile: GroundProfile, quality: Quality, sampler: CoverSampler, opt: PlanOptions = {}): ChunkPlan {
  const dens = DENSITY[quality], amount = opt.amount ?? 1;
  const x0 = ix * CHUNK, z0 = iz * CHUNK, area = CHUNK * CHUNK;
  const r = rng(Math.imul(ix, 73856093) ^ Math.imul(iz, 19349663) ^ 0x5bd1e995);
  const cards: number[] = [], litter: number[] = [], stones: number[] = [];
  const flowerCols = profile.flowers.map(hexLinear);
  const oak = profile.oakLeaves.map(hexLinear), maple = profile.mapleLeaves.map(hexLinear);
  const stoneRgb = hexLinear(profile.stoneColor);

  // slope as the shader reads it (1 - normal.y) from the drawn heights
  const E = 0.3;
  const slopeAt = (x: number, z: number, y: number): [number, number, number, number] => {
    const gx = (sampler.height(x + E, z) - sampler.height(x - E, z)) / (2 * E), gz = (sampler.height(x, z + E) - sampler.height(x, z - E)) / (2 * E);
    const len = Math.hypot(gx, 1, gz);
    return [1 - 1 / len, -gx / len, -gz / len, y];
  };

  // ── cards
  const nCards = Math.round(area * dens.cards * amount);
  for (let i = 0; i < nCards; i++) {
    const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, rr = r(), rp = r(), rs = r(), rj = r();
    const s = sampler.at(x, z);
    if (s.density <= 0.02) continue;
    const wood = smooth(0.18, 0.55, s.forest);
    // drifts: the cover comes in patches with bare gaps between
    const patch = 0.45 + 0.9 * vnoise(x * 0.42, z * 0.42, 11);
    let k = (profile.openDensity * (1 - wood) + profile.woodDensity * wood) * patch * s.density * (1 - smooth(0.04, 0.22, s.field)) * (1 - 0.9 * s.worn);
    if (k <= 0) continue;
    const y = sampler.height(x, z);
    const sl = slopeAt(x, z, y)[0];
    k *= 1 - smooth(0.12, 0.3, sl);
    if (rr > k) continue;
    // flowers come in single-color drifts
    const drift = vnoise(x * 0.3, z * 0.3, 23);
    const flowerOk = drift > 0.52;
    const w = blend(profile.open, profile.wood, wood);
    const tile = pick(w, t => (t === CARD.DAISY || t === CARD.SPIKE) ? (flowerOk ? 3 : 0) : t === CARD.TUFT ? 1 + 0.4 * (1 - patch) : 1, rp);
    if (tile < 0) continue;
    const sz = CARD_SIZE[tile];
    const grass = tile === CARD.TUFT || tile === CARD.TALL || tile === CARD.STRAW;
    const sc = 0.75 + 0.55 * rs;
    const cell = hash2(Math.floor(x * 0.3), Math.floor(z * 0.3), 5);
    const fc = flowerCols[Math.floor(cell * flowerCols.length) % flowerCols.length] ?? [1, 1, 1];
    const isFlower = tile === CARD.DAISY || tile === CARD.SPIKE || tile === CARD.CACTUS;
    cards.push(x, y - 0.004, z, r() * 6.2832, sz[0] * sc * (0.9 + 0.2 * rj), sz[1] * sc * (grass ? profile.grassHeight : 1) * (0.85 + 0.3 * rj), tile, rj,
      isFlower ? (tile === CARD.CACTUS ? 0.62 : fc[0]) : 1, isFlower ? (tile === CARD.CACTUS ? 0.07 : fc[1]) : 1, isFlower ? (tile === CARD.CACTUS ? 0.1 : fc[2]) : 1);
  }

  // ── litter (flat decals lying on the slope) and worn scuffs
  const nLit = Math.round(area * dens.litter * amount);
  for (let i = 0; i < nLit; i++) {
    const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, rr = r(), rp = r(), rs = r(), rj = r(), rc = r();
    const s = sampler.at(x, z);
    if (s.density <= 0.02) continue;
    const wood = smooth(0.18, 0.55, s.forest);
    const lp = 0.5 + 0.8 * vnoise(x * 0.9, z * 0.9, 37);
    const k = (profile.litterOpenDensity * (1 - wood) + profile.litterWoodDensity * wood) * lp * s.density * (1 - smooth(0.1, 0.3, s.field)) * (1 - 0.7 * s.worn);
    if (rr > k) continue;
    const tile = pick(blend(profile.litterOpen, profile.litterWood, wood), () => 1, rp);
    if (tile < 0) continue;
    const y = sampler.height(x, z);
    const [, nx, nz] = slopeAt(x, z, y);
    let cr = 1, cg = 1, cb = 1;
    if (tile === LIT.OAK) [cr, cg, cb] = oak[Math.floor(rc * oak.length) % oak.length];
    else if (tile === LIT.MAPLE) [cr, cg, cb] = maple[Math.floor(rc * maple.length) % maple.length];
    litter.push(x, y + 0.003, z, r() * 6.2832, (0.07 + 0.07 * rs) * (tile === LIT.GRAVEL ? 0.8 : 1), tile, rj, cr, cg, cb, nx, nz);
  }
  const soil = hexLinear(profile.soil);
  const nScuff = Math.round(area * dens.scuffs * amount);
  for (let i = 0; i < nScuff; i++) {
    const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, rr = r(), rs = r(), rj = r();
    const s = sampler.at(x, z);
    if (s.density <= 0.02 || s.worn < 0.12 || rr > s.worn) continue;
    const y = sampler.height(x, z);
    const [, nx, nz] = slopeAt(x, z, y);
    const v = 0.85 + 0.3 * rj;
    litter.push(x, y + 0.0035, z, r() * 6.2832, 0.1 + 0.12 * rs, LIT.SCUFF, rj, soil[0] * v, soil[1] * v, soil[2] * v, nx, nz);
  }

  // ── stones (on the ground; more on slopes, in dry country and on bare ground)
  const nSt = Math.round(area * dens.stones * profile.stoneDensity * amount);
  for (let i = 0; i < nSt; i++) {
    const x = x0 + r() * CHUNK, z = z0 + r() * CHUNK, rr = r(), rs = r(), rj = r();
    const s = sampler.at(x, z);
    if (s.density <= 0.3) continue;
    const y = sampler.height(x, z);
    const sl = slopeAt(x, z, y)[0];
    if (rr > 0.55 + 2.5 * sl) continue;
    const v = 0.78 + 0.4 * rj;
    stones.push(x, y - 0.004, z, r() * 6.2832, 0.012 + 0.02 * rs * rs, 0.45 + 0.35 * rj, stoneRgb[0] * v, stoneRgb[1] * v, stoneRgb[2] * v);
  }

  const cap = opt.maxPerChunk ?? 1e9;
  return {
    cards: new Float32Array(cards.slice(0, cap * CARD_STRIDE)),
    litter: new Float32Array(litter.slice(0, cap * LITTER_STRIDE)),
    stones: new Float32Array(stones.slice(0, cap * STONE_STRIDE)),
  };
}

/** The flower season: 0 (none) … 1 (full bloom) from the drawn season (shared uniforms' values). Mirrors the vertex shader. */
export function flowerSeason(p: { fresh: number; bloom: number; fall: number; dormant: number; snow: number; dry: number }, springOnly: boolean): number {
  const grow = springOnly ? Math.min(1, p.bloom * 1.4 + p.fresh * 0.9) : Math.min(1, p.bloom + p.fresh * 0.5 + 0.7) * (1 - 0.55 * p.dry);
  return Math.max(0, grow * (1 - smooth(0.05, 0.5, p.fall)) * (1 - smooth(0, 0.3, Math.max(p.dormant, p.snow))));
}
