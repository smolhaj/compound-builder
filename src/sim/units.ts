/**
 * U.S. customary units for everything the player reads (pure, tested). The simulation keeps SI internally (meters,
 * liters, kilograms, kcal, degrees C); convert here, at the formatting layer, and never store a converted value.
 * Energy stays kWh and power stays kW (U.S. standard); food energy is shown as Calories (the label unit).
 */
import { pluralize } from './words';

export const FT_PER_M = 3.280839895;
export const IN_PER_M = 39.37007874;
export const FT_PER_MILE = 5280;
export const M_PER_MILE = 1609.344;
export const GAL_PER_L = 0.264172052;
export const LB_PER_KG = 2.204622622;
export const OZ_PER_G = 0.035273962;
export const SQFT_PER_M2 = 10.76391042;
export const SQFT_PER_ACRE = 43560;
export const ACRE_PER_HA = 2.471053815;
export const CUFT_PER_M3 = 35.3146667;
export const CUYD_PER_M3 = 1.307950619;
export const MPH_PER_MS = 2.236936292;
export const IN_PER_MM = 0.0393700787;
export const PSI_PER_KPA = 0.145037738;
export const GPM_PER_LPM = GAL_PER_L;

/** A number for reading: one decimal under 10 (a trailing ".0" dropped), whole above, thousands separators. */
export function num(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a < 10) { const r = Math.round(n * 10) / 10; return Object.is(r, -0) ? '0' : String(r); }
  return Math.round(n).toLocaleString('en-US');
}

/** Three significant figures for a big round-ish quantity ("2,640", "106,000"). */
export function sig3(n: number): string {
  const a = Math.abs(n);
  if (a < 100) return num(n);
  const p = 10 ** (Math.floor(Math.log10(a)) - 2);
  return (Math.round(n / p) * p).toLocaleString('en-US');
}

/* ---------- length ---------- */
export const toFeet = (m: number): number => m * FT_PER_M;
export const toMiles = (km: number): number => km * 1000 / M_PER_MILE;

/** "6 in", "7.9 ft", "230 ft", "1,320 ft", "1.4 mi": a length given in meters. */
export function lengthText(m: number): string {
  const ft = Math.abs(m) * FT_PER_M;
  const sign = m < 0 ? '-' : '';
  if (ft < 2) return `${sign}${Math.round(Math.abs(m) * IN_PER_M)} in`;
  if (ft >= FT_PER_MILE) return `${sign}${num(Math.abs(m) / M_PER_MILE)} mi`;
  return `${sign}${num(ft)} ft`;
}
/** Always feet ("2,716 ft"), for a wall or a road where the total matters in feet. */
export const feetText = (m: number): string => `${num(toFeet(m))} ft`;
/** Always inches ("6 in"). */
export const inchesText = (m: number): string => `${num(m * IN_PER_M)} in`;
/** A distance given in kilometers: feet below a quarter mile, miles above. */
export function kmText(km: number): string {
  const mi = toMiles(km);
  return mi < 0.25 ? `${num(km * 1000 * FT_PER_M)} ft` : `${num(mi)} mi`;
}
/** "A × B ft" for a footprint given in meters; trade sizes land on whole feet. */
export function footprintText(wM: number, dM: number): string {
  return `${Math.round(toFeet(wM))} × ${Math.round(toFeet(dM))} ft`;
}

/* ---------- area and volume ---------- */
export const sqftText = (m2: number): string => `${num(m2 * SQFT_PER_M2)} sq ft`;
export function acresText(acres: number): string {
  return pluralize(num(acres), 'acre');
}
/** A ground area given in m²: square feet below a tenth of an acre, acres above. */
export function areaText(m2: number): string {
  const ft2 = m2 * SQFT_PER_M2;
  return ft2 < 4356 ? `${num(ft2)} sq ft` : acresText(ft2 / SQFT_PER_ACRE);
}
export const cuYdText = (m3: number): string => `${num(m3 * CUYD_PER_M3)} cu yd`;
export const cuFtText = (m3: number): string => `${num(m3 * CUFT_PER_M3)} cu ft`;

