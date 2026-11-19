/**
 * The slow climate kinds, runaway heat and the ice age (docs/design/climate_disasters.md, owner-approved 2026-11-19): the state-aware layer
 * over the pure curves in climateCurve.ts. Pure; no value imports from state.ts (day of year is passed in), so disaster.ts, housing.ts,
 * heating.ts and the engine can all call it without a cycle.
 *
 *   era hold        a slow kind keeps the era open until its curve is done plus one year, then it settles as "the new normal"
 *   difficulty      Cozy stretches the curve 1.5x and shrinks the amplitude to 0.7; Hardcore is 0.8x as long and 1.2x as deep (DIFFICULTY)
 *   heat            the summer peak, the lift to the day's temperature, the outdoor grow factor, wet-bulb and the outdoor work share
 *   ice             the cold anomaly (through the shared winter engine with a coldScale), the snow load, and the cold equipment factors
 *
 * Nothing here is saved: every number is a function of the clock, the region, the variant and the difficulty.
 */
import type { DisasterKind, DisasterState } from './disaster';
import type { GameState } from './state';
import type { RegionId } from './regions';
import { REGIONS } from './regions';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { REGION_WINTER, winterAt, type WinterState } from './winter';
import {
  HEAT_PEAK_F, HEAT_RAMP_YEARS, COLD_RAMP_YEARS, ICE_AGE, JAN_LOW_Y0_F, JULY_HIGH_Y0_F, afternoonRh, coldAnomaly, heatPeakF, heatWinterLowF,
  outdoorGrowFactor, outdoorWorkShare, snowLoadPsf, wetBulbF,
} from './climateCurve';

export type SlowKind = 'runaway_heat' | 'ice_age';
export const SLOW_KINDS: readonly SlowKind[] = ['runaway_heat', 'ice_age'];
export const isSlowKind = (k: DisasterKind | string | null | undefined): k is SlowKind => k === 'runaway_heat' || k === 'ice_age';

/**
 * The kinds that put the world into a winter (the shared winter engine, or a heat or cold curve over years). The era roll never puts one right
 * after another. Nuclear stays out: its exchange winter is short and its own rule (effects.winterFactor), and the doc keeps it separate.
 */
export const WINTER_KINDS: readonly DisasterKind[] = ['ash_winter', 'supervolcano', 'asteroid', 'runaway_heat', 'ice_age'];

/** Years each kind takes to reach its plateau at Standard (climateCurve: 4 and 3). */
export const RAMP_YEARS: Record<SlowKind, number> = { runaway_heat: HEAT_RAMP_YEARS, ice_age: COLD_RAMP_YEARS };

/** How the difficulty bends a slow curve: `stretch` multiplies its length, `amp` its depth (DIFFICULTY.climateStretch / climateAmp). */
export interface ClimateTune { stretch: number; amp: number }
export const climateTune = (d: Difficulty | undefined): ClimateTune => { const k = DIFFICULTY[d ?? 'standard']; return { stretch: k.climateStretch, amp: k.climateAmp }; };

/**
 * Days after the hit when the era may settle: the curve's last day plus one year ("the new normal"). 0 for every other kind (they keep the
 * old rule in eras.ts), so the era timing of the existing kinds cannot change.
 */
export function eraHoldDays(d: Pick<DisasterState, 'kind' | 'difficulty'>): number {
  if (!isSlowKind(d.kind)) return 0;
  return Math.round((RAMP_YEARS[d.kind] * climateTune(d.difficulty).stretch + 1) * 365);
}

type S = Pick<GameState, 'disaster' | 'clock' | 'site'>;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smoothDoy = (doy: number, peakDoy: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * (doy - peakDoy) / 365);
/** 1 in midsummer, 0 in midwinter. */
export const summerness = (doy: number): number => smoothDoy(doy, 196);
/** 1 in midwinter, 0 in midsummer. */
export const winterness = (doy: number): number => smoothDoy(doy, 30);

