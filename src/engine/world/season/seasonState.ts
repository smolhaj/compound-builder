/**
 * seasonState — the visual seasons of the whole world (campus + town +
 * regional landscape), per climate region. Pure (no Three.js): tested by
 * seasonState.test.ts, consumed by seasonShader.ts (GPU uniforms) and by
 * the game canvas (particles, wetness, weather snow allowance).
 *
 * Every visual parameter is a smooth function of the day of the year, so
 * foliage turns gradually through the fall, the snow comes in December,
 * melts in March and the trees leaf out in April. The SeasonController eases
 * the drawn values toward that target over a few in-game days, so calendar
 * jumps and a Settings override never snap. (Ported from University Empire;
 * the game supplies the day of the year directly — no academic terms.)
 *
 * Climates (one per location):
 *   New England    — peak scarlet/orange/gold blaze mid-Oct, full snow Dec–Mar, frozen ponds
 *   Midwest        — golden/orange fall, full snow, frozen ponds
 *   Mountain West  — aspen gold late Sep, full snow, tan grass in late summer
 *   Pacific NW     — mostly evergreen + yellow bigleaf maples; wet, dull winters, only passing snow
 *   Deep South     — subtle bronze fall in Nov, no snow, browned dormant lawns in winter
 *   Southern Cal.  — minimal fall, no snow, dormant winter lawns, tan dry summer hills
 */

export type VisualSeason = 'spring' | 'summer' | 'fall' | 'winter';
/** Settings → Lighting → Season override. */
export type SeasonMode = 'auto' | VisualSeason;
export const SEASON_MODES: readonly SeasonMode[] = ['auto', 'spring', 'summer', 'fall', 'winter'];

export function isSeasonMode(v: unknown): v is SeasonMode {
  return typeof v === 'string' && (SEASON_MODES as readonly string[]).includes(v);
}

/** Drawn seasonal state. All values 0–1. */
export interface SeasonParams {
  /** Deciduous foliage turning (0 green → 1 every tree at its fall colour). */
  fall: number;
  /** Leaf drop (0 full crowns → 1 bare branches). Capped per region. */
  bare: number;
  /** Spring flush: fresh light-green new leaves and lawns. */
  fresh: number;
  /** Spring blossom on the flowering trees (pink / white). */
  bloom: number;
  /** Lying snow cover on the ground / roofs / boughs (season base, before weather). */
  snow: number;
  /** Browned dormant winter grass. */
  dormant: number;
  /** Late-summer dry (tan) grass. */
  dry: number;
  /** Fallen leaves on lawns, under trees, in gutters. */
  litter: number;
  /** Frozen ponds / lakes. */
  ice: number;
  /** Mountain snow line: 0 = summer line, 1 = winter line. */
  cold: number;
  /** Damp, dull ground (Pacific NW winters). */
  wet: number;
}

export const SEASON_KEYS: readonly (keyof SeasonParams)[] = [
  'fall', 'bare', 'fresh', 'bloom', 'snow', 'dormant', 'dry', 'litter', 'ice', 'cold', 'wet',
];

export function zeroSeasonParams(): SeasonParams {
  return { fall: 0, bare: 0, fresh: 0, bloom: 0, snow: 0, dormant: 0, dry: 0, litter: 0, ice: 0, cold: 0, wet: 0 };
}