/** "5.3 gal", "264 gal", "2,640 gal": liters in, U.S. gallons out. */
export function gallonsText(l: number): string {
  const g = l * GAL_PER_L;
  if (!(g > 0.04)) return '0 gal';
  return `${g >= 100 ? sig3(g) : num(g)} gal`;
}
/** Just the number of gallons, same rounding. */
export const gallons = (l: number): string => (l * GAL_PER_L >= 100 ? sig3(l * GAL_PER_L) : num(l * GAL_PER_L));
export const gpmText = (lpm: number): string => `${num(lpm * GPM_PER_LPM)} gpm`;

/* ---------- mass ---------- */
export const TON_LB = 2000;
/** "6 oz", "12 lb", "1,350 lb", "2.2 tons": kilograms in. */
export function poundsText(kg: number): string {
  const lb = kg * LB_PER_KG;
  if (lb < 1) return `${Math.round(lb * 16)} oz`;
  if (lb >= TON_LB * 2) return `${num(lb / TON_LB)} tons`;
  return `${lb >= 100 ? sig3(lb) : num(lb)} lb`;
}
/** Grams (a fish, a handful of seed): ounces under a pound, pounds above. */
export function gramsText(g: number): string {
  const oz = g * OZ_PER_G;
  return oz < 15.5 ? `${num(oz)} oz` : `${num(oz / 16)} lb`;
}
/** Metric tons. */
export const tonnesText = (t: number): string => poundsText(t * 1000);

/* ---------- temperature, speed, weather ---------- */
export const toF = (c: number): number => c * 9 / 5 + 32;
export const tempText = (c: number): string => `${Math.round(toF(c))}°F`;
/** A temperature difference (not a reading): 5 °C of swing is 9 °F. */
export const tempDeltaText = (c: number): string => `${Math.round(c * 9 / 5)}°F`;
export const mphText = (ms: number): string => `${num(ms * MPH_PER_MS)} mph`;
export const kphToMph = (kph: number): number => kph * 0.621371192;
/** Rain or snow: millimeters in, inches out ("43 in"). */
export const rainText = (mm: number): string => `${num(mm * IN_PER_MM)} in`;
export const psiText = (kpa: number): string => `${num(kpa * PSI_PER_KPA)} psi`;

/* ---------- food energy ---------- */
/** "2,000 Calories", "82k Calories": food energy in kcal, in the unit on a U.S. label. */
export function caloriesText(kcal: number): string {
  return `${Math.round(kcal).toLocaleString('en-US')} Calories`;
}
/** "82k Calories" for big pantry totals. */
export function caloriesShort(kcal: number): string {
  return Math.abs(kcal) >= 10_000 ? `${Math.round(kcal / 1000).toLocaleString('en-US')}k Calories` : caloriesText(kcal);
}

/* ---------- money per length ---------- */
/** A cost quoted per 100 m in the sim, as dollars per 100 ft. */
export const perHundredFeet = (usdPer100m: number): number => usdPer100m / FT_PER_M;

/* ---------- radiation ---------- */
/** rem per sievert (1 Sv = 100 rem; 1 mSv = 100 mrem). The sim keeps sieverts; only the formatters convert. */
export const REM_PER_SV = 100;
/** Becquerels per curie (1 Ci = 3.7 × 10¹⁰ Bq). */
export const BQ_PER_CI = 3.7e10;
/** A dose given in sieverts, in rem (U.S. civil-defense units): millirem below 1 rem. "12 rem", "340 mrem", "2.5 rem". */
export function remText(sv: number): string {
  const rem = Math.max(0, sv) * REM_PER_SV;
  if (rem < 1) return `${Math.round(rem * 1000).toLocaleString('en-US')} mrem`;
  return `${rem < 10 ? (Math.round(rem * 10) / 10).toFixed(1).replace(/\.0$/, '') : Math.round(rem).toLocaleString('en-US')} rem`;
}
/** A dose rate given in sieverts an hour: "rem/h" (millirem/h below 1 rem/h). */
export const remRateText = (svPerHour: number): string => `${remText(svPerHour)}/h`;
/** An activity given in becquerels, in curies (mCi / µCi below a curie). */
export function curieText(bq: number): string {
  const ci = bq / BQ_PER_CI;
  if (ci >= 1) return `${num(ci)} Ci`;
  if (ci >= 1e-3) return `${num(ci * 1e3)} mCi`;
  return `${num(ci * 1e6)} µCi`;
}
