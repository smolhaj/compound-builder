/**
 * Valley fog, low cloud and overcast (docs/DECISIONS.md "Misty mountains"). Pure, no state: every number is a function of
 * the game seed, the day of the year, the hour and the place, so the picture (the engine draws exactly this) and the
 * mechanics (watchers, cameras, raids, solar, the forecast) always agree, and nothing needs saving.
 *
 *  Day       `fogDay(seed, doy, region)`: whether this is a valley-fog morning, how deep the bank is, how low the cloud
 *            is and whether it drizzles. Fog runs in spells of two to four days (a stalled air mass), by region and
 *            season: the Pacific Northwest and Appalachia are fog country (fall mornings, wet spring), the Mountain West
 *            fogs in winter inversions only, the desert hardly ever. Cold-air pooling fills the valleys on still nights.
 *  Hour      `fogAt(day, hour, place)`: radiation fog forms after midnight, is deepest at dawn, and burns off from the
 *            bottom up through the morning (later under cloud, never in a winter inversion). Against the camp's height
 *            over the valley floor it gives the fog top, "N m below camp" (or the camp standing in it), the cloud base
 *            and what a person at the camp can see.
 *  Sight     a visibility range (Koschmieder: dense fog ≈ 40 m, mist a few hundred) and a factor per sensor: the naked
 *            eye, a visible-light camera and a night-vision tube lose most of it; a thermal camera or scope sees through
 *            fog mostly untouched. The factor scales how far a watch spots a crew (battle.ts), what cameras and
 *            floodlights add at the gate (gear.ts) and the watch's own score (encounters.ts postureOf). Small: dense fog
 *            takes about a third off the watch, and a crew coming up unseen has that much more time.
 *  Solar     overcast and the morning fog the panels sit in cut the day's output (cloud keeps about a third of the
 *            sun, thin overcast more); panels above the fog bank are in clear air the whole day.
 *  Forecast  `fogForecast`: the line the radio and the daily log give the evening before.
 */
import type { RegionId } from './regions';

/** What a person watches with: it changes how much fog costs them. */
export type FogSensor = 'eye' | 'camera' | 'nvg' | 'thermal';

/** One region's fog: the chance per day of a valley-fog morning, of an overcast day and of drizzle, by season (winter, spring, summer, fall). */
export interface FogClimate { valley: readonly [number, number, number, number]; overcast: readonly [number, number, number, number]; drizzle: readonly [number, number, number, number]; /** Cold-air inversions that hold the fog all day in winter. */ inversions: boolean }

export const REGION_FOG: Record<RegionId, FogClimate> = {
  pnw:           { valley: [0.30, 0.28, 0.14, 0.45], overcast: [0.65, 0.50, 0.20, 0.55], drizzle: [0.40, 0.30, 0.05, 0.30], inversions: false },
  appalachia:    { valley: [0.22, 0.32, 0.30, 0.50], overcast: [0.45, 0.35, 0.30, 0.30], drizzle: [0.25, 0.25, 0.20, 0.15], inversions: false },
  mountain_west: { valley: [0.20, 0.08, 0.04, 0.12], overcast: [0.30, 0.25, 0.12, 0.15], drizzle: [0.10, 0.10, 0.05, 0.04], inversions: true },
  north_woods:   { valley: [0.22, 0.18, 0.12, 0.30], overcast: [0.50, 0.35, 0.25, 0.40], drizzle: [0.10, 0.20, 0.15, 0.20], inversions: true },
  new_england:   { valley: [0.15, 0.20, 0.15, 0.30], overcast: [0.45, 0.40, 0.30, 0.35], drizzle: [0.15, 0.25, 0.15, 0.20], inversions: false },
  ozarks:        { valley: [0.15, 0.28, 0.20, 0.30], overcast: [0.35, 0.30, 0.20, 0.25], drizzle: [0.15, 0.20, 0.10, 0.10], inversions: false },
  hill_country:  { valley: [0.12, 0.15, 0.08, 0.12], overcast: [0.30, 0.20, 0.10, 0.15], drizzle: [0.10, 0.10, 0.04, 0.06], inversions: false },
  rust_belt:     { valley: [0.15, 0.15, 0.10, 0.20], overcast: [0.55, 0.40, 0.30, 0.40], drizzle: [0.20, 0.20, 0.10, 0.12], inversions: false },
  upper_midwest: { valley: [0.15, 0.15, 0.10, 0.20], overcast: [0.50, 0.35, 0.25, 0.35], drizzle: [0.15, 0.15, 0.10, 0.12], inversions: true },
  plains:        { valley: [0.10, 0.10, 0.05, 0.10], overcast: [0.30, 0.25, 0.15, 0.20], drizzle: [0.08, 0.10, 0.05, 0.05], inversions: false },
  desert:        { valley: [0.03, 0.02, 0.01, 0.02], overcast: [0.12, 0.06, 0.06, 0.06], drizzle: [0.04, 0.02, 0.02, 0.02], inversions: false },
};

