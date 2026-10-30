/**
 * What the lie of the land costs (docs/DECISIONS.md, "Varied lots and elevations"): the driveway and the power line
 * on a grade, the grading and retaining wall under a building on a slope, the winter road that closes in snow, and the
 * deputy who takes longer to climb the hill. Pure; every effect is small, and a place with no lot is untouched.
 */
import { siteLot } from './lotListing';
import { regionFor } from './climate';
import { mulberry32 } from './rng';
import type { Blueprint } from './blueprints';
import type { Site } from './site';
import type { GameState, Structure } from './state';
import { dayIndex } from './state';
import { VEHICLES, fleetOf, runs } from './vehicles';
import { roadResponse, roadWinter } from './roadFx';
import { tunnelResponse } from './corridors';

// ── the road and the line ──

export interface RoadFactor {
  /** The road is this much longer than the straight line (switchbacks), and each foot costs this much more (cut and fill, walls, culverts). */
  lenMul: number; perFtMul: number;
  /** Steepest 60 m stretch of the straight road, %. */
  gradePct: number;
  switchbacks: boolean;
  text: string | null;
}

const FLAT: RoadFactor = { lenMul: 1, perFtMul: 1, gradePct: 0, switchbacks: false, text: null };

/**
 * The county's rule of thumb: a gravel drive is fine to 8 %; to 12 % it needs cut and fill and culverts; past that a
 * truck cannot climb it straight, so it switchbacks (the road lengthens by grade / 9 %) and every foot is dearer (walls,
 * a heavier base); past 30 % it is a mule track with hairpins. An outlier butte needs an engineer.
 */
export function roadFactor(site: Pick<Site, 'lot' | 'home'>): RoadFactor {
  const lot = siteLot(site);
  if (!lot) return FLAT;
  const g = lot.stats.accessMaxPct, out = site.lot!.outlier;
  if (g <= 8) return { ...FLAT, gradePct: g };
  if (g <= 12) return { lenMul: 1.1, perFtMul: 1.25, gradePct: g, switchbacks: false, text: `${Math.round(g)} % grade: cut and fill and culverts add a quarter` };
  if (out && site.lot!.kind === 'mesa') return { lenMul: 3.6, perFtMul: 3.4, gradePct: g, switchbacks: true, text: 'a butte with no ramp: the road is a cut zigzag up the cliff, three times the length and dear a foot (an engineer first)' };
  const lenMul = Math.min(3.6, g / 9) * (out ? 1.2 : 1), perFt = g <= 18 ? 1.5 : g <= 30 ? 2 : 2.6;
  return { lenMul: Math.round(lenMul * 100) / 100, perFtMul: perFt * (out ? 1.3 : 1), gradePct: g, switchbacks: true, text: `${Math.round(g)} % straight up: the road switchbacks, ${Math.round((lenMul - 1) * 100)} % longer and dearer a foot` };
}

/** The power line over rough ground: poles on slopes and rock cost more (1 on level ground, up to 2.6). */
export function powerFactor(site: Pick<Site, 'lot' | 'home'>): number {
  const lot = siteLot(site);
  if (!lot) return 1;
  const s = lot.stats;
  return Math.round(Math.min(2.6, 1 + 1.0 * Math.min(1, s.meanSlopePct / 30) + 0.8 * Math.min(1, s.cliffFrac / 0.2) + (site.lot!.outlier ? 0.3 : 0)) * 100) / 100;
}

// ── the building pad ──

/** Rise over run across a footprint of half-size `half` (world units) at (x, z), the steepest of the two axes; 0 with no lot. */
export function gradeAt(site: Pick<Site, 'lot' | 'home'>, x: number, z: number, half = 0.8): number {
  const lot = siteLot(site);
  if (!lot) return 0;
  const f = lot.field;
  const hs = [-1, 0, 1].map(i => [-1, 0, 1].map(j => f.h(x + i * half, z + j * half)));
  let g = 0;
  for (let j = 0; j < 3; j++) g = Math.max(g, Math.abs(hs[2][j] - hs[0][j]) / (2 * half));
  for (let i = 0; i < 3; i++) g = Math.max(g, Math.abs(hs[i][2] - hs[i][0]) / (2 * half));
  return Math.round(g * 1000) / 1000;
}

/** Bands of grade: 0 level (no work), 1 gentle (grading and a stem wall), 2 a retaining wall, 3 a tall wall, 4 terraced into the hill. */
export const gradeBucket = (g: number): 0 | 1 | 2 | 3 | 4 => (g < 0.06 ? 0 : g < 0.12 ? 1 : g < 0.2 ? 2 : g < 0.3 ? 3 : 4);

/** Structures that are not graded: underground work and anything that is not a surface building. */
const UNGRADED = /^(bunker|escape|hatch|tunnel|wall|fence|hedge|gate)/;

const gradedCache = new Map<string, Blueprint>();
/**
 * The blueprint of a building on a slope: the pad takes longer to cut, the foundation more fieldstone for the retaining
 * wall behind it (2 pallets at the gentlest, 32 on a hillside terrace).
 */
