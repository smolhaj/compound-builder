/**
 * The dome as live game state (docs/DOME_COMPOUND.md 7.1 to 7.3, owner decisions of 2026-11-17 and 11-18): lockdown with a CO2 clock, paid air
 * filtering, the very expensive closed ecology, the dome's own climate and the clean zone under the shell.
 *
 * One dome runs the compound's air: the biggest finished enclosure (`domeOf`). `GameState.dome` holds the switches and the gauges (save v99,
 * optional: absent until the player touches the dome). The pure models are `air.ts` (the CO2 clock), `climate.ts` (kWh) and `protection.ts`;
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
import { nightOf, meanLow } from '../housing';
import { solarFogK } from '../fogFx';
import { powerOnPlace } from '../hookups';
import { DIFFICULTY } from '../difficulty';
import type { FxCard } from '../disasterFx';
import { TIER, shellFt, tierOfKind, tierRank, DOME_KINDS, type DomeTier } from './tiers';
import { domeGeometry } from './geometry';
import { SHELL } from './protection';
import { domeLoad, passiveF, type ClimateMode } from './climate';
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
  P_PLANT: 0.012, P_BLIGHT: 0.03,
  /** Days between two cards of one kind. */
  COOLDOWN: 6,
} as const;

export type LifeCard = 'foul' | 'plant' | 'blight' | 'power';
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
}

export const newDomeState = (): DomeState => ({
  lockdown: false, since: null, filtering: 'none', mode: 'frost', co2ppm: freshAir().co2ppm, o2pct: freshAir().o2pct, filterHealth: 1, ecoHealth: 1, dust: 0,
  plantDownUntil: 0, installing: null, cards: [], cool: {}, alarm: 'ok', hours: null, indoorF: 55, outF: 55, kwhDay: 0, powered: false, ventedAt: null,
});

/** What the dome has right now (a read: never creates the state). */
export const domeOfState = (s: GameState): DomeState => s.dome ?? newDomeState();

// ── which dome, who is inside ─────────────────────────────────────────────────────────────

export interface DomeRef { st: Structure; tier: DomeTier; cells: number; /** Shell radius, world units (1 unit = 20 ft). */ r: number; shellFt: number }

/** Footprint cells of the structure (the default size of its tier: the diameter handle is a later slice). */
export function domeOf(s: GameState): DomeRef | null {
  let best: DomeRef | null = null;
  for (const st of s.structures) {
    if (!DOME_KINDS.includes(st.kind) || !isFinished(st)) continue;
    const tier = tierOfKind(st.kind)!, cells = TIER[tier].cells;
    if (!best || tierRank(tier) > tierRank(best.tier)) best = { st, tier, cells, r: shellFt(tier, cells) / 2 / 20, shellFt: shellFt(tier, cells) };
  }
  return best;
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

// ── outside ───────────────────────────────────────────────────────────────────────────────

export interface Outside { f: number; sun: number; hour: number }
/** The temperature and the sun outside right now (U.S. degrees F): the night's low from the region and the day, a 22 degree swing to mid afternoon. */
export function outside(s: GameState): Outside {
  const hour = hourOf(s.clock.t), n = nightOf(s), doy = calendarOf(s.clock).doy;
  const swing = 22 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (hour - 5) / 24));
  const season = 0.55 + 0.45 * Math.cos(2 * Math.PI * (doy - 172) / 365);
  const day = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
  return { f: n.lowF + swing + (n.hot ? 12 : 0), sun: day * season * Math.min(1, solarFogK(s) * 1.5), hour };
}

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

/** The dome's draw a day (kWh): the climate plant on a typical day here plus the air plant while sealed. Read by utilities.ts. */
export function domeKwhDay(s: GameState, st: Structure): number {
  const tier = tierOfKind(st.kind);
  if (!tier) return 0;
  const d = domeOfState(s), cells = TIER[tier].cells;
  const low = meanLow(s, calendarOf(s.clock).doy);
  let clim = 0;
  for (const [h, sun] of [[2, 0], [8, 0.35], [14, 1], [20, 0]] as const) {
    const f = low + 22 * (0.5 - 0.5 * Math.cos(2 * Math.PI * (h - 5) / 24));
    clim += domeLoad(tier, cells, f, sun * 0.8, d.mode).kwhPerDay / 4;
  }
  const air = d.lockdown || d.filtering === 'closed' ? airPlantKw(tier, cells, d.filtering) * 24 : 0;
  // sealed on life support the climate plant only holds the shell (a quarter of its work): the air plant is what the compound's power must keep
  return Math.max(0.2, (d.lockdown && d.filtering !== 'none' ? clim * 0.25 : clim) + air);
}

