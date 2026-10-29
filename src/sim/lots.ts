/**
 * Lot archetypes (docs/DECISIONS.md, "Varied lots and elevations"): the shape
 * of the ground a listing sits on. A mountain or hill listing is one of eight
 * kinds, each a pure, seeded height function over the home rect:
 *
 *  - ridge     a ridge-top knoll: a rounded crest with a small flat top and rock outcrops;
 *  - hillside  a slope climbing away from the road, in benches and shallow gullies, a creek down the fall line sometimes;
 *  - bench     benchland above a river: the cut bank, one broad flat bench, then the hill behind;
 *  - gorge     a creek in a canyon, rims on both sides (typical 30-80 m deep; the outliers 150-300 m);
 *  - mesa      a flat-topped tongue with cliffs on three sides that slopes down to the road (a butte, with a switchback
 *              road, in the outlier);
 *  - saddle    a pass between two peaks, with a spring;
 *  - bluff     a flat upland ending in a steep bluff over a lake;
 *  - island    an island (or peninsula) in a lake, reached by a causeway from the road side.
 *
 * Heights are world units (1 u ≈ 6 m) of relief above the regional datum
 * (TOWN_Y); the lake level is -0.3. `lotField` also gives the creek (its bed
 * never rises downstream, so water always runs downhill), the lake and the
 * causeway. `lotStats` reads slope, pads (flat enough to build on), the access
 * grade from the road, the cliffs and the aspect, for the listing card and the
 * slope-driven costs. Pure; no three.js.
 */
import { createNoise2D } from 'simplex-noise';
import { mulberry32 } from './rng';
import type { Rect } from './land';

export type LotKind = 'ridge' | 'hillside' | 'bench' | 'gorge' | 'mesa' | 'saddle' | 'bluff' | 'island';
export const LOT_KINDS: readonly LotKind[] = ['ridge', 'hillside', 'bench', 'gorge', 'mesa', 'saddle', 'bluff', 'island'];

export const LOT_NAME: Record<LotKind, string> = {
  ridge: 'Ridge-top knoll', hillside: 'Hillside', bench: 'Valley bench', gorge: 'Gorge & creek bed',
  mesa: 'Mesa', saddle: 'Saddle & pass', bluff: 'Lakeshore bluff', island: 'Island',
};

/** What is saved with a listing: enough to rebuild the same ground. */
export interface LotSpec {
  kind: LotKind;
  seed: number;
  /** Drop across the parcel, world units (5-13 typical; 25-50 for the outliers). */
  relief: number;
  /** One of the special listings (cliffs, gorges): 150-300 m of relief. */
  outlier: boolean;
  /** Altitude of the camp-level ground above sea level, m. */
  elevM: number;
  /** Mirrors the layout (the high side north or south, the bench on the other bank); a hillside with flip -1 falls away from the road. */
  flip: 1 | -1;
  /** A creek runs down the hillside (the bench and the gorge always have one; the rest never). */
  creek?: boolean;
}

export interface LotField {
  spec: LotSpec;
  rect: Rect;
  /** Relief above the datum at (x, z), units. */
  h(x: number, z: number): number;
  /** Creek centerline z at x, and its bed level (non-increasing eastward). Null: no running water on the place. */
  creek: { zAt(x: number): number; bedY(x: number): number; halfWidth: number } | null;
  /** Still water: the plane's level in the same frame (the lake, for the bluff and the island). */
  lake: { y: number } | null;
  /** A raised strip across the water to the island: its center line and half width. */
  causeway: { pts: Array<[number, number]>; halfW: number; top: number } | null;
  /** Where the camp likes to be when it is not the biggest flat (the island, the knoll's crown): null = the biggest pad. */
  homeSpot: [number, number] | null;
  /** A spring on the ground (the saddle). */
  spring: [number, number] | null;
  /** 0-1: how much of this ground is bare rock (cliffs, outcrops, scree) before slope is considered. */
  rock(x: number, z: number): number;
  /** Which way the main fall faces, radians (0 = east, π/2 = south). */
  fall: number;
}

export const LAKE_Y = -0.3;

/** Where the trees stop, by region (m above sea level; 9999: the region's hills never reach it). */
export function treeLineM(region: string): number {
  return region === 'mountain_west' ? 3050 : region === 'pnw' ? 1750 : region === 'appalachia' ? 1950 : 9999;
}

