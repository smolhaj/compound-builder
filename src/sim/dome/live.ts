/**
 * The dome as live game state (docs/DOME_COMPOUND.md 7.1 to 7.3, owner decisions of 2026-11-17 and 11-18): lockdown with a CO2 clock, paid air
 * filtering, the very expensive closed ecology, the dome's own climate and the clean zone under the shell.
 *
 * EVERY finished dome runs its own air, climate, filtering, ecology, water loop and power node (owner decision 1 of 2026-11-18; save v100):
 * `GameState.domes[structureId]` holds each one's switches and gauges, and `GameState.dome` mirrors the biggest (`domeOf`) for the older readers. The pure models are `air.ts` (the CO2 clock), `climate.ts` (kWh) and `protection.ts`;
 * this file only reads the state, steps the gauges and makes the small events. Not exported from `dome/index.ts` (it reads GameState).
 *
 *  Sealed       people burn air, the shell leaks a little, filtering and plants take it back. The clock is `lockdownClock`.
 *  Open         the vents are open: the air is fresh, and dust (fallout, ash, smoke) comes in while there is any outside. A dusty dome is not a clean zone.
 *  Fail-safe    at 2 percent CO2 or 15 percent oxygen the vents open on their own (a dome cannot suffocate its people) and the lockdown ends.
 *  Power        one load node on the compound's power (utilities.ts): the air plant (only while sealed) and the climate plant. Life support first.
 *  Closed       the closed ecology makes the air indefinitely and some food, at a standing cost, with real failure risks (blight, a seized pump).
 * Pure of rendering; deterministic from the state and the day. Every strength reads the difficulty.
 */
import type { GameState, Structure } from '../state';
import { dayIndex, calendarOf, hourOf } from '../state';
import { isFinished } from '../construction';
import { isHome } from '../blueprints';
import { log } from '../economy';
import { mulberry32 } from '../rng';
import { nightOf } from '../housing';
import { regionFor } from '../climate';
import { solarFogK } from '../fogFx';
import { powerOnPlace } from '../hookups';
import { DIFFICULTY } from '../difficulty';
import type { FxCard } from '../disasterFx';
import { TIER, shellFt, tierOfKind, tierRank, cellsOfKind, type DomeTier } from './tiers';
import { domeGeometry } from './geometry';
import { SHELL } from './protection';
import { domeLoad, BAND, comfortAt, type ClimateMode, type CoolStage } from './climate';
import { WATER_LOOPS, loopUsd, loopKw, rainCatchL, reuseL, condensateL, GAL_PER_L, type WaterLoop } from './waterLoop';
import { stockCover } from './agro';
import type { PlantKind } from './plantUnits';
import { damagePlant, fxOf, plantJobs, rushPlant, rushQuote, specOf, unitsOf } from './plantLive';
import { PLANT_SHORT, plantKinds, spareProblem, spareUsd } from './plantUnits';
import {
  FILTERING, LIMIT_PPM, O2, SCRUB, BED_CAP, freshAir, lockdownClock, sealedAir, advancedFilterUsd, closedEcologyUsd, scrubberUsd,
  type AirCtx, type Clock, type Filtering,
} from './air';

/** Tunables. */
export const LIVE = {
  /** Fail-safe: the vents open on their own at this CO2 (ppm) or below this oxygen (percent). */
  VENT_PPM: LIMIT_PPM.hard, VENT_O2: 15,
  /** Alarm bands: hours left to the alarm limit. */
  LOW_H: 24, CRIT_H: 6,
  /** Dust (0..1 inside) above which the ground under the shell is no longer a clean zone. */
  DIRTY: 0.25,
  /** Days the install of each level takes after the county signs off (the review days come first for the closed ecology). */
  INSTALL_DAYS: { none: 0, scrubber: 2, advanced: 14, closed: 90 } as Record<Filtering, number>,
  /** Share of a filter set's price that a spare costs. */
  SPARE_SHARE: 0.12,
  /** The closed ecology's standing cost a day, as a share of its price, and the food it grows (baskets per person a day at full health). */
  ECO_UPKEEP_DAY: 0.00012, ECO_FOOD: 0.35,
  /** Daily failure chances at Standard (scaled by the difficulty). */
  P_PLANT: 0.012, P_BLIGHT: 0.03, P_LOOP: 0.012,
  /** Days between two cards of one kind. */
  COOLDOWN: 6,
} as const;

export type LifeCard = 'foul' | 'plant' | 'blight' | 'power' | 'hot' | 'loop' | 'stock';
export type DomeAlarm = 'ok' | 'low' | 'critical';

export interface DomeState {
  /** Sealed (true) or open (false). */
  lockdown: boolean;
  /** Game time the lockdown began, or null. */
  since: number | null;
  filtering: Filtering;
  mode: ClimateMode;
  co2ppm: number;
  o2pct: number;
  /** Filter media 0..1 (clogs with sealed days and dust; a spare set restores it). */
  filterHealth: number;
  /** The closed ecology's loop 0..1 (blight, a dead pump); full on install. */
  ecoHealth: number;
  /** Dust inside 0..1 (fallout, ash, smoke let in through open vents). */
  dust: number;
  /** The air plant stops until this game time (a seized blower), or 0. */
  plantDownUntil: number;
  /** An upgrade being fitted. */
  installing: { level: Filtering; readyAt: number } | null;
  /** Decisions waiting on the player. */
  cards: LifeCard[];
  /** Day each kind of card was last raised. */
  cool: Partial<Record<LifeCard, number>>;
  /** Last step's reading: alarm band, hours of air (null = no limit), indoor and outdoor temperature, kWh a day, powered. */
  alarm: DomeAlarm;
  hours: number | null;
  indoorF: number;
  outF: number;
  kwhDay: number;
  powered: boolean;
  /** The last time the fail-safe vents opened (game time), or null. */
  ventedAt: number | null;
  /** The structure this state belongs to (set when the state is filed under `GameState.domes`). */
  id?: string;
  /** Water loop level, and the game time its pumps are down until (a fouled membrane), or 0. (All below: save v100, optional.) */
  loop?: WaterLoop;
  loopDownUntil?: number;
  /** Rented chillers run until this game time (a hot-day fix), or 0. */
  chillUntil?: number;
  /** The last rung of the cooling ladder used, and the day's estimates: water the pads drink, rain caught, water the loops gave back (gallons). */
  stage?: CoolStage;
  waterGalDay?: number;
  rainGalDay?: number;
  savedGalDay?: number;
  /** Hours today above the top of the band by 3 F or more, and a slow 0..1 mean of how far the air has been from comfortable (animals, beds). */
  overH?: number;
  stress?: number;
  /** Whether the shell reaches a cistern (so its rain is kept), as the water balance last found it. */
  cistern?: boolean;
  /** Kinds of plant unit with a second (N+1) unit bought (save v103, optional; sim/dome/plantUnits.ts). */
  spares?: PlantKind[];
}

export const newDomeState = (): DomeState => ({
  lockdown: false, since: null, filtering: 'none', mode: 'temperate', co2ppm: freshAir().co2ppm, o2pct: freshAir().o2pct, filterHealth: 1, ecoHealth: 1, dust: 0,
  plantDownUntil: 0, installing: null, cards: [], cool: {}, alarm: 'ok', hours: null, indoorF: 55, outF: 55, kwhDay: 0, powered: false, ventedAt: null,
});


// ── which domes, who is inside ────────────────────────────────────────────────────────────

export interface DomeRef { st: Structure; tier: DomeTier; cells: number; /** Shell radius, world units (1 unit = 20 ft). */ r: number; shellFt: number }

