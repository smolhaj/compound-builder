/**
 * Frost and wind at a spot (docs/DECISIONS.md, "Frost pockets and wind wired in"). The Terrain overlay has always drawn the
 * cold-air pockets and the wind field; this is where the sim reads them for everything that grows, makes power or burns wood:
 *
 *  Garden    a bed in a cold-air pocket starts nine days later and ends nine days sooner (cold pools at both ends of the
 *            season); one on a slope that drains the cold air starts four days earlier. Exposed to wind (1.15 or more: a crest about 3 m above the ground round it)
 *            it dries and lodges: 5 % less. A hedge or a fence within 12 m on the windward side takes half of that.
 *  Field     the same, over the crop's weeks: a pocket costs 8 % (frost in the grain-fill), an exposed field 4 %.
 *  Orchard   the pocket was already read (sim/orchard.ts); wind adds a lower fruit set (bees stay in the hive above
 *            5 m/s): 8 % less on an exposed plot.
 *  Solar     a ground array on an exposed spot takes the gale: a windstorm, derecho or hurricane's remnants may strip
 *            panels (odds scale with exposure above 1.0; a hardware kit and two panels put them back). Panels in a
 *            wind run cooler: +2 % output at exposure 1.3.
 *  Wind      the turbine's own ground factor (sim/renewables.ts windExposure); the siting card says what a spot gives.
 *  Heat      an exposed house loses heat to the wind: the wood stove burns up to 8 % more; one in a hollow, 4 % less.
 *
 * Every number is here, in one place. Pure (tested); reads only the ground and the weather.
 */
import { dayIndex, type GameState, type Structure } from './state';
import { plotSite, type PlotSite } from './orchard';
import { groundExposure, windExposure } from './renewables';
import { weatherOf } from './weatherThreats';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { sunFactor } from './terrainFx';
import { mulberry32 } from './rng';
import type { PerimeterRun } from './perimeter';

export const MC = {
  /** Wind exposure (renewables.windExposure: 0.6 hollow … 1.4 ridge) at and above which a place counts as exposed, and below which as sheltered. */
  EXPOSED: 1.15, SHELTERED: 0.85,
  /** Garden: days a bed's season starts later / ends sooner in a pocket, and starts earlier on a draining slope. */
  GARDEN_POCKET_DAYS: 9, GARDEN_DRAIN_DAYS: 4,
  /** Yield cost of a pocket and of an exposed place for a field, a garden, an orchard. */
  FIELD_POCKET: 0.08, FIELD_WIND: 0.04, GARDEN_WIND: 0.05, ORCHARD_WIND: 0.08,
  /** A hedge, a fence or a wall within this many units on the windward side halves the wind cost. */
  SHELTER_R: 2,
  /** Solar: output gain per 0.1 of exposure above 1.0 (cooler panels), capped. */
  SOLAR_COOL: 0.007, SOLAR_COOL_CAP: 0.03,
  /** Chance per windy storm day, per unit of exposure above 1.0, that an array loses panels. */
  ARRAY_STRIP: 0.5,
  /** Heating: extra wood at exposure 1.4, and the saving in a hollow (0.6). */
  HEAT_EXPOSED: 0.08, HEAT_HOLLOW: -0.04,
} as const;

export type Windiness = 'sheltered' | 'moderate' | 'exposed';

export interface SiteClimate {
  site: PlotSite;
  /** Wind exposure 0.55-1.5 (renewables.windExposure) and its word. */
  wind: number;
  windy: Windiness;
  /** Sun against level (0.75 north face … 1.25 south face). */
  sun: number;
}

const bandOf = (w: number): Windiness => (w >= MC.EXPOSED ? 'exposed' : w <= MC.SHELTERED ? 'sheltered' : 'moderate');

/** What the ground gives a spot: cold air, wind and sun. */
export function siteClimate(s: GameState, at: Pick<Structure, 'x' | 'z'>): SiteClimate {
  const wind = windExposure(s, at.x, at.z);
  return { site: plotSite(s, at), wind, windy: bandOf(wind), sun: sunFactor(s, at) };
}

/** Is a finished hedge, fence or wall within `SHELTER_R` of the spot (a windbreak)? */
export function windbreakNear(s: GameState, at: Pick<Structure, 'x' | 'z'>): boolean {
  const near = (r: PerimeterRun) => r.pts.some(p => Math.hypot(p[0] - at.x, p[1] - at.z) <= MC.SHELTER_R);
  return s.perimeter.some(r => r.finishedAt !== null && r.kind !== 'water_pipe' && r.kind !== 'power_cable' && near(r));
}

/** What exposure costs a crop (0 … cost), halved behind a windbreak. */
export function windCost(s: GameState, at: Pick<Structure, 'x' | 'z'>, cost: number): number {
  const w = windExposure(s, at.x, at.z);
  if (w < MC.EXPOSED) return 0;
  return windbreakNear(s, at) ? cost / 2 : cost;
}

/** Days the bed's season starts later (+) or sooner (-) than the region's, and ends sooner (+) or later (-): the pocket's cold at both ends. */
export function gardenShift(s: GameState, st: Pick<Structure, 'x' | 'z'>): { start: number; end: number } {
  const p = plotSite(s, st);
  if (p.pocket) return { start: MC.GARDEN_POCKET_DAYS, end: MC.GARDEN_POCKET_DAYS };
  if (p.drained) return { start: -MC.GARDEN_DRAIN_DAYS, end: 0 };
  return { start: 0, end: 0 };
}

/**
 * A garden bed's season factor on `doy`, given the region's [g0, g1] (greenhouse-extended, with the successions): the shared ramp (up over
 * 45 days from the start, flat, down over the last 35), moved by the bed's own frost dates, and the wind's cost.
 */
