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
 * Other regions (game/region/regionWorld.ts) lie differently: an
 * Appalachian hollow (a hay bottom along the creek, wooded sides rising
 * 40–60 m), a desert bajada with a dry wash, North Woods swells with a bog,
 * flat Plains with the creek in a draw, Northwest foothills, Upper Midwest
 * moraine hummocks, a New England drumlin flank, an Ozark ridgetop falling
 * into its hollow, Hill Country limestone stair-steps, a Rust Belt ravine;
 * each set into its own regional field.
 *
 * Pure (no three.js): one height/cover function the renderer, the camera
 * floor, placement and (later) water flow all share. 1 unit ≈ 6 m.
 */
import { createNoise2D } from 'simplex-noise';
import { RegionalField, TOWN_Y } from '../../engine/world/terrain/regionalLandscape';
import { regionWorld, type Relief, type RegionWorld } from '../region/regionWorld';
import { REGIONS, type RegionId } from '../../sim/regions';
import { lotField, treeLineM, type LotField, type LotSpec } from '../../sim/lots';

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
  /** Creek center z at world x. */
  zAt(x: number): number;
  /** Water surface y at world x (falls gently eastward). */
  waterY(x: number): number;
  /** Channel half-width at the water line (world units). */
  halfWidth: number;
}

/** A graded building pad: flat at `y` inside the rect, easing to natural ground over `skirt`. */
/**
 * A berm (bank of earth, height > 0) or ditch (trench, height < 0) along a
 * polyline, `k` built (0–1 scales the height), with gaps for gates.
 * Profiles: berm ≈ 4 m base, 1 m crest; ditch ≈ 3 m top, 1 m bottom.
 */
export interface Earthwork {
  pts: Array<[number, number]>;
  height: number;
  k: number;
  gates: Array<{ at: number; w: number }>;
  bbox?: [number, number, number, number];
}

/**
 * An open excavation (a bunker room being dug): the ground inside the rect
 * comes down to `floor`, battered back 1 : 1 outside it; `k` (0–1) is how
 * far the dig has gone (and goes back to 0 as it is backfilled). Trees stay
 * off the site once it has been dug (`k` 0 after backfill still clears).
 */
export interface Pit { x0: number; z0: number; x1: number; z1: number; floor: number; k: number }
/** Horizontal reach of a pit's batter beyond its rect for a dig `depth` deep. */
export const pitReach = (depth: number) => depth * 1.0 + 0.05;

const BERM_HALF_BASE = 0.34, BERM_HALF_TOP = 0.08, DITCH_HALF_TOP = 0.26, DITCH_HALF_BOT = 0.08;
export const earthworkReach = (w: Earthwork) => (w.height > 0 ? BERM_HALF_BASE : DITCH_HALF_TOP) + 0.02;

function polyBox(pts: ReadonlyArray<[number, number]>, pad: number): [number, number, number, number] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}

/** Distance to a polyline and the distance along it of the closest point. */
export function closestOnLine(pts: ReadonlyArray<[number, number]>, x: number, z: number): { d: number; s: number } {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, l = Math.sqrt(l2);
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; bestS = acc + t * l; }
    acc += l;
  }
  return { d: best, s: bestS };
}