/** Altitude of the camp-level ground on the region's hill lots, m above sea level [min, max]. */
export const ALT_RANGE: Record<string, [number, number]> = {
  mountain_west: [1350, 2700], appalachia: [250, 1100], pnw: [80, 1500],
};
const ROAD_Y = 0.3;
const PARCEL = 67;

const sst = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Terraced staircase: flats with short risers (riser share `r` of each step). */
const terrace = (u: number, r: number): number => { const k = Math.floor(u); return k + sst(1 - r, 1, u - k); };
/** Polynomial smooth minimum (blend width k). */
const smin = (a: number, b: number, k: number): number => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
/** Linear in the range, saturating softly outside it. */
const soft = (T: number, lo: number, hi: number): number => T > hi ? hi + 0.3 * Math.tanh((T - hi) / 0.3) : T < lo ? lo + 0.3 * Math.tanh((T - lo) / 0.3) : T;

/** Make a non-increasing (eastward) bed table of a raw bed function, 1 u apart. */
function monotoneBed(raw: (x: number) => number): (x: number) => number {
  const X0 = -80, N = 240, tab: number[] = [];
  let lo = Infinity;
  for (let i = 0; i <= N; i++) { lo = Math.min(lo, raw(X0 + i)); tab.push(lo); }
  return (x: number) => { const u = clamp(x - X0, 0, N - 1e-6), i = Math.floor(u), f = u - i; return tab[i] * (1 - f) + tab[i + 1] * f; };
}

