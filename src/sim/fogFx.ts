/**
 * Fog and the game (sim/fog.ts is the pure model): the place's shape read from the lot, and the few numbers the other
 * systems read. Cheap enough to call every frame and from every posture check: a seeded hash or two and a cache.
 *
 *  Watch       `fogSightK(s, sensor)` scales what the eye, the camera and the night-vision tube add at the gate and how far
 *              the towers see a crew coming (gear.ts, encounters.ts, battle.ts); thermal is nearly untouched.
 *  Solar       `solarFogK(s)` is the day's share of the sun (utilities.ts).
 *  Forecast    `fogLog(s)` is the daily log's line (a forecast the evening before, and what the morning is) and
 *              `fogRadioLine(s)` the line the weather loop gives once the grid is down (radio.ts).
 * Nothing here is saved: it is all a function of the seed and the clock.
 */
import { calendarOf, hourOf, type GameState } from './state';
import { DEFAULT_PLACE, fogDay, fogForecast, fogForMode, fogOn, fogReadout, fogSightFactor, solarFogFactor, type FogNow, type FogPlace, type FogSensor } from './fog';
import type { RegionId } from './regions';
import { siteLot } from './lotListing';
import { campOf, groundOf } from './terrainState';
import { logGate } from './nag';

/** Mountain regions: the valleys hold fog banks. */
export const MOUNTAIN_REGIONS: ReadonlySet<RegionId> = new Set<RegionId>(['pnw', 'mountain_west', 'appalachia']);

const placeCache = new WeakMap<object, Map<string, FogPlace>>();

/** The camp's height over the valley floor (the lowest ground the land shows: the lot's own, or the datum the water and lowlands round it sit on) and under the ridges, from the lot's ground (a place with no lot gets a region default). */
export function fogPlaceOf(s: GameState): FogPlace {
  const region = s.site.region, mtnRegion = MOUNTAIN_REGIONS.has(region);
  const lot = siteLot(s.site);
  if (!lot) return mtnRegion ? { campAboveFloorM: 60, ridgeAboveCampM: 120, mountain: true } : DEFAULT_PLACE;
  const c = campOf(s), key = `${Math.round(c[0] / 4)},${Math.round(c[1] / 4)}`;
  let m = placeCache.get(s.site);
  if (!m) { m = new Map(); placeCache.set(s.site, m); }
  let p = m.get(key);
  if (!p) {
    const g = groundOf(s), campM = (g ? g.h(c[0], c[1]) : lot.field.h(c[0], c[1])) * 6, st = lot.stats;
    p = { campAboveFloorM: Math.max(0, Math.round(campM - Math.min(st.minM, 0))), ridgeAboveCampM: Math.max(0, Math.round(st.maxM - campM)), mountain: mtnRegion || st.dropM >= 45 };
    m.set(key, p);
  }
  return p;
}

/** Is a storm on today (an overcast, drizzling day whatever the roll)? */
const stormToday = (s: GameState): boolean => { const a = s.weather?.active; const d = Math.floor(s.clock.t + 0.25); return !!a && d >= a.at && d <= a.until && a.kind !== 'heat_wave'; };

/** The fog at a calendar day and hour in this game (the view's clock, or the sim's). */
export function fogAtView(s: GameState, doy: number, hour: number): FogNow {
  return fogOn(s.seed, doy, hour, s.site.region, fogPlaceOf(s), { storm: false });
}

/**
 * The fog the VIEW shows (the engine draws this, the readout names it): the sim's own fog at the view's day and hour in 'auto', a fixed
 * look when Settings → Weather forces one (null: none — clear, partly cloudy, off). The sim's mechanics always use `fogNow`.
 */
export function fogForView(s: GameState, doy: number, hour: number, mode = 'auto'): FogNow | null {
  if (mode === 'off') return null;
  if (mode !== 'auto') return fogForMode(mode, fogPlaceOf(s));
  return fogOn(s.seed, doy, hour, s.site.region, fogPlaceOf(s), { storm: doy === calendarOf(s.clock).doy && stormToday(s) });
}

/** The fog on the game's own clock. */
export function fogNow(s: GameState): FogNow {
  return fogOn(s.seed, calendarOf(s.clock).doy, hourOf(s.clock.t), s.site.region, fogPlaceOf(s), { storm: stormToday(s) });
}

/** 0.1–1: the share of its reach a sensor keeps in today's fog right now. */
export function fogSightK(s: GameState, sensor: FogSensor): number {
  return fogSightFactor(fogNow(s), sensor);
}

/** The day's share of the sun (0.18–1) for the panels; the camp is where they stand. */
export function solarFogK(s: GameState): number {
  return solarFogFactor(fogDay(s.seed, calendarOf(s.clock).doy, s.site.region, { storm: stormToday(s) }), fogPlaceOf(s));
}

/** The readout line for the overlays ('' when the air is clear). A look forced in Settings → Weather says so: it does not touch the mechanics. */
export function fogLineFor(s: GameState, doy: number, hour: number, mode = 'auto'): string {
  const now = fogForView(s, doy, hour, mode);
  if (!now) return '';
  const t = fogReadout(now);
  return t && mode !== 'auto' ? `${t} (weather forced: view only)` : t;
}

/** Once a day (the morning): the forecast for the next dawn, and what this one is. Log lines. */
export function fogLog(s: GameState): string[] {
  const out: string[] = [];
  const { doy } = calendarOf(s.clock), day = fogDay(s.seed, doy, s.site.region, { storm: stormToday(s) });
  const place = fogPlaceOf(s);
  if (day.valley >= 0.5 && logGate(s, 'fog-today', 3)) {
    const now = fogOn(s.seed, doy, 6.5, s.site.region, place, { storm: stormToday(s) });
    out.push(now.inFog ? `Fog this morning: the camp is in it, sight ${Math.round(now.sightM / 10) * 10} m. The watch cannot see the drive until it lifts.` : `Valley fog this morning, ${Math.max(0, Math.round(now.belowCampM))} m below the camp: a white sea down the hollow, clear air up here.`);
  }
  const f = fogForecast(s.seed, doy, s.site.region, place);
  if (f && logGate(s, 'fog-forecast', 4)) out.push(f);
  return out;
}

/** What the weather loop says on the radio (null: nothing worth a line tomorrow). */
export function fogRadioLine(s: GameState): string | null {
  return fogForecast(s.seed, calendarOf(s.clock).doy, s.site.region, fogPlaceOf(s));
}
