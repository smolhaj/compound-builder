/**
 * The county road's graded bed (docs/DECISIONS.md, "County road bed"): the road ribbon used to lie on the raw ground, so on a hillside lot
 * its centre line bounced with every hummock and ran at 30 to 45 % grades. Now it gets what the drive gets: a smooth vertical profile held
 * to the road grade limit, and the same bench (sim/roadBed.ts) cut into the ground along it, cut banks on the uphill side and fill slopes
 * on the downhill side, so the surface is never floating over the slope or buried in it. Decks over creeks and ravines keep their own
 * straight line (sim/countyCrossings.ts) and carry no bed; the profile eases into the deck's ends.
 * Pure: the ground is a function, the road a centre line `x(z)`.
 */
import { RoadBed, BED, type BedStation } from './roadBed';
import type { CountyGap } from './countyCrossings';
import { PARCEL_SIZE } from '../game/parcel/parcelTerrain';

/** The grade the county road is held to (rise over run): the sustained 10 % of a county road. */
export const COUNTY_GRADE = 0.1;
/** The stretch graded: well past the parcel on both sides, so the road the player sees from the hills is smooth too (beyond it the road lies on the ground). */
export const COUNTY_Z0 = -250, COUNTY_Z1 = PARCEL_SIZE + 250;
const STEP = 1;
/** Half the window the ground is averaged over to find the road's line (samples of STEP): a county road ignores a hummock a few units across. */
const SMOOTH = 5;
/** The county bench: the surface is 1.0 wide; the shoulders make 0.65 to a side. Banks may reach further than the drive's, since the county road keeps its grade and cuts through. */
export const COUNTY_HALF = 0.65, COUNTY_REACH = 8;

export interface CountyProfile { z0: number; step: number; y: Float64Array }

/** Running mean over ±`w` stations (the ends repeat), pinned stations kept. */
function average(y: Float64Array, pin: Uint8Array, w: number): Float64Array {
  const n = y.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (pin[i]) { out[i] = y[i]; continue; }
    let a = 0, c = 0;
    for (let k = -w; k <= w; k++) { a += y[Math.min(n - 1, Math.max(0, i + k))]; c++; }
    out[i] = a / c;
  }
  return out;
}

/** The most the road's line may stand off the (smoothed) ground: a cut or fill taller than this (u; 2 is 40 ft) is an earthwork no county would dig for a gravel road, so on ground steeper than the grade limit over a long run the road keeps within this and takes the grade the land gives it. */
export const COUNTY_DEV = 2;

/**
 * The profile closest to `s` whose grade stays within `lim` per station and which never strays more than `dev` from `ref` (default `s`): pairs of stations too far
 * apart are pulled together equally (a pinned one stays) and each sweep ends back inside the tube, until nothing is left over; the tube has the last word.
 */
export function limitGrade(s: Float64Array, pin: Uint8Array, lim: number, dev = Infinity, ref: Float64Array = s): Float64Array {
  const n = s.length, y = Float64Array.from(s), d = lim * STEP;
  const tube = () => { for (let i = 0; i < n; i++) y[i] = Math.max(ref[i] - dev, Math.min(ref[i] + dev, y[i])); };
  for (let it = 0; it < 4000; it++) {
    let worst = 0;
    for (let i = 0; i + 1 < n; i++) {
      const diff = y[i + 1] - y[i], over = Math.abs(diff) - d;
      if (over <= 0) continue;
      worst = Math.max(worst, over);
      const sg = Math.sign(diff);
      if (pin[i] && pin[i + 1]) continue;
      if (pin[i]) y[i + 1] -= sg * over; else if (pin[i + 1]) y[i] += sg * over; else { y[i] += sg * over / 2; y[i + 1] -= sg * over / 2; }
    }
    tube();
    if (worst < 1e-4) break;
  }
  return y;
}

/**
 * The vertical profile: the ground averaged twice over a window (a triangular weight) with the deck of each gap pinned, then held to the
 * road grade by the least change (limitGrade) within COUNTY_DEV of the ground, and rounded into vertical curves at the sags and crests.
 * `deck(z)` is the deck height where the road bridges, else null.
 */
export function countyProfile(ground: (z: number) => number, deck: (z: number) => number | null, z0 = COUNTY_Z0, z1 = COUNTY_Z1): CountyProfile {
  const n = Math.floor((z1 - z0) / STEP) + 1;
  const g = new Float64Array(n), pin = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const z = z0 + i * STEP, d = deck(z); if (d !== null) { g[i] = d; pin[i] = 1; } else g[i] = ground(z); }
  let y = g;
  for (let pass = 0; pass < 2; pass++) y = average(y, pin, SMOOTH);
  // (the limit leaves a sharp V at a sag and a ridge at a crest: averaging rounds it and cannot steepen a grade)
  let f = limitGrade(y, pin, COUNTY_GRADE, COUNTY_DEV, y);
  for (let pass = 0; pass < 2; pass++) f = average(f, pin, SMOOTH);
  return { z0, step: STEP, y: limitGrade(f, pin, COUNTY_GRADE, COUNTY_DEV, y) };
}

/** The profile's height at z (linear between stations); null outside the graded stretch. */
export function profileAt(p: CountyProfile, z: number): number | null {
  const f = (z - p.z0) / p.step;
  if (f < 0 || f > p.y.length - 1) return null;
  const i = Math.min(p.y.length - 2, Math.floor(f)), t = f - i;
  return p.y[i] + (p.y[i + 1] - p.y[i]) * t;
}

/** The bed along the road: stations every step, none under a deck. */
export function countyBedOf(p: CountyProfile, x: (z: number) => number, gaps: readonly CountyGap[]): RoadBed {
  const pts: BedStation[] = [], skip: boolean[] = [];
  for (let i = 0; i < p.y.length; i++) {
    const z = p.z0 + i * p.step;
    pts.push({ x: x(z), z, y: p.y[i], half: COUNTY_HALF, reach: COUNTY_REACH });
    skip.push(gaps.some(g => z >= g.z0 && z <= g.z1));
  }
  return new RoadBed(pts, skip);
}

/** The tallest bench cut or fill the bed makes against the natural ground along the road (the earthwork a player would see as a bank, u). */
export function bedDepth(bed: RoadBed, natural: (x: number, z: number) => number, x: (z: number) => number, z0 = COUNTY_Z0, z1 = COUNTY_Z1): number {
  let worst = 0;
  for (let z = z0; z <= z1; z += 2) for (const o of [-1, 1]) { const px = x(z) + o * (BED.halfW + 0.2), n = natural(px, z); worst = Math.max(worst, Math.abs(bed.apply(px, z, n).h - n)); }
  return worst;
}
