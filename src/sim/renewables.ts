/**
 * Micro-hydro and the small wind turbine (docs/DECISIONS.md, "Micro-hydro and wind"). Two more
 * power sources for utilities.balanceDay, each tied to the ground the lot really has:
 *
 *  Hydro   P = 9.81 x flow (L/s) x head (m) x efficiency. The head is the creek's fall between the
 *          intake weir and the turbine house over the penstock the kit lays (100 m of buried 150 mm
 *          HDPE, or less if the lot ends sooner: terrain.ts `creekDropM`'s ground); the flow is the
 *          creek's own, by region, by season (snowmelt in the spring, the August low, the Northwest's
 *          wet winters), cut to what the water right lets you take. It runs all day and all night, so
 *          a few kW is a lot of energy. The dangers are the creek's: frazil and anchor ice at the
 *          intake in a hard winter, a flood that closes the intake and may take the weir, a drought
 *          that dries it, leaves and silt on the trash rack until somebody clears it (the
 *          `plant` chore, sim/daily.ts).
 *  Wind    the region's mean wind at 10 m, moved by the ground (terrain.ts `wind`: ridges high,
 *          hollows low, 0.6-1.4), by the tree cover, by the hub height (18 m, shear 0.2), by the
 *          season (windier in winter and spring) and by the day (seeded). The turbine's power curve
 *          (cut-in 3 m/s, rated 5 kW at 11, furled at 25) is integrated over a Rayleigh spread of
 *          the day's wind. A storm's gusts furl it, and the worst take the tail or a blade; an ice
 *          storm or a freezing fog ices the blades (a fifth of the output, and ice is thrown). It is
 *          loud (a scout hears it; sim/encounters.ts postureOf) and its tower shows for kilometers
 *          (sim/opsec.ts structure weight).
 *
 * Nothing here is saved: the day's output is a pure function of the game seed, the day, the weather
 * and the ground, so no save bump. A broken turbine or intake goes in `utilities.broken` (the pump's
 * repair path). Pure (tested).
 */
import { calendarOf, dayIndex, type GameState, type Structure } from './state';
import { creekDropM, windAt } from './terrain';
import { groundOf, terrainOf } from './terrainState';
import { regionFor } from './climate';
import { meanLow, nightOf } from './housing';
import { weatherOf } from './weatherThreats';
import { mulberry32 } from './rng';
import type { RegionId } from './regions';
import { isFinished } from './construction';
const docksCount = (s: GameState): number => s.structures.filter(st => isFinished(st) && (st.kind === 'boat_dock' || st.kind === 'marina')).length;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const gauss = (d: number, mid: number, sd: number) => Math.exp(-((((d - mid + 182.5) % 365 + 365) % 365 - 182.5) ** 2) / (2 * sd * sd));

// ── micro-hydro ──

export const HYDRO = {
  /** Penstock the kit lays (m): two 50 m lengths of 150 mm HDPE, buried. */
  PEN_M: 100,
  /** Share of the head left after friction in the pipe. */
  NET: 0.92,
  /** Overall efficiency, water to the alternator's terminals (Turgo runner 0.78, alternator 0.9, controller and wiring 0.9, rounded). */
  ETA: 0.62,
  /** Largest flow the two nozzles pass (L/s) and the alternator's rating (kW). */
  MAX_LPS: 30, MAX_KW: 3,
  /** Share of the creek the water right lets you divert. */
  TAKE: 0.7,
  /** Head below which the penstock cannot pay for itself (m): the site card says no. */
  MIN_HEAD_M: 2.5,
  /** How near the creek's centerline the house stands (world units): on the bank, not in the channel. */
  NEAR_MIN: 1.2, NEAR_MAX: 14,
  /** Flow above this multiple of the usual closes the intake; the chance the weir goes with it. */
  FLOOD_X: 3, WEIR_LOSS: 0.12,
} as const;

/** The creek's mean flow here (L/s), before the season: a homestead creek, scaled by the region's rain. */
export function creekBaseLps(s: GameState): number {
  const R = regionFor(s.site);
  return 22 * Math.pow(Math.max(0.2, R.rainMm / 400), 0.8) * (s.site.lot?.creek ? 1.25 : 1);
}