/** Climate of one location. Days are days of the year (Jan 1 = 1). */
export interface SeasonClimate {
  id: string;
  /** Fall colour intensity (1 = New England peak blaze, 0.15 = SoCal). */
  blaze: number;
  /** Fall palette shares: [scarlet, orange, gold/yellow, bronze/brown]. */
  palette: readonly [number, number, number, number];
  /** First trees turn / peak colour / last leaves down. */
  turnStart: number;
  peak: number;
  dropEnd: number;
  /** How bare the deciduous trees get (live oaks / SoCal sycamores keep leaves). */
  bareMax: number;
  /**
   * Share of the broadleaf trees that are evergreen (live oak, southern
   * magnolia, coast live oak): no fall colour, no leaf drop, no winter holes.
   */
  broadEvergreen: number;
  /** Spring leaf-out (fresh green crowns) and blossom peak. */
  leafOut: number;
  bloomDay: number;
  /** Ground snow cover amount and its window [on, full] … [melt, gone] (wraps the new year). */
  snow: number;
  snowOn: number;
  snowFull: number;
  snowMelt: number;
  snowGone: number;
  /** Weather-sim snow allowed (0 = winter precipitation falls as rain). */
  weatherSnow: number;
  /** Dormant brown lawns amount; browning from dormantOn, green again by greenUp. */
  dormant: number;
  dormantOn: number;
  greenUp: number;
  /** Late-summer dry grass amount and its [start, full, end] days. */
  dry: number;
  dryStart: number;
  dryFull: number;
  dryEnd: number;
  /** Ponds and lakes freeze over with the snow. */
  freeze: boolean;
  /** Damp, dull winter ground (PNW). */
  wetWinter: number;
}

const BASE: Omit<SeasonClimate, 'id'> = {
  blaze: 0.85, palette: [0.16, 0.36, 0.38, 0.1],
  turnStart: 262, peak: 287, dropEnd: 312, bareMax: 1, broadEvergreen: 0,
  leafOut: 112, bloomDay: 108,
  snow: 0.88, snowOn: 334, snowFull: 348, snowMelt: 66, snowGone: 84, weatherSnow: 1,
  dormant: 1, dormantOn: 300, greenUp: 105,
  dry: 0, dryStart: 200, dryFull: 228, dryEnd: 320,
  freeze: true, wetWinter: 0,
};

export const CLIMATES: Record<string, SeasonClimate> = {
  new_england: {
    ...BASE, id: 'new_england', blaze: 1, palette: [0.38, 0.3, 0.24, 0.08],
    turnStart: 262, peak: 290, dropEnd: 318,
    snow: 0.92, snowOn: 338, snowFull: 352, snowMelt: 66, snowGone: 86,
  },
  midwest_plains: { ...BASE, id: 'midwest_plains' },
  mountain_west: {
    ...BASE, id: 'mountain_west', blaze: 0.9, palette: [0.03, 0.12, 0.8, 0.05],
    turnStart: 255, peak: 278, dropEnd: 300, leafOut: 112, bloomDay: 106,
    snow: 0.85, snowOn: 326, snowFull: 342, snowMelt: 72, snowGone: 92,
    dry: 0.75, dryStart: 192, dryFull: 226, dryEnd: 330,
  },
  pacific_northwest: {
    ...BASE, id: 'pacific_northwest', blaze: 0.75, palette: [0.04, 0.18, 0.68, 0.1],
    turnStart: 268, peak: 296, dropEnd: 322, leafOut: 104, bloomDay: 88,
    snow: 0, weatherSnow: 0.55, dormant: 0.15, dormantOn: 320, greenUp: 70,
    freeze: false, wetWinter: 0.55,
  },
  deep_south: {
    ...BASE, id: 'deep_south', blaze: 0.38, palette: [0.1, 0.22, 0.18, 0.5],
    // live oak + southern magnolia: ≈ 3 in 4 campus broadleaves keep their leaves
    turnStart: 300, peak: 326, dropEnd: 352, bareMax: 0.55, broadEvergreen: 0.72, leafOut: 78, bloomDay: 80,
    snow: 0, weatherSnow: 0, dormant: 0.9, dormantOn: 330, greenUp: 88,
    freeze: false,
  },
  southern_california: {
    ...BASE, id: 'southern_california', blaze: 0.15, palette: [0.08, 0.25, 0.37, 0.3],
    turnStart: 310, peak: 335, dropEnd: 356, bareMax: 0.2, broadEvergreen: 0.5, leafOut: 62, bloomDay: 70,
    snow: 0, weatherSnow: 0, dormant: 0.55, dormantOn: 335, greenUp: 70,
    dry: 0.85, dryStart: 178, dryFull: 212, dryEnd: 322,
    freeze: false,
  },
};

export function climateFor(locationId: string | null | undefined): SeasonClimate {
  return (locationId && CLIMATES[locationId]) || CLIMATES.midwest_plains;
}