/** Meteorological season of a day of the year: 0 winter (Dec–Feb), 1 spring, 2 summer, 3 fall. */
export function fogSeason(doy: number): 0 | 1 | 2 | 3 {
  if (doy >= 335 || doy <= 59) return 0;
  if (doy <= 151) return 1;
  if (doy <= 243) return 2;
  return 3;
}

/** The place's own shape: the camp's height over the valley floor (the lowest ground the land shows: the lot's, or the water and lowland round it) and under the ridges (m), and whether it is mountain country at all. */
export interface FogPlace {
  /** Meters the camp stands above the lowest ground of the land. */
  campAboveFloorM: number;
  /** Meters the ridges round the camp stand above it. */
  ridgeAboveCampM: number;
  /** Mountain country: the valleys hold fog banks. Flat country fogs in a ground layer instead. */
  mountain: boolean;
}

/** The depth a bank of share 1 has here, m over the valley floor: mountain valleys hold 110 m of it, flat country only a ground layer (40 m). A camp up the slope is above most banks; one in the bottom is in all of them. */
export const hollowM = (place: FogPlace): number => (place.mountain ? 110 : 40);

/** A place with no lot data: flat country a few meters above the low ground, so a ground layer of fog still shows. */
export const DEFAULT_PLACE: FogPlace = { campAboveFloorM: 12, ridgeAboveCampM: 60, mountain: false };

/** What a day does (the same all day; `fogAt` turns it into hours). */
export interface FogDay {
  doy: number;
  /** 0–1: how hard valley fog forms this dawn (0 = none). */
  valley: number;
  /** How deep the bank gets at its deepest, as a share of the place's full bank (`hollowM`): 0.2 a skim in the bottom, 1 the deepest, over 1 a winter inversion. */
  depth: number;
  /** 0–1: cloud cover that sits low (0 clear). */
  overcast: number;
  /** 0–1: drizzle and mist in the air (0 none). */
  drizzle: number;
  /** A winter inversion: the bank does not burn off, it lifts to a low ceiling. */
  inversion: boolean;
  /** Hour of day the bank is gone (24 = not today). */
  burnOffH: number;
}