/** Every finished dome, biggest tier first (ties by the order they were built): the first is the "main" dome the older readers mean. */
export function domesOf(s: GameState): DomeRef[] {
  const out: DomeRef[] = [];
  for (const st of s.structures) {
    if (!tierOfKind(st.kind) || !isFinished(st)) continue;
    const tier = tierOfKind(st.kind)!, cells = cellsOfKind(st.kind) ?? TIER[tier].cells;
    out.push({ st, tier, cells, r: shellFt(tier, cells) / 2 / 20, shellFt: shellFt(tier, cells) });
  }
  return out.map((d, i) => ({ d, i })).sort((a, b) => tierRank(b.d.tier) - tierRank(a.d.tier) || a.i - b.i).map(x => x.d);
}

/** The main dome (the biggest tier), or the one with this structure id. */
export function domeOf(s: GameState, id?: string): DomeRef | null {
  const all = domesOf(s);
  return id ? all.find(d => d.st.id === id) ?? null : all[0] ?? null;
}

/** A dome's gauges and switches as they stand (a read: never files anything). The first dome falls back to the older single `dome` of a v99 save. */
export function stateOf(s: GameState, d: DomeRef): DomeState {
  const own = s.domes?.[d.st.id];
  if (own) return own;
  if (s.dome && (s.dome.id === d.st.id || (!s.dome.id && domeOf(s)?.st.id === d.st.id))) return s.dome;
  return newDomeState();
}

/** The dome's state, filed under `GameState.domes` (made if absent; a v99 save's single `dome` is adopted by the main dome). Keeps `dome` mirroring the main one. */
export function ownState(s: GameState, d: DomeRef): DomeState {
  const L = (s.domes ??= {});
  let st = L[d.st.id];
  if (!st) {
    const main = domeOf(s)?.st.id === d.st.id;
    st = main && s.dome && (!s.dome.id || s.dome.id === d.st.id) ? s.dome : newDomeState();
    L[d.st.id] = st;
  }
  st.id = d.st.id;
  if (domeOf(s)?.st.id === d.st.id) s.dome = st;
  return st;
}

/** The main dome's state (older readers and the single-dome tests): a read. */
export const domeOfState = (s: GameState): DomeState => { const d = domeOf(s); return d ? stateOf(s, d) : s.dome ?? newDomeState(); };

/** A short name for the Dome page and the cards: "Geodesic dome", or "Geodesic dome 2" when there is more than one of a tier. */
export function domeLabel(s: GameState, d: DomeRef): string {
  const same = s.structures.filter(x => x.kind === d.st.kind && isFinished(x));
  return same.length > 1 ? `${TIER[d.tier].name} ${same.findIndex(x => x.id === d.st.id) + 1}` : TIER[d.tier].name;
}

const inside = (d: DomeRef, x: number, z: number): boolean => Math.hypot(x - d.st.x, z - d.st.z) <= d.r;

/** Garden beds under the shell: each growing kind counts some beds (the air model caps them). */
const BEDS: Record<string, number> = { garden: 2, field: 3, greenhouse: 2, greenhouse_heated: 6, aquaponics: 3, high_tunnel: 3, polytunnel: 2, orchard: 2, orchard_grove: 4 };
export function bedsUnder(s: GameState, d: DomeRef): number {
  let n = 0;
  for (const st of s.structures) if (isFinished(st) && BEDS[st.kind] && inside(d, st.x, st.z)) n += BEDS[st.kind];
  return Math.min(BED_CAP, n);
}

export function homesUnder(s: GameState, d: DomeRef): number { return s.structures.filter(st => isFinished(st) && isHome(st.kind) && inside(d, st.x, st.z)).length; }

/** Everyone alive and on the place (the air does not care who is working where). */
export const peopleHome = (s: GameState): number => s.personState.filter(ps => ps.needs.died == null && !ps.needs.left && !ps.needs.taken).length;

/**
 * People who live under this dome's shell: everyone on the place split among the domes by their homes (a family with no home under a shell is
 * counted with the main dome, which is where the air plant, the lockdown and the shelter are; nobody is counted twice).
 */
export function peopleUnder(s: GameState, d: DomeRef): number {
  const all = domesOf(s), total = peopleHome(s);
  if (all.length === 1) return total;
  const homes = all.map(x => homesUnder(s, x)), sum = homes.reduce((a, b) => a + b, 0), i = all.findIndex(x => x.st.id === d.st.id);
  if (sum === 0) return i === 0 ? total : 0;
  return Math.round(total * (homes[i] / sum));
}

// ── outside ───────────────────────────────────────────────────────────────────────────────

export interface Outside { f: number; sun: number; hour: number }
/** The temperature and the sun outside right now (U.S. degrees F): the night's low from the region and the day, a 22 degree swing to mid afternoon. A blizzard or storm dims the sun and chills the day. */
export function outside(s: GameState): Outside {
  const hour = hourOf(s.clock.t), n = nightOf(s), doy = calendarOf(s.clock).doy;
  const swing = 22 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (hour - 5) / 24));
  const season = 0.55 + 0.45 * Math.cos(2 * Math.PI * (doy - 172) / 365);
  const day = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
  const dim = n.snowy || n.stormy ? 0.3 : n.rainy ? 0.55 : 1;
  return { f: n.lowF + swing + (n.hot ? 12 : 0) - (n.snowy ? 4 : 0), sun: day * season * dim * Math.min(1, solarFogK(s) * 1.5), hour };
}

/** How dry the air is here, 0 (humid) to 1 (desert): evaporative cooling works in dry air. From the region's annual rain. */
export const dryAir = (s: GameState): number => Math.max(0.1, Math.min(0.95, 1.15 - regionFor(s.site).rainMm / 900));

/** How much dust, ash or smoke there is in the air outside, 0..1: fallout for three weeks, ash for two months, wildfire smoke for the fire. */
export function outsideDirt(s: GameState): number {
  const d = s.disaster;
  if (!d.kind) return 0;
  const h = (s.clock.t - d.hitAt) * 24;
  switch (d.kind) {
    case 'nuclear': case 'reactor_meltdown': return h >= 1 && h < 24 * 21 ? 1 : 0;
    case 'ash_winter': case 'supervolcano': return h >= -24 && h < 24 * 60 ? 0.8 : 0;
    case 'wildfire': return h >= -48 && h < 24 * 6 ? 0.7 : 0;
    default: return 0;
  }
}

// ── power ─────────────────────────────────────────────────────────────────────────────────

const wired = (s: GameState, id: string): boolean => s.utilities.fittings.some(f => f.building === id && f.kind === 'wire' && f.finishedAt !== null);

/** Kilowatts of the air plant at a filtering level (the blowers, fans, UV and the grow lights of a closed loop). */
export function airPlantKw(tier: DomeTier, cells: number, filtering: Filtering): number {
  const v = domeGeometry(tier, shellFt(tier, cells)).volumeCf, fp = domeGeometry(tier, shellFt(tier, cells)).footprintSf;
  switch (filtering) {
    case 'none': return 0;
    case 'scrubber': return 0.2 + v / 250_000;
    case 'advanced': return 0.6 + v / 100_000;
    case 'closed': return 0.6 + v / 100_000 + 1.5 + fp / 6_000;
  }
}

/**
 * The always-on house load of a glazed dome that is run as a living place (kWh a day per 1,000 sq ft of floor): circulation fans (a closed greenhouse
 * needs air moving across the leaves), irrigation and sump pumps, the humidity and CO2 controls, the lights and the control system. About 12 kWh per
 * 1,000 sq ft (0.012 kWh per sq ft), so a small 60 ft geodesic carries about 34 kWh a day before it heats or cools anything.
 * See docs/DOME_COMPOUND.md 5.2 for where it comes from (Dutch glasshouses, Biosphere 2, indoor plant factories).
 */
export const AUX_KWH_KSF = 12;
export const auxKwhDay = (tier: DomeTier, cells: number): number => tier === 'earthen' ? 0.2 : AUX_KWH_KSF * domeGeometry(tier, shellFt(tier, cells)).footprintSf / 1000;

