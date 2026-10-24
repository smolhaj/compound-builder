/**
 * weatherState — pure, deterministic weather state machine (no three.js).
 *
 * Drives the visual-only weather layer (WeatherRenderer + CampusScene sky /
 * fog / light hooks). Nothing here touches game state or the save file.
 *
 * Model
 *   • A seeded Markov chain picks the next weather "spell" (clear / cloudy /
 *     rain / storm / snow) from season-dependent weights; each spell lasts a
 *     seeded duration in visual seconds (one visual day ≈ 120 s at 1×).
 *   • Morning fog is separate: each visual day rolls (seeded) whether it
 *     dawns foggy; the fog peaks around 6:30 and burns off by ~10:00.
 *   • Smoothed outputs (cloud, rain, snow, fog) ease toward the spell's
 *     targets so changes fade in/out instead of popping.
 *   • Ground state integrates over time: wetness rises while it rains and
 *     dries afterwards; snow cover accumulates while it snows and melts
 *     (slowly in winter, quickly otherwise).
 *
 * A forced mode (Settings → Weather) pins the targets; 'off' zeroes
 * everything immediately.
 */

/** Settings weather: 'auto' runs the sim; the rest force a look ('off' = Low tier). */
export type WeatherMode = 'auto' | 'off' | 'clear' | 'partly' | 'overcast' | 'rain' | 'storm' | 'snow' | 'fog';
export type WeatherKind = 'clear' | 'partly' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow';
export type WeatherSeason = 'fall' | 'winter' | 'spring' | 'summer';

export const WEATHER_MODES: readonly WeatherMode[] = ['auto', 'off', 'clear', 'partly', 'overcast', 'rain', 'storm', 'snow', 'fog'];

/** Every weather state, in the order a sky usually moves through them. */
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'partly', 'overcast', 'rain', 'storm', 'fog', 'snow'];

/** Player-facing name of a weather state (Settings readout, QA). */
export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: 'Clear', partly: 'Partly cloudy', overcast: 'Overcast', rain: 'Rain',
  storm: 'Thunderstorm', fog: 'Fog', snow: 'Snow',
};

/** What the sky is doing right now (written by WeatherRenderer; Settings readout). */
export const WEATHER_NOW: { kind: WeatherKind; mode: WeatherMode } = { kind: 'clear', mode: 'auto' };

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/**
 * Meteorological season for a day of the year: December, January and
 * February are winter.
 */
export function weatherSeasonFor(doy: number): WeatherSeason {
  let m = 12;
  while (m > 1 && doy <= MONTH_START[m - 1]) m--;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'fall';
}

/** Runtime check (prefs / untyped callers). */
export function isWeatherMode(v: unknown): v is WeatherMode {
  return typeof v === 'string' && (WEATHER_MODES as readonly string[]).includes(v);
}

/** Smoothed, renderer-facing weather outputs. All 0–1. */
export interface WeatherOutputs {
  /** Overcast amount: flat stratus deck, dimmer sun, softer shadows. */
  cloud: number;
  /** Broken fair-weather / towering cumulus (puffy low layer). */
  cumulus: number;
  /** High cirrus wisps. */
  cirrus: number;
  /** Falling rain intensity. */
  rain: number;
  /** Falling snow intensity. */
  snow: number;
  /** Ground fog / haze. */
  fog: number;
  /** Thunderstorm overhead: dark deck, gusts, lightning near by. */
  storm: number;
  /** A storm cell on the horizon (an approaching front, a Midwest supercell). */
  distantStorm: number;
  /** Wind / gustiness (rain slant, snow squalls, flags). */
  wind: number;
  /** Background haze of the air mass (humid Gulf summer high, crisp New England fall low). */
  haze: number;
  /** Surface wetness (darkened albedo, glossy roads, puddles). */
  wetness: number;
  /** Lying snow on upward-facing surfaces. */
  snowCover: number;
}

interface KindTarget {
  cloud: number; cumulus: number; cirrus: number; rain: number; snow: number;
  fog: number; storm: number; wind: number;
}