/** Life support gets its power first while sealed; the climate alone is the last load served. */
export function domeLoadPriority(s: GameState, kind: string): number | null {
  if (!tierOfKind(kind)) return null;
  const d = s.dome;
  return d && (d.lockdown || d.filtering === 'closed') && d.filtering !== 'none' ? 1 : 5;
}

/** Is the air plant running: wired, on the load list's served side, not seized. */
export function planPowered(s: GameState, d: DomeRef, st: DomeState): boolean {
  if (s.clock.t < st.plantDownUntil) return false;
  if (!wired(s, d.st.id)) return false;
  if (s.utilities.report?.shed?.includes(d.st.id) || s.utilities.fried.includes(d.st.id)) return false;
  return powerOnPlace(s);
}

// ── the air ───────────────────────────────────────────────────────────────────────────────

/** Share of the incremental scrubbing a level does at a filter health (0.4 at a fouled set to 1 new), so the order none < scrubber < advanced < closed holds at any health. */
export const mediaK = (health: number): number => 0.4 + 0.6 * Math.max(0, Math.min(1, health));

export function airCtx(s: GameState, d: DomeRef, st: DomeState, powered = planPowered(s, d, st)): AirCtx {
  const eco = st.filtering === 'closed' ? Math.max(0, Math.min(1, st.ecoHealth)) : 0;
  // the closed loop's own beds work with no power too (they live on sun); its machinery needs the plant
  return { tier: d.tier, cells: d.cells, people: Math.max(0, peopleHome(s)), filtering: st.filtering, powered, beds: Math.min(BED_CAP, bedsUnder(s, d) + eco * BED_CAP), seals: 1 };
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

/** The clock from now: hours of air if nothing changes. */
export function domeClock(s: GameState): Clock | null {
  const d = domeOf(s);
  if (!d) return null;
  const st = domeOfState(s);
  const air = { co2ppm: st.co2ppm, o2pct: st.o2pct };
  return lockdownClock(air, airCtx(s, d, st));
}

/** The clock for a sealed dome from fresh air, at the current people, filtering and power (what the card says before sealing). */
export function freshClock(s: GameState): Clock | null {
  const d = domeOf(s);
  if (!d) return null;
  const st = domeOfState(s);
  return lockdownClock(freshAir(), airCtx(s, d, st));
}

// ── step ──────────────────────────────────────────────────────────────────────────────────

const difficultyOf = (s: GameState) => DIFFICULTY[s.disaster.difficulty ?? 'standard'];
/** How hard failures bite: 0.35 on Cozy, 1 on Standard, 1.4 on Hardcore. */
export const failScale = (s: GameState): number => ({ cozy: 0.35, standard: 1, hardcore: 1.4 } as const)[s.disaster.difficulty ?? 'standard'] * (difficultyOf(s) ? 1 : 1);

const FILTER_SHARE = (f: Filtering): number => SCRUB[f].co2;

/** One sub-step of the dome's gauges (`dtDays` of game time). Returns log lines. */
export function stepDome(s: GameState, dtDays: number): string[] {
  const d = domeOf(s);
  if (!d) { if (s.dome && (s.dome.lockdown || s.dome.alarm !== 'ok')) { s.dome.lockdown = false; s.dome.since = null; s.dome.alarm = 'ok'; s.dome.hours = null; } return []; }
  const out: string[] = [];
  const st = s.dome ??= newDomeState();
  const hrs = dtDays * 24;
  const powered = planPowered(s, d, st);
  st.powered = powered;
  const o = outside(s);
  st.outF = o.f;
  // the inside temperature: the climate plant holds the mode's band when it has power, else the shell floats
  const ld = domeLoad(d.tier, d.cells, o.f, o.sun, st.mode);
  st.indoorF = powered ? ld.indoorF : passiveF(d.tier, d.cells, o.f, o.sun);
  st.kwhDay = domeKwhDay(s, d.st);

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
    // the fail-safe vents
    if (st.co2ppm >= LIVE.VENT_PPM || st.o2pct <= LIVE.VENT_O2) {
      st.lockdown = false; st.since = null; st.ventedAt = s.clock.t;
      out.push(`The dome's fail-safe vents opened on their own: the air had gone bad (${(st.co2ppm / 10000).toFixed(1)} percent CO2, ${st.o2pct.toFixed(1)} percent oxygen). The lockdown is over.${dirt > 0.2 ? ' There is dust in the air outside, and it is coming in.' : ''}`);
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
  if (st.alarm !== before && st.alarm !== 'ok') out.push(st.alarm === 'critical' ? `The dome's air is nearly gone: about ${Math.max(0, Math.floor(st.hours ?? 0))} hours to the limit. Open the vents or fix the air plant.` : `The dome's air is getting short: about ${Math.floor(st.hours ?? 0)} hours left sealed.`);
  return out;
}

const raise = (_s: GameState, st: DomeState, kind: LifeCard, day: number): boolean => {
  if (st.cards.includes(kind) || day - (st.cool[kind] ?? -99) < LIVE.COOLDOWN) return false;
  st.cards.push(kind); st.cool[kind] = day; return true;
};

/** Once a day: installs finish, the loop is fed and pays its upkeep, the media and the machines fail now and then, and decisions are raised. Returns log lines. */
export function domeDay(s: GameState): string[] {
  const d = domeOf(s);
  if (!d) return [];
  const st = s.dome;
  if (!st) return [];
  const out: string[] = [], day = dayIndex(s.clock.t), r = mulberry32(s.seed * 7919 + day * 31 + 5), scale = failScale(s);
  // installs
  if (st.installing && s.clock.t >= st.installing.readyAt) {
    const lv = st.installing.level;
    st.filtering = lv; st.installing = null;
    if (lv === 'closed') st.ecoHealth = 1;
    st.filterHealth = 1;
    out.push(lv === 'closed' ? 'The closed ecology is planted and running: the loop will make the dome\'s air for as long as it is fed, powered and tended.' : `The ${lv === 'scrubber' ? 'CO2 scrubbers are' : 'advanced air bank is'} fitted and running.`);
  }
  const powered = planPowered(s, d, st);
  const people = peopleHome(s);
  // the closed ecology: upkeep, food, recovery, the dark
  if (st.filtering === 'closed') {
    const cost = Math.round(closedEcologyUsd(d.tier, d.cells) * LIVE.ECO_UPKEEP_DAY);
    if (s.money >= cost) { s.money -= cost; if (powered) st.ecoHealth = Math.min(1, st.ecoHealth + 0.02); }
    else { st.ecoHealth = Math.max(0, st.ecoHealth - 0.08); out.push('The closed ecology went without its upkeep today: seed, nutrients, parts. The loop is weakening.'); }
    if (!powered) st.ecoHealth = Math.max(0, st.ecoHealth - 0.03);
    if (st.ecoHealth > 0.2 && people > 0) s.stock.fresh += people * LIVE.ECO_FOOD * st.ecoHealth;
    if (r() < LIVE.P_BLIGHT * scale * (powered ? 1 : 1.6)) {
      st.ecoHealth = Math.max(0, st.ecoHealth - (0.25 + 0.25 * r()));
      if (raise(s, st, 'blight', day)) out.push('Blight in the closed ecology: leaves yellowing across the grow beds. The loop is losing ground.');
    }
  }
  // the machines
  if (st.filtering !== 'none' && powered && st.lockdown && r() < LIVE.P_PLANT * scale * (st.filtering === 'closed' ? 1.5 : 1)) {
    st.plantDownUntil = s.clock.t + 2 + Math.floor(r() * 3);
    if (raise(s, st, 'plant', day)) out.push('The air plant seized: the main blower stopped and the bank is dark.');
  }
  if (st.filtering !== 'none' && st.filterHealth < 0.35 && (st.lockdown || st.dust > 0.1)) if (raise(s, st, 'foul', day)) out.push('The filter media is fouled: the air bank is passing less every hour.');
  if (st.lockdown && st.filtering !== 'none' && !powered && st.alarm !== 'ok') if (raise(s, st, 'power', day)) out.push('The dome is sealed and the air plant has no power.');
  // a card whose cause is gone goes away
  st.cards = st.cards.filter(c => c === 'foul' ? st.filterHealth < 0.5 : c === 'plant' ? s.clock.t < st.plantDownUntil : c === 'blight' ? st.filtering === 'closed' && st.ecoHealth < 0.75 : st.lockdown && !powered);
  return out;
}

// ── player controls ───────────────────────────────────────────────────────────────────────

/** Why the lockdown cannot be switched now (null = it can). */
export function lockdownProblem(s: GameState, on: boolean): string | null {
  if (!domeOf(s)) return 'no dome stands finished yet';
  const st = domeOfState(s);
  if (on && st.lockdown) return 'already sealed';
  if (!on && !st.lockdown) return 'already open';
  return null;
}

/** Seal the dome (airlocks shut, vents closed) or open it. Returns why not, or null. */
export function setLockdown(s: GameState, on: boolean): string | null {
  const why = lockdownProblem(s, on);
  if (why) return why;
  const st = s.dome ??= newDomeState();
  if (on) {
    st.lockdown = true; st.since = s.clock.t; st.co2ppm = freshAir().co2ppm; st.o2pct = freshAir().o2pct;
    const c = freshClock(s);
    log(s, `The dome is sealed: airlocks shut, vents closed. ${c && c.hours !== Infinity ? `Sealed with ${peopleHome(s)} people the air lasts about ${c.hours < 72 ? `${Math.floor(c.hours)} hours` : `${Math.floor(c.hours / 24)} days`}.` : 'The air will hold as long as the plant runs.'}`);
  } else {
    const dirt = outsideDirt(s);
    st.lockdown = false; st.since = null;
    log(s, dirt > 0.2 ? 'The airlocks are open with dust in the air outside: it is coming in, and the ground under the shell is no longer clean.' : 'The dome is open: vents and airlocks, fresh air.');
  }
  return null;
}

export function setClimateMode(s: GameState, mode: ClimateMode): string | null {
  if (!domeOf(s)) return 'no dome stands finished yet';
  (s.dome ??= newDomeState()).mode = mode;
  return null;
}

export interface FilterBill { level: Filtering; usd: number; permitUsd: number; reviewDays: number; installDays: number; totalUsd: number; days: number }

/** What an upgrade to `level` costs here: the equipment less half the credit for the level already owned, the county's life-safety review for the closed loop, and the days. */
export function filteringBill(s: GameState, level: Filtering): FilterBill | null {
  const d = domeOf(s);
  if (!d || level === 'none') return null;
  const price = (l: Filtering): number => l === 'scrubber' ? scrubberUsd(d.tier, d.cells) : l === 'advanced' ? advancedFilterUsd(d.tier, d.cells) : l === 'closed' ? closedEcologyUsd(d.tier, d.cells) : 0;
  const owned = domeOfState(s).filtering;
  const usd = Math.max(0, price(level) - (owned === 'none' ? 0 : Math.round(price(owned) * 0.5)));
  const permitUsd = level === 'closed' ? Math.round(usd * 0.05 / 1000) * 1000 : 0;
  const reviewDays = level === 'closed' ? Math.max(14, Math.round(TIER[d.tier].reviewDays / 3)) : 0;
  const installDays = LIVE.INSTALL_DAYS[level];
  return { level, usd, permitUsd, reviewDays, installDays, totalUsd: usd + permitUsd, days: reviewDays + installDays };
}

export function filteringProblem(s: GameState, level: Filtering): string | null {
  const d = domeOf(s);
  if (!d) return 'no dome stands finished yet';
  if (level === 'none') return 'nothing to buy';
  const st = domeOfState(s);
  if (FILTERING.indexOf(st.filtering) >= FILTERING.indexOf(level)) return 'already fitted';
  if (st.installing) return 'another upgrade is being fitted';
  if (level === 'closed' && FILTERING.indexOf(st.filtering) < FILTERING.indexOf('advanced')) return 'the closed ecology needs the advanced air bank first';
  if (d.tier === 'earthen' && level !== 'scrubber') return 'an earthen dome is too small for that';
  const b = filteringBill(s, level)!;
  if (s.money < b.totalUsd) return `needs $${b.totalUsd.toLocaleString('en-US')}`;
  return null;
}

/** Buy a filtering level (or the closed ecology): the money goes now, the crew fits it over the days. */
export function buyFiltering(s: GameState, level: Filtering): string | null {
  const why = filteringProblem(s, level);
  if (why) return why;
  const b = filteringBill(s, level)!, st = s.dome ??= newDomeState();
  s.money -= b.totalUsd;
  st.installing = { level, readyAt: s.clock.t + b.days };
  log(s, level === 'closed'
    ? `The closed ecology is ordered: the county reviews the life-safety plan for ${b.reviewDays} days, then the crew builds the loop for ${b.installDays}.`
    : `The ${level === 'scrubber' ? 'CO2 scrubbers' : 'advanced air bank'} are ordered: about ${b.days} days to fit.`);
  return null;
}

export function spareFiltersUsd(s: GameState): number {
  const d = domeOf(s);
  return d ? Math.max(2000, Math.round(advancedFilterUsd(d.tier, d.cells) * LIVE.SPARE_SHARE / 500) * 500) : 0;
}
export function replaceFilters(s: GameState): string | null {
  const d = domeOf(s), st = domeOfState(s);
  if (!d) return 'no dome stands finished yet';
  if (st.filtering === 'none') return 'no filters fitted';
  if (st.filterHealth > 0.9) return 'the media is still good';
  const c = spareFiltersUsd(s);
  if (s.money < c) return `needs $${c.toLocaleString('en-US')}`;
  s.money -= c; (s.dome ??= newDomeState()).filterHealth = 1;
  log(s, 'The filter media is swapped for a fresh set.');
  return null;
}

export function tendCostUsd(s: GameState): number { const d = domeOf(s); return d ? Math.round(closedEcologyUsd(d.tier, d.cells) * 0.01 / 500) * 500 : 0; }
export function tendEcology(s: GameState): string | null {
  const st = domeOfState(s);
  if (st.filtering !== 'closed') return 'no closed ecology';
  if (st.ecoHealth > 0.9) return 'the loop is healthy';
  const c = tendCostUsd(s);
  if (s.money < c) return `needs $${c.toLocaleString('en-US')}`;
  s.money -= c; (s.dome ??= newDomeState()).ecoHealth = 1;
  log(s, 'The grow beds are replanted and treated: the loop is whole again.');
  return null;
}

// ── cards ─────────────────────────────────────────────────────────────────────────────────

const usd = (n: number): string => `$${Math.round(n).toLocaleString('en-US')}`;
const repairUsd = (s: GameState): number => { const d = domeOf(s); return d ? Math.max(3000, Math.round(advancedFilterUsd(d.tier, d.cells) * 0.2 / 500) * 500) : 0; };

/** Decisions the dome puts on the Next-steps list (dispatched from disasterFx.fxCards). */
export function domeCards(s: GameState): FxCard[] {
  const st = s.dome;
  if (!st?.cards.length || !domeOf(s)) return [];
  const out: FxCard[] = [];
  for (const c of st.cards) {
    switch (c) {
      case 'foul': out.push({ id: 'dome:foul', title: 'The dome\'s filter media is fouled', why: `${Math.round(st.filterHealth * 100)} percent of the media is left, so the bank scrubs less every hour. A fresh set costs ${usd(spareFiltersUsd(s))}.`, urgency: 86, acts: [{ label: `Swap the media · ${usd(spareFiltersUsd(s))}`, choice: 'dome:foul:swap' }, { label: 'Run it dirty', choice: 'dome:foul:ignore' }] }); break;
      case 'plant': out.push({ id: 'dome:plant', title: 'The dome\'s air plant has seized', why: 'The blower stopped. Sealed, the air is running on the shell alone until it is back.', urgency: 94, tone: 'alarm', acts: [{ label: `Call the repair crew · ${usd(repairUsd(s))}`, choice: 'dome:plant:crew' }, { label: 'Rig a hand-crank blower', choice: 'dome:plant:hand' }, { label: 'Open the vents', choice: 'dome:open' }] }); break;
      case 'blight': out.push({ id: 'dome:blight', title: 'Blight in the closed ecology', why: `The loop is at ${Math.round(st.ecoHealth * 100)} percent. Below half it makes less air than the advanced bank alone.`, urgency: 84, acts: [{ label: `Replant and treat · ${usd(tendCostUsd(s))}`, choice: 'dome:blight:tend' }, { label: 'Let it recover on its own', choice: 'dome:blight:wait' }] }); break;
      case 'power': out.push({ id: 'dome:power', title: 'No power to the dome\'s air plant', why: 'Sealed with the plant dark, the air is on a clock. Fix the power, or open the vents before the fail-safe does.', urgency: 92, tone: 'alarm', acts: [{ label: 'Open the vents', choice: 'dome:open' }, { label: 'Hold sealed and ration the air', choice: 'dome:power:hold' }] }); break;
    }
  }
  return out;
}

/** Answer a dome card's button. Null when the choice is not the dome's. */
export function domeChoose(s: GameState, choice: string): string | null {
  if (!choice.startsWith('dome:')) return null;
  const st = s.dome;
  if (!st) return null;
  const drop = (c: LifeCard) => { st.cards = st.cards.filter(x => x !== c); };
  switch (choice) {
    case 'dome:foul:swap': { const w = replaceFilters(s); if (!w) drop('foul'); return w ?? 'The media is swapped.'; }
    case 'dome:foul:ignore': drop('foul'); return 'You leave it: the bank scrubs less until the media is changed.';
    case 'dome:plant:crew': { const c = repairUsd(s); if (s.money < c) return `needs ${usd(c)}`; s.money -= c; st.plantDownUntil = 0; drop('plant'); log(s, 'A repair crew drove out and had the blower running by evening.'); return 'The blower is running again.'; }
    case 'dome:plant:hand': { st.plantDownUntil = Math.min(st.plantDownUntil, s.clock.t + 1.5); drop('plant'); log(s, 'The family rigged a hand-crank blower: it moves air, but somebody has to turn it. The plant is back in a day and a half.'); return 'A hand-crank blower will do until the plant is back.'; }
    case 'dome:open': { const w = setLockdown(s, false); drop('plant'); drop('power'); return w ?? 'The vents are open.'; }
    case 'dome:power:hold': drop('power'); return 'You hold sealed. Watch the clock.';
    case 'dome:blight:tend': { const w = tendEcology(s); if (!w) drop('blight'); return w ?? 'The beds are replanted.'; }
    case 'dome:blight:wait': drop('blight'); return 'You let the loop recover on its own.';
    default: return null;
  }
}

// ── readers for the other systems ─────────────────────────────────────────────────────────

/** The one board line for the air: a threat when the dome is sealed and the clock is short. Null when all is well. */
export function domeAirLine(s: GameState): { text: string; tone: 'warn' | 'bad' } | null {
  const st = s.dome;
  if (!st || !domeOf(s) || !st.lockdown || st.alarm === 'ok') return null;
  const h = st.hours === null ? 0 : Math.max(0, Math.floor(st.hours));
  if (!st.powered && st.filtering !== 'none') return { text: `The sealed dome's air plant has no power: about ${h} ${h === 1 ? 'hour' : 'hours'} of air`, tone: st.alarm === 'critical' ? 'bad' : 'warn' };
  return { text: `The sealed dome has about ${h} ${h === 1 ? 'hour' : 'hours'} of air left`, tone: st.alarm === 'critical' ? 'bad' : 'warn' };
}

/** Is the ground under the shell a clean zone (shell whole, nothing dusty let in)? */
export function domeClean(s: GameState): boolean {
  const d = domeOf(s);
  if (!d) return false;
  const st = domeOfState(s);
  return !d.st.roofLost && st.dust < LIVE.DIRTY;
}

/** What the dome changes in a fallout day: the dose divisor for hours worked on the place, and the share of the food and water dose that remains. Null with no dome. */
export function domeFalloutAdj(s: GameState): { outPf: number; foodK: number; clean: boolean } | null {
  const d = domeOf(s);
  if (!d) return null;
  const clean = domeClean(s);
  if (!clean) return { outPf: 1.5, foodK: 1, clean };
  return { outPf: Math.max(1.5, SHELL[d.tier].fallout_pf), foodK: 0.2, clean };
}

/** The dome as a fallout shelter: [protection factor, name] while it is sealed and clean, else null. */
export function domeShelter(s: GameState): [number, string] | null {
  const d = domeOf(s), st = s.dome;
  if (!d || !st?.lockdown || !domeClean(s)) return null;
  return [Math.max(1.5, SHELL[d.tier].fallout_pf), 'the dome'];
}

/** Fraction of the wood stove's work the dome saves: homes under a powered, climate-held shell are mild. 1 = no saving. */
export function domeHeatK(s: GameState): number {
  const d = domeOf(s), st = s.dome;
  if (!d || !st?.powered) return 1;
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind)).length;
  if (homes === 0) return 1;
  const under = homesUnder(s, d);
  return 1 - 0.5 * (under / homes) * (st.mode === 'frost' ? 0.6 : 1);
}

/** What the renderer shows inside: haze (CO2 and dust), sealed, plants (the closed loop's health). */
export function domeLook(s: GameState): { sealed: boolean; haze: number; plants: number; dust: number } {
  const st = s.dome;
  if (!st || !domeOf(s)) return { sealed: false, haze: 0, plants: 0, dust: 0 };
  const co2 = Math.max(0, Math.min(1, (st.co2ppm - 1500) / (LIMIT_PPM.hard - 1500)));
  return { sealed: st.lockdown, haze: Math.max(co2 * 0.8, st.dust * 0.6), plants: st.filtering === 'closed' ? st.ecoHealth : 0, dust: st.dust };
}