const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** Day of the year (1–365) for a calendar month (1-based) / day. */
export function dayOfYear(month: number, monthDay: number): number {
  return MONTH_START[Math.max(1, Math.min(12, month)) - 1] + monthDay;
}

/** Representative day for a forced season (fall = the region's peak colour). */
export function overrideDay(mode: VisualSeason, c: SeasonClimate): number {
  switch (mode) {
    case 'spring': return 116;   // late April: leaf-out, blossom, greening lawns
    case 'summer': return 226;   // mid-August: lush, dry tan grass where it dries
    case 'fall': return c.peak;
    case 'winter': return 22;    // late January
  }
}

function sstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Cold-window value: ramps up on → full (late year), holds, ramps down melt → gone (early year). */
function window(d: number, on: number, full: number, melt: number, gone: number): number {
  if (d >= on) return sstep(on, full, d);
  if (d <= gone) return 1 - sstep(melt, gone, d);
  return 0;
}

/** Target seasonal state for a climate on a day of the year. */
export function seasonTargets(c: SeasonClimate, d: number): SeasonParams {
  const p = zeroSeasonParams();
  const late = d >= 182; // July onward: the growing season winds down
  // Foliage: turning → peak → drop; bare through winter; leaf-out in spring
  if (late) {
    p.fall = sstep(c.turnStart, c.peak, d);
    p.bare = c.bareMax * sstep(c.peak + 2, c.dropEnd, d);
  } else {
    // Winter colour state lingers until just before leaf-out, so the new year
    // never flips a half-bare southern tree back to summer green
    p.fall = 1 - sstep(c.leafOut - 26, c.leafOut - 12, d);
    p.bare = c.bareMax * (1 - sstep(c.leafOut - 16, c.leafOut + 6, d));
    p.fresh = sstep(c.leafOut - 14, c.leafOut, d);
    p.bloom = sstep(c.bloomDay - 12, c.bloomDay, d) * (1 - sstep(c.bloomDay + 14, c.bloomDay + 32, d));
  }
  // Snow on the ground, ice on the ponds, winter snow line in the ranges
  p.snow = c.snow * window(d, c.snowOn, c.snowFull, c.snowMelt, c.snowGone);
  p.ice = c.freeze ? window(d, c.snowOn + 8, c.snowFull + 10, c.snowMelt - 4, c.snowGone - 4) : 0;
  p.cold = window(d, 288, 336, 92, 136);
  // Lawns: dormant brown through the cold months, dry tan in late summer
  p.dormant = c.dormant * window(d, c.dormantOn, c.dormantOn + 28, c.greenUp - 24, c.greenUp);
  p.dry = c.dry * (late ? sstep(c.dryStart, c.dryFull, d) * (1 - sstep(c.dryEnd - 20, c.dryEnd, d)) : 0);
  // Fallen leaves (mostly under snow in mid-winter; matted remains after the melt)
  const leaves = Math.min(1, c.bareMax * 1.4);
  const fallen = late ? sstep(c.peak - 14, c.dropEnd - 6, d) : 0.3 * (1 - sstep(c.greenUp - 30, c.greenUp + 4, d));
  p.litter = leaves * fallen * (1 - Math.min(1, p.snow * 1.1));
  p.wet = c.wetWinter * window(d, 290, 320, 75, 110);
  return p;
}

/** Visual season label for a day of the year (Dec–Feb winter, Mar–May spring …). */
export function visualSeasonForDay(d: number): VisualSeason {
  if (d >= 335 || d < 60) return 'winter';
  if (d < 152) return 'spring';
  if (d < 244) return 'summer';
  return 'fall';
}

/**
 * Season for landscape baked into models (beds, ponds): the visual season of
 * the day, except climates whose ponds do not freeze get a mild, dormant
 * "fall" winter.
 */
export function landscapeSeasonFor(doy: number, locationId: string | null | undefined): VisualSeason {
  const v = visualSeasonForDay(doy);
  return v === 'winter' && !climateFor(locationId).freeze ? 'fall' : v;
}

