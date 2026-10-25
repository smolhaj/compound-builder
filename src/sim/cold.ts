/**
 * The cold (decided with the user: "Yes, cold hurts"). Pure.
 *
 * The night's low outside comes from the region's January low and its
 * seasonal swing (NOAA 1991–2020 normals for the region's homestead
 * country), less a nuclear, ash or impact winter. Indoors it is the stove's
 * warmth while there is firewood (or a powered furnace, or propane heaters
 * bought while the stores are open). With no heat the house holds a few
 * degrees above the outside low (body heat, thermal mass, insulation: a log
 * house or farmhouse more, a trailer or a tent hardly any); a bunker sits at
 * the ground's steady temperature whatever the season.
 *
 * Bedding warms the sleeper: everyone has blankets and quilts; a
 * cold-weather sleeping bag does far more. Below about 10 °C in bed, health
 * wears down a little a day, morale with it; babies, toddlers and the
 * elderly lose it about twice as fast. Below freezing in bed the body cools
 * night after night and hypothermia sets in after a few days: it takes
 * health fast, but warming up ends it in a day or two. A family with
 * blankets in one heated room is fine; an unheated cabin in a North Woods
 * January kills the old and the very young within a few weeks.
 */
import type { GameState } from './state';
import type { Needs } from './needs';
import type { Person } from './family';
import type { RegionId } from './regions';
import { calendarOf, dayIndex } from './state';
import { climate } from './effects';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { demandNow } from './heating';
import { snowedIn } from './weatherThreats';

/** Typical January night low (°C) and how much warmer the July low is. */
export const JAN_LOW_C: Record<RegionId, number> = { mountain_west: -12, appalachia: -4, desert: -3, north_woods: -18, plains: -11, pnw: 1, upper_midwest: -15 };
export const LOW_SWING_C: Record<RegionId, number> = { mountain_west: 21, appalachia: 20, desert: 20, north_woods: 30, plains: 28, pnw: 11, upper_midwest: 30 };
/** The ground's steady temperature (°C) a couple of meters down: about the year's mean air temperature. */
export const GROUND_C: Record<RegionId, number> = { mountain_west: 7, appalachia: 13, desert: 16, north_woods: 4, plains: 11, pnw: 10, upper_midwest: 7 };
/** Degrees an unheated house holds above the night's low outside (no tent: the camp). */
export const HOUSE_HOLDS_C: Record<string, number> = { log_house: 10, farmhouse: 9, timber_cabin: 8, cottage: 8, trailer: 4 };
export const CAMP_HOLDS_C = 2;
/** A heated room (°C), and what bedding adds in bed. */
export const HEATED_C = 18, BLANKETS_C = 5, SLEEPING_BAG_C = 12;
/** In-bed temperature below which the cold wears on health, and below which hypothermia builds. */
export const COLD_HARM_C = 10, HYPOTHERMIA_C = 0;
/** Health a day for each degree below COLD_HARM_C (an adult). */
export const COLD_HEALTH_PER_C = 0.18;
/** Propane heaters while the stores are open, at full demand ($ a day). */
export const PROPANE_USD = 6;

/** How much faster the cold (or thirst) takes someone: babies and the elderly first. */
export function frailty(p: Pick<Person, 'age' | 'kid'>, what: 'cold' | 'thirst'): number {
  if (what === 'cold') return p.age < 2 ? 2 : p.age < 6 ? 1.5 : p.age >= 75 ? 2 : p.age >= 65 ? 1.5 : 1;
  return p.age < 3 ? 1.6 : p.age < 10 ? 1.3 : p.age >= 75 ? 1.4 : p.age >= 65 ? 1.25 : 1;
}

/** Tonight's low outside (°C). */
export function outdoorLowC(s: GameState): number {
  const r = s.site.region, doy = calendarOf(s.clock).doy;
  const winter = 0.5 + 0.5 * Math.cos(2 * Math.PI * (doy - 15) / 365);
  return JAN_LOW_C[r] + LOW_SWING_C[r] * (1 - winter) - 25 * climate(s).cold - (snowedIn(s) ? 5 : 0);
}

export interface Shelter {
  /** Where the family sleeps, the temperature there tonight (°C), whether it's heated. */
  where: string; c: number; heated: boolean;
  /** The night's low outside. */
  outside: number;
  /** Sleeping bags to go round (the frailest get them first): person index → has one. */
  bag: Set<number>;
}