/** Spell targets for each weather kind. */
export const KIND_TARGETS: Record<WeatherKind, KindTarget> = {
  clear:    { cloud: 0.0,  cumulus: 0.12, cirrus: 0.25, rain: 0,   snow: 0,   fog: 0,    storm: 0, wind: 0.2 },
  partly:   { cloud: 0.1,  cumulus: 0.55, cirrus: 0.3,  rain: 0,   snow: 0,   fog: 0,    storm: 0, wind: 0.35 },
  overcast: { cloud: 0.82, cumulus: 0.2,  cirrus: 0,    rain: 0,   snow: 0,   fog: 0.12, storm: 0, wind: 0.3 },
  rain:     { cloud: 0.88, cumulus: 0.15, cirrus: 0,    rain: 0.6, snow: 0,   fog: 0.3,  storm: 0, wind: 0.45 },
  storm:    { cloud: 1.0,  cumulus: 0.3,  cirrus: 0,    rain: 1.0, snow: 0,   fog: 0.4,  storm: 1, wind: 1 },
  fog:      { cloud: 0.45, cumulus: 0,    cirrus: 0,    rain: 0,   snow: 0,   fog: 1,    storm: 0, wind: 0.05 },
  snow:     { cloud: 0.82, cumulus: 0.1,  cirrus: 0,    rain: 0,   snow: 0.8, fog: 0.35, storm: 0, wind: 0.45 },
};

/** Relative chance of each next spell, per season. */
export const SEASON_WEIGHTS: Record<WeatherSeason, Record<WeatherKind, number>> = {
  spring: { clear: 2.5, partly: 2.5, overcast: 2,   rain: 3,   storm: 0.8, fog: 0.4, snow: 0 },
  summer: { clear: 4.5, partly: 3.5, overcast: 1,   rain: 1,   storm: 1,   fog: 0.2, snow: 0 },
  fall:   { clear: 2.5, partly: 2.5, overcast: 2,   rain: 2.5, storm: 0.6, fog: 0.6, snow: 0 },
  winter: { clear: 2,   partly: 1.5, overcast: 2.5, rain: 0.7, storm: 0,   fog: 0.5, snow: 3.5 },
};

/**
 * Regional multipliers on SEASON_WEIGHTS (NOAA climate normals, in spirit):
 * Seattle / Portland are dry in summer and gray-wet all winter (drizzle, fog
 * banks on the sound); coastal Southern California sees rain on a few winter
 * days and June-gloom cloud; the Gulf South and the Midwest get summer
 * thunderstorms (and spring severe weather); the Mountain West has its
 * July–August monsoon afternoon storms and otherwise sunny skies; New England
 * falls are crisp and bright. New England is the baseline.
 */
export const REGION_WEATHER: Record<string, Partial<Record<WeatherSeason, Partial<Record<WeatherKind, number>>>>> = {
  pacific_northwest: {
    spring: { rain: 1.6, overcast: 1.6, clear: 0.6, partly: 0.9 },
    summer: { clear: 1.6, rain: 0.25, storm: 0.1, fog: 1.5 },
    fall:   { rain: 1.8, overcast: 1.5, storm: 0.4, fog: 2.2, clear: 0.6 },
    winter: { rain: 7, overcast: 2, clear: 0.4, partly: 0.6, storm: 0.3, snow: 0.3, fog: 2 },
  },
  southern_california: {
    spring: { rain: 0.3, storm: 0.1, clear: 1.6, overcast: 0.6, fog: 0.5 },
    summer: { rain: 0.05, storm: 0.05, overcast: 0.8, clear: 1.3, fog: 0.5 },
    fall:   { rain: 0.2, storm: 0.1, clear: 1.7, overcast: 0.6 },
    winter: { rain: 0.8, storm: 0.2, clear: 1.3, snow: 0 },
  },
  deep_south: {
    spring: { storm: 1.6, rain: 1.2 },
    summer: { storm: 3, rain: 1.8, clear: 0.6, partly: 1.4, fog: 0.5 },
    fall:   { rain: 0.8, clear: 1.2 },
    winter: { rain: 2.5, overcast: 1.3, fog: 1.6 },
  },
  midwest_plains: {
    spring: { storm: 1.8, rain: 1.1, partly: 1.3 },
    summer: { storm: 2, rain: 1.2, partly: 1.6, clear: 0.8 },
    fall:   { clear: 1.2, partly: 1.2 },
  },
  mountain_west: {
    spring: { rain: 0.7, clear: 1.3, fog: 0.3 },
    summer: { storm: 1.6, rain: 0.6, clear: 1.4, partly: 1.3, fog: 0.1 },
    fall:   { rain: 0.5, clear: 1.6, fog: 0.3 },
    winter: { rain: 0.4, snow: 1.3, clear: 1.3, fog: 0.3 },
  },
  new_england: {
    fall:   { clear: 1.4, partly: 1.2, overcast: 0.8 },
  },
};