export function lotField(spec: LotSpec, rect: Rect): LotField {
  const rnd = mulberry32(spec.seed * 2654435761 + 17);
  const noise = createNoise2D(mulberry32(spec.seed * 40503 + 5));
  const n = (x: number, z: number, s: number, o = 0) => noise(x * s + o, z * s - o);
  const w = rect.x1 - rect.x0, hz = rect.z1 - rect.z0, cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
  const L = Math.min(w, hz), R = spec.relief, flip = spec.flip;
  const out: LotField = { spec, rect, h: () => 0, creek: null, lake: null, causeway: null, homeSpot: null, spring: null, rock: () => 0, fall: 0 };
  let raw: (x: number, z: number) => number = () => 0;
  let rock: (x: number, z: number) => number = () => 0;
  const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();

  switch (spec.kind) {
    case 'ridge': {
      const al = (r1 - 0.5) * 1.1 + (r2 < 0.5 ? Math.PI / 2 : 0), ca = Math.cos(al), sa = Math.sin(al);
      const La = L * (0.95 + 0.3 * r3), Lb = L * (0.36 + 0.08 * r4), Hc = R / 0.8, ph = r2 * 6.28;
      out.fall = Math.atan2(sa, ca) + Math.PI / 2;
      raw = (x, z) => {
        const a = (x - cx) * ca + (z - cz) * sa, b = -(x - cx) * sa + (z - cz) * ca;
        const crest = Math.exp(-((b / Lb) ** 2)) * (0.8 + 0.2 * Math.cos(a / (0.33 * L) + ph)) * Math.exp(-((a / La) ** 4));
        // a small flat top: the crest is clipped and the rest of it eased
        const top = 0.86, g = crest < top ? crest : top + (crest - top) * 0.2;
        const outcrop = crest > 0.7 ? 0.1 * R * (0.5 + 0.5 * n(x, z, 0.35, 3)) * sst(0.7, 0.9, crest) : 0;
        return 0.45 + Hc * g + outcrop + 0.05 * R * n(x, z, 0.09, 1) + 0.18 * R * clamp((PARCEL - x) / PARCEL, 0, 1.4);
      };
      rock = (x, z) => { const a = (x - cx) * ca + (z - cz) * sa, b = -(x - cx) * sa + (z - cz) * ca; const crest = Math.exp(-((b / Lb) ** 2)) * Math.exp(-((a / La) ** 4)); return sst(0.8, 0.95, crest) * (0.6 + 0.4 * n(x, z, 0.25, 9)); };
      break;
    }
    case 'hillside': {
      // falls toward the road (east) within ±40°, or (flip) away from it
      const phi = (r1 - 0.5) * 1.4 + (flip < 0 ? Math.PI : 0), cf = Math.cos(phi), sf = Math.sin(phi);
      const steps = 2 + Math.floor(r2 * 1.99), riser = 0.45 + 0.15 * r3, tb = 0.45 + 0.3 * r4;
      out.fall = phi;
      const base = (x: number, z: number) => {
        const p = (x - cx) * cf + (z - cz) * sf, b = -(x - cx) * sf + (z - cz) * cf;
        const T = 0.5 - p / L;
        const Tt = soft(T, -0.7, 1.7), Tb = lerp(Tt, terrace((Tt + 0.7) * steps, riser) / steps - 0.7, tb);
        const gully = 0.07 * R * (1 - Math.abs(n(b, p, 0.09, 4))) ** 3;
        return R * (Tb + 1.0) - gully + 0.05 * R * n(x, z, 0.1, 2) + 0.02 * R * n(x, z, 0.4, 8);
      };
      raw = base;
      if (spec.creek && flip > 0 && Math.cos(phi) > 0.6) {
        // a creek down the fall line: its bed is the ground along the line less half a unit, never rising downstream
        const tn = Math.tan(phi), z0c = cz + (r2 - 0.5) * 0.3 * L, pc = r3 * 6.28;
        const zc = (x: number) => z0c + (x - cx) * tn + 2.2 * Math.sin(x / 17 + pc);
        const bed = monotoneBed(x => base(x, zc(x)) - 0.55);
        out.creek = { zAt: zc, bedY: bed, halfWidth: 0.6 };
        raw = (x, z) => {
          const d = Math.abs(z - zc(x)) * Math.cos(phi), valley = bed(x) + 0.3 + 0.3 * d ** 1.15;
          return smin(base(x, z), valley, 0.7);
        };
      }
      rock = (x, z) => sst(0.6, 0.9, Math.abs(n(x, z, 0.12, 5))) * 0.5;
      break;
    }
    case 'bench': {
      // a valley running east-west with the river on one side of the lot; the bench above it
      const sg = flip, B = R * 0.65, fp = 1.6 + r1, rw = B / 0.55, bw = 0.45 * L, dr = fp + rw + bw / 2;
      const zr = cz - sg * dr, A1 = 2 + 2 * r2, p1 = r3 * 6.28, g = 0.016 + 0.01 * r4;
      const zc = (x: number) => zr + A1 * Math.sin(x / 21 + p1) + 0.8 * n(x, 0, 0.05, 6);
      const bed = monotoneBed(x => Math.max(0.2, 1.6 - g * (x - 75)));
      out.creek = { zAt: zc, bedY: bed, halfWidth: 0.7 };
      out.fall = 0;
      raw = (x, z) => {
        const q = sg * (z - zc(x)), ground = bed(x) + 0.35;
        let y: number;
        if (q < 0) y = sst(0, 15, -q) * (B * 0.9) + 0.04 * (-q); // the far bank: up to the next hill
        else if (q < fp) y = 0;
        else if (q < fp + rw) y = B * sst(0, 1, (q - fp) / rw) * 0.85 + B * 0.15 * ((q - fp) / rw);
        else if (q < fp + rw + bw) y = B + 0.02 * (q - fp - rw) + 0.12 * R * 0.15 * n(x, z, 0.12, 2);
        else y = B + 0.02 * bw + 0.3 * (q - fp - rw - bw) * (1 - 0.35 * sst(10, 40, q - fp - rw - bw));
        return ground + y + 0.05 * R * n(x, z, 0.08, 3) * sst(fp, fp + 3, q);
      };
      rock = (x, z) => { const q = sg * (z - zc(x)); return q > fp && q < fp + rw ? 0.7 * (0.5 + 0.5 * n(x, z, 0.3, 1)) : q < 0 ? 0.3 : 0; };
      break;
    }
    case 'gorge': {
      const D = R, fw = D > 18 ? 0.9 : 1.2 + 1.2 * (1 - D / 18), wwL = D * (D > 18 ? 0.85 : 0.75), wwR = D * (D > 18 ? 1.3 : 1.7);
      const zr = cz + (r1 - 0.5) * 0.25 * L, A1 = (D > 18 ? 2 : 3) + 2 * r2, p1 = r3 * 6.28, g = (D > 18 ? 0.035 : 0.022) + 0.012 * r4;
      const zc = (x: number) => zr + A1 * Math.sin(x / 19 + p1) + 1.2 * n(x, 0, 0.05, 6);
      const bed = monotoneBed(x => Math.max(0.2, 0.7 - g * (x - 75)));
      out.creek = { zAt: zc, bedY: bed, halfWidth: Math.min(1.1, 0.5 + D * 0.02) };
      out.fall = 0;
      raw = (x, z) => {
        const dz = z - zc(x), side = dz * flip < 0 ? 0 : 1;
        const ww = side ? wwR : wwL;
        const js = Math.min(D, 14) / 6, jag = js * 0.9 * n(x, z, 0.075, 2) + 0.25 * js * n(x, z, 0.21, 7);
        const d = Math.max(0, Math.abs(dz) - fw + (side ? jag : 0.5 * jag));
        const t = clamp(d / ww, 0, 1);
        // a cliff in the middle of the wall with a talus apron at its foot, and a few ledges
        const prof = 0.12 * t + 0.88 * sst(0.1, 0.9, t), ledge = side ? 0.22 : 0.08;
        const wall = lerp(prof, terrace(t * 4, 0.5) / 4, ledge);
        const rim = D * (1 + 0.12 * n(x, 0, 0.04, 3)) + 0.05 * Math.max(0, d - ww) + 0.04 * R * n(x, z, 0.1, 1);
        return bed(x) + 0.25 + wall * rim;
      };
      rock = (x, z) => { const d = Math.abs(z - zc(x)); const t = clamp((d - fw) / (flip * (z - zc(x)) < 0 ? wwL : wwR), 0, 1); return sst(0.08, 0.3, t) * (1 - sst(0.95, 1.05, t)) * (0.7 + 0.3 * n(x, z, 0.3, 8)); };
      break;
    }
    case 'mesa': {
      const butte = spec.outlier;
      // the tongue: from its west cliff (x = xw) east to the road, easing down; cliffs on the north and south sides
      const gr = 0.17, xw = rect.x0 + 0.1 * w * r2;
      // the cliff stands 65 % of the relief; on a small lot it is cut down to what leaves the top a flat stretch before the ramp to the road
      const T = butte ? R : Math.min(R * 0.65, gr * 0.55 * (PARCEL - xw - 3));
      const run = butte ? 20 : T / gr, xr0 = Math.max(xw + 3, PARCEL - run - 3);
      const half = (0.3 + 0.1 * r1) * hz, cw = T * 0.42 + 0.5, sw = T * 1.5 + 2;
      out.fall = 0;
      const topH = (x: number) => (x < xr0 ? T : T * (1 - (butte ? sst(xr0, PARCEL + 4, x) : (x - xr0) / (PARCEL - xr0 + 3))));
      raw = (x, z) => {
        const wob = 1.5 * n(x, z, 0.07, 3) + 0.6 * n(x, z, 0.22, 5);
        const dz = Math.abs(z - cz) - half + wob, dx = xw - x + wob;
        const sd = Math.max(dz, dx);   // > 0 outside the tongue
        const top = topH(Math.min(x, PARCEL + 3)) + 0.1 * T * 0.2 * n(x, z, 0.15, 2);
        if (sd <= 0) return 0.3 + Math.max(top, 0.1) + 0.04 * T * n(x, z, 0.3, 4);
        // cliff down to 45% then talus to the plain
        const cliffTo = 0.42, t1 = clamp(sd / cw, 0, 1), t2 = clamp((sd - cw) / sw, 0, 1);
        const f = sd < cw ? 1 - (1 - cliffTo) * sst(0, 1, t1) : cliffTo * (1 - sst(0, 1, t2) ** 0.8);
        return 0.3 + Math.max(top, 0.1) * f + 0.03 * T * n(x, z, 0.2, 6) * (1 - f);
      };
      rock = (x, z) => {
        const wob = 1.5 * n(x, z, 0.07, 3), dz = Math.abs(z - cz) - half + wob, dx = xw - x + wob, sd = Math.max(dz, dx);
        return sd > -0.5 && sd < cw + sw * 0.45 ? 0.85 : sd > -4 ? 0.2 : 0;
      };
      break;
    }
    case 'saddle': {
      const Hs = R / 0.485, ax = r1 < 0.5 ? 1 : -1;
      out.fall = 0;
      out.spring = [cx + 3 * ax, cz + 2 * (r2 - 0.5)];
      raw = (x, z) => {
        const rz = 0.35 + 0.65 * Math.min(1.3, (Math.abs(z - cz) / (0.6 * L)) ** 1.6);
        const fx = Math.exp(-(((x - cx) / (1.5 * L)) ** 2));
        return 0.4 + Hs * rz * fx * (0.97 + 0.06 * n(x, z, 0.06, 1)) + 0.04 * R * n(x, z, 0.12, 5) + 0.012 * (cx - x);
      };
      rock = (x, z) => { const rz = Math.abs(z - cz) / (0.6 * L); return sst(0.8, 1.1, rz) * 0.5 * (0.6 + 0.4 * n(x, z, 0.2, 6)); };
      break;
    }
    case 'bluff': {
      const Bh = R, xb0 = cx - (0.12 + 0.1 * r1) * w, wob = 4 + 3 * r2, ph = r3 * 6.28;
      out.fall = Math.PI;
      out.lake = { y: LAKE_Y };
      const xb = (z: number) => xb0 + wob * Math.sin(z / 14 + ph) + 2 * n(z, 0, 0.07, 4);
      const bf = Bh / 0.85;
      raw = (x, z) => {
        const e = xb(z) - x;                       // distance west of the bluff edge (>0 over the water side)
        const lakeM = 1 - sst(46, 72, Math.abs(z - cz));   // the lake closes at its north and south ends
        const up = LAKE_Y + Bh + 0.03 * (x - xb(z)) + 0.04 * R * n(x, z, 0.1, 2) + 0.03 * R * n(x, z, 0.3, 3);
        if (e <= 0) return up;
        // the face drops from the upland to the shelf, then the bed; the lake closes at its north and south ends (the face eases out)
        const face = LAKE_Y + 0.25 + (up - LAKE_Y - 0.25) * (1 - sst(0, bf, e)) * (1 + 0.2 * n(x, z, 0.18, 7) * sst(0, 3, e) * Math.min(1, 10 / Bh));
        const bed = LAKE_Y + 0.25 - 2.85 * sst(bf + 1, bf + 11, e) * (1 - sst(80, 96, e));
        const land = e < bf + 1 ? face : bed + 0.5 * sst(86, 100, e);
        return lerp(up, land, lakeM);
      };
      rock = (x, z) => { const e = xb(z) - x; return e > -1 && e < bf + 1 ? 0.55 * (0.5 + 0.5 * n(x, z, 0.25, 1)) : 0; };
      break;
    }
    case 'island': {
      const peninsula = rect.x1 - rect.x0 < 30;
      const ri = (peninsula ? 0.3 : 0.27) * L, gap = clamp(3.5 + 4 * r1, 3, 7);
      const icx = Math.min(cx - 0.08 * w, 64 - ri - gap), icz = cz + (r2 - 0.5) * 0.15 * hz, xm = Math.min(65.5, icx + ri + gap);
      const Hi = Math.min(R * 0.9, ri * 0.1), lcx = (icx - ri * 1.6 + xm) / 2, ax = (xm - (icx - ri * 1.6)) / 2, az = Math.max(ri * 2.2, 0.62 * hz);
      out.fall = 0;
      out.lake = { y: LAKE_Y };
      const zc = icz + 1.2 * Math.sin(r3 * 6.28);
      const top = LAKE_Y + 0.5;
      out.homeSpot = [icx, icz];
      out.causeway = { pts: [[icx + ri * 0.55, zc], [(icx + xm) / 2, zc + 0.8 * Math.sin(r4 * 6.28)], [xm + 2, zc]], halfW: peninsula ? 1.1 : 0.65, top };
      raw = (x, z) => {
        const e = Math.hypot((x - lcx) / ax, (z - icz) / az) + 0.04 * n(x, z, 0.08, 3);
        const bank = ROAD_Y + 0.12 * n(x, z, 0.12, 2);
        const inLake = 1 - sst(0.88, 1.0, e);
        const bed = LAKE_Y - 0.4 - 2.4 * sst(0.0, 0.5, 1 - e) - 0.2 * n(x, z, 0.15, 5);
        let y = lerp(bank, bed, inLake);
        // the island: a knoll with a small flat top and steep banks
        const d = Math.hypot(x - icx, (z - icz) * 0.85) + 1.2 * n(x, z, 0.09, 4), k = clamp(1 - d / ri, 0, 1);
        const island = Hi * sst(0, 0.8, k) * (0.9 + 0.1 * k) + 0.05 * R * n(x, z, 0.2, 6) * k;
        if (k > 0) y = Math.max(y, lerp(y, LAKE_Y + 0.2 + island, sst(0, 0.35, k)));
        // the causeway
        const pts = out.causeway!.pts;
        for (let i = 1; i < pts.length; i++) {
          const [ax2, az2] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax2, dz = bz - az2, l2 = dx * dx + dz * dz;
          const t = clamp(((x - ax2) * dx + (z - az2) * dz) / l2, 0, 1), dd = Math.hypot(x - (ax2 + dx * t), z - (az2 + dz * t));
          const hw = out.causeway!.halfW, add = (top - y) * (1 - sst(hw, hw + 1.3, dd));
          if (add > 0) y += add;
        }
        return y;
      };
      rock = (x, z) => { const d = Math.hypot(x - icx, (z - icz) * 0.85); return d < ri && d > ri * 0.45 ? 0.35 * (0.5 + 0.5 * n(x, z, 0.3, 2)) : 0; };
      break;
    }
  }

  out.h = raw;
  out.rock = rock;
  return out;
}