export function gradedBlueprint(bp: Blueprint, grade: number): Blueprint {
  const b = gradeBucket(grade);
  if (b === 0 || UNGRADED.test(bp.kind)) return bp;
  const key = `${bp.kind}:${b}`;
  let out = gradedCache.get(key);
  if (!out) {
    out = {
      ...bp,
      stages: bp.stages.map(st => st.id === 'site'
        ? { ...st, hours: Math.round(st.hours * (1 + 0.6 * b)), name: `${st.name} (cut into the slope)` }
        : st.id === 'foundation'
          ? { ...st, hours: Math.round(st.hours * (1 + 0.25 * b)), materials: { ...st.materials, fieldstone: (st.materials.fieldstone ?? 0) + 2 * b * b } }
          : st),
    };
    gradedCache.set(key, out);
  }
  return out;
}

/** Stamp the slope under a staked structure (its grade, for the blueprint). */
export function stampGrade(s: GameState, st: Structure): void {
  if (!s.site.lot || UNGRADED.test(st.kind)) return;
  const g = gradeAt(s.site, st.x, st.z);
  if (gradeBucket(g) > 0) st.grade = g; else delete st.grade;
}

/** Plain words for the grade under a spot (the placement hint, the guidance card): null on level ground. */
export function gradeNote(site: Pick<Site, 'lot' | 'home'>, x: number, z: number): string | null {
  const g = gradeAt(site, x, z), b = gradeBucket(g);
  if (b === 0) return null;
  const pct = Math.round(g * 100), pallets = 2 * b * b;
  return b === 1 ? `${pct} % slope: grading and a stem wall (about ${pallets} pallets of fieldstone more)`
    : `${pct} % slope: this needs a retaining wall, about ${pallets} more pallets of fieldstone and ${Math.round(60 * b)} % more time on the pad`;
}

// ── winter access ──

/**
 * How hard the way in is in snow: the steepest stretch beyond 6 %, and altitude beyond 1,900 m. 0 on any place with an
 * easy road; at 1 or more the road closes on heavy snow days.
 */
export function roadDifficulty(site: Site, seed?: number): number {
  const lot = siteLot(site);
  if (!lot) return 0;
  // with a game the road is the planned one (sim/roadFx.ts: switchbacks hold the grade down, but add hairpins and length); a listing reads the straight line
  const road = seed !== undefined ? roadWinter({ site, seed }) : Math.max(0, (lot.stats.accessMaxPct - 6) / 8);
  return road + Math.max(0, (site.lot!.elevM - 1900) / 900) + (site.lot!.kind === 'gorge' ? 0.2 : 0);
}

/** Best traction in the yard: the running road vehicle with the highest off-road rating (a pickup 0.6 ... the motorhome 0.85). */
function traction(s: GameState): number {
  let t = 0.5;
  for (const v of fleetOf(s)) if (runs(v) && !v.away && VEHICLES[v.kind].seats > 0) t = Math.max(t, VEHICLES[v.kind].offroad);
  return t;
}

/** Heavy-snow days begin on a day of the cold season with this chance (the region's snowfall at this height, about 12 cm a heavy day). */
function snowStartChance(s: GameState, day: number): number {
  const R = regionFor(s.site), doy = ((day + s.clock.startDoy - 1) % 365 + 365) % 365 + 1;
  const season = doy >= 305 || doy <= 90;
  return season ? Math.min(0.25, R.snowCm / 12 / 150) : 0;
}

/** Days the road stays shut after a heavy snow starts: 1 at the threshold, more the harder the way in; a plow blade halves it. */
function closureDays(s: GameState): number {
  const d = roadDifficulty(s.site, s.seed) * (1.5 - traction(s));
  if (d < 1) return 0;
  const days = Math.min(6, 1 + Math.floor(d * 1.5));
  return s.stock.plow >= 1 ? (d < 1.8 ? 0 : Math.max(1, Math.ceil(days / 2))) : days;
}

/** Days left that the way in is closed by snow on `day` (0: open). Pure in the seed and the day: nothing is stored. */
export function roadClosedFor(s: GameState, day = dayIndex(s.clock.t)): number {
  if (!s.site.lot) return 0;
  const n = closureDays(s);
  if (n <= 0) return 0;
  for (let back = 0; back < n; back++) {
    const d = day - back;
    if (d < 0) break;
    if (mulberry32(s.seed * 8191 + d * 31 + 17)() < snowStartChance(s, d)) return n - back;
  }
  return 0;
}

/** The text that goes with a closure (deliveries, the weekend commute). */
export const ROAD_CLOSED_TEXT = 'the road up the hill is drifted shut and the plow has not been through';

/** Deputy, ambulance and fire take longer up a long, steep or winding road (sim/roadFx.ts), and 2.5 times as long while it is closed. */
export function responseFactor(s: GameState): number {
  // the planned road: its length, hairpins, grade and single-file structures (sim/roadFx.ts); a place with no lot keeps the old 1
  let k = s.site.lot ? roadResponse(s) : 1;
  if (roadClosedFor(s) > 0) k *= s.stock.plow >= 1 ? 1.5 : 2.5;
  k += tunnelResponse(s);
  return k;
}

/** One line for the Supplies/Land panels: how often the road closes. */
export function winterRoadLine(s: GameState): string | null {
  if (!s.site.lot) return null;
  const n = closureDays(s), R = regionFor(s.site);
  if (n <= 0) return roadDifficulty(s.site, s.seed) > 0.5 ? 'The way in is steep, but a truck gets up it in snow.' : null;
  const heavy = Math.round(R.snowCm / 12);
  return `The road closes about ${Math.round(heavy * n * 0.6)} days a winter (${heavy} heavy snows, ${n} day${n === 1 ? '' : 's'} each)${s.stock.plow >= 1 ? ', fewer with the plow blade on the truck' : ': a plow blade would cut that in half'}.`;
}