/** Is the house heated tonight: wood in the stove, a furnace on power, or propane bought in town. */
export function heatSource(s: GameState): 'stove' | 'furnace' | 'propane' | null {
  const day = dayIndex(s.clock.t);
  if (s.heat.warned < day - 1) return 'stove';
  const home = s.structures.find(x => isHome(x.kind) && isFinished(x));
  if (home && s.utilities.lit.includes(home.id) && s.utilities.grid && s.disaster.tracks.grid > 0.5) return 'furnace';
  // while the town works nobody freezes: propane heaters from the farm store, or (broke) energy assistance and the warming center
  if (s.disaster.tracks.stores > 0.5 && s.disaster.tracks.deliveries > 0.25) return 'propane';
  return null;
}

/**
 * Tonight's shelter, once a day before people are seen to: the warmest place
 * on the place, heated or not. Logs when a cold spell in the house begins
 * and pays for propane.
 */
export function shelterTonight(s: GameState, out: string[]): Shelter {
  const outside = outdoorLowC(s), day = dayIndex(s.clock.t);
  const fin = s.structures.filter(isFinished);
  const homes = fin.filter(x => isHome(x.kind)).sort((a, b) => (HOUSE_HOLDS_C[b.kind] ?? 0) - (HOUSE_HOLDS_C[a.kind] ?? 0));
  const home = homes[0];
  const label = home ? `the ${home.kind.replace(/_/g, ' ')}` : 'camp';
  const demand = demandNow(s);
  const src = demand > 0 ? heatSource(s) : 'stove';
  if (src === 'propane' && s.money > 0) s.money -= PROPANE_USD * demand;
  let best = { where: label, c: src ? Math.max(HEATED_C, outside) : outside + (home ? HOUSE_HOLDS_C[home.kind] ?? 6 : CAMP_HOLDS_C), heated: !!src };
  // the bunker holds the ground's temperature (plus the family's own warmth) whatever the season
  const bunker = fin.some(x => x.kind.startsWith('bunker_') && x.kind !== 'bunker_hatch' && x.kind !== 'bunker_stairs' && x.kind !== 'bunker_corridor');
  if (!best.heated && bunker && GROUND_C[s.site.region] + 3 > best.c) best = { where: 'the bunker', c: GROUND_C[s.site.region] + 3, heated: false };
  // a cold spell begins (said once, not every night)
  const cold = !best.heated && best.c < COLD_HARM_C;
  if (cold && (s.heat.cold ?? -1) < 0) { s.heat.cold = day; out.push(`No heat: ${Math.round(best.c)} °C in ${best.where} tonight (${Math.round(outside)} °C outside). Everyone sleeps together under every blanket.`); }
  else if (!cold && (s.heat.cold ?? -1) >= 0) { if (day - (s.heat.cold ?? day) > 2 && best.heated) out.push(`Warm again in ${best.where}.`); s.heat.cold = -1; }
  // sleeping bags to the frailest first
  const bags = Math.floor(s.stock.sleeping_bags ?? 0);
  const order = s.people.map((p, i) => ({ i, f: frailty(p, 'cold'), alive: s.personState[i]?.needs.died == null })).filter(x => x.alive).sort((a, b) => b.f - a.f);
  return { ...best, outside, bag: new Set(order.slice(0, bags).map(x => x.i)) };
}

const HYPO = 'hypothermia';
export const isColdHurt = (what: string) => what.startsWith(HYPO);

/** One person's night in the cold: returns the change to health today (needs.ts adds it); morale, hypothermia. */
export function coldDay(p: Person, i: number, n: Needs, sh: Shelter, out: string[]): number {
  const inBed = sh.c + (sh.bag.has(i) ? SLEEPING_BAG_C : BLANKETS_C);
  const f = frailty(p, 'cold');
  let dh = 0;
  // a cold house wears on everyone's spirits
  if (sh.c < 14) n.morale -= Math.min(2, 0.12 * (14 - sh.c));
  if (inBed < COLD_HARM_C) dh -= COLD_HEALTH_PER_C * (COLD_HARM_C - inBed) * f;
  // night after night below freezing in bed: the body loses heat it can't make up
  const chill0 = n.chill ?? 0;
  n.chill = inBed < HYPOTHERMIA_C ? chill0 + (HYPOTHERMIA_C - inBed) * 0.5 * f : Math.max(0, chill0 - (inBed >= 5 ? 10 : 2));
  const h = n.hurt.find(x => isColdHurt(x.what));
  if (n.chill >= 10) {
    const sev = Math.min(90, 20 + n.chill * 1.5);
    if (h) h.sev = sev;
    else { n.hurt.push({ what: `${HYPO}: shivering, slurred, clumsy`, sev }); out.push(`${p.first} is hypothermic: too cold for too many nights. They need a heated room.`); }
    dh -= sev / 30;
  } else if (h) {
    n.hurt = n.hurt.filter(x => x !== h);
    out.push(`${p.first} has warmed up.`);
  }
  return dh;
}