// ── stats ──

export interface LotStats {
  /** Highest and lowest ground in the rect (relief units), and the drop (m). */
  maxM: number; minM: number; dropM: number;
  /** Mean and 90th-percentile slope (%), and the steepest 3-cell slope (%). */
  meanSlopePct: number; p90SlopePct: number; maxSlopePct: number;
  /** Share of the rect (dry land, not water) flat enough to build on (slope at most 12 %), and the largest connected flat pad (m²). */
  padFrac: number; padM2: number; padCount: number;
  /** Share of the rect on cliff-steep ground (slope over 70 %). */
  cliffFrac: number;
  /** Share of the rect under water. */
  waterFrac: number;
  /** Aspect of the land round the largest pad: which way it faces (radians, 0 east, π/2 south) and the sun it gets (0.75 north-facing .. 1.25 south-facing). */
  aspect: number; sun: number;
  /** The road to the biggest pad: length (m), the steepest 60 m stretch (%), the average (%), and the climb (m). */
  accessM: number; accessMaxPct: number; accessAvgPct: number; accessRiseM: number;
  /** Where the best pad is (x, z). */
  pad: [number, number];
  /** The creek's fall through the rect (m), 0 if none; the head a spring or reservoir at the highest pad over the lowest water (m). */
  creekDropM: number; headM: number;
  /** The creek's flood-prone floor within the rect (share of the rect below the creek bed + 1.5 m). */
  floodFrac: number;
  /** How far the pad stands above (+) or below (-) the land 100 m round it, m: high ground, or a bowl. */
  standM: number;
  /** Of 8 compass approaches on foot from 130 m out, how many are open (no cliff, no water, nothing steeper than 50 %), and the compass index (0 = E, 2 = S, 4 = W, 6 = N) of the easiest. */
  lanesOpen: number; easiestLane: number;
  /** The highest flat dry ground within 180 m of the pad above it, m: a reservoir there feeds the house by gravity (7 m is enough). */
  reservoirM: number;
}