/** The four sample hours of a day (2, 8, 14 and 20 o'clock): outside temperature and sun, from today's real low. */
function dayProfile(s: GameState): Array<{ f: number; sun: number }> {
  const n = nightOf(s), doy = calendarOf(s.clock).doy;
  const season = 0.55 + 0.45 * Math.cos(2 * Math.PI * (doy - 172) / 365), dim = n.snowy || n.stormy ? 0.3 : n.rainy ? 0.55 : 1;
  return ([[2, 0], [8, 0.35], [14, 1], [20, 0]] as const).map(([h, sun]) => ({ f: n.lowF + 22 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (h - 5) / 24)) + (n.hot ? 12 : 0) - (n.snowy ? 4 : 0), sun: sun * season * dim }));
}

export interface DayLoad { kwh: number; climateKwh: number; auxKwh: number; loopKwh: number; airKwh: number; waterGal: number }
/** A dome's draw and water for today: the climate plant over the day's weather, the house load, the water loop's pumps and the air plant while sealed. */
export function dayLoad(s: GameState, d: DomeRef, st: DomeState = stateOf(s, d)): DayLoad {
  let clim = 0, water = 0;
  const dry = dryAir(s);
  for (const p of dayProfile(s)) { const l = domeLoad(d.tier, d.cells, p.f, p.sun, st.mode, { sealed: st.lockdown, dry }); clim += l.kwhPerDay / 4; water += l.waterGalDay / 4; }
  const air = st.lockdown || st.filtering === 'closed' ? airPlantKw(d.tier, d.cells, st.filtering) * 24 : 0;
  const loopK = loopKw(d.tier, d.cells, st.loop ?? 'none') * 24, aux = auxKwhDay(d.tier, d.cells);
  clim *= fxOf(s, d, st).climate;
  return { kwh: Math.max(0.2, clim + aux + loopK + air), climateKwh: clim, auxKwh: aux, loopKwh: loopK, airKwh: air, waterGal: water };
}

/** The dome's draw a day (kWh), read by utilities.ts. */
export function domeKwhDay(s: GameState, st: Structure): number {
  const d = domeOf(s, st.id);
  return d ? dayLoad(s, d).kwh : 0;
}

/** Life support gets its power first while sealed; the climate alone is the last load served. `id` picks the dome (the main one if omitted). */
export function domeLoadPriority(s: GameState, kind: string, id?: string): number | null {
  if (!tierOfKind(kind)) return null;
  const d = id ? s.domes?.[id] : s.dome;
  return d && (d.lockdown || d.filtering === 'closed') && d.filtering !== 'none' ? 1 : 5;
}

/** Is the air plant running: wired, on the load list's served side, not seized. */
export function planPowered(s: GameState, d: DomeRef, st: DomeState): boolean {
  if (s.clock.t < st.plantDownUntil) return false;
  if (!wired(s, d.st.id)) return false;
  if (s.utilities.report?.shed?.includes(d.st.id) || s.utilities.fried.includes(d.st.id)) return false;
  if (fxOf(s, d, st).power === 'dark') return false;   // the substation is lost and the batteries are spent (sim/dome/plantUnits.ts)
  return powerOnPlace(s);
}

// ── the air ───────────────────────────────────────────────────────────────────────────────

/** Share of the incremental scrubbing a level does at a filter health (0.4 at a fouled set to 1 new), so the order none < scrubber < advanced < closed holds at any health. */
export const mediaK = (health: number): number => 0.4 + 0.6 * Math.max(0, Math.min(1, health));

export function airCtx(s: GameState, d: DomeRef, st: DomeState, powered = planPowered(s, d, st)): AirCtx {
  const eco = st.filtering === 'closed' ? Math.max(0, Math.min(1, st.ecoHealth)) : 0;
  // the closed loop's own beds work with no power too (they live on sun); its machinery needs the plant
  return { tier: d.tier, cells: d.cells, people: Math.max(0, peopleUnder(s, d)), filtering: st.filtering, powered, beds: Math.min(BED_CAP, bedsUnder(s, d) + eco * BED_CAP), seals: 1, scrubK: fxOf(s, d, st).scrub };
}

/** The effective scrubbing shares at a level and health (used by the property tests): more filtering never scrubs less. */
export function effectiveScrub(level: Filtering, mediaHealth: number, ecoHealth: number): { co2: number; o2: number } {
  const base = SCRUB[level], k = mediaK(mediaHealth);
  const adv = SCRUB.advanced;
  if (level === 'closed') {
    // the loop never does worse than the advanced bank it includes
    const e = Math.max(0, Math.min(1, ecoHealth));
    return { co2: Math.max(adv.co2 * k, base.co2 * e), o2: Math.max(adv.o2 * k, base.o2 * e) };
  }
  return { co2: base.co2 * k, o2: base.o2 * k };
}

/** The clock from now: hours of air if nothing changes (the dome with this id, or the main one). */
export function domeClock(s: GameState, id?: string): Clock | null {
  const d = domeOf(s, id);
  if (!d) return null;
  const st = stateOf(s, d);
  return lockdownClock({ co2ppm: st.co2ppm, o2pct: st.o2pct }, airCtx(s, d, st));
}

/** The clock for a sealed dome from fresh air, at the current people, filtering and power (what the card says before sealing). */
export function freshClock(s: GameState, id?: string): Clock | null {
  const d = domeOf(s, id);
  if (!d) return null;
  const st = stateOf(s, d);
  return lockdownClock(freshAir(), airCtx(s, d, st));
}

// ── step ──────────────────────────────────────────────────────────────────────────────────

const difficultyOf = (s: GameState) => DIFFICULTY[s.disaster.difficulty ?? 'standard'];
/** How hard failures bite: 0.35 on Cozy, 1 on Standard, 1.4 on Hardcore. */
export const failScale = (s: GameState): number => ({ cozy: 0.35, standard: 1, hardcore: 1.4 } as const)[s.disaster.difficulty ?? 'standard'] * (difficultyOf(s) ? 1 : 1);

const FILTER_SHARE = (f: Filtering): number => SCRUB[f].co2;
/** The air at which the sealed dome's heat fail-safe opens the vents on its own (degrees F). */
export const HEAT_VENT_F = 105;

/** One sub-step of every dome's gauges (`dtDays` of game time). Returns log lines. */
export function stepDome(s: GameState, dtDays: number): string[] {
  const all = domesOf(s);
  if (!all.length) {
    for (const st of [s.dome, ...Object.values(s.domes ?? {})]) if (st && (st.lockdown || st.alarm !== 'ok')) { st.lockdown = false; st.since = null; st.alarm = 'ok'; st.hours = null; }
    return [];
  }
  const out: string[] = [], multi = all.length > 1;
  for (const d of all) for (const line of stepOne(s, d, ownState(s, d), dtDays, multi)) out.push(line);
  return out;
}