/** The creek's flow multiplier by day of the year (1 = the mean): spring runoff, the late summer low, wet Northwest winters. */
export function creekSeason(s: GameState, doy: number): number {
  const R = regionFor(s.site), snow = clamp(R.snowCm / 140, 0, 2), wet = s.site.region === 'pnw' ? 0.8 : s.site.region === 'appalachia' ? 0.3 : 0;
  return Math.max(0.22, 0.85 + 1.1 * snow * gauss(doy, 140, 30) + wet * gauss(doy, 345, 45) - 0.4 * gauss(doy, 235, 45));
}

/** Is the creek in flood or flash flood today? */
export function creekInFlood(s: GameState, day = dayIndex(s.clock.t)): boolean {
  const a = weatherOf(s).active;
  return !!a && (a.kind === 'flood' || a.kind === 'flash_flood' || a.kind === 'hurricane_remnants') && day >= a.at && day <= a.until;
}

/** The creek today (L/s): season, a drought's dry bed, a flood's brown torrent. */
export function creekLps(s: GameState, doy = calendarOf(s.clock).doy, day = dayIndex(s.clock.t)): number {
  const drought = s.disaster.kind === 'drought' && s.clock.t >= s.disaster.hitAt;
  const jitter = 0.9 + 0.2 * mulberry32(s.seed * 17 + Math.floor(day / 3) * 5 + 1)();   // a few days of rain or dry, three days at a time
  return creekBaseLps(s) * creekSeason(s, doy) * jitter * (drought ? 0.25 : 1) * (creekInFlood(s, day) ? 6 : 1);
}

/** Freeze at the intake today: 0 clear, 1 frozen solid. Anchor ice and frazil from about 20 F on the nights, solid below -10 F. */
export function intakeIce(s: GameState, doy = calendarOf(s.clock).doy): number {
  return clamp((22 - meanLow(s, doy)) / 34, 0, 1);
}

export interface HydroSite {
  /** Gross head over the penstock (m), net of friction, and the pipe's length (m) -- shorter than the kit's when the lot ends first. */
  headM: number; netM: number; lenM: number;
  /** The intake weir (world units), upstream on the creek. */
  intake: [number, number];
  /** Distance from the house to the creek's centerline (world units). */
  bank: number;
}

/**
 * What the creek offers a turbine house at (x, z): the intake sits `PEN_M` upstream along the creek (the lower x: the creek runs
 * east), not past the lot's edge; the head is the fall of the water between there and the house. Null: no creek on the place.
 */
export function hydroSiteAt(s: GameState, x: number, z: number): HydroSite | null {
  const g = groundOf(s), t = terrainOf(s);
  if (!g?.creek || !t || !s.site.creek) return null;
  const c = g.creek, home = s.site.home;
  const unitsMax = HYDRO.PEN_M / 6;
  // upstream along the channel, but not off the lot (the water right is for your own reach)
  const xi = Math.max(home.x0 + 2, x - unitsMax);
  const len = Math.max(0, x - xi) * 6;
  if (len < 12) return { headM: 0, netM: 0, lenM: Math.round(len), intake: [xi, c.zAt(xi)], bank: Math.abs(z - c.zAt(x)) };
  const head = Math.max(0, (c.waterY(xi) - c.waterY(x)) * 6);
  void creekDropM;
  return { headM: head, netM: head * HYDRO.NET, lenM: Math.round(len), intake: [xi, c.zAt(xi)], bank: Math.abs(z - c.zAt(x)) };
}

/** Why a turbine house cannot stand at (x, z) (null: it can). */
export function hydroProblem(s: GameState, x: number, z: number): 'no_creek' | 'not_on_bank' | 'no_head' | null {
  const site = hydroSiteAt(s, x, z);
  if (!site) return 'no_creek';
  if (site.bank < HYDRO.NEAR_MIN || site.bank > HYDRO.NEAR_MAX) return 'not_on_bank';
  if (site.headM < HYDRO.MIN_HEAD_M) return 'no_head';
  return null;
}

export const HYDRO_PROBLEM_TEXT = {
  no_creek: 'No creek runs through your land: a turbine needs falling water',
  not_on_bank: 'Put the turbine house on the creek bank, within about 80 m of the water',
  no_head: 'The creek does not fall far enough here: it needs 2.5 m of drop over the penstock (try further downstream, or a steeper reach)',
} as const;

export type HydroState = 'running' | 'dry' | 'frozen' | 'flood' | 'broken' | 'choked';