/** Slope threshold of a pad a house can sit on, and of cliff ground (rise over run). */
export const PAD_SLOPE = 0.12;
export const CLIFF_SLOPE = 0.7;

/** The road meets the lot at its east edge: the drive starts at (x = 67, the pad's z). */
export function lotStats(f: LotField, step = 2): LotStats {
  const { rect } = f;
  const nx = Math.max(2, Math.round((rect.x1 - rect.x0) / step) + 1), nz = Math.max(2, Math.round((rect.z1 - rect.z0) / step) + 1);
  const dx = (rect.x1 - rect.x0) / (nx - 1), dz = (rect.z1 - rect.z0) / (nz - 1);
  const H = new Float32Array(nx * nz), wet = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const h = f.h(rect.x0 + i * dx, rect.z0 + j * dz); H[j * nx + i] = h;
    if (f.lake && h < f.lake.y + 0.02) wet[j * nx + i] = 1;
    if (f.creek) { const x = rect.x0 + i * dx, z = rect.z0 + j * dz; if (Math.abs(z - f.creek.zAt(x)) < f.creek.halfWidth && h < f.creek.bedY(x) + 0.55) wet[j * nx + i] = 1; }
  }
  const at = (i: number, j: number) => H[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  const slope = new Float32Array(nx * nz);
  const slopes: number[] = [];
  let hi = -Infinity, lo = Infinity, water = 0, cliff = 0, land = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, gx = (at(i + 1, j) - at(i - 1, j)) / (2 * dx), gz = (at(i, j + 1) - at(i, j - 1)) / (2 * dz), m = Math.hypot(gx, gz);
    slope[k] = m; hi = Math.max(hi, H[k]); lo = Math.min(lo, H[k]);
    if (wet[k]) { water++; continue; }
    land++; slopes.push(m);
    if (m > CLIFF_SLOPE) cliff++;
  }
  slopes.sort((a, b) => a - b);
  const q = (p: number) => (slopes.length ? slopes[Math.min(slopes.length - 1, Math.floor(p * slopes.length))] : 0);
  // pads: connected flat cells (4-neighbour), at least 12 cells (≈ 0.4 acre at 1 u cells: 36 m² each ≈ 430 m²)
  const lab = new Int32Array(nx * nz).fill(-1), pads: Array<{ n: number; sx: number; sz: number; cx: number; cz: number }> = [];
  for (let s = 0; s < nx * nz; s++) {
    if (lab[s] >= 0 || wet[s] || slope[s] > PAD_SLOPE) continue;
    const id = pads.length, stack = [s], p = { n: 0, sx: 0, sz: 0, cx: 0, cz: 0 };
    lab[s] = id;
    while (stack.length) {
      const k = stack.pop()!, i = k % nx, j = (k - i) / nx;
      p.n++; p.sx += i; p.sz += j;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const kk = jj * nx + ii;
        if (lab[kk] >= 0 || wet[kk] || slope[kk] > PAD_SLOPE) continue;
        lab[kk] = id; stack.push(kk);
      }
    }
    pads.push(p);
  }
  const cellM2 = dx * dz * 36;
  const big = pads.filter(p => p.n * cellM2 >= 450).sort((a, b) => b.n - a.n);
  let best = big[0] ?? pads.sort((a, b) => b.n - a.n)[0] ?? { n: 0, sx: (nx - 1) / 2, sz: (nz - 1) / 2 };
  if (f.homeSpot) {
    // the camp goes where the lot says (the island), on the nearest pad of any size
    const [hx, hz] = f.homeSpot;
    let nd = Infinity;
    for (const p of pads) {
      const d = Math.hypot(rect.x0 + (p.sx / p.n) * dx - hx, rect.z0 + (p.sz / p.n) * dz - hz);
      if (p.n >= 6 && d < nd) { nd = d; best = p; }
    }
  }
  const px = rect.x0 + (best.sx / Math.max(1, best.n)) * dx, pz = rect.z0 + (best.sz / Math.max(1, best.n)) * dz;
  let padCells = 0;
  for (const p of big) padCells += p.n;
  // aspect round the pad: the downhill direction of the land within 8 u
  let gxs = 0, gzs = 0;
  for (let a = 0; a < 16; a++) {
    const ang = a * Math.PI / 8, y = f.h(px + Math.cos(ang) * 8, pz + Math.sin(ang) * 8);
    gxs += Math.cos(ang) * y; gzs += Math.sin(ang) * y;
  }
  const uphill = Math.atan2(gzs, gxs), aspect = Math.hypot(gxs, gzs) < 0.5 ? f.fall : uphill + Math.PI;
  const tilt = Math.min(0.4, Math.hypot(gxs, gzs) / 16 / 4);
  const sun = clamp(1 + 0.8 * tilt * Math.sin(aspect), 0.75, 1.25);
  // the road: from (67, pad z) straight to the pad
  const acc = accessProfile(f, px, pz);
  const crk = f.creek;
  const creekDropM = crk ? Math.max(0, (crk.bedY(rect.x0) - crk.bedY(rect.x1)) * 6) : 0;
  let lowWater = Infinity;
  if (crk) lowWater = crk.bedY(rect.x1); else if (f.lake) lowWater = f.lake.y;
  let flood = 0;
  if (crk) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = rect.x0 + i * dx; if (H[j * nx + i] < crk.bedY(x) + 0.25) flood++; }
  // standing over the land round it
  // (the water round an island counts as the lake's surface, not the bed under it)
  let ring = 0;
  const dry = (x: number, z: number) => Math.max(f.h(x, z), f.lake ? f.lake.y : -Infinity);
  for (let a = 0; a < 16; a++) ring += dry(px + Math.cos(a * Math.PI / 8) * 16, pz + Math.sin(a * Math.PI / 8) * 16);
  const padY = f.h(px, pz), standM = (padY - ring / 16) * 6;
  // approaches on foot
  let lanesOpen = 0, easiestLane = 0, easiestCost = Infinity;
  for (let d = 0; d < 8; d++) {
    const ang = d * Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
    let open = true, cost = 0, prev = f.h(px + ca * 22, pz + sa * 22);
    for (let r = 21; r >= 0; r--) {
      const x = px + ca * r, z = pz + sa * r, h = f.h(x, z), m = Math.abs(h - prev);
      if (m > 0.5 || (f.lake && h < f.lake.y + 0.02) || (f.creek && Math.abs(z - f.creek.zAt(x)) < f.creek.halfWidth && h < f.creek.bedY(x) + 0.55)) open = false;
      cost += 1 + 4 * m; prev = h;
    }
    if (open) lanesOpen++;
    if (cost < easiestCost) { easiestCost = cost; easiestLane = d; }
  }
  // the best reservoir bench above the pad
  let reservoirM = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    if (wet[k] || slope[k] > PAD_SLOPE) continue;
    const x = rect.x0 + i * dx, z = rect.z0 + j * dz;
    if (Math.hypot(x - px, z - pz) > 30) continue;
    reservoirM = Math.max(reservoirM, (H[k] - padY) * 6);
  }
  return {
    standM, lanesOpen, easiestLane, reservoirM,
    maxM: hi * 6, minM: lo * 6, dropM: (hi - lo) * 6,
    meanSlopePct: 100 * (slopes.length ? slopes.reduce((a, b) => a + b, 0) / slopes.length : 0), p90SlopePct: 100 * q(0.9), maxSlopePct: 100 * (slopes[slopes.length - 1] ?? 0),
    padFrac: land ? padCells / land : 0, padM2: big.length ? big[0].n * cellM2 : 0, padCount: big.length,
    cliffFrac: land ? cliff / (nx * nz) : 0, waterFrac: water / (nx * nz),
    aspect, sun, accessM: acc.lenM, accessMaxPct: acc.maxPct, accessAvgPct: acc.avgPct, accessRiseM: acc.riseM,
    pad: [px, pz], creekDropM, headM: Number.isFinite(lowWater) ? Math.max(0, (hi - lowWater) * 6) : 0,
    floodFrac: flood / (nx * nz),
  };
}