/**
 * Regional character of the sky, independent of the spell: how big the
 * cumulus build (Midwest "big sky" towers, thin SoCal puffs), how heavy the
 * rain falls (PNW drizzle), and the season's background haze (humid Gulf
 * summers, crisp New England and Rocky Mountain air).
 */
export interface RegionSky {
  cumulus: number;
  rain: number;
  haze: Record<WeatherSeason, number>;
  /** Chance a fair visual day grows a thunderstorm cell on the horizon by late afternoon. */
  supercell: Partial<Record<WeatherSeason, number>>;
  /** Chance a summer / spring morning dawns under a marine layer that burns off by noon. */
  marine?: Partial<Record<WeatherSeason, number>>;
}

const BASE_HAZE: Record<WeatherSeason, number> = { spring: 0.45, summer: 0.55, fall: 0.35, winter: 0.4 };

export const REGION_SKY: Record<string, RegionSky> = {
  new_england:         { cumulus: 1.0,  rain: 1.0,  haze: { spring: 0.4, summer: 0.5, fall: 0.12, winter: 0.25 }, supercell: { summer: 0.12 } },
  pacific_northwest:   { cumulus: 0.8,  rain: 0.55, haze: { spring: 0.45, summer: 0.4, fall: 0.5, winter: 0.55 }, supercell: {} },
  southern_california: { cumulus: 0.45, rain: 0.9,  haze: { spring: 0.45, summer: 0.5, fall: 0.4, winter: 0.3 }, supercell: {}, marine: { spring: 0.45, summer: 0.6 } },
  deep_south:          { cumulus: 1.15, rain: 1.15, haze: { spring: 0.55, summer: 0.8, fall: 0.5, winter: 0.45 }, supercell: { spring: 0.3, summer: 0.5 } },
  midwest_plains:      { cumulus: 1.3,  rain: 1.05, haze: { spring: 0.35, summer: 0.45, fall: 0.25, winter: 0.3 }, supercell: { spring: 0.4, summer: 0.5, fall: 0.1 } },
  mountain_west:       { cumulus: 1.1,  rain: 0.8,  haze: { spring: 0.15, summer: 0.2, fall: 0.1, winter: 0.12 }, supercell: { summer: 0.4 } },
};

/** Region sky character (unknown region → New England-like baseline with the base haze). */
export function regionSky(region: string): RegionSky {
  return REGION_SKY[region] ?? { cumulus: 1, rain: 1, haze: BASE_HAZE, supercell: { summer: 0.15 } };
}

/**
 * Distant thunderstorm build-up over a fair afternoon (0–1): towers grow from
 * early afternoon, stand on the horizon through dusk (lightning flickers in
 * them after dark) and collapse by midnight.
 */
export function supercellCurve(hour: number): number {
  if (hour < 13 || hour >= 24) return 0;
  if (hour < 16.5) { const t = (hour - 13) / 3.5; return t * t * (3 - 2 * t); }
  if (hour < 21) return 1;
  const t = (hour - 21) / 3;
  return 1 - t * t * (3 - 2 * t);
}

/** Marine layer (June gloom): overcast at dawn, burnt off by early afternoon. */
export function marineLayerCurve(hour: number): number {
  if (hour < 3 || hour > 13.5) return 0;
  if (hour < 5) return (hour - 3) / 2;
  if (hour < 10) return 1;
  const t = (hour - 10) / 3.5;
  return 1 - t * t * (3 - 2 * t);
}

/** Spell duration range [min, max] in visual seconds. */
export const KIND_DURATION: Record<WeatherKind, readonly [number, number]> = {
  clear:    [120, 300],
  partly:   [90, 240],
  overcast: [60, 160],
  rain:     [45, 120],
  storm:    [45, 90],
  fog:      [50, 120],
  snow:     [70, 180],
};

/** Share of a storm spell spent with the front approaching (anvil on the horizon, distant thunder) before the rain. */
export const STORM_APPROACH = 0.3;

/** Chance that a visual day dawns foggy, per season. */
export const MORNING_FOG_CHANCE: Record<WeatherSeason, number> = {
  spring: 0.4, summer: 0.15, fall: 0.5, winter: 0.35,
};

/** Seconds of visual time per in-game visual day (matches CampusCanvas). */
export const VISUAL_DAY_SECONDS = 120;