function stepOne(s: GameState, d: DomeRef, st: DomeState, dtDays: number, multi: boolean): string[] {
  const out: string[] = [], name = multi ? `The ${domeLabel(s, d).toLowerCase()}'s ` : "The dome's ";
  const hrs = dtDays * 24;
  const powered = planPowered(s, d, st);
  st.powered = powered;
  const o = outside(s);
  st.outF = o.f;
  // the inside temperature: the plant holds the mode's band when it has power (and in a hot hour, rented chillers count as power), else the shell floats
  // with only the free parts of the ladder (vents when open, roof screens); a sealed dome with the plant dark floats
  const chill = s.clock.t < (st.chillUntil ?? 0);
  const fx = fxOf(s, d, st), ventK = fx.vent;
  const ld = domeLoad(d.tier, d.cells, o.f, o.sun, st.mode, { sealed: st.lockdown, dry: dryAir(s), powered: powered || chill, ventK });
  // a damaged or lost climate plant holds the band by its share, and the air drifts toward what it would float at by the rest (rented chillers cover the gap)
  const held = chill ? 1 : fx.climate;
  if (held < 1 && powered) {
    const flo = domeLoad(d.tier, d.cells, o.f, o.sun, st.mode, { sealed: st.lockdown, dry: dryAir(s), powered: false, ventK });
    ld.indoorF = ld.indoorF * held + flo.indoorF * (1 - held);
  }
  st.indoorF = ld.indoorF;
  st.stage = ld.stage;
  st.kwhDay = dayLoad(s, d, st).kwh;
  // comfort bookkeeping: hours well over the band, and a slow mean of discomfort
  const hi = BAND[st.mode][1];
  st.overH = (st.overH ?? 0) + (st.indoorF > hi + 3 ? hrs : 0);
  st.stress = (st.stress ?? 0) + ((1 - comfortAt(st.indoorF)) - (st.stress ?? 0)) * Math.min(1, dtDays * 2);

  const dirt = outsideDirt(s);
  const sealed = st.lockdown;
  if (sealed) {
    // the air
    const ctxA = airCtx(s, d, st, powered);
    // fouled media does less: scale the plant's help by the media (the same ordering at any health)
    const k = mediaK(st.filterHealth);
    const eff: AirCtx = { ...ctxA, filtering: ctxA.filtering };
    const next = sealedAir({ co2ppm: st.co2ppm, o2pct: st.o2pct }, eff, hrs);
    // fouled media: blend the clean-media result with the unfiltered one in proportion to the lost share (never better than clean, never worse than none)
    if (k < 1 && powered && st.filtering !== 'none') {
      const none = sealedAir({ co2ppm: st.co2ppm, o2pct: st.o2pct }, { ...eff, filtering: 'none' }, hrs);
      const w = (1 - k) * (st.filtering === 'closed' && st.ecoHealth > 0.5 ? 0.4 : 1);
      st.co2ppm = next.co2ppm * (1 - w) + none.co2ppm * w;
      st.o2pct = next.o2pct * (1 - w) + none.o2pct * w;
    } else { st.co2ppm = next.co2ppm; st.o2pct = next.o2pct; }
    // dust settles; a running filter bank scrubs it out
    st.dust = Math.max(0, st.dust - (powered && FILTER_SHARE(st.filtering) >= 0.9 ? 0.15 : 0.04) * dtDays);
    // the media clogs while sealed
    if (st.filtering !== 'none') st.filterHealth = Math.max(0, st.filterHealth - (0.035 + 0.05 * dirt) * dtDays);
    // bad air hurts: headaches and bad sleep above the workplace limit
    if (st.co2ppm > LIMIT_PPM.alarm || st.o2pct < O2.impaired) {
      const bad = Math.min(3, Math.max(st.co2ppm / LIMIT_PPM.alarm, (O2.normal - st.o2pct) / (O2.normal - O2.impaired)));
      for (const ps of s.personState) if (ps.needs.died == null && !ps.needs.left && !ps.needs.taken) ps.needs.morale = Math.max(0, ps.needs.morale - 7 * bad * dtDays);
    }
    // the fail-safe vents: bad air, or a sealed shell cooking in the sun with the plant dark
    const hot = st.indoorF >= HEAT_VENT_F;
    if (st.co2ppm >= LIVE.VENT_PPM || st.o2pct <= LIVE.VENT_O2 || hot) {
      st.lockdown = false; st.since = null; st.ventedAt = s.clock.t;
      out.push(hot && st.co2ppm < LIVE.VENT_PPM
        ? `${name}fail-safe vents opened on their own: the sealed shell had reached ${Math.round(st.indoorF)} F. The lockdown is over.${dirt > 0.2 ? ' There is dust in the air outside, and it is coming in.' : ''}`
        : `${name}fail-safe vents opened on their own: the air had gone bad (${(st.co2ppm / 10000).toFixed(1)} percent CO2, ${st.o2pct.toFixed(1)} percent oxygen). The lockdown is over.${dirt > 0.2 ? ' There is dust in the air outside, and it is coming in.' : ''}`);
    }
  } else {
    // open: the air is fresh and the dust comes in; filtering takes some of it
    st.co2ppm = freshAir().co2ppm; st.o2pct = freshAir().o2pct;
    if (dirt > 0) st.dust = Math.min(1, st.dust + dirt * 0.9 * (1 - 0.7 * FILTER_SHARE(st.filtering) * (powered ? 1 : 0)) * dtDays);
    else st.dust = Math.max(0, st.dust - 0.1 * dtDays);
    if (st.filtering !== 'none') st.filterHealth = Math.max(0, st.filterHealth - (0.004 + 0.02 * dirt) * dtDays);
  }

  // the gauges the card and the board read
  const clock = lockdownClock({ co2ppm: st.co2ppm, o2pct: st.o2pct }, airCtx(s, d, st, powered));
  st.hours = clock.hours === Infinity ? null : clock.hours;
  const before = st.alarm;
  st.alarm = !st.lockdown ? 'ok' : (st.hours !== null && st.hours < LIVE.CRIT_H) || st.co2ppm >= LIMIT_PPM.alarm ? 'critical' : st.hours !== null && st.hours < LIVE.LOW_H ? 'low' : 'ok';
  if (st.alarm !== before && st.alarm !== 'ok') out.push(st.alarm === 'critical' ? `${name}air is nearly gone: about ${Math.max(0, Math.floor(st.hours ?? 0))} hours to the limit. Open the vents or fix the air plant.` : `${name}air is getting short: about ${Math.floor(st.hours ?? 0)} hours left sealed.`);
  return out;
}

const raise = (_s: GameState, st: DomeState, kind: LifeCard, day: number): boolean => {
  if (st.cards.includes(kind) || day - (st.cool[kind] ?? -99) < LIVE.COOLDOWN) return false;
  st.cards.push(kind); st.cool[kind] = day; return true;
};

/** Per-dome water flows for today's balance (liters), read by utilities.ts. `rainMmDay` is the day's rain already scaled to the region; `connected` says whether a dome reaches a cistern. */
export interface DomeWaterFlows { rainL: number; reuseL: number; condL: number; coolL: number }
export function domeWaterFlows(s: GameState, rainMmDay: number, perPersonL: number, connected: (id: string) => boolean): DomeWaterFlows {
  const f: DomeWaterFlows = { rainL: 0, reuseL: 0, condL: 0, coolL: 0 };
  for (const d of domesOf(s)) {
    const st = stateOf(s, d), loop = st.loop ?? 'none', up = s.clock.t >= (st.loopDownUntil ?? 0), pw = wired(s, d.st.id) && !s.utilities.fried.includes(d.st.id);   // a daily figure: the pumps and coils run on the day's power, not the instant's
    const link = connected(d.st.id);
    const wk = fxOf(s, d, st).water;   // the water plant's share (sim/dome/plantUnits.ts): lost, the loop is off and the rain runs in unfiltered
    const rain = link ? rainCatchL(d.tier, d.cells, rainMmDay, wk > 0 ? loop : 'none') : 0;
    const re = loop !== 'none' && up && pw ? reuseL(peopleUnder(s, d), perPersonL, loop) * wk : 0;
    const cond = d.tier !== 'earthen' ? condensateL(bedsUnder(s, d), pw) : 0, cool = dayLoad(s, d, st).waterGal * 3.785;
    f.rainL += rain; f.reuseL += re; f.condL += cond; f.coolL += cool;
    const own = s.domes?.[d.st.id];
    if (own) { own.cistern = link; own.rainGalDay = rain * GAL_PER_L; own.savedGalDay = (re + cond) * GAL_PER_L; own.waterGalDay = cool / 3.785; }
  }
  return f;
}

/** Hours a hot day pushes the plant over the band before it is a decision for the player. */
const HOT_H = 3;
/** What a day of rented chillers costs, per 1,000 sq ft of floor. */
const CHILLER_USD_KSF = 600;
export const chillerUsd = (_s: GameState, d: DomeRef): number => Math.max(1500, Math.round(domeGeometry(d.tier, d.shellFt).footprintSf / 1000 * CHILLER_USD_KSF / 500) * 500);
export const STOCK_CARE_USD = 350;