export interface HydroDay { kwh: number; kw: number; lps: number; netM: number; state: HydroState; note: string }

/** The turbine's day. `care` is the intake chore's yield (1 = clear screens, down to 0.6 buried in leaves). */
export function hydroDay(s: GameState, st: Pick<Structure, 'id' | 'x' | 'z'>, opts: { broken?: boolean; care?: number; doy?: number; day?: number } = {}): HydroDay {
  const doy = opts.doy ?? calendarOf(s.clock).doy, day = opts.day ?? dayIndex(s.clock.t);
  const site = hydroSiteAt(s, st.x, st.z);
  const none = (state: HydroState, note: string, lps = 0): HydroDay => ({ kwh: 0, kw: 0, lps, netM: site?.netM ?? 0, state, note });
  if (!site || site.netM <= 0) return none('dry', 'no head');
  if (opts.broken) return none('broken', 'the intake or the turbine is damaged');
  if (creekInFlood(s, day)) return none('flood', 'the creek is in flood: the intake gate is shut');
  const flow = creekLps(s, doy, day), ice = intakeIce(s, doy);
  if (ice >= 0.97) return none('frozen', 'the intake is frozen solid', flow);
  const q = Math.min(HYDRO.MAX_LPS, flow * HYDRO.TAKE) * (1 - 0.8 * ice) * (opts.care ?? 1);
  if (q < 1.5) return none('dry', 'the creek is too low to turn the runner', flow);
  const kw = Math.min(HYDRO.MAX_KW, 9.81 * q * site.netM * HYDRO.ETA / 1000);
  const state: HydroState = ice > 0.35 ? 'choked' : 'running';
  return { kwh: kw * 24, kw, lps: q, netM: site.netM, state, note: state === 'choked' ? 'ice at the intake is cutting the flow' : 'running' };
}

// ── wind ──

/** Annual mean wind at 10 m over open ground (m/s), by region: NREL / AWS Truepower wind maps rounded for a homestead lot, not a wind farm ridge. */
export const WIND_10M: Record<RegionId, number> = {
  plains: 5.4, upper_midwest: 4.8, mountain_west: 4.3, desert: 4.2, hill_country: 4.4, north_woods: 3.6, rust_belt: 3.9,
  new_england: 3.6, appalachia: 3.2, pnw: 3.4, ozarks: 3.5,
};

/** The 5 kW class turbine on an 18 m guyed tilt-up tower (Bergey Excel 6 / Skystream class). */
export const TURBINE = { RATED_KW: 5, CUT_IN: 3, RATED_MS: 11, FURL_MS: 25, HUB_M: 18, ROTOR_M: 5.5, SHEAR: 0.2, ICE_K: 0.2, GUST_X: 1.9 } as const;

/** Gust speeds (m/s) of the storms that bring wind; above FURL the turbine feathers, and the worst can break it. */
export const STORM_GUST_MS: Partial<Record<string, number>> = { windstorm: 33, derecho: 42, hurricane_remnants: 31, tornado: 68, blizzard: 27, hail: 24, ice_storm: 20 };
/** Chance a storm of the kind takes the tail or a blade off an 18 m turbine (the day it hits). */
export const STORM_BREAK: Partial<Record<string, number>> = { derecho: 0.1, windstorm: 0.04, tornado: 0.4, hurricane_remnants: 0.03 };

/** Ground exposure of a point: 0.6 in a hollow to 1.4 on a ridge (terrain.ts wind field), eased down by timber. */
export function windExposure(s: GameState, x: number, z: number): number {
  const t = terrainOf(s);
  const ground = t ? 0.6 + 0.8 * windAt(t, x, z) : 1;
  const trees = 1 - 0.1 * clamp(s.site.timber, 0, 1.4);
  return ground * trees;
}

/** The ground's own exposure (0.6 hollow … 1.4 ridge), without the tree cover. */
export function groundExposure(s: GameState, x: number, z: number): number {
  const t = terrainOf(s);
  return t ? 0.6 + 0.8 * windAt(t, x, z) : 1;
}

/** Mean wind at hub height (m/s) at a point for the year, and for a day of the year (windier in winter and spring). */
export function hubMeanMs(s: GameState, x: number, z: number): number {
  return WIND_10M[s.site.region] * windExposure(s, x, z) * Math.pow(TURBINE.HUB_M / 10, TURBINE.SHEAR);
}
export const windSeason = (doy: number): number => 1 + 0.18 * Math.cos(2 * Math.PI * (doy - 45) / 365);

