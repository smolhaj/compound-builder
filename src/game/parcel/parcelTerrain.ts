/**
 * parcelTerrain — the seeded Mountain West homestead parcel (40 acres,
 * docs/DECISIONS.md) set into UE's regional landscape.
 *
 * The parcel follows UE's 'benches' relief (old Lake Bonneville shorelines):
 * flat benches stepping up westward toward the range, joined by short steep
 * risers. A creek leaves the range and crosses the parcel west → east in a
 * small incised channel with a floodplain; timber (ponderosa / Douglas fir)
 * holds the upper bench, cottonwoods line the creek.
 *
 * Outside the parcel the regional field (RegionalField 'mountain') takes
 * over: the irrigated plain, the reservoir and the Front Range ~2 km west.
 * The creek runs on through it so the channel never ends at the fence.
 *
 * Pure (no three.js): one height/cover function the renderer, the camera
 * floor, placement and (later) water flow all share. 1 unit ≈ 6 m.
 */
import { createNoise2D } from 'simplex-noise';
import { RegionalField, TOWN_Y } from '../../engine/world/terrain/regionalLandscape';

/** Parcel side in world units (40 acres ≈ 402 m). */
export const PARCEL_SIZE = 67;

export interface ParcelSample {
  /** Ground height (world y). */
  h: number;
  /** Forest density 0..1. */
  forest: number;
  /** Farmland 0..1. */
  field: number;
}

export interface CreekLine {
  /** Creek centre z at world x. */
  zAt(x: number): number;
  /** Water surface y at world x (falls gently eastward). */
  waterY(x: number): number;
  /** Channel half-width at the water line (world units). */
  halfWidth: number;
}

/** A graded building pad: flat at `y` inside the rect, easing to natural ground over `skirt`. */
export interface Pad {
  x0: number; z0: number; x1: number; z1: number;
  y: number;
  skirt: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Terraced staircase: flats with short risers (riser share `r` of each step). */
function terrace(u: number, r: number): number {
  const k = Math.floor(u);
  return k + sstep(1 - r, 1, u - k);
}

/** Channel depth below the floodplain and the bank profile (world units). */
const CREEK_DEPTH = 0.42;
const CREEK_HALF = 0.7;
const FLOODPLAIN_HALF = 4.5;

export class ParcelTerrain {
  readonly seed: number;
  readonly size = PARCEL_SIZE;
  readonly region: RegionalField;
  readonly creek: CreekLine;
  private readonly _noise: (x: number, y: number) => number;
  private readonly _benchAmp: number;
  private readonly _benchSteps: number;
  private readonly _benchPhase: number;
  private readonly _timberSide: number;
  private _pads: Pad[] = [];

  constructor(seed: number) {
    this.seed = seed;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    this._noise = createNoise2D(rnd);
    this.region = new RegionalField({ kind: 'mountain', cW: PARCEL_SIZE, cH: PARCEL_SIZE, townExt: 14 });
    this._benchAmp = 3.2 + 1.6 * rnd();          // 19–29 m of relief across the parcel
    this._benchSteps = rnd() < 0.5 ? 2 : 3;
    this._benchPhase = rnd() * 0.6;
    this._timberSide = rnd() < 0.5 ? -1 : 1;      // timber north (−z) or south (+z) of the creek
    const z0 = PARCEL_SIZE * (0.35 + 0.3 * rnd());
    const a1 = 3 + 4 * rnd(), a2 = 1 + 2 * rnd(), p1 = rnd() * 6.28, p2 = rnd() * 6.28;
    const n = this._noise;
    this.creek = {
      zAt: (x: number) => z0 + a1 * Math.sin(x / 19 + p1) + a2 * Math.sin(x / 7.3 + p2) + 1.2 * n(x * 0.03, 9.1),
      waterY: (x: number) => this._floodplainY(x) - CREEK_DEPTH + 0.12,
      halfWidth: CREEK_HALF,
    };
  }

  /** Bench relief above the town datum before the creek (≥ 0, rising west). */
  private _bench(x: number, z: number): number {
    const S = PARCEL_SIZE;
    const n = this._noise;
    const t = Math.max(0, Math.min(1.25, (S - x) / (S * 0.9) + this._benchPhase / this._benchSteps + 0.05 * n(x * 0.03, z * 0.04)));
    let h = this._benchAmp * terrace(t * this._benchSteps, 0.3) / this._benchSteps;
    h += this._benchAmp * 0.08 * (0.5 + 0.5 * (n(x * 0.05, z * 0.05) * 0.65 + n(x * 0.11 + 31, z * 0.11 - 17) * 0.35));
    return h;
  }