export function gardenSeasonK(s: GameState, st: Pick<Structure, 'x' | 'z'>, doy: number, g0: number, g1: number): number {
  const sh = gardenShift(s, st), a = g0 + sh.start, b = g1 - sh.end;
  const season = doy < a || doy > b ? 0 : doy < a + 45 ? (doy - a) / 45 : doy < b - 35 ? 1 : (b - doy) / 35;
  return season * (1 - windCost(s, st, MC.GARDEN_WIND));
}

/** A field's yield factor for its place (1 on ordinary ground). */
export function fieldSiteK(s: GameState, st: Pick<Structure, 'x' | 'z'>): number {
  const p = plotSite(s, st);
  return (1 - (p.pocket ? MC.FIELD_POCKET : 0)) * (1 - windCost(s, st, MC.FIELD_WIND));
}

/** The orchard's fruit-set factor for wind (1 sheltered or behind a windbreak, down to 0.92 on an exposed plot). */
export const orchardWindK = (s: GameState, st: Pick<Structure, 'x' | 'z'>): number => 1 - windCost(s, st, MC.ORCHARD_WIND);

/** Output factor of a ground array from the wind cooling it (1 … 1.03). */
export function solarCoolK(s: GameState, st: Pick<Structure, 'x' | 'z'>): number {
  const w = windExposure(s, st.x, st.z);
  return 1 + Math.min(MC.SOLAR_COOL_CAP, Math.max(0, w - 1) * 10 * MC.SOLAR_COOL);
}

/** Kinds of array a gale can strip (rooftop panels are the roof's business). */
export const GROUND_ARRAYS: readonly string[] = ['solar_array', 'solar_farm'];
const GALES = new Set(['windstorm', 'derecho', 'hurricane_remnants', 'tornado']);

/** Does today's gale strip this array? Rolls once, the day the storm hits, seeded by the game, the day and the array. */
export function arrayStripped(s: GameState, st: Structure, day = dayIndex(s.clock.t)): boolean {
  const a = weatherOf(s).active;
  if (!a || a.at !== day || !GALES.has(a.kind) || !GROUND_ARRAYS.includes(st.kind)) return false;
  const over = Math.max(0, windExposure(s, st.x, st.z) - 1);
  if (over <= 0) return false;
  const id = [...st.id].reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7);
  return mulberry32(s.seed * 53 + day * 11 + id)() < Math.min(0.9, over * MC.ARRAY_STRIP * (a.kind === 'tornado' ? 2 : 1));
}

/** Share more (or less) wood the homes burn for where they stand: exposed ones lose heat to the wind, hollows are snug. Averaged over the finished homes. */
export function heatWindK(s: GameState): number {
  const homes = s.structures.filter(st => isFinished(st) && isHome(st.kind));
  if (!homes.length) return 1;
  let sum = 0;
  for (const h of homes) {
    // (the ground only, and a dead band round level: an ordinary house on ordinary ground burns what it always did)
    const g = groundExposure(s, h.x, h.z), w = Math.abs(g - 1) < 0.1 ? 1 : g;
    sum += w >= 1 ? MC.HEAT_EXPOSED * Math.min(1, (w - 1) / 0.4) : MC.HEAT_HOLLOW * Math.min(1, (1 - w) / 0.4);
  }
  return 1 + sum / homes.length;
}

/** One line for the siting card: what the cold air and the wind do to this kind of thing here (null when nothing to say). */
export function siteNote(s: GameState, kind: string, at: Pick<Structure, 'x' | 'z'>): string | null {
  const c = siteClimate(s, at);
  const wind = c.windy === 'exposed' ? 'open to the wind' : c.windy === 'sheltered' ? 'sheltered from the wind' : '';
  switch (kind) {
    case 'garden': case 'greenhouse': case 'greenhouse_heated': case 'polytunnel': case 'high_tunnel': {
      if (c.site.pocket) return `A cold-air pocket: this bed starts ${MC.GARDEN_POCKET_DAYS} days later and ends ${MC.GARDEN_POCKET_DAYS} sooner than the region's season (a tunnel or greenhouse gets most of it back).`;
      if (c.site.drained) return `A slope that drains the cold air: this bed starts ${MC.GARDEN_DRAIN_DAYS} days early.`;
      return c.windy === 'exposed' ? 'Open to the wind: the bed dries and lodges (5 % less); a hedge or a fence on the windward side halves that.' : null;
    }
    case 'field': return c.site.pocket ? 'A cold-air pocket: frost in the grain-fill costs this field 8 %.' : c.windy === 'exposed' ? 'Open to the wind: 4 % less; a windbreak halves it.' : null;
    case 'solar_array': case 'solar_farm': return c.windy === 'exposed' ? 'Exposed: the panels run cooler (+2 %) but a windstorm or derecho may strip them. Racks on the lee side of a rise are safer.' : c.sun >= 1.08 ? 'A south-facing slope: more winter sun.' : null;
    case 'wind_turbine': return `Wind here is ${Math.round(c.wind * 100)} % of an open field's (${wind || 'ordinary exposure'}).`;
    default: return wind && (kind === 'orchard' || kind === 'orchard_grove') ? `Open to the wind: bees stay home above 5 m/s, so the fruit sets 8 % less (a windbreak halves it).` : null;
  }
}

/** The month the first hard frost is likely at a bed (used by the Farm tab): the region's median shifted by the bed's end. */
export function bedFirstFrost(s: GameState, st: Pick<Structure, 'x' | 'z'>, first: number): number {
  return first - gardenShift(s, st).end;
}