/** Deterministic hash → [0, 1). */
export function hash01(a: number, b = 0): number {
  let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Morning fog strength for an hour of day (0–24), given a 0–1 foggy-day factor. */
export function morningFogCurve(hour: number): number {
  // Builds from 4:00, peaks 5:30–7:30, burns off by 10:30.
  if (hour < 4 || hour > 10.5) return 0;
  if (hour < 5.5) return (hour - 4) / 1.5;
  if (hour < 7.5) return 1;
  const t = (hour - 7.5) / 3;
  return 1 - t * t * (3 - 2 * t);
}

function normSeason(s: string): WeatherSeason {
  return s === 'winter' || s === 'spring' || s === 'summer' ? s : 'fall';
}

/** Weighted pick from SEASON_WEIGHTS with r ∈ [0, 1). Never repeats `prev` twice running for clear. */
export function pickNextKind(season: string, r: number, prev: WeatherKind | null = null, region?: string): WeatherKind {
  const ns = normSeason(season);
  const base = SEASON_WEIGHTS[ns];
  const mul = (region && REGION_WEATHER[region]?.[ns]) || {};
  const w = Object.fromEntries((Object.keys(base) as WeatherKind[]).map(k => [k, base[k] * (mul[k] ?? 1)])) as Record<WeatherKind, number>;
  const kinds = Object.keys(w) as WeatherKind[];
  // Discourage back-to-back identical precipitation spells
  const weight = (k: WeatherKind) => (k === prev && k !== 'clear' ? w[k] * 0.35 : w[k]);
  let total = 0;
  for (const k of kinds) total += weight(k);
  let acc = r * total;
  for (const k of kinds) {
    acc -= weight(k);
    if (acc < 0) return k;
  }
  return 'clear';
}

const approach = (cur: number, target: number, dt: number, tau: number): number =>
  cur + (target - cur) * (1 - Math.exp(-dt / tau));

const ZERO: WeatherOutputs = {
  cloud: 0, cumulus: 0, cirrus: 0, rain: 0, snow: 0, fog: 0, storm: 0, distantStorm: 0, wind: 0, haze: 0, wetness: 0, snowCover: 0,
};

/** Forced Settings modes map onto a weather kind ('auto' / 'off' don't). */
export function forcedKind(mode: WeatherMode): WeatherKind | null {
  return mode === 'auto' || mode === 'off' ? null : mode;
}

export class WeatherSim {
  kind: WeatherKind = 'clear';
  /** Visual seconds left in the current spell. */
  timeLeft = 0;
  /** Length of the current spell (visual seconds). */
  spellLength = 1;
  /** Seeded strength of the current spell (0.6–1.3): drizzle vs downpour, flurries vs a squall. */
  intensity = 1;
  readonly out: WeatherOutputs = { ...ZERO };

  private readonly _seed: number;
  /** Campus region (location id) for REGION_WEATHER / REGION_SKY; '' = baseline. */
  private _region = '';
  get region(): string { return this._region; }
  /**
   * Setting the region re-rolls the current spell with that region's weights:
   * the first spell is rolled before the campus climate is known, and every
   * new game opened in the same (baseline-weighted) spell — rain in SoCal.
   */
  set region(r: string) {
    if (r === this._region) return;
    this._region = r;
    if (this._season !== null) this.nextSpell(this._season);
  }
  private _spell = 0;
  private _season: WeatherSeason | null = null;
  /** Visual-day index used for the morning-fog / supercell / marine-layer rolls. */
  private _dayIdx = 0;
  private _prevHour = -1;
  private _foggyDay = 0;
  private _cellDay = 0;
  private _marineDay = 0;
  /** QA: force a distant storm cell on the horizon (0–1, null = the seeded roll). */
  forceDistantStorm: number | null = null;

  constructor(seed = 1) {
    this._seed = seed | 0;
  }

  /** Is the current spell precipitating? */
  get precipitating(): boolean {
    return this.kind === 'rain' || this.kind === 'storm' || this.kind === 'snow';
  }

  /** Player-facing label of what the sky is doing now. */
  get label(): string { return WEATHER_LABEL[this.kind]; }

  /**
   * Bearing of today's storm cell / the approaching front (radians, world
   * atan2(z, x)): weather comes in from the west (−x), ± 45°.
   */
  get stormAz(): number {
    return Math.PI + (hash01(this._seed ^ 0x3c6ef372, this._spell + this._dayIdx * 131) - 0.5) * 1.6;
  }

  /** 0–1 progress through the current spell. */
  get spellProgress(): number {
    return Math.max(0, Math.min(1, 1 - this.timeLeft / Math.max(1e-6, this.spellLength)));
  }

  /** Start a new spell (seeded). Exposed for tests. */
  nextSpell(season: string): void {
    this._spell++;
    let k = pickNextKind(season, hash01(this._seed, this._spell * 2), this.kind, this.region);
    // Snow can't fall outside winter; winter rain stays possible (thaw days)
    if (k === 'snow' && normSeason(season) !== 'winter') k = 'rain';
    this.kind = k;
    const [lo, hi] = KIND_DURATION[k];
    this.spellLength = this.timeLeft = lo + (hi - lo) * hash01(this._seed, this._spell * 2 + 1);
    this.intensity = 0.6 + 0.7 * hash01(this._seed ^ 0x27d4eb2d, this._spell);
  }

  /**
   * Advance by `dt` visual seconds.
   * @param season  game season ('fall' | 'winter' | 'spring' | 'summer')
   * @param hour    visual hour of day 0–24 (morning fog, afternoon storms, marine layer)
   * @param mode    Settings → Weather override
   */
  update(dt: number, season: string, hour: number, mode: WeatherMode = 'auto'): WeatherOutputs {
    const o = this.out;
    const s = normSeason(season);
    if (mode === 'off') {
      Object.assign(o, ZERO);
      this._season = s;
      return o;
    }
    dt = Math.max(0, Math.min(dt, 5)); // tab-switch spikes
    const sky = regionSky(this._region);

    // First update / season change: start a fitting spell, and a winter that
    // begins already shows some lying snow.
    if (this._season !== s) {
      const first = this._season === null;
      this._season = s;
      if (first && s === 'winter') o.snowCover = 0.55;
      if (first) o.haze = sky.haze[s];
      if (this.kind === 'snow' && s !== 'winter') this.timeLeft = 0;
      if (first) this.nextSpell(s);
    }

    // Daily rolls — once per visual day, when the hour wraps
    if (this._prevHour < 0 || hour < this._prevHour - 12) {
      this._dayIdx++;
      this._foggyDay = hash01(this._seed ^ 0x5bd1e995, this._dayIdx) < MORNING_FOG_CHANCE[s]
        ? 0.6 + 0.4 * hash01(this._seed, this._dayIdx * 7 + 3) : 0;
      this._cellDay = hash01(this._seed ^ 0x68e31da4, this._dayIdx) < (sky.supercell[s] ?? 0)
        ? 0.7 + 0.3 * hash01(this._seed, this._dayIdx * 11 + 5) : 0;
      this._marineDay = hash01(this._seed ^ 0x1b873593, this._dayIdx) < (sky.marine?.[s] ?? 0) ? 1 : 0;
    }
    this._prevHour = hour;

    if (mode === 'auto') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) this.nextSpell(s);
    }

    const k: WeatherKind = mode === 'auto' ? this.kind : (forcedKind(mode) ?? 'clear');
    const t = KIND_TARGETS[k];
    const inten = mode === 'auto' ? this.intensity : 1;
    let tCloud = t.cloud, tCum = t.cumulus * sky.cumulus, tCir = t.cirrus;
    let tRain = t.rain * sky.rain * (k === 'rain' ? inten : 1);
    const tSnow = t.snow * (k === 'snow' ? Math.min(1.25, inten) : 1);
    let tFog = t.fog, tStorm = t.storm, tWind = t.wind * (k === 'snow' ? 0.6 + 0.5 * inten : 1);
    let tDistant = 0;
    if (mode === 'rain') tRain = Math.max(tRain, 0.75 * sky.rain);

    if (mode === 'auto') {
      // A storm comes in as a front: anvil on the horizon first, then the rain
      if (k === 'storm') {
        const p = this.spellProgress;
        const arrive = Math.max(0, Math.min(1, (p - STORM_APPROACH) / 0.12));
        const leave = Math.max(0, Math.min(1, (p - 0.85) / 0.15));
        const over = arrive * (1 - leave);
        tDistant = Math.max(1 - arrive, leave);
        tCloud = 0.35 + 0.65 * over;
        tRain = t.rain * over;
        tStorm = over;
        tCum = Math.max(tCum * over, 0.45 * (1 - over) * sky.cumulus);
        tWind = 0.4 + 0.6 * over;
      }
      // Morning fog on calm mornings (rain / storms mix the air)
      tFog = Math.max(tFog, this._foggyDay * morningFogCurve(hour) * (k === 'storm' ? 0 : 1));
      // Marine layer (SoCal June gloom)
      if (this._marineDay && (k === 'clear' || k === 'partly')) {
        const m = marineLayerCurve(hour);
        tCloud = Math.max(tCloud, 0.78 * m);
        tCum *= 1 - m;
        tCir *= 1 - m;
      }
    }
    // Afternoon supercell on the horizon (fair / partly cloudy days; also the
    // forced Partly Cloudy setting, which is the fair-weather-with-build-ups sky)
    if (this._cellDay && (k === 'partly' || (mode === 'auto' && k === 'clear'))) {
      tDistant = Math.max(tDistant, this._cellDay * supercellCurve(hour));
      tCum = Math.max(tCum, 0.35 * supercellCurve(hour) * sky.cumulus);
    }
    if (mode !== 'auto' && k === 'storm') {
      tDistant = 0.6;   // forced storm: more cells round the horizon
    }
    if (this.forceDistantStorm !== null) tDistant = this.forceDistantStorm;

    o.cloud = approach(o.cloud, tCloud, dt, 9);
    o.cumulus = approach(o.cumulus, Math.min(1, tCum), dt, 12);
    o.cirrus = approach(o.cirrus, tCir, dt, 15);
    // Precipitation waits for the clouds to build and stops before they clear
    o.rain = approach(o.rain, Math.min(1, tRain) * Math.min(1, o.cloud / 0.6), dt, 5);
    o.snow = approach(o.snow, Math.min(1, tSnow) * Math.min(1, o.cloud / 0.55), dt, 6);
    o.fog = approach(o.fog, tFog, dt, 7);
    o.storm = approach(o.storm, tStorm, dt, 6);
    o.distantStorm = approach(o.distantStorm, Math.min(1, tDistant), dt, 10);
    o.wind = approach(o.wind, Math.min(1, tWind), dt, 4);
    // Rain washes the haze out of the air; the season sets the base
    o.haze = approach(o.haze, sky.haze[s] * (1 - 0.5 * Math.min(1, o.rain + o.snow)), dt, 30);

    // Ground: wetting while it rains (or snow melts), drying otherwise
    const wetTarget = o.rain > 0.05 ? 0.35 + 0.65 * Math.min(1, o.rain * 1.4) : 0;
    if (o.wetness < wetTarget) o.wetness = Math.min(wetTarget, o.wetness + dt * (0.04 + o.rain * 0.12));
    else {
      const sun = 1 - o.cloud * 0.7;
      const dry = (s === 'summer' ? 1 / 60 : s === 'winter' ? 1 / 220 : 1 / 120) * sun;
      o.wetness = Math.max(wetTarget, o.wetness - dt * dry);
    }

    // Lying snow: accumulates while snowing, melts when not — and rain washes it away
    if (o.snow > 0.05) o.snowCover = Math.min(1, o.snowCover + dt * o.snow / 45);
    else if (mode === 'snow') o.snowCover = Math.min(1, o.snowCover + dt / 45);
    else {
      const melt = (s === 'winter' ? (mode === 'clear' ? 1 / 120 : 1 / 600) : 1 / 25) + o.rain / 20;
      const before = o.snowCover;
      o.snowCover = Math.max(0, o.snowCover - dt * melt);
      // Meltwater keeps the ground damp
      if (before > 0.02 && s !== 'winter') o.wetness = Math.max(o.wetness, Math.min(0.6, before));
    }
    if (mode === 'clear' && s !== 'winter') o.snowCover = Math.max(0, o.snowCover - dt / 10);
    if (mode === 'rain' || mode === 'storm') o.snowCover = Math.max(0, o.snowCover - dt / 8);
    return o;
  }
}

/**
 * How much lying snow the renderer may show (0–1): rain washes it out. A rainy
 * shot never shows snow on the ground, so a forced Rain / Storm mode hides it
 * outright and auto rain fades it as the rain sets in.
 */
export function snowShownUnderRain(cover: number, rain: number, mode: WeatherMode): number {
  if (mode === 'rain' || mode === 'storm') return 0;
  return cover * Math.max(0, 1 - rain * 2.2);
}