  /** Distance outside the parcel (Chebyshev, 0 on it). */
  private _outside(x: number, z: number): number {
    return Math.max(-x, x - PARCEL_SIZE, -z, z - PARCEL_SIZE, 0);
  }

  /** Floodplain level at x: the creek valley floor falls eastward with the benches. */
  private _floodplainY(x: number): number {
    const S = PARCEL_SIZE;
    const t = Math.max(0, Math.min(1, (S - x) / S));
    return TOWN_Y + this._benchAmp * 0.18 * t + 0.6 * Math.max(0, -x) / 60;
  }

  /** Natural ground (no pads). */
  natural(x: number, z: number): ParcelSample {
    const r = this.region.sample(x, z);
    // the benches run on along the range front; the regional field takes over far out
    const out = this._outside(x, z);
    const w = 1 - sstep(4, 34, out);
    let h = r.h + this._bench(x, z) * (1 - sstep(80, 300, out));
    // Creek valley: floodplain flat, incised channel. Runs on past the parcel.
    const dz = Math.abs(z - this.creek.zAt(x));
    const fp = this._floodplainY(x);
    const valley = fp + 0.25 * Math.max(0, dz - FLOODPLAIN_HALF) ** 1.2;
    const along = 1 - sstep(PARCEL_SIZE + 40, PARCEL_SIZE + 100, Math.abs(x - PARCEL_SIZE / 2) + PARCEL_SIZE / 2);
    if (along > 0) {
      h = h + (Math.min(h, valley) - h) * along;
      if (dz < CREEK_HALF + 1.1) {
        const bed = fp - CREEK_DEPTH + CREEK_DEPTH * sstep(CREEK_HALF * 0.25, CREEK_HALF + 1.1, dz);
        h = h + (Math.min(h, bed) - h) * along;
      }
    }
    // Cover: timber on the upper bench on one side of the creek; cottonwoods on the banks
    const side = Math.sign(z - this.creek.zAt(x)) === this._timberSide ? 1 : 0;
    const upper = sstep(this._benchAmp * 0.35, this._benchAmp * 0.6, this._bench(x, z));
    const patch = sstep(-0.45, 0.4, this._noise(x * 0.04 + 5, z * 0.04 - 2) + 0.35 * this._noise(x * 0.13 - 3, z * 0.13 + 8));
    const timber = side * upper * patch * w;
    const riparian = (1 - sstep(1.5, 6 + 3 * this._noise(x * 0.05, 3.3), dz)) * sstep(CREEK_HALF + 0.2, CREEK_HALF + 0.8, dz) * along
      * (0.55 + 0.45 * sstep(-0.3, 0.3, this._noise(x * 0.09 + 11, z * 0.09)));
    const forest = Math.max(r.forest * (1 - w), 0.92 * timber, 0.75 * riparian);
    return { h, forest, field: r.field * (1 - w) };
  }

  /** Graded pads (buildings): replaces the natural ground under them. */
  setPads(pads: readonly Pad[]): void { this._pads = pads.slice(); }
  get pads(): readonly Pad[] { return this._pads; }

  sample(x: number, z: number): ParcelSample {
    const s = this.natural(x, z);
    for (const p of this._pads) {
      const d = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0);
      if (d >= p.skirt) continue;
      const k = 1 - sstep(0, p.skirt, d);
      s.h += (p.y - s.h) * k;
      s.forest *= 1 - k;
    }
    return s;
  }

  height = (x: number, z: number): number => this.sample(x, z).h;

  /** Mean natural height over a rect (pad level for a new building). */
  padHeight(x0: number, z0: number, x1: number, z1: number): number {
    let s = 0, n = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      s += this.natural(x0 + (x1 - x0) * i / 4, z0 + (z1 - z0) * j / 4).h;
      n++;
    }
    return s / n;
  }

  /** Is (x, z) in the creek channel (below its water line)? */
  isCreek(x: number, z: number): boolean {
    return this.natural(x, z).h < this.creek.waterY(x) - 0.01;
  }
}