/** Discrete plant season: autumn tints only once the trees are turning (see seasonState.plants). */
export function plantSeason(visual: VisualSeason, p: SeasonParams): VisualSeason {
  return visual === 'fall' && p.fall < 0.3 && p.bare < 0.3 ? 'summer' : visual;
}

/**
 * Live seasonal state shared by every renderer that wants to react without
 * a uniform (e.g. water reading `ice`). Updated in place by SeasonController.
 */
export const seasonState: {
  params: SeasonParams;
  climate: SeasonClimate;
  /** Season label of the current (eased) target day. */
  visual: VisualSeason;
  /**
   * Season for discretely tinted plants (shore willows, reeds, lilies): stays
   * summer-green until the broadleaves have actually begun to turn, so a pond
   * willow isn't autumn-yellow on 1 September beside green trees.
   */
  plants: VisualSeason;
  /** Weather-sim snow allowance for the region (0 = winter precipitation is rain). */
  weatherSnow: number;
  /** Target day of the year (calendar or override) — farm crop calendars (cropCalendar). */
  doy: number;
} = {
  params: zeroSeasonParams(),
  climate: CLIMATES.midwest_plains,
  visual: 'summer',
  plants: 'summer',
  weatherSnow: 1,
  doy: 196,
};

/** Easing time constant, in game days ("a few in-game days"). */
export const SEASON_TAU_DAYS = 2.5;
/** Easing time constant in real seconds while a Settings override changes. */
export const SEASON_TAU_OVERRIDE_S = 0.6;

export interface SeasonFrame {
  locationId: string | null | undefined;
  /** Day of the year (1–365) of the game calendar. */
  doy: number;
  /** Total game days elapsed (drives the in-game-day easing). */
  totalDays: number;
  mode: SeasonMode;
  /** Real seconds since last frame. */
  dt: number;
}

/**
 * Eases the drawn season toward the calendar / override target. The first
 * frame, a location change and a big calendar jump (load / new game) snap.
 */
export class SeasonController {
  readonly params: SeasonParams = zeroSeasonParams();
  private _loc: string | null = null;
  private _lastTotal = NaN;
  private _lastMode: SeasonMode | null = null;
  /** Real-time easing window left after an override change (s), and frames
   *  left (slow frames — dt is clamped by the render loop — still converge). */
  private _overrideEase = 0;
  private _overrideFrames = 0;

  update(f: SeasonFrame): SeasonParams {
    const climate = climateFor(f.locationId);
    const doy = f.mode === 'auto' ? f.doy : overrideDay(f.mode, climate);
    const target = seasonTargets(climate, doy);
    const loc = f.locationId ?? '';
    const jump = !Number.isFinite(this._lastTotal) || f.totalDays < this._lastTotal || f.totalDays - this._lastTotal > 40;
    const snap = this._loc !== loc || jump;
    if (this._lastMode !== null && this._lastMode !== f.mode) { this._overrideEase = 4; this._overrideFrames = 30; }
    const dDays = snap ? 0 : Math.max(0, f.totalDays - this._lastTotal);
    const overriding = this._overrideEase > 0 || this._overrideFrames > 0;
    this._overrideEase = Math.max(0, this._overrideEase - f.dt);
    this._overrideFrames = Math.max(0, this._overrideFrames - 1);
    let k: number;
    if (snap) k = 1;
    else {
      const rate = dDays / SEASON_TAU_DAYS + (overriding ? Math.max(f.dt / SEASON_TAU_OVERRIDE_S, 0.2) : 0);
      k = 1 - Math.exp(-rate);
    }
    for (const key of SEASON_KEYS) this.params[key] += (target[key] - this.params[key]) * k;
    this._loc = loc;
    this._lastTotal = f.totalDays;
    this._lastMode = f.mode;
    seasonState.params = this.params;
    seasonState.climate = climate;
    seasonState.visual = visualSeasonForDay(doy);
    seasonState.plants = plantSeason(seasonState.visual, this.params);
    seasonState.weatherSnow = climate.weatherSnow;
    seasonState.doy = doy;
    return this.params;
  }

  /** Force the next update to snap (e.g. a loaded save). */
  reset(): void {
    this._lastTotal = NaN;
  }
}