/** Once a day, for every dome: installs finish, the loop is fed and pays its upkeep, the media and the machines fail now and then, and decisions are raised. Returns log lines. */
export function domeDay(s: GameState): string[] {
  const all = domesOf(s), out: string[] = [];
  for (const d of all) out.push(...domeDayOne(s, d, ownState(s, d), all.length > 1));
  return out;
}

function domeDayOne(s: GameState, d: DomeRef, st: DomeState, multi: boolean): string[] {
  const out: string[] = [], day = dayIndex(s.clock.t), idh = Array.from(d.st.id).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
  const r = mulberry32(s.seed * 7919 + day * 31 + 5 + (multi ? idh : 0)), scale = failScale(s), name = multi ? `The ${domeLabel(s, d).toLowerCase()}` : 'The dome';
  // installs
  if (st.installing && s.clock.t >= st.installing.readyAt) {
    const lv = st.installing.level;
    st.filtering = lv; st.installing = null;
    if (lv === 'closed') st.ecoHealth = 1;
    st.filterHealth = 1;
    out.push(lv === 'closed' ? `${name}'s closed ecology is planted and running: the loop will make the dome's air for as long as it is fed, powered and tended.` : `${name}'s ${lv === 'scrubber' ? 'CO2 scrubbers are' : 'advanced air bank is'} fitted and running.`);
  }
  const powered = planPowered(s, d, st);
  const people = peopleUnder(s, d);
  // the closed ecology: upkeep, food, recovery, the dark
  if (st.filtering === 'closed') {
    const cost = Math.round(closedEcologyUsd(d.tier, d.cells) * LIVE.ECO_UPKEEP_DAY);
    if (s.money >= cost) { s.money -= cost; if (powered) st.ecoHealth = Math.min(1, st.ecoHealth + 0.02); }
    else { st.ecoHealth = Math.max(0, st.ecoHealth - 0.08); out.push(`${name}'s closed ecology went without its upkeep today: seed, nutrients, parts. The loop is weakening.`); }
    if (!powered) st.ecoHealth = Math.max(0, st.ecoHealth - 0.03);
    if (st.ecoHealth > 0.2 && people > 0) s.stock.fresh += people * LIVE.ECO_FOOD * st.ecoHealth;
    if (r() < LIVE.P_BLIGHT * scale * (powered ? 1 : 1.6)) {
      st.ecoHealth = Math.max(0, st.ecoHealth - (0.25 + 0.25 * r()));
      if (raise(s, st, 'blight', day)) out.push(`Blight in ${name.toLowerCase()}'s closed ecology: leaves yellowing across the grow beds. The loop is losing ground.`);
    }
  }
  // the machines
  if (st.filtering !== 'none' && powered && st.lockdown && r() < LIVE.P_PLANT * scale * (st.filtering === 'closed' ? 1.5 : 1)) {
    st.plantDownUntil = s.clock.t + 2 + Math.floor(r() * 3);
    if (raise(s, st, 'plant', day)) out.push(`${name}'s air plant seized: the main blower stopped and the bank is dark.`);
  }
  if (st.filtering !== 'none' && st.filterHealth < 0.35 && (st.lockdown || st.dust > 0.1)) if (raise(s, st, 'foul', day)) out.push(`${name}'s filter media is fouled: the air bank is passing less every hour.`);
  if (st.lockdown && st.filtering !== 'none' && !powered && st.alarm !== 'ok') if (raise(s, st, 'power', day)) out.push(`${name} is sealed and the air plant has no power.`);
  // the water loop's pumps and membranes wear out
  const loop = st.loop ?? 'none';
  if (loop !== 'none' && s.clock.t >= (st.loopDownUntil ?? 0) && r() < LIVE.P_LOOP * scale * (loop === 'recycle' ? 1.4 : 1) * (powered ? 1 : 1.5)) {
    st.loopDownUntil = s.clock.t + 3 + Math.floor(r() * 3);
    if (raise(s, st, 'loop', day)) out.push(`${name}'s ${loop === 'recycle' ? 'recycle' : 'graywater'} loop has failed: a fouled membrane and a burned-out pump. The wastewater is backing up toward the sump.`);
  }
  // a storm: a lightning surge into the substation, hail on the roof vents (only the units the dome has; a second unit takes the hit first)
  if (nightOf(s).stormy && tierOfKind(d.st.kind) !== 'earthen' && r() < P_STORM * scale) {
    const kinds = plantKinds(d.tier, specOf(st)).filter(k => k === 'substation' || k === 'vents'), kind = kinds[Math.floor(r() * kinds.length)];
    const unit = kind && unitsOf(s, d, st).find(u => u.kind === kind && u.cond === 'ok');
    if (unit) { const line = damagePlant(s, d, st, unit.id, r() < 0.2 ? 'down' : 'damaged', 'storm'); if (line) out.push(line); }
  }
  // a hot day the plant could not hold
  const hotH = st.overH ?? 0;
  if (hotH >= HOT_H && raise(s, st, 'hot', day)) out.push(`${name} ran hot for ${Math.round(hotH)} hours today (${Math.round(st.indoorF)} F inside): the beds are wilting and the animals are panting.`);
  st.overH = 0;
  // animals under the shell that are stressed by the heat or the cold
  const stock = stockCover(s);
  if (stock.share > 0 && (st.stress ?? 0) > 0.45 && raise(s, st, 'stock', day)) out.push(`The animals under ${name.toLowerCase()} are stressed by the ${st.indoorF > 80 ? 'heat' : 'cold'} (${Math.round(st.indoorF)} F inside).`);
  // a card whose cause is gone goes away
  st.cards = st.cards.filter(c => c === 'foul' ? st.filterHealth < 0.5 : c === 'plant' ? s.clock.t < st.plantDownUntil : c === 'blight' ? st.filtering === 'closed' && st.ecoHealth < 0.75
    : c === 'hot' ? st.indoorF > BAND[st.mode][1] + 1 : c === 'loop' ? s.clock.t < (st.loopDownUntil ?? 0) : c === 'stock' ? (st.stress ?? 0) > 0.25 : st.lockdown && !powered);
  return out;
}

// ── player controls ───────────────────────────────────────────────────────────────────────

/** Why the lockdown cannot be switched now (null = it can). `id` picks the dome (the main one if omitted). */
export function lockdownProblem(s: GameState, on: boolean, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  const st = stateOf(s, d);
  if (on && st.lockdown) return 'already sealed';
  if (!on && !st.lockdown) return 'already open';
  return null;
}

/** Seal the dome (airlocks shut, vents closed) or open it. Returns why not, or null. */
export function setLockdown(s: GameState, on: boolean, id?: string): string | null {
  const why = lockdownProblem(s, on, id);
  if (why) return why;
  const d = domeOf(s, id)!, st = ownState(s, d), nm = domesOf(s).length > 1 ? `The ${domeLabel(s, d).toLowerCase()}` : 'The dome';
  if (on) {
    st.lockdown = true; st.since = s.clock.t; st.co2ppm = freshAir().co2ppm; st.o2pct = freshAir().o2pct;
    const c = freshClock(s, d.st.id);
    log(s, `${nm} is sealed: airlocks shut, vents closed. ${c && c.hours !== Infinity ? `Sealed with ${peopleUnder(s, d)} people the air lasts about ${c.hours < 72 ? `${Math.floor(c.hours)} hours` : `${Math.floor(c.hours / 24)} days`}.` : 'The air will hold as long as the plant runs.'}`);
  } else {
    const dirt = outsideDirt(s);
    st.lockdown = false; st.since = null;
    log(s, dirt > 0.2 ? `${nm}'s airlocks are open with dust in the air outside: it is coming in, and the ground under the shell is no longer clean.` : `${nm} is open: vents and airlocks, fresh air.`);
  }
  return null;
}

export function setClimateMode(s: GameState, mode: ClimateMode, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  ownState(s, d).mode = mode;
  return null;
}