/** A straight road from the county road (x = 67) to a point: length, steepest 60 m stretch, average grade, climb (m). */
export function accessProfile(f: LotField, px: number, pz: number): { lenM: number; maxPct: number; avgPct: number; riseM: number } {
  const x0 = PARCEL + 1, steps = Math.max(2, Math.ceil(Math.hypot(x0 - px, 0)));
  // the road runs level in z along the valley when it can: it bends to the pad's z only on the last stretch
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = lerp(x0, px, t), z = lerp(pz, pz, t);
    // over the water the road is the causeway, a little above the lake
    const hh = f.h(x, z);
    pts.push([x, z, f.lake && hh < f.lake.y + 0.5 ? f.lake.y + 0.5 : hh]);
  }
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    len += d;
  }
  // steepest 10-unit (60 m) stretch
  let maxPct = 0;
  for (let i = 0; i + 10 <= pts.length - 1; i++) maxPct = Math.max(maxPct, Math.abs(pts[i + 10][2] - pts[i][2]) / Math.hypot(pts[i + 10][0] - pts[i][0], pts[i + 10][1] - pts[i][1]));
  if (!maxPct && pts.length > 1) maxPct = Math.abs(pts[pts.length - 1][2] - pts[0][2]) / Math.max(1e-6, len);
  const net = Math.abs(pts[pts.length - 1][2] - pts[0][2]);
  return { lenM: Math.round(len * 6), maxPct: Math.round(maxPct * 1000) / 10, avgPct: Math.round(100 * 1000 * net / Math.max(1e-6, len)) / 1000, riseM: Math.round(net * 6) };
}

/** Cross-section along a line (for the listing's profile chart): `n` samples of ground height (m above the lowest) and water. */
export function profileLine(f: LotField, a: [number, number], b: [number, number], n = 48): Array<{ d: number; yM: number; wet: boolean }> {
  const out: Array<{ d: number; yM: number; wet: boolean }> = [];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t), h = f.h(x, z);
    const wet = (!!f.lake && h < f.lake.y + 0.02) || (!!f.creek && Math.abs(z - f.creek.zAt(x)) < f.creek.halfWidth && h < f.creek.bedY(x) + 0.55);
    out.push({ d: t * len * 6, yM: h * 6, wet });
  }
  return out;
}