/** The hours of a day, as the fog sees them. */
export interface FogNow {
  /** The day this came from. */
  day: FogDay;
  hour: number;
  /** 0–1: how thick the fog is, in the bank and at the camp if it is inside. */
  density: number;
  /** Fog top over the valley floor, m (0 = no bank). */
  bankM: number;
  /** Meters the fog top is BELOW the camp (negative: the camp stands that deep in the fog). */
  belowCampM: number;
  inFog: boolean;
  /** Cloud base over the camp, m (a high number = no low cloud), and 0–1 how much low cloud there is. */
  cloudBaseM: number;
  lowCloud: number;
  overcast: number;
  drizzle: number;
  /** What a person at the camp sees with the naked eye, m. */
  sightM: number;
}

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Deterministic hash → [0, 1). */
export function fogHash(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** A spell draw: the same value for a run of two to four days, with a day-by-day mix so spells start and end ragged. */
function spellDraw(seed: number, doy: number, salt: number): number {
  const len = 2 + Math.floor(fogHash(seed + salt, 77) * 3);
  const block = Math.floor((doy + Math.floor(fogHash(seed, salt) * 4)) / len);
  return fogHash(seed * 31 + salt, fogHash(seed, doy + salt * 7) < 0.7 ? block : doy + 1000);
}

/** The day's fog and cloud. `storm`: a storm is on (overcast and drizzling whatever the roll says). */
export function fogDay(seed: number, doy: number, region: RegionId, opts: { storm?: boolean } = {}): FogDay {
  const C = REGION_FOG[region] ?? REGION_FOG.hill_country, si = fogSeason(doy);
  const rv = spellDraw(seed, doy, 1), pv = C.valley[si];
  let valley = rv < pv ? 0.3 + 0.7 * (1 - rv / pv) : 0;
  const ro = spellDraw(seed, doy, 2), po = C.overcast[si];
  let overcast = ro < po ? 0.55 + 0.45 * (1 - ro / po) : ro < po * 1.6 ? 0.25 : 0;
  const rd = spellDraw(seed, doy, 3), pd = C.drizzle[si];
  let drizzle = overcast >= 0.55 && rd < pd / Math.max(0.05, po) ? 0.3 + 0.7 * (1 - rd * po / Math.max(0.01, pd)) : 0;
  if (opts.storm) { overcast = 1; drizzle = Math.max(drizzle, 0.8); valley *= 0.5; }
  // a drizzling day pulls its own mist down into the valleys
  if (drizzle > 0.3) valley = Math.max(valley, 0.25 + 0.4 * drizzle);
  const inversion = C.inversions && si === 0 && valley > 0.45 && fogHash(seed + 9, doy >> 1) < 0.6;
  const depth = valley > 0 ? Math.round(100 * (0.18 + 0.82 * Math.pow(valley, 1.3) * (0.75 + 0.25 * fogHash(seed + 4, doy))) * (inversion ? 1.5 : 1)) / 100 : 0;
  const burnOffH = inversion ? 24 : valley > 0 ? clamp(9.2 + 1.6 * valley + 2.6 * overcast + (si === 0 ? 1.2 : si === 2 ? -0.8 : 0), 9, 16) : 0;
  return { doy, valley, depth, overcast, drizzle, inversion, burnOffH };
}

/**
 * How full the bank is at an hour, 0–1: forming after midnight, deepest 5–8, burning off from the bottom up (the top drops,
 * the base lifts) until `burnOffH`; a winter inversion only thins to a low ceiling. Re-forms (a little) in the evening.
 */
export function bankCurve(hour: number, day: FogDay): number {
  if (day.valley <= 0) return 0;
  const h = ((hour % 24) + 24) % 24;
  const lift = day.inversion ? 0.55 : 0;
  // 0–5: building (from the evening's 0.3), 5–8: deepest, 8–burnOff: lifting
  if (h < 5) return 0.35 + 0.65 * smooth(0, 5, h);
  if (h < 8) return 1;
  if (h < day.burnOffH) { const t = smooth(8, Math.max(8.5, day.burnOffH), h); return lift + (1 - lift) * (1 - t); }
  if (day.inversion) return lift;
  // after the burn-off: nothing till dusk, then the cold air starts to pool again
  return h >= 18.5 ? 0.35 * smooth(18.5, 24, h) : 0;
}

/**
 * The fog at a calendar day and hour. The game's day turns at 06:00, so the hours before it belong to the dawn that is coming:
 * the evening and the small hours build the NEXT day's bank (a winter inversion stays up through its own evening).
 */
export function fogOn(seed: number, doy: number, hour: number, region: RegionId, place: FogPlace = DEFAULT_PLACE, opts: { storm?: boolean } = {}): FogNow {
  const h = ((hour % 24) + 24) % 24, today = fogDay(seed, doy, region, opts);
  const evening = h >= 18.5 || h < 6;
  const day = !evening ? today : today.inversion && h >= 18.5 ? today : fogDay(seed, doy + 1, region, {});
  return fogAt(day, h, place);
}

/** What a person sees through fog of a density: Koschmieder-style, 40 m in the densest, ≈ 270 m at half, a few km when thin. */
export function fogVisibilityM(density: number): number {
  const d = clamp(density, 0, 1);
  return 40 + 4960 * (1 - d) ** 4;   // 5 km clear, falling steeply: 0.25 → ≈ 1.6 km, 0.5 → ≈ 350 m, 0.75 → ≈ 60 m
}

/** The fog at an hour, against the place. */
export function fogAt(day: FogDay, hour: number, place: FogPlace = DEFAULT_PLACE): FogNow {
  const b = bankCurve(hour, day);
  const bankM = day.valley > 0 ? Math.round(day.depth * b * hollowM(place)) : 0;
  const density = clamp(day.valley * Math.pow(b, 0.7), 0, 1);
  const belowCampM = place.campAboveFloorM - bankM;
  const inFog = bankM > 0 && belowCampM < 0 && density > 0.04;
  // cloud: overcast and drizzle pull the base down toward the ridges; a clear sky has none
  const lowness = clamp(day.overcast * 0.75 + day.drizzle * 0.45, 0, 1);
  const lowCloud = clamp(day.overcast * (0.45 + 0.55 * day.drizzle) + 0.15 * day.valley * b, 0, 1);
  const cloudBaseM = Math.round(1400 - 1330 * lowness * lowness - (day.drizzle > 0 ? 70 * day.drizzle : 0));
  const inCloud = cloudBaseM < 0 ? 1 : 0;
  // what the naked eye sees at the camp
  const haze = 5000 * (1 - 0.65 * day.drizzle) * (1 - 0.15 * day.overcast);
  const fogV = inFog ? fogVisibilityM(clamp(density * (0.7 + 0.3 * smooth(0, 40, -belowCampM)), 0, 1)) : 5000;
  const cloudV = cloudBaseM < place.ridgeAboveCampM * 0.3 ? 120 + 300 * smooth(0, 80, cloudBaseM) : 5000;
  const sightM = Math.round(Math.max(30, Math.min(haze, fogV, cloudV * (inCloud ? 0.6 : 1))));
  return { day, hour, density, bankM, belowCampM, inFog, cloudBaseM, lowCloud, overcast: day.overcast, drizzle: day.drizzle, sightM };
}

/** How far a sensor sees through the day's fog, m. Thermal mostly ignores fog (it loses a little in the densest). */
export function sensorSightM(now: FogNow, sensor: FogSensor): number {
  const eye = now.sightM;
  switch (sensor) {
    case 'thermal': return Math.min(5000, Math.round(eye * 8 + 200));
    case 'nvg': return Math.round(eye * 0.85);
    case 'camera': return Math.round(eye * 0.9);
    default: return eye;
  }
}

/** The range a defense is judged at (m): fog that leaves this much sight costs nothing. */
export const SIGHT_REF_M = 400;

/** 0.1–1: the share of its usual reach a sensor keeps in this fog (1 in clear air or mist; ≈ 0.1 for the eye in the densest fog). */
export function fogSightFactor(now: FogNow, sensor: FogSensor): number {
  return clamp(sensorSightM(now, sensor) / SIGHT_REF_M, 0.1, 1);
}

/**
 * How much of the day's sun the panels get, 0–1 (the average over the day). Overcast keeps about a third of the sun
 * (thin cloud more); a panel standing in the morning bank loses the hours till it burns off. A panel above the bank
 * (the camp stands over the fog) loses only to the cloud.
 */
export function solarFogFactor(day: FogDay, place: FogPlace = DEFAULT_PLACE): number {
  const cloud = 1 - 0.68 * day.overcast - 0.07 * day.drizzle;
  let fogLoss = 0;
  if (day.valley > 0) {
    // the hours the bank is thick (5 to burn-off), against ≈ 11 hours of useful sun; only if the camp stands in it at its deepest
    const inIt = place.campAboveFloorM < day.depth * hollowM(place);
    if (inIt) fogLoss = clamp((Math.min(day.burnOffH, 16) - 7) / 11, 0, 0.6) * day.valley * 0.55;
  }
  return clamp(cloud * (1 - fogLoss), 0.18, 1);
}

/** The readout line for the terrain overlay / sightlines: "Fog down to 38 m below camp, sight range 5 km". */
export function fogReadout(now: FogNow): string {
  const range = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 4950 ? 0 : 1)} km` : `${Math.round(m / 10) * 10} m`);
  if (now.bankM > 0 && now.density > 0.04) {
    const lead = now.inFog
      ? `Camp in fog, ${Math.round(-now.belowCampM)} m under its top`
      : `Fog down to ${Math.round(now.belowCampM)} m below camp`;
    return `${lead}, sight range ${range(now.sightM)} (thermal ${range(sensorSightM(now, 'thermal'))})`;
  }
  if (now.cloudBaseM < 400) return `Cloud ${Math.max(0, Math.round(now.cloudBaseM / 10) * 10)} m over the camp, sight range ${range(now.sightM)}`;
  if (now.sightM < 4500) return `Hazy, sight range ${range(now.sightM)}`;
  return '';
}

/** The evening-before forecast line, or null for a clear night. */
export function fogForecast(seed: number, doy: number, region: RegionId, place: FogPlace = DEFAULT_PLACE, opts: { storm?: boolean } = {}): string | null {
  const d = fogDay(seed, doy + 1, region, opts);
  if (d.valley < 0.4 && d.drizzle < 0.5 && d.overcast < 0.7) return null;
  const dawn = fogAt(d, 6.5, place), lift = Math.round(Math.min(d.burnOffH, 23));
  if (d.valley >= 0.4) {
    const where = dawn.inFog ? `the camp will be in it (sight ${Math.round(dawn.sightM / 10) * 10} m at first light)` : `down to ${Math.max(0, Math.round(dawn.belowCampM))} m below the camp`;
    return d.inversion
      ? `Forecast: a winter inversion sets in tonight. Valley fog ${where}; it will not burn off tomorrow.`
      : `Forecast: valley fog by dawn, ${where}; it should lift about ${lift}:00.`;
  }
  return d.drizzle >= 0.5 ? 'Forecast: low cloud and drizzle tomorrow; the ridges will be in cloud.' : 'Forecast: a gray, overcast day tomorrow; solar will be poor.';
}

/**
 * The fog a forced Settings → Weather mode shows (QA and the player's own look): a fixed day, at its dawn. Null = no fog and no
 * low cloud ('clear', 'partly', 'off'). 'auto' is the sim's own (`fogOn`).
 */
export function fogForMode(mode: string, place: FogPlace = DEFAULT_PLACE): FogNow | null {
  const base: FogDay = { doy: 0, valley: 0, depth: 0, overcast: 0, drizzle: 0, inversion: false, burnOffH: 24 };
  const day: FogDay | null = mode === 'fog' ? { ...base, valley: 0.85, depth: 0.45, overcast: 0.5, burnOffH: 24 }
    : mode === 'overcast' ? { ...base, valley: 0.3, depth: 0.3, overcast: 0.85, drizzle: 0.15, burnOffH: 24 }
    : mode === 'rain' || mode === 'storm' ? { ...base, valley: 0.45, depth: 0.4, overcast: 1, drizzle: 0.7, burnOffH: 24 }
    : mode === 'snow' ? { ...base, valley: 0.3, depth: 0.3, overcast: 0.85, burnOffH: 24 }
    : null;
  return day ? fogAt(day, 6.5, place) : null;
}