export interface FilterBill { level: Filtering; usd: number; permitUsd: number; reviewDays: number; installDays: number; totalUsd: number; days: number }

/** What an upgrade to `level` costs here: the equipment less half the credit for the level already owned, the county's life-safety review for the closed loop, and the days. */
export function filteringBill(s: GameState, level: Filtering, id?: string): FilterBill | null {
  const d = domeOf(s, id);
  if (!d || level === 'none') return null;
  const price = (l: Filtering): number => l === 'scrubber' ? scrubberUsd(d.tier, d.cells) : l === 'advanced' ? advancedFilterUsd(d.tier, d.cells) : l === 'closed' ? closedEcologyUsd(d.tier, d.cells) : 0;
  const owned = stateOf(s, d).filtering;
  const usd = Math.max(0, price(level) - (owned === 'none' ? 0 : Math.round(price(owned) * 0.5)));
  const permitUsd = level === 'closed' ? Math.round(usd * 0.05 / 1000) * 1000 : 0;
  const reviewDays = level === 'closed' ? Math.max(14, Math.round(TIER[d.tier].reviewDays / 3)) : 0;
  const installDays = LIVE.INSTALL_DAYS[level];
  return { level, usd, permitUsd, reviewDays, installDays, totalUsd: usd + permitUsd, days: reviewDays + installDays };
}

export function filteringProblem(s: GameState, level: Filtering, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  if (level === 'none') return 'nothing to buy';
  const st = stateOf(s, d);
  if (FILTERING.indexOf(st.filtering) >= FILTERING.indexOf(level)) return 'already fitted';
  if (st.installing) return 'another upgrade is being fitted';
  if (level === 'closed' && FILTERING.indexOf(st.filtering) < FILTERING.indexOf('advanced')) return 'the closed ecology needs the advanced air bank first';
  if (d.tier === 'earthen' && level !== 'scrubber') return 'an earthen dome is too small for that';
  const b = filteringBill(s, level, id)!;
  if (s.money < b.totalUsd) return `needs $${b.totalUsd.toLocaleString('en-US')}`;
  return null;
}

/** Buy a filtering level (or the closed ecology): the money goes now, the crew fits it over the days. */
export function buyFiltering(s: GameState, level: Filtering, id?: string): string | null {
  const why = filteringProblem(s, level, id);
  if (why) return why;
  const d = domeOf(s, id)!, b = filteringBill(s, level, id)!, st = ownState(s, d);
  s.money -= b.totalUsd;
  st.installing = { level, readyAt: s.clock.t + b.days };
  log(s, level === 'closed'
    ? `The closed ecology is ordered: the county reviews the life-safety plan for ${b.reviewDays} days, then the crew builds the loop for ${b.installDays}.`
    : `The ${level === 'scrubber' ? 'CO2 scrubbers' : 'advanced air bank'} are ordered: about ${b.days} days to fit.`);
  return null;
}

export function spareFiltersUsd(s: GameState, id?: string): number {
  const d = domeOf(s, id);
  return d ? Math.max(2000, Math.round(advancedFilterUsd(d.tier, d.cells) * LIVE.SPARE_SHARE / 500) * 500) : 0;
}
export function replaceFilters(s: GameState, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  const st = stateOf(s, d);
  if (st.filtering === 'none') return 'no filters fitted';
  if (st.filterHealth > 0.9) return 'the media is still good';
  const c = spareFiltersUsd(s, id);
  if (s.money < c) return `needs $${c.toLocaleString('en-US')}`;
  s.money -= c; ownState(s, d).filterHealth = 1;
  log(s, 'The filter media is swapped for a fresh set.');
  return null;
}

export function tendCostUsd(s: GameState, id?: string): number { const d = domeOf(s, id); return d ? Math.round(closedEcologyUsd(d.tier, d.cells) * 0.01 / 500) * 500 : 0; }
export function tendEcology(s: GameState, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  const st = stateOf(s, d);
  if (st.filtering !== 'closed') return 'no closed ecology';
  if (st.ecoHealth > 0.9) return 'the loop is healthy';
  const c = tendCostUsd(s, id);
  if (s.money < c) return `needs $${c.toLocaleString('en-US')}`;
  s.money -= c; ownState(s, d).ecoHealth = 1;
  log(s, 'The grow beds are replanted and treated: the loop is whole again.');
  return null;
}

/** The water loop's bill (the dome with this id, or the main one): null when nothing to buy. */
export function loopBill(s: GameState, level: WaterLoop, id?: string): { usd: number; days: number } | null {
  const d = domeOf(s, id);
  if (!d || level === 'none') return null;
  const own = stateOf(s, d).loop ?? 'none';
  const usd = Math.max(0, loopUsd(d.tier, d.cells, level) - (own === 'none' ? 0 : Math.round(loopUsd(d.tier, d.cells, own) * 0.5)));
  return { usd, days: level === 'grey' ? 5 : 21 };
}
export function loopProblem(s: GameState, level: WaterLoop, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  if (level === 'none') return 'nothing to buy';
  if (d.tier === 'earthen') return 'an earthen dome is too small for a water loop';
  const st = stateOf(s, d);
  if (WATER_LOOPS.indexOf(st.loop ?? 'none') >= WATER_LOOPS.indexOf(level)) return 'already fitted';
  const b = loopBill(s, level, id)!;
  if (s.money < b.usd) return `needs $${b.usd.toLocaleString('en-US')}`;
  return null;
}
/** Buy a water loop level: the money goes now and it works at once (the crew plumbs it while the dome runs). */
export function buyLoop(s: GameState, level: WaterLoop, id?: string): string | null {
  const why = loopProblem(s, level, id);
  if (why) return why;
  const d = domeOf(s, id)!, b = loopBill(s, level, id)!, st = ownState(s, d);
  s.money -= b.usd; st.loop = level; st.loopDownUntil = 0;
  log(s, level === 'grey' ? 'A graywater loop is plumbed in: sink and shower water goes to the beds and the toilets, and rain off the shell is filtered into the cisterns.' : 'A full recycle loop is plumbed in: the wastewater is treated and drunk again, and rain off the shell is filtered into the cisterns.');
  return null;
}

// ── the plant: a second unit (N+1) and the repair of what a raid, a fire or a storm broke (sim/dome/plantUnits.ts) ──

/** What a second unit of this kind costs on this dome (null: no spare for it). */
export function spareBill(s: GameState, kind: PlantKind, id?: string): number | null {
  const d = domeOf(s, id);
  return d ? spareUsd(d.tier, d.cells, kind, stateOf(s, d).filtering) : null;
}
export function sparesProblem(s: GameState, kind: PlantKind, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  const st = stateOf(s, d), why = spareProblem(d.tier, specOf(st), kind);
  if (why) return why;
  const c = spareUsd(d.tier, d.cells, kind, st.filtering);
  if (c !== null && s.money < c) return `needs $${c.toLocaleString('en-US')}`;
  return null;
}
/** Buy the second unit: the money goes now, the crew sets it in the same bay or pad within the day. */
export function buySpare(s: GameState, kind: PlantKind, id?: string): string | null {
  const why = sparesProblem(s, kind, id);
  if (why) return why;
  const d = domeOf(s, id)!, c = spareUsd(d.tier, d.cells, kind, stateOf(s, d).filtering) ?? 0, st = ownState(s, d);
  s.money -= c; st.spares = [...(st.spares ?? []), kind];
  log(s, `A second ${PLANT_SHORT[kind]} is set beside the first: if one is lost the other carries the dome.`);
  return null;
}
/** Pay a contractor to finish a plant repair now. */
export function rushPlantJob(s: GameState, jobId: string, id?: string): string | null {
  const d = domeOf(s, id);
  if (!d) return 'no dome stands finished yet';
  return rushPlant(s, d, stateOf(s, d), jobId);
}