/** Power (kW) at wind speed v (m/s): zero below cut-in, a cubic ramp to rated, rated to the furl speed, then feathered. */
export function powerKw(v: number): number {
  if (v < TURBINE.CUT_IN || v >= TURBINE.FURL_MS) return 0;
  if (v >= TURBINE.RATED_MS) return TURBINE.RATED_KW;
  const a = TURBINE.CUT_IN ** 3, b = TURBINE.RATED_MS ** 3;
  return TURBINE.RATED_KW * (v ** 3 - a) / (b - a);
}

const _rayleigh = new Map<number, number>();
/** Mean output (kW) when the wind is Rayleigh-distributed about a mean speed (integrated over 0.5 m/s bins; cached to 0.1 m/s). */
export function meanKw(vMean: number): number {
  const key = Math.round(vMean * 10);
  const hit = _rayleigh.get(key);
  if (hit !== undefined) return hit;
  const m = key / 10, k = Math.PI / (4 * m * m);
  let sum = 0, mass = 0;
  for (let v = 0.25; v < 40; v += 0.5) { const p = 2 * k * v * Math.exp(-k * v * v) * 0.5; sum += p * powerKw(v); mass += p; }
  const out = mass > 0 ? sum / mass : 0;
  _rayleigh.set(key, out);
  return out;
}

export type WindState = 'running' | 'calm' | 'iced' | 'furled' | 'broken';
export interface WindDay { kwh: number; kw: number; meanMs: number; gustMs: number; state: WindState; note: string }

/** The day's wind factor, seeded by the game and the day: lognormal about 1 (sigma 0.35), kept between 0.3 and 2.2. */
export function dayWindFactor(seed: number, day: number): number {
  const r = mulberry32(seed * 29 + day * 13 + 7);
  const z = Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
  return clamp(Math.exp(0.35 * z - 0.35 * 0.35 / 2), 0.3, 2.2);
}

export function windStorm(s: GameState, day = dayIndex(s.clock.t)): { kind: string; gust: number } | null {
  const a = weatherOf(s).active;
  if (!a || day < a.at || day > a.until) return null;
  const gust = STORM_GUST_MS[a.kind];
  return gust ? { kind: a.kind, gust } : null;
}

/** Is the blade icing today (an ice storm, or a freezing night with the sky wet)? */
export function bladesIced(s: GameState, day = dayIndex(s.clock.t)): boolean {
  const a = weatherOf(s).active;
  if (a && a.kind === 'ice_storm' && day >= a.at && day <= a.until) return true;
  const n = nightOf(s, day);
  return n.lowF <= 30 && n.lowF >= 14 && (n.rainy || n.snowy) && mulberry32(s.seed * 41 + day)() < 0.5;
}

/** The turbine's day. */
export function windDay(s: GameState, st: Pick<Structure, 'id' | 'x' | 'z'>, opts: { broken?: boolean; doy?: number; day?: number } = {}): WindDay {
  const doy = opts.doy ?? calendarOf(s.clock).doy, day = opts.day ?? dayIndex(s.clock.t);
  const mean = hubMeanMs(s, st.x, st.z) * windSeason(doy) * dayWindFactor(s.seed, day);
  const storm = windStorm(s, day);
  const gust = Math.max(mean * TURBINE.GUST_X, storm?.gust ?? 0);
  const out = (state: WindState, note: string, kw = 0): WindDay => ({ kwh: kw * 24, kw, meanMs: mean, gustMs: gust, state, note });
  if (opts.broken) return out('broken', 'the tail or a blade is damaged');
  if (gust >= TURBINE.FURL_MS && (storm || mean * TURBINE.GUST_X >= TURBINE.FURL_MS)) return out('furled', 'furled in the gusts', 0);
  const iced = bladesIced(s, day);
  const kw = meanKw(mean) * (iced ? TURBINE.ICE_K : 1);
  if (kw < 0.02) return out('calm', 'becalmed');
  return out(iced ? 'iced' : 'running', iced ? 'ice on the blades' : 'turning', kw);
}

/** Does the storm break the turbine on the day it hits? A roll of the day's random against the storm's odds. */
export function stormBreaks(s: GameState, rnd: number, day = dayIndex(s.clock.t)): boolean {
  const a = weatherOf(s).active;
  if (!a || a.at !== day) return false;
  return rnd < (STORM_BREAK[a.kind] ?? 0);
}