/** Height change an earthwork makes at (x, z). */
export function earthworkOffset(w: Earthwork, x: number, z: number): number {
  const { d, s } = closestOnLine(w.pts, x, z);
  for (const g of w.gates) if (Math.abs(s - g.at) < g.w / 2) return 0;
  const [top, base] = w.height > 0 ? [BERM_HALF_TOP, BERM_HALF_BASE] : [DITCH_HALF_BOT, DITCH_HALF_TOP];
  if (d >= base) return 0;
  const f = d <= top ? 1 : 1 - sstep(top, base, d);
  return w.height * w.k * f;
}

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
/** The creek valley-floor table (non-bench reliefs): x from FP_X0, one entry a unit. */
const FP_X0 = -70, FP_N = 210;

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

  /** The creek runs through the home forty, or on a neighbor's land (about a quarter mile off). */
  readonly creekHome: boolean;
  private readonly _timber: number;

  /** The region's world (relief, trees, rocks, road and fences). */
  readonly world: RegionWorld;
  readonly relief: Relief;
  readonly regionId: RegionId;
  /** Per-parcel shape of the non-bench reliefs (amplitude, bottom width, phase). */
  private _relA = 0;
  private _relB = 0;
  private _relP = 0;
  /** A dry wash across the desert place (center z at x), or null. */
  readonly wash: ((x: number) => number) | null = null;
  /** The listing's lot archetype (sim/lots.ts): ridge, bench, gorge, mesa ... null on the classic ground. */
  readonly lot: LotField | null = null;
  /** Running water on the place is drawn (false for a lot with no creek: its stream is not on the map). */
  readonly hasStream: boolean = true;

  /** `creek`: through the place (default) or off it; `timber`: how much timber against the usual (1); `region`: whose land. */
  constructor(seed: number, opts: { creek?: boolean; timber?: number; region?: RegionId; lot?: LotSpec | null; home?: { x0: number; z0: number; x1: number; z1: number } } = {}) {
    this.seed = seed;
    this.creekHome = opts.creek ?? true;
    this._timber = opts.timber ?? 1;
    this.regionId = opts.region ?? 'mountain_west';
    this.world = regionWorld(this.regionId);
    this.relief = this.world.relief;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    this._noise = createNoise2D(rnd);
    this.region = new RegionalField({ kind: this.world.kind, cW: PARCEL_SIZE, cH: PARCEL_SIZE, townExt: 14 });
    this._benchAmp = 3.2 + 1.6 * rnd();          // 19–29 m of relief across the parcel
    this._benchSteps = rnd() < 0.5 ? 2 : 3;
    this._benchPhase = rnd() * 0.6;
    this._timberSide = rnd() < 0.5 ? -1 : 1;      // timber north (−z) or south (+z) of the creek
    const zIn = PARCEL_SIZE * (0.35 + 0.3 * rnd());
    // off the place: through the north or the south forty
    const z0 = this.creekHome ? zIn : rnd() < 0.5 ? PARCEL_SIZE * (1.45 + 0.15 * rnd()) : -PARCEL_SIZE * (0.45 + 0.15 * rnd());
    const a1 = 3 + 4 * rnd(), a2 = 1 + 2 * rnd(), p1 = rnd() * 6.28, p2 = rnd() * 6.28;
    const n = this._noise;
    this.creek = {
      zAt: (x: number) => z0 + a1 * Math.sin(x / 19 + p1) + a2 * Math.sin(x / 7.3 + p2) + 1.2 * n(x * 0.03, 9.1),
      waterY: (x: number) => this._floodplainY(x) - CREEK_DEPTH + 0.12,
      halfWidth: CREEK_HALF,
    };
    if (opts.lot) {
      // a lot archetype owns the ground: its relief, its creek (if any) and its lake
      const home = opts.home ?? { x0: 0, z0: 0, x1: PARCEL_SIZE, z1: PARCEL_SIZE };
      const lf = lotField(opts.lot, home);
      this.lot = lf;
      this.creekHome = !!lf.creek;
      this.hasStream = !!lf.creek;
      if (lf.creek) {
        const lc = lf.creek;
        this.creek = { zAt: lc.zAt, waterY: (x: number) => TOWN_Y + lc.bedY(x) + 0.3 - CREEK_DEPTH + 0.12, halfWidth: lc.halfWidth };
      } else {
        // no stream on the place: the channel sits far off the map
        this.creek = { zAt: () => PARCEL_SIZE * 6, waterY: () => -50, halfWidth: CREEK_HALF };
      }
      return;
    }
    // the other reliefs draw their own shape after the bench rolls (Mountain West parcels stay as they were)
    if (this.relief !== 'benches') {
      const r2 = mulberry32(seed * 6151 + 29);
      this._relA = r2(); this._relB = r2(); this._relP = r2() * 6.28;
      if (this.relief === 'bajada' && !this.creekHome) {
        const wz = PARCEL_SIZE * (0.3 + 0.4 * r2()), wa = 3 + 4 * r2(), wp = r2() * 6.28;
        this.wash = (x: number) => wz + wa * Math.sin(x / 15 + wp) + 1.5 * Math.sin(x / 5.1 + 2 * wp);
      }
      // the creek's valley floor follows the land down: the lowest ground across its line, never rising downstream (east)
      const fp: number[] = [];
      let lo = Infinity;
      for (let i = 0; i <= FP_N; i++) {
        const x = FP_X0 + i, zc = this.creek.zAt(x);
        let m = Infinity;
        for (const dz of [-7, -3.5, 0, 3.5, 7]) m = Math.min(m, this._open(x, zc + dz));
        lo = Math.min(lo, m - 0.05);
        fp.push(lo);
      }
      // a little smoothing (still never above the ground it was taken from)
      this._fp = fp.map((v, i) => Math.min(v, (fp[Math.max(0, i - 2)] + fp[Math.max(0, i - 1)] + v + fp[Math.min(FP_N, i + 1)] + fp[Math.min(FP_N, i + 2)]) / 5));
    }
  }

  private _fp: number[] | null = null;
  /** The region's middle timber (the neighbors' woods). */
  private get _regionTimber(): number { const [a, b] = REGIONS[this.regionId].timber; return (a + b) / 2; }

  /** Natural ground before the creek and the wash are cut (the regional field plus the local relief). */
  private _open(x: number, z: number): number {
    return this.region.sample(x, z).h + this._local(x, z) * (1 - sstep(80, 300, this._outside(x, z)));
  }

  /**
   * Local relief above the regional ground, by region: the Mountain West
   * benches, or the hollow / bajada / swell / flat / foothill / moraine shapes.
   */
  private _local(x: number, z: number): number {
    if (this.lot) return this.lot.h(x, z);
    const S = PARCEL_SIZE, n = this._noise;
    switch (this.relief) {
      case 'benches': return this._bench(x, z);
      case 'hollow': {
        // the sides rise 40–60 m from a hay bottom 70–100 m wide; spurs and side hollows in the slopes
        const A = 7 + 3 * this._relA, B = 6 + 3 * this._relB;
        const dz = Math.abs(z - this.creek.zAt(x));
        const up = sstep(B, B + 32, dz + 2.5 * n(x * 0.04, z * 0.04));
        return A * up + 1.2 * up * n(x * 0.04 + 3, z * 0.04 - 7) + 0.9 * (S - x) / S + 0.12 * n(x * 0.11, z * 0.11);
      }
      // a long alluvial slope off the mesa (≈ 2 %), low swells
      case 'bajada': return 1.6 * (S - x) / S + 0.45 * (0.5 + 0.5 * n(x * 0.03, z * 0.03)) + 0.12 * n(x * 0.12, z * 0.12);
      // low glacial swells; a bog in a hollow
      case 'swell': return 1.2 * (0.5 + 0.5 * n(x * 0.028 + this._relP, z * 0.028)) + 0.35 * n(x * 0.09, z * 0.09) - 0.6 * this._bog(x, z);
      case 'flat': return 0.5 * (0.5 + 0.5 * n(x * 0.018, z * 0.018)) + 0.25 * (S - x) / S;
      case 'foothill': {
        // rolling foothill benches, 20–35 m of relief, rising away from the road
        const A = 3.5 + 2 * this._relA;
        return A * (0.5 + 0.5 * (0.8 * n(x * 0.016 + this._relP, z * 0.016) + 0.2 * n(x * 0.05, z * 0.05))) + 2 * (S - x) / S;
      }
      case 'drumlin': {
        // the flank of a drumlin (NNW long axis) rising 20–35 m to the west, stony
        const A = 3.5 + 2.5 * this._relA, cz = S * (0.3 + 0.4 * this._relB);
        const u = (x + 12) * 0.92 + (z - cz) * 0.38, v = -(x + 12) * 0.38 + (z - cz) * 0.92;
        return A * Math.exp(-((u / 60) ** 2 + (v / 34) ** 2)) + 0.25 * n(x * 0.05, z * 0.05) + 0.1 * n(x * 0.16, z * 0.16);
      }
      case 'ridge': {
        // an Ozark ridgetop: the flat top in pasture, falling 25–35 m into the creek's hollow; a sinkhole
        const A = 4 + 2 * this._relA, B = 8 + 3 * this._relB;
        const dz = Math.abs(z - this.creek.zAt(x));
        const up = sstep(B, B + 30, dz + 2.5 * n(x * 0.04, z * 0.04));
        const sx = S * (0.25 + 0.5 * this._relB), sz = this.creek.zAt(sx) + (this._relA < 0.5 ? -1 : 1) * (B + 22);
        const sink = 0.6 * (1 - sstep(1.5, 4, Math.hypot(x - sx, z - sz)));
        return A * up + 0.6 * up * n(x * 0.05 + 3, z * 0.05 - 7) + 0.5 * (S - x) / S - sink;
      }
      case 'stairstep': {
        // limestone benches with short steep risers, rising 20–30 m to the west
        const A = 3.2 + 1.8 * this._relA, steps = 3;
        const t = Math.max(0, Math.min(1.2, (S - x) / S + 0.1 * n(x * 0.03, z * 0.03) + 0.15 * this._relB));
        return A * terrace(t * steps, 0.25) / steps + 0.12 * n(x * 0.08, z * 0.08);
      }
      case 'ravine': {
        // gently rolling fields; the creek in a wooded ravine 10–18 m deep
        const A = 1.8 + 1.2 * this._relA, B = 2.2;
        const dz = Math.abs(z - this.creek.zAt(x));
        return A * sstep(B, B + 13, dz + 1.5 * n(x * 0.05, z * 0.05)) + 0.6 * (0.5 + 0.5 * n(x * 0.025 + this._relP, z * 0.025)) + 0.3 * (S - x) / S;
      }
      case 'moraine': {
        // swells and kettle hollows of 10–15 m; slopes mostly 2–12 %
        const A = 1.6 + 0.9 * this._relA;
        return A * (0.5 + 0.5 * (0.75 * n(x * 0.024 + this._relP, z * 0.024) + 0.25 * n(x * 0.06 - 4, z * 0.06)));
      }
    }
  }


  /** Slope (rise over run) of the lot's relief at (x, z). */
  lotSlope(x: number, z: number): number {
    const f = this.lot;
    if (!f) return 0;
    return Math.hypot(f.h(x + 0.5, z) - f.h(x - 0.5, z), f.h(x, z + 0.5) - f.h(x, z - 0.5));
  }

  /**
   * Timber on a lot archetype: none on cliffs, scree and outcrops, thinning to
   * nothing at the region's tree line (by altitude), open meadow on level
   * benches, denser on the north-facing and sheltered ground.
   */
  private _lotCover(x: number, z: number): number {
    const f = this.lot!, n = this._noise;
    const g = this.lotSlope(x, z), rock = f.rock(x, z), elev = f.spec.elevM + f.h(x, z) * 6;
    const line = treeLineM(this.regionId);
    let c = 0.42 * (1 - sstep(line - 250, line, elev)) * (1 - 0.9 * sstep(0.3, 0.7, rock)) * (1 - sstep(0.55, 0.95, g));
    // meadow: level ground is more often open, and a few glades everywhere
    const glade = sstep(0.15, 0.55, n(x * 0.035 + 2, z * 0.035 - 6));
    c *= 1 - glade * (g < 0.1 ? 0.8 : 0.45);
    // a south-facing slope is drier and more open
    const fall = f.fall, south = Math.sin(fall) * Math.min(1, g * 4);
    c *= 1 - 0.18 * Math.max(0, -south);
    return c;
  }

  /** North Woods: an open sphagnum bog in a low spot (0–1). */
  private _bog(x: number, z: number): number {
    if (this.relief !== 'swell') return 0;
    const bx = PARCEL_SIZE * (0.2 + 0.3 * this._relB), bz = PARCEL_SIZE * (0.15 + 0.7 * this._relA);
    return 1 - sstep(6, 13, Math.hypot(x - bx, (z - bz) * 0.8) + 3 * this._noise(x * 0.06, z * 0.06));
  }

  /** Timber cover the region's land carries at (x, z), before the listing's timber (0–1). */
  private _cover(x: number, z: number): number {
    if (this.lot) return this._lotCover(x, z);
    const n = this._noise, S = PARCEL_SIZE;
    switch (this.relief) {
      case 'benches': case 'flat': return 0;
      case 'hollow': {
        // woods everywhere off the bottom; the bottom in hay
        // (an old hayfield cleared on the road side of a ridge-top place)
        const off = sstep(0.8, 2.4, this._local(x, z) - 0.9 * (S - x) / S);
        const field = this.creekHome ? 0 : 0.9 * sstep(S * 0.58, S * 0.72, x + 4 * n(x * 0.05, z * 0.05 - 4));
        return 0.95 * off * (0.8 + 0.2 * n(x * 0.03 + 5, z * 0.03 - 2)) * (1 - field);
      }
      // pinyon–juniper in open stands
      case 'bajada': return 0.62 * sstep(-0.25, 0.45, n(x * 0.05 + 2, z * 0.05 - 9) + 0.4 * n(x * 0.15, z * 0.15));
      case 'swell': {
        // an old clearing on the road side; spruce and birch to its edge; the bog open
        const clear = sstep(S * 0.55, S * 0.7, x + 5 * n(x * 0.05, z * 0.05 + 3));
        return 0.97 * (1 - clear) * (1 - this._bog(x, z));
      }
      case 'foothill': {
        // a pasture cleared on the lower, road side
        const clear = sstep(S * 0.5, S * 0.68, x + 6 * n(x * 0.04, z * 0.04 + 1));
        return 0.97 * (1 - clear * (0.85 + 0.15 * n(x * 0.2, z * 0.2)));
      }
      case 'drumlin': {
        // the upper (west) part gone back to sugarbush and pine behind a stone wall; hay below
        const wall = S * (0.45 + 0.1 * this._relB);
        return 0.95 * (1 - sstep(wall - 3, wall + 1, x + 3 * n(x * 0.03, z * 0.03 + 4)));
      }
      case 'ridge': {
        // woods down the hollow sides; the ridgetop in fescue with a few oaks left for shade
        const B = 8 + 3 * this._relB;
        const dz = Math.abs(z - this.creek.zAt(x));
        const side = sstep(B - 2, B + 4, dz) * (1 - sstep(B + 22, B + 32, dz));
        return Math.max(0.95 * side, 0.55 * sstep(0.35, 0.6, n(x * 0.05 + 5, z * 0.05 - 2)));
      }
      case 'stairstep': {
        // live oak motts and cedar brakes on the grass, thicker on the risers
        return 0.7 * sstep(-0.15, 0.45, n(x * 0.045 + 5, z * 0.045 - 2) + 0.35 * n(x * 0.12 - 3, z * 0.12 + 8));
      }
      case 'ravine': {
        // the ravine sides wooded; a second-growth woodlot at the back of the place
        const dz = Math.abs(z - this.creek.zAt(x));
        const rav = this.creekHome ? (1 - sstep(10, 15, dz)) * sstep(1.5, 2.5, dz) : 0;
        return Math.max(0.92 * rav, 0.9 * (1 - sstep(S * 0.26, S * 0.32, x + 2.5 * n(x * 0.04, z * 0.04))));
      }
      case 'moraine': {
        // the woodlot on the back (west) of the forty, a fence-line edge; fields in front
        return 0.92 * (1 - sstep(S * 0.3, S * 0.36, x + 2.5 * n(x * 0.04, z * 0.04)));
      }
    }
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
    if (this.lot?.creek) return TOWN_Y + this.lot.creek.bedY(x) + 0.3;
    if (this._fp) {
      const u = Math.max(0, Math.min(FP_N - 1e-6, x - FP_X0)), i = Math.floor(u), f = u - i;
      return this._fp[i] * (1 - f) + this._fp[i + 1] * f;
    }
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
    let h = r.h + this._local(x, z) * (1 - sstep(80, 300, out));
    // the desert's dry wash: a flat sandy bed a couple of meters down, cut banks
    if (this.wash) h -= 0.32 * (1 - sstep(1.2, 2.4, Math.abs(z - this.wash(x))));
    // Creek valley: floodplain flat, incised channel. Runs on past the parcel.
    const dz = Math.abs(z - this.creek.zAt(x));
    const fp = this._floodplainY(x);
    const valley = fp + 0.25 * Math.max(0, dz - FLOODPLAIN_HALF) ** 1.2;
    const along = 1 - sstep(PARCEL_SIZE + 20, PARCEL_SIZE + 65, Math.abs(x - PARCEL_SIZE / 2) + PARCEL_SIZE / 2);
    if (along > 0) {
      // (a lot archetype carves its own valley; only the channel is cut here)
      if (!this.lot) h = h + (Math.min(h, valley) - h) * along;
      if (dz < CREEK_HALF + 1.1 && (!this.lot || this.lot.creek)) {
        const bed = fp - CREEK_DEPTH + CREEK_DEPTH * sstep(CREEK_HALF * 0.25, CREEK_HALF + 1.1, dz);
        h = h + (Math.min(h, bed) - h) * along;
      }
    }
    // Cover: timber on the upper bench on one side of the creek; cottonwoods on the banks
    // with the creek off the place, the timber runs in patches on the upper bench on either side
    let timber: number;
    if (this.relief === 'benches' && !this.lot) {
      const side = !this.creekHome && Math.abs(z - this.creek.zAt(x)) > 20 ? 1 : Math.sign(z - this.creek.zAt(x)) === this._timberSide ? 1 : 0;
      const upper = sstep(this._benchAmp * 0.35, this._benchAmp * 0.6, this._bench(x, z));
      const patch = sstep(-0.45, 0.4, this._noise(x * 0.04 + 5, z * 0.04 - 2) + 0.35 * this._noise(x * 0.13 - 3, z * 0.13 + 8));
      timber = Math.min(1, side * upper * patch * w * this._timber);
    } else {
      // the region's cover, thinned or thickened by the listing's timber
      // the region's cover, thinned or thickened by the listing's timber; the land round the place
      // carries the same woods (at the region's usual timber), out to where the regional field takes over
      const near = 1 - sstep(60, 240, out), k = w * this._timber + (1 - w) * near * this._regionTimber;
      timber = Math.min(1, this._cover(x, z) * k * this.world.cover);
    }
    const riparian = (1 - sstep(1.5, 6 + 3 * this._noise(x * 0.05, 3.3), dz)) * sstep(CREEK_HALF + 0.2, CREEK_HALF + 0.8, dz) * along
      * (0.55 + 0.45 * sstep(-0.3, 0.3, this._noise(x * 0.09 + 11, z * 0.09)));
    let forest = Math.max(r.forest * (this.relief === 'benches' && !this.lot ? 1 - w : sstep(60, 240, out)), 0.92 * timber, 0.75 * riparian);
    // desert washes: a few cottonwoods / desert willow on the banks, where the water sits after a storm
    if (this.wash) {
      const dw = Math.abs(z - this.wash(x));
      forest = Math.max(forest, 0.5 * (1 - sstep(2.4, 5, dw)) * sstep(1.6, 2.4, dw) * (0.5 + 0.5 * this._noise(x * 0.1 + 7, 1.3)) * w);
    }
    // under the lake nothing grows, and the shore is bare for a step
    if (this.lot?.lake && h < TOWN_Y + this.lot.lake.y + 0.12) forest = 0;
    return { h, forest, field: r.field * (1 - w) };
  }

  /** Graded pads (buildings): replaces the natural ground under them. */
  setPads(pads: readonly Pad[]): void { this._pads = pads.slice(); }

  private _works: Earthwork[] = [];
  /** Berms (raised banks) and ditches (cut trenches) along polylines. */
  setEarthworks(works: readonly Earthwork[]): void { this._works = works.map(w => ({ ...w, bbox: polyBox(w.pts, earthworkReach(w)) })); }
  get earthworks(): readonly Earthwork[] { return this._works; }
  private _pits: Pit[] = [];
  /** Open excavations (bunker digs). */
  setPits(pits: readonly Pit[]): void { this._pits = pits.slice(); }
  get pits(): readonly Pit[] { return this._pits; }
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
    for (const w of this._works) {
      const b = w.bbox!;
      if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue;
      const dy = earthworkOffset(w, x, z);
      if (dy !== 0) { s.h += dy; s.forest = 0; }
    }
    for (const p of this._pits) {
      const d = Math.max(p.x0 - x, x - p.x1, p.z0 - z, z - p.z1, 0);
      const reach = pitReach(Math.max(0, s.h - p.floor));
      if (d > reach) continue;
      s.forest = 0;
      if (p.k <= 0) continue;
      // the cut: floor inside, a 1 : 1 batter up to the ground outside
      const cut = Math.min(s.h, p.floor + d);
      s.h += (cut - s.h) * p.k;
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
    const h = this.natural(x, z).h;
    if (this.lot?.lake && h < TOWN_Y + this.lot.lake.y + 0.02) return true;
    return h < this.creek.waterY(x) - 0.01;
  }

  /** The lake's water plane (world y), or null. */
  get lakeY(): number | null { return this.lot?.lake ? TOWN_Y + this.lot.lake.y : null; }
}