/** Daily chance (Standard) that a storm's lightning or hail damages a plant unit that is not backed up. */
const P_STORM = 0.02;

// ── cards ─────────────────────────────────────────────────────────────────────────────────

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const repairUsd = (s: GameState, id?: string): number => { const d = domeOf(s, id); return d ? Math.max(3000, Math.round(advancedFilterUsd(d.tier, d.cells) * 0.2 / 500) * 500) : 0; };
const loopRepairUsd = (s: GameState, id?: string): number => { const d = domeOf(s, id); return d ? Math.max(2500, Math.round(loopUsd(d.tier, d.cells, stateOf(s, d).loop ?? 'grey') * 0.12 / 500) * 500) : 0; };

/** Decisions the dome puts on the Next-steps list (dispatched from disasterFx.fxCards). The main dome's ids are plain; another dome's carry `@structureId`. */
export function domeCards(s: GameState): FxCard[] {
  const out: FxCard[] = [], all = domesOf(s);
  all.forEach((d, i) => {
    const st = stateOf(s, d), sfx = i === 0 ? '' : `@${d.st.id}`, who = all.length > 1 ? ` (${domeLabel(s, d).toLowerCase()})` : '', id = d.st.id;
    for (const j of plantJobs(s, id)) {
      const q = rushQuote(d, st, j), ready = (j.readyDay ?? 0) <= dayIndex(s.clock.t);
      out.push({ id: `dome:plantjob:${j.id}${sfx}`, title: `${j.what ? j.what[0].toUpperCase() + j.what.slice(1) : 'A plant unit'} is ${j.cond === 'down' ? 'out' : 'damaged'}${who}`,
        why: `${j.cond === 'down' ? 'It is out' : 'It runs at half'}. ${ready ? 'The family is working on it.' : `The parts are on order (about ${Math.max(1, (j.readyDay ?? 0) - dayIndex(s.clock.t))} days).`}`, urgency: j.cond === 'down' ? 88 : 60, tone: j.cond === 'down' ? 'alarm' : undefined,
        acts: q === null ? [] : [{ label: `Rush a contractor · ${usd(q)}`, choice: `dome:rush:${j.id}${sfx}` }] } as FxCard);
    }
    for (const c of st.cards) {
      switch (c) {
        case 'foul': out.push({ id: `dome:foul${sfx}`, title: `The dome's filter media is fouled${who}`, why: `${Math.round(st.filterHealth * 100)} percent of the media is left, so the bank scrubs less every hour. A fresh set costs ${usd(spareFiltersUsd(s, id))}.`, urgency: 86, acts: [{ label: `Swap the media · ${usd(spareFiltersUsd(s, id))}`, choice: `dome:foul:swap${sfx}` }, { label: 'Run it dirty', choice: `dome:foul:ignore${sfx}` }] }); break;
        case 'plant': out.push({ id: `dome:plant${sfx}`, title: `The dome's air plant has seized${who}`, why: 'The blower stopped. Sealed, the air is running on the shell alone until it is back.', urgency: 94, tone: 'alarm', acts: [{ label: `Call the repair crew · ${usd(repairUsd(s, id))}`, choice: `dome:plant:crew${sfx}` }, { label: 'Rig a hand-crank blower', choice: `dome:plant:hand${sfx}` }, { label: 'Open the vents', choice: `dome:open${sfx}` }] }); break;
        case 'blight': out.push({ id: `dome:blight${sfx}`, title: `Blight in the closed ecology${who}`, why: `The loop is at ${Math.round(st.ecoHealth * 100)} percent. Below half it makes less air than the advanced bank alone.`, urgency: 84, acts: [{ label: `Replant and treat · ${usd(tendCostUsd(s, id))}`, choice: `dome:blight:tend${sfx}` }, { label: 'Let it recover on its own', choice: `dome:blight:wait${sfx}` }] }); break;
        case 'power': out.push({ id: `dome:power${sfx}`, title: `No power to the dome's air plant${who}`, why: 'Sealed with the plant dark, the air is on a clock. Fix the power, or open the vents before the fail-safe does.', urgency: 92, tone: 'alarm', acts: [{ label: 'Open the vents', choice: `dome:open${sfx}` }, { label: 'Hold sealed and ration the air', choice: `dome:power:hold${sfx}` }] }); break;
        case 'hot': {
          const dirty = outsideDirt(s) > 0.2, sealed = st.lockdown;
          out.push({ id: `dome:hot${sfx}`, title: `The dome is running hot${who}`, why: `${Math.round(st.indoorF)} F inside against a ${BAND[st.mode][1]} F ceiling. ${sealed ? 'Sealed, there are no vents to open, so the plant has to do it all.' : 'The vents and screens are doing what they can.'}${dirty ? ' There is dust outside: opening up lets it in.' : ''} Beds wilt and animals pant above 90 F.`, urgency: 82, tone: st.indoorF >= 98 ? 'alarm' : undefined,
            acts: [{ label: `Rent portable chillers for two days · ${usd(chillerUsd(s, d))}`, choice: `dome:hot:chill${sfx}` }, { label: sealed ? 'Open the vents and screens' : 'Roll the screens by hand and prop the doors', choice: `dome:hot:vent${sfx}` }, { label: 'Ride it out', choice: `dome:hot:wait${sfx}` }] });
          break;
        }
        case 'loop': out.push({ id: `dome:loop${sfx}`, title: `The dome's water loop has failed${who}`, why: 'A fouled membrane and a dead pump: the wastewater is backing up toward the sump, and the rain filter is bypassed. The cistern covers the household until it is fixed.', urgency: 76,
          acts: [{ label: `Call the plumber · ${usd(loopRepairUsd(s, id))}`, choice: `dome:loop:fix${sfx}` }, { label: 'Flush to the septic and wait it out', choice: `dome:loop:flush${sfx}` }] }); break;
        case 'stock': out.push({ id: `dome:stock${sfx}`, title: `The animals under the dome are stressed${who}`, why: `It is ${Math.round(st.indoorF)} F in the barn. Panting hens stop laying, and stressed goats and sheep take sick more easily. Electrolytes, shade and a visit from the vet cost ${usd(STOCK_CARE_USD)}.`, urgency: 70,
          acts: [{ label: `Electrolytes and a vet visit · ${usd(STOCK_CARE_USD)}`, choice: `dome:stock:care${sfx}` }, { label: 'Let them cope', choice: `dome:stock:wait${sfx}` }] }); break;
      }
    }
  });
  return out;
}