/** The 0..1 warning-sign fraction (0 before the warning starts, 1 at the hit). Same as disaster.tension, without the import. */
export function warnFrac(d: Pick<DisasterState, 'kind' | 'warnAt' | 'hitAt'>, t: number): number {
  if (!d.kind || t < d.warnAt) return 0;
  return Math.min(1, (t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
}

/** Game years since the hit, divided by the difficulty's stretch (negative before it). */
export function slowYears(s: Pick<GameState, 'disaster' | 'clock'>): number {
  return (s.clock.t - s.disaster.hitAt) / 365 / climateTune(s.disaster.difficulty).stretch;
}
/** True when this kind is the active disaster and it has hit. */
export const slowActive = (s: Pick<GameState, 'disaster' | 'clock'>, kind: SlowKind): boolean => s.disaster.kind === kind && s.clock.t >= s.disaster.hitAt;

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Runaway heat
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The warning signs bring the summer peak up this far (degrees F, design doc 1.1: 0 to plus 8) by the hit. */
export const HEAT_WARN_F = 8;
/** The night's low rises about as much as the day (doc 1.2); the shared temperature model adds its own 12 F on hot nights, so the lift is trimmed. */
export const HEAT_LOW_SHARE = 0.85;

/** How much hotter than normal the summer afternoon peak is now (degrees F, 0 or more): the warning ramp before the hit, the region table after. */
export function heatPeakDeltaF(s: S): number {
  const d = s.disaster;
  if (d.kind !== 'runaway_heat') return 0;
  const { amp } = climateTune(d.difficulty), region = s.site.region;
  const warn = HEAT_WARN_F * amp * warnFrac(d, s.clock.t);
  if (s.clock.t < d.hitAt) return warn;
  return Math.max(warn, (heatPeakF(region, slowYears(s)) - HEAT_PEAK_F[region][0]) * amp);
}
/** How much milder than normal the January low is now (degrees F, 0 or more; winters lift 15 to 20 F by year 4). */
export function heatWinterDeltaF(s: S): number {
  const d = s.disaster;
  if (d.kind !== 'runaway_heat' || s.clock.t < d.hitAt) return 0;
  return (heatWinterLowF(s.site.region, slowYears(s)) - JAN_LOW_Y0_F[s.site.region]) * climateTune(d.difficulty).amp;
}
/** The summer peak high now (degrees F) in a heat disaster (the region's normal July high when none is on). */
export const heatPeakF_now = (s: S): number => HEAT_PEAK_F[s.site.region][0] + heatPeakDeltaF(s);

/** The lift to today's air temperature (degrees F) for the day of the year: the winter lift in January, the peak delta in July. */
export function heatDeltaF(s: S, doy: number): number {
  const p = heatPeakDeltaF(s);
  if (p <= 0) return 0;
  const w = heatWinterDeltaF(s), k = summerness(doy);
  return w + (p - w) * k;
}
/** What the shared overnight-low model adds (housing.meanLow): the heat's lift on the night. Zero when no heat disaster is on. */
export const heatLiftF = (s: S, doy: number): number => HEAT_LOW_SHARE * heatDeltaF(s, doy);

/**
 * Share of a normal outdoor crop left (0..1): the doc's grow factor at the season's peak, relative to the region's own normal summer so year 0
 * starts at 1. Mostly a summer effect: in winter heat does not hurt a crop (and winter crops flip into the outdoor season).
 */
export function heatGrow(s: S, doy: number): number {
  const d = s.disaster;
  if (d.kind !== 'runaway_heat') return 1;
  const rel = clamp(outdoorGrowFactor(heatPeakF_now(s)) / outdoorGrowFactor(HEAT_PEAK_F[s.site.region][0]), 0, 1);
  return 1 - (1 - rel) * clamp(summerness(doy) * 1.25, 0, 1);
}

/** The variants shift the air's moisture (percentage points of relative humidity): the humid furnace is the killer, the dry one the parched. */
export const HEAT_RH_SHIFT: Record<string, number> = { dry_furnace: -10, humid_furnace: 16 };
/** Afternoon relative humidity (percent) here for this run. */
export function heatRh(s: S): number {
  return clamp(afternoonRh(REGIONS[s.site.region].rainMm) + (HEAT_RH_SHIFT[s.disaster.variant] ?? 0), 5, 99);
}
/** Relative humidity rises as the air cools through the day: `peakF` is today's afternoon high, `airF` the air now. */
export function rhAt(rhAfternoon: number, peakF: number, airF: number): number {
  return clamp(rhAfternoon + 1.2 * Math.max(0, peakF - airF), 5, 99);
}
/** Wet-bulb (F) for the air now, given the day's afternoon peak (for the humidity). */
export function wetBulbNow(s: S, airF: number, peakF: number): number {
  return wetBulbF(airF, rhAt(heatRh(s), peakF, airF));
}
/** Share of a normal outdoor work hour available at this air temperature in a heat disaster (1 when none is on). */
export function heatWorkShare(s: S, airF: number, peakF: number): number {
  if (!slowActive(s, 'runaway_heat')) return 1;
  return outdoorWorkShare(wetBulbNow(s, airF, peakF));
}

/** Wells and shallow water drop in the heat (doc 1.2: the drought rule, a slower draw): the share of yield left. */
export function heatWellYield(s: S, wellKind: string): number {
  if (!slowActive(s, 'runaway_heat')) return 1;
  const a = Math.min(1, slowYears(s) / HEAT_RAMP_YEARS), amp = climateTune(s.disaster.difficulty).amp;
  return wellKind === 'well_hand' ? Math.max(0, 1 - 0.75 * a * amp) : Math.max(0.35, 1 - 0.5 * a * amp);
}

/** Heat illness chance a day for one person with the house at or above 95 F and no cooling (PROPOSED, doc 1.3: 3 to 6 percent). */
export const HEAT_ILLNESS_P = 0.03;
export const HEAT_ILLNESS_INDOOR_F = 95;
/** The house runs about this far under the afternoon peak (shade, walls, the night's cool); an earth-sheltered room holds near the ground at 52 F. */
export const HOUSE_SHADE_F = 8;

// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Ice age
// ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The warning's cold is this share of the full anomaly by the hit (doc 2.1: minus 3 to 8 F of minus 30 to 40). */
export const COLD_WARN_SHARE = 0.15;
/** How much of the full cold a region sees: the ocean shutdown chills the north Atlantic side hardest and the south half as much (doc 2.1). */
export const OCEAN_SHUTDOWN_K: Record<RegionId, number> = {
  north_woods: 1, new_england: 1, upper_midwest: 1, rust_belt: 1, appalachia: 0.8, plains: 0.65, mountain_west: 0.65, pnw: 0.65, ozarks: 0.5, hill_country: 0.5, desert: 0.5,
};
/** The share of the full ice age this variant and region get. */
export const iceVariantK = (variant: string, region: RegionId): number => (variant === 'ocean_shutdown' ? OCEAN_SHUTDOWN_K[region] : 1);

/** 0..1 how far the cold has come (the doc's smoothstep over 3 game years, stretched by difficulty), with the warning's small start. */
export function iceProgress(s: Pick<GameState, 'disaster' | 'clock'>): number {
  const d = s.disaster;
  if (d.kind !== 'ice_age') return 0;
  const warn = COLD_WARN_SHARE * warnFrac(d, s.clock.t);
  return s.clock.t < d.hitAt ? warn : Math.max(warn, coldAnomaly(slowYears(s)));
}
/** The mean annual drop at the plateau (degrees F, negative): the middle of the region's July and January drops (climateCurve.ICE_AGE). */
export function iceMeanDropF(region: RegionId): number {
  return ((ICE_AGE[region].july3 - JULY_HIGH_Y0_F[region]) + (ICE_AGE[region].jan3 - JAN_LOW_Y0_F[region])) / 2;
}
/** The winter engine's severity for the ice age at this amplitude (k reaches its 1.2 cap in the northern tier at Standard). */
export const ICE_SEVERITY = 1.15;

/**
 * The ice age's winter state, on the shared winter engine (winter.ts) with a coldScale so the cold reaches the region's year-3 mean drop while
 * the grow, solar and food-stress shapes stay the engine's. The engine's own 14-month decay never applies: the clock is held on the plateau.
 * `coldF` is the anomaly (negative).
 */
export function iceWinter(s: S): WinterState {
  const d = s.disaster;
  if (d.kind !== 'ice_age') return winterAt(-1, 0, s.site.region);
  const { amp } = climateTune(d.difficulty), region = s.site.region;
  const c = iceProgress(s), vk = iceVariantK(d.variant, region);
  const sev = ICE_SEVERITY * amp * vk, k = Math.min(1.2, sev * REGION_WINTER[region]);
  const scale = k > 0 ? Math.abs(iceMeanDropF(region)) * amp * vk / (10 * k) : 0;
  // days 30 to 180 map the engine's curve 0 to 1 linearly: feed it the day that gives our progress
  return winterAt(30 + 150 * c, sev, region, scale);
}
/** Degrees F below normal now (0 or more). */
export const iceColdF = (s: S): number => (s.disaster.kind === 'ice_age' ? Math.max(0, -iceWinter(s).coldF) : 0);

/** Ground snow load now (pounds per square foot): the region's plateau by the cold curve, deeper in winter, a perennial pack by year three. */
export function iceGroundPsf(s: S, doy: number): number {
  const d = s.disaster;
  if (d.kind !== 'ice_age' || s.clock.t < d.hitAt) return 0;
  const { amp } = climateTune(d.difficulty), region = s.site.region;
  const base = snowLoadPsf(region, slowYears(s), amp * iceVariantK(d.variant, region));
  return base * (0.25 + 0.75 * winterness(doy));   // (the summer pack is not bare: a seasonal floor of a quarter)
}
/** A roof carries about this share of the ground load (an unheated roof, doc 2.2). */
export const ROOF_SNOW_SHARE = 0.7;
/** Inches of settled snow per pound per square foot (about 1.25 inches a psf), for shoveling hours. */
export const SNOW_IN_PER_PSF = 0.8;

/**
 * Battery capacity in the cold (doc 2.2: about half at 0 F): the share left at this cold anomaly. The anomaly stands in for the air, so it
 * needs no temperature call; a battery inside a warm room keeps more (not modeled here).
 */
export function coldBatteryK(coldF: number): number { return 1 - 0.5 * clamp(coldF / 30, 0, 1); }
/** Wood burned in the cold (doc 2.3: 2x at a 30 F anomaly): the multiplier on the stove's demand. */
export function coldWoodK(coldF: number): number { return 1 + clamp(coldF / 30, 0, 1); }
/** Diesel gels near 10 to 15 F unless it is treated (doc 2.2): the generator's output factor. A bottle of fuel stabilizer in the stock treats it. */
export function dieselGelK(lowF: number, treated: boolean): number {
  if (lowF > 12) return 1;
  const cold = clamp((12 - lowF) / 25, 0, 1);
  return treated ? 1 - 0.2 * cold : 1 - 0.6 * cold;
}

/** Wood burned for the stove: the cold's doubling in an ice age, the mild winters' saving in a heat disaster (multiplier on the stove's demand). */
export function slowWoodK(s: S): number {
  const d = s.disaster;
  if (d.kind === 'ice_age') return coldWoodK(iceColdF(s));
  if (d.kind === 'runaway_heat') return 1 - 0.5 * clamp(heatWinterDeltaF(s) / 20, 0, 1);
  return 1;
}
/** How much more water the body needs in a heat disaster's summer (multiplier on the drinking ration; 1 when none, up to 1.7). */
export function heatThirstK(s: S, doy: number): number {
  if (!slowActive(s, 'runaway_heat')) return 1;
  return 1 + clamp(heatDeltaF(s, doy) / 45, 0, 0.7) * clamp(summerness(doy) * 1.5, 0, 1);
}
/** The share of the sun that reaches the panels in an ice age (1 when none): the winter engine's solar. */
export const iceSolarK = (s: S): number => (slowActive(s, 'ice_age') ? iceWinter(s).solar : 1);

/** A normal afternoon high (degrees F) here on this day of the year (January's low plus 18 to July's high), plus the heat disaster's lift. */
export function dayPeakF(s: S, doy: number): number {
  const R = REGIONS[s.site.region], winter = R.janLowF + 18;
  return winter + (R.julyHighF - winter) * summerness(doy) + heatDeltaF(s, doy);
}