/** Does the flood take the intake weir away today? (Only on the day it starts.) */
export function floodTakesWeir(s: GameState, rnd: number, day = dayIndex(s.clock.t)): boolean {
  const a = weatherOf(s).active;
  return !!a && a.at === day && creekInFlood(s, day) && rnd < HYDRO.WEIR_LOSS;
}

/** Daily chance a turbine or intake wears out on its own (bearing, bush, a slipped guy): about one year in eight. */
export const WEAR_PER_DAY = 1 / 2900;

// ── the day, for the whole place (called by utilities.balanceDay) ──

export interface RenewDay { hydro: Map<string, HydroDay>; wind: Map<string, WindDay>; hydroKwh: number; windKwh: number; notes: string[] }

/**
 * Both kinds of source for today: each finished turbine house and wind turbine, with its output and state. Wear, storm and flood damage
 * are rolled here from `rnd` (the day's random), pushing into `broken` and returning the lines for the log.
 */
export function renewablesDay(s: GameState, rnd: number, care = 1, faultK = 1): RenewDay {
  const u = s.utilities, doy = calendarOf(s.clock).doy, day = dayIndex(s.clock.t);
  const out: RenewDay = { hydro: new Map(), wind: new Map(), hydroKwh: 0, windKwh: 0, notes: [] };
  for (const st of s.structures) {
    if (!isFinished(st) || u.fried.includes(st.id)) continue;
    if (st.kind === 'micro_hydro') {
      // the weir goes in a flood; a turbine wears
      const was = u.broken.includes(st.id);
      if (!was && (floodTakesWeir(s, rnd, day) || rnd * faultK < WEAR_PER_DAY * 0.6)) { u.broken.push(st.id); out.notes.push(creekInFlood(s, day) ? 'The flood took the intake weir. A hardware kit and a day\'s work will put it back.' : 'The turbine is running rough: a bearing is going. A hardware kit will fix it.'); }
      const d = hydroDay(s, st, { broken: u.broken.includes(st.id), care, doy, day });
      out.hydro.set(st.id, d); out.hydroKwh += d.kwh;
    } else if (st.kind === 'wind_turbine') {
      const was = u.broken.includes(st.id);
      if (!was && (stormBreaks(s, rnd, day) || rnd * faultK < WEAR_PER_DAY * 0.5)) { u.broken.push(st.id); out.notes.push(weatherOf(s).active && weatherOf(s).active!.at === day ? 'The gale took the turbine\'s tail. A hardware kit and a climb will fix it.' : 'The turbine is shaking: a bearing is going. A hardware kit will fix it.'); }
      const d = windDay(s, st, { broken: u.broken.includes(st.id), doy, day });
      out.wind.set(st.id, d); out.windKwh += d.kwh;
    }
  }
  return out;
}

/** The yield multiplier of the intake chore: clear screens 1, buried in leaves and silt down to 0.6 (the backlog level, 0-100). */
export const intakeCare = (level: number): number => 1 - 0.4 * Math.max(0, level - 20) / 80;

/** Backlog a day on the intake and the turbines (the `plant` chore): leaves in the fall, silt in the runoff, ice in a hard winter. */
export function plantChoreRate(s: GameState, doy: number): number {
  const fin = s.structures.filter(isFinished);
  const hydro = fin.filter(st => st.kind === 'micro_hydro').length, wind = fin.filter(st => st.kind === 'wind_turbine').length;
  const dock = docksCount(s);
  if (!hydro && !wind && !dock) return 0;
  const leaves = gauss(doy, 290, 18), runoff = gauss(doy, 140, 20), ice = intakeIce(s, doy);
  // hauling the boats out before the freeze, launching them in the spring, scraping the pilings: the dock's share of the chore
  const haul = gauss(doy, 275, 20) + gauss(doy, 110, 14);
  return Math.min(60, hydro * (4 + 14 * leaves + 8 * runoff + 10 * ice) + wind * 2 + dock * (1 + 9 * haul));
}

/** Noise a scout hears (0-15, added to the place's visibility): a running turbine whooshes and hums. */
export function turbineNoise(s: GameState): number {
  const w = s.utilities.report.windKwh ?? 0;
  return w > 4 ? Math.min(12, 4 + w / 6) : 0;
}