/** Answer a dome card's button. Null when the choice is not the dome's. */
export function domeChoose(s: GameState, choice: string): string | null {
  if (!choice.startsWith('dome:')) return null;
  const [head, at] = choice.split('@'), id = at || undefined;
  if (head.startsWith('dome:rush:')) { const w = rushPlantJob(s, head.slice(10), id); return w ?? 'A contractor finished the repair.'; }
  const d = domeOf(s, id);
  if (!d) return null;
  const st = stateOf(s, d);
  if (!s.domes?.[d.st.id] && s.dome !== st) return null;
  const drop = (c: LifeCard) => { const o = ownState(s, d); o.cards = o.cards.filter(x => x !== c); };
  switch (head) {
    case 'dome:foul:swap': { const w = replaceFilters(s, id); if (!w) drop('foul'); return w ?? 'The media is swapped.'; }
    case 'dome:foul:ignore': drop('foul'); return 'You leave it: the bank scrubs less until the media is changed.';
    case 'dome:plant:crew': { const c = repairUsd(s, id); if (s.money < c) return `needs ${usd(c)}`; s.money -= c; ownState(s, d).plantDownUntil = 0; drop('plant'); log(s, 'A repair crew drove out and had the blower running by evening.'); return 'The blower is running again.'; }
    case 'dome:plant:hand': { const o = ownState(s, d); o.plantDownUntil = Math.min(o.plantDownUntil, s.clock.t + 1.5); drop('plant'); log(s, 'The family rigged a hand-crank blower: it moves air, but somebody has to turn it. The plant is back in a day and a half.'); return 'A hand-crank blower will do until the plant is back.'; }
    case 'dome:open': { const w = setLockdown(s, false, d.st.id); drop('plant'); drop('power'); return w ?? 'The vents are open.'; }
    case 'dome:power:hold': drop('power'); return 'You hold sealed. Watch the clock.';
    case 'dome:blight:tend': { const w = tendEcology(s, id); if (!w) drop('blight'); return w ?? 'The beds are replanted.'; }
    case 'dome:blight:wait': drop('blight'); return 'You let the loop recover on its own.';
    case 'dome:hot:chill': { const c = chillerUsd(s, d); if (s.money < c) return `needs ${usd(c)}`; s.money -= c; ownState(s, d).chillUntil = s.clock.t + 2; drop('hot'); log(s, 'Portable chillers were trucked in and ducted through the airlocks: the air is coming down.'); return 'The chillers are running for two days.'; }
    case 'dome:hot:vent': { if (st.lockdown) setLockdown(s, false, d.st.id); drop('hot'); log(s, 'The screens are drawn and the doors are propped: all the air the shell can move.'); return 'The vents and screens are open.'; }
    case 'dome:hot:wait': drop('hot'); return 'You ride it out.';
    case 'dome:loop:fix': { const c = loopRepairUsd(s, id); if (s.money < c) return `needs ${usd(c)}`; s.money -= c; ownState(s, d).loopDownUntil = 0; drop('loop'); log(s, 'A plumber swapped the membrane and the pump: the loop is running again.'); return 'The loop is running again.'; }
    case 'dome:loop:flush': drop('loop'); return 'You flush to the septic and wait out the repair.';
    case 'dome:stock:care': { if (s.money < STOCK_CARE_USD) return `needs ${usd(STOCK_CARE_USD)}`; s.money -= STOCK_CARE_USD; ownState(s, d).stress = 0; drop('stock'); log(s, 'The vet came out and left electrolytes, shade cloth and a cooling schedule: the animals settled.'); return 'The animals settle.'; }
    case 'dome:stock:wait': drop('stock'); return 'You let them cope.';
    default: return null;
  }
}

// ── readers for the other systems ─────────────────────────────────────────────────────────

/** One dome as the Dome page and the board read it. */
export interface DomeView { ref: DomeRef; id: string; label: string; st: DomeState; people: number; homes: number; beds: number; main: boolean }
export function domeViews(s: GameState): DomeView[] {
  return domesOf(s).map((ref, i) => ({ ref, id: ref.st.id, label: domeLabel(s, ref), st: stateOf(s, ref), people: peopleUnder(s, ref), homes: homesUnder(s, ref), beds: bedsUnder(s, ref), main: i === 0 }));
}

/** The one board line for the air: the worst sealed dome with a short clock. Null when all is well. */
export function domeAirLine(s: GameState): { text: string; tone: 'warn' | 'bad' } | null {
  const all = domesOf(s);
  let worst: { d: DomeRef; st: DomeState } | null = null;
  for (const d of all) {
    const st = stateOf(s, d);
    if (!st.lockdown || st.alarm === 'ok') continue;
    if (!worst || (st.alarm === 'critical' && worst.st.alarm !== 'critical') || (st.alarm === worst.st.alarm && (st.hours ?? 0) < (worst.st.hours ?? 0))) worst = { d, st };
  }
  if (!worst) return null;
  const { d, st } = worst, h = st.hours === null ? 0 : Math.max(0, Math.floor(st.hours)), who = all.length > 1 ? `The sealed ${domeLabel(s, d).toLowerCase()}` : 'The sealed dome';
  if (!st.powered && st.filtering !== 'none') return { text: `${who}'s air plant has no power: about ${h} ${h === 1 ? 'hour' : 'hours'} of air`, tone: st.alarm === 'critical' ? 'bad' : 'warn' };
  return { text: `${who} has about ${h} ${h === 1 ? 'hour' : 'hours'} of air left`, tone: st.alarm === 'critical' ? 'bad' : 'warn' };
}

/** Is the ground under this dome's shell a clean zone (shell whole, nothing dusty let in)? With no id: any dome that is (the main one first). */
export function domeClean(s: GameState, id?: string): boolean {
  const ds = id ? [domeOf(s, id)].filter((x): x is DomeRef => !!x) : domesOf(s);
  return ds.some(d => !d.st.roofLost && stateOf(s, d).dust < LIVE.DIRTY);
}

/** What the domes change in a fallout day: the dose divisor for hours worked on the place, and the share of the food and water dose that remains. Null with no dome. The best clean dome counts. */
export function domeFalloutAdj(s: GameState): { outPf: number; foodK: number; clean: boolean } | null {
  const all = domesOf(s);
  if (!all.length) return null;
  const clean = all.filter(d => domeClean(s, d.st.id));
  if (!clean.length) return { outPf: 1.5, foodK: 1, clean: false };
  return { outPf: Math.max(1.5, ...clean.map(d => SHELL[d.tier].fallout_pf)), foodK: 0.2, clean: true };
}

/** The dome as a fallout shelter: [protection factor, name] for the best sealed, clean dome, else null. */
export function domeShelter(s: GameState): [number, string] | null {
  const ok = domesOf(s).filter(d => stateOf(s, d).lockdown && domeClean(s, d.st.id));
  if (!ok.length) return null;
  const best = ok.reduce((a, b) => SHELL[b.tier].fallout_pf > SHELL[a.tier].fallout_pf ? b : a);
  return [Math.max(1.5, SHELL[best.tier].fallout_pf), domesOf(s).length > 1 ? `the ${domeLabel(s, best).toLowerCase()}` : 'the dome'];
}

/** Fraction of the wood stove's work the domes save: homes under a powered, climate-held shell are mild. 1 = no saving. */
export function domeHeatK(s: GameState): number {
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind)).length;
  if (homes === 0) return 1;
  let saved = 0;
  for (const d of domesOf(s)) { const st = stateOf(s, d); if (st.powered) saved += homesUnder(s, d) * (st.mode === 'frost' ? 0.6 : 1); }
  return 1 - 0.5 * Math.min(1, saved / homes);
}

/** What the renderer shows inside the main dome: haze (CO2 and dust), sealed, plants (the closed loop's health). */
export function domeLook(s: GameState, id?: string): { sealed: boolean; haze: number; plants: number; dust: number; filtering: Filtering } {
  const d = domeOf(s, id);
  if (!d) return { sealed: false, haze: 0, plants: 0, dust: 0, filtering: 'none' };
  const st = stateOf(s, d);
  const co2 = Math.max(0, Math.min(1, (st.co2ppm - 1500) / (LIMIT_PPM.hard - 1500)));
  return { sealed: st.lockdown, haze: Math.max(co2 * 0.8, st.dust * 0.6), plants: st.filtering === 'closed' ? st.ecoHealth : 0, dust: st.dust, filtering: st.filtering };
}

/** The sealed-dome shelter facts the felt cards and the radio quote: any dome sealed, hours of air (the shortest), whether it is clean, and its filtering. */
export function domeShelterFacts(s: GameState): { count: number; sealed: boolean; clean: boolean; hours: number | null; filtering: Filtering; people: number } | null {
  const all = domesOf(s);
  if (!all.length) return null;
  const sealed = all.filter(d => stateOf(s, d).lockdown);
  const best = (sealed.length ? sealed : all).map(d => ({ d, st: stateOf(s, d), c: freshClock(s, d.st.id) })).sort((a, b) => (b.c?.hours ?? 0) - (a.c?.hours ?? 0))[0];
  const h = best.c && best.c.hours !== Infinity ? best.c.hours : null;
  return { count: all.length, sealed: sealed.length > 0, clean: all.some(d => domeClean(s, d.st.id)), hours: h, filtering: best.st.filtering, people: peopleUnder(s, best.d) };
}

