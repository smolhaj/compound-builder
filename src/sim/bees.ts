/**
 * Beekeeping (docs/DECISIONS.md "Farm & kitchen, part 2"). Pure; the daily step is `beesDay`.
 *
 *  Apiary     the `apiary` kit piece holds four hives; bees come as a nucleus colony from the Shop in spring
 *             (`bee_nuc`) and are put in with the Stock button. `hive_supplies` (frames, mite strips, sugar)
 *             covers a year for all the hives.
 *  Forage     what the place gives them, 0.4–1.4: the garden, the orchard and the fields (beans, clover in
 *             the cover crop) bring bees; a wet region more than a dry one. The nectar flow is June to August.
 *  Colony     strength 0–1 builds from the first warm days (+0.02 a day) to a summer plateau; a strong colony
 *             makes ≈ 55 lb of surplus honey a year at forage 1, after the ≈ 55 lb of winter stores it must
 *             keep (more in a hard-winter region). Surplus is taken in late summer (day 245): honey into the
 *             pantry, a pound of wax for every 40 lb.
 *  Swarm      in May a strong colony may swarm (about 1 in 4; the beekeeper's attention halves it; a gardener of
 *             skill 4 catches 60 % of them into a new hive while there is room).
 *  Mites      varroa builds all summer (+0.25 % a day); the fall treatment (a year of `hive_supplies`) knocks
 *             it back to 10 %; untreated, a mite load over 0.6 kills the colony in winter.
 *  Winter     the spring check (day 90): each colony lives with a chance from its mites, its stores, its strength
 *             and the cold (about 80 % in a good year; the national average is 60 %), seeded per game and year.
 *  Bears      where bears live and the line is open, one can wipe out the hives in the active months.
 *  Pollination  with enough colonies the garden sets 10 % more and the orchard 18 % more (`pollination`).
 *  Care       the `bees` chore (Garden duty): weekly inspections, feeding, the mite treatment. Behind, swarms are
 *             likelier and the mites build faster (`beeCare`).
 */
import { calendarOf, type GameState } from './state';
import { isFinished } from './construction';

import { mulberry32 } from './rng';
import { log } from './economy';
import { logGate } from './nag';
import { addFood } from './pantry';
import { farmOf, finishedOf } from './farm';
import { ORCHARD_KINDS } from './greenhouse';
import { predatorSpecies, proof } from './wildlife';
import { regionFor } from './climate';

export interface Apiary {
  /** Colonies in the hives (0–4), their strength (0–1), the pounds of honey in the hives above what winter needs, and the stores. */
  colonies: number;
  strength: number;
  stores: number;
  surplus: number;
  /** Varroa load 0–1. */
  mites: number;
  /** Year the hives were treated, the honey was taken, the winter check was made. */
  treated: number;
  taken: number;
  checked: number;
  /** This year's honey taken (lb) and colonies lost over the winter / to swarms and bears, for the readout. */
  honeyYear: number;
  lostWinter: number;
  year: number;
}
export const HIVES = 4, WINTER_LB = 55, FLOW_LB = 55;
export const newApiary = (): Apiary => ({ colonies: 0, strength: 0.3, stores: 0, surplus: 0, mites: 0.05, treated: -1, taken: -1, checked: -1, honeyYear: 0, lostWinter: 0, year: 0 });
export const apiaryOf = (s: GameState, id: string): Apiary => ((farmOf(s).apiaries ??= {})[id] ??= newApiary());
export const apiaries = (s: GameState) => finishedOf(s, 'apiary');
const stock = (s: GameState, k: string): number => (s.stock as unknown as Record<string, number>)[k] ?? 0;

/** Days of the year the bees fly (the air warm enough): from the region's spring warmth to its fall cold. */
export function flightDays(s: GameState): [number, number] {
  const [last, first] = regionFor(s.site).frost;
  return [last - 20, first + 25];
}
export const flying = (s: GameState): boolean => { const d = calendarOf(s.clock).doy, [a, b] = flightDays(s); return d >= a && d <= b; };

/** What the place gives the bees (0.4–1.4). */
export function forage(s: GameState): number {
  const fin = s.structures.filter(isFinished), n = (k: string) => fin.filter(x => x.kind === k).length;
  const wet = Math.min(1.3, Math.max(0.6, regionFor(s.site).rainMm / 900));
  return Math.max(0.4, Math.min(1.4, (0.55 + 0.08 * n('garden') + 0.14 * fin.filter(x => ORCHARD_KINDS.includes(x.kind)).length + 0.05 * n('field')) * wet + 0.1 * Math.min(1, s.site.timber / 1.2)));
}
/** The share of the nectar flow a day of the year is (June to August peak). */
export function flow(s: GameState, doy = calendarOf(s.clock).doy): number {
  const [a, b] = flightDays(s);
  if (doy < a || doy > b) return 0;
  const mid = 175 + (regionFor(s.site).frost[0] - 140) * 0.3;
  return Math.max(0.1, Math.min(1, 1 - Math.abs(doy - mid) / 70));
}
/** Stores a colony needs to see out the winter (lb): more where winters are long. */
export const winterNeed = (s: GameState): number => Math.round(WINTER_LB * (0.8 + 0.3 * regionFor(s.site).cold));

export const colonyCount = (s: GameState): number => apiaries(s).reduce((a, st) => a + apiaryOf(s, st.id).colonies, 0);
export const healthyColonies = (s: GameState): number => apiaries(s).reduce((a, st) => { const p = apiaryOf(s, st.id); return a + (p.strength >= 0.4 ? p.colonies : 0); }, 0);

/** The garden's and the orchard's pollination bonus: 1 with no bees (wild pollinators carry the usual crop). */
export function pollination(s: GameState): { garden: number; orchard: number } {
  const fin = s.structures.filter(isFinished);
  const gardens = fin.filter(x => x.kind === 'garden').length, orchards = fin.filter(x => ORCHARD_KINDS.includes(x.kind)).length;
  const need = gardens * 0.5 + orchards * 1;
  if (need <= 0 || !flying(s)) return { garden: 1, orchard: 1 };
  const x = Math.min(1, healthyColonies(s) / need);
  return { garden: 1 + 0.1 * x, orchard: 1 + 0.18 * x };
}

/** The `bees` chore's growth a day: inspections in the flying season, the fall treatment. */
export function beeRate(s: GameState): number {
  const c = colonyCount(s);
  return c > 0 && flying(s) ? Math.min(20, 5 + 3 * c) : 0;
}
/** How well the hives are kept (1 = inspected; down to a half when the chore is badly behind). */
export const beeCare = (s: GameState): number => 1 - 0.5 * Math.max(0, Math.min(1, (((s.daily?.chores.levels as Record<string, number> | undefined)?.bees ?? 0) - 30) / 70));

/** Why a colony cannot go in now (null = it can). */
export function stockProblem(s: GameState, id: string): string | null {
  const st = apiaries(s).find(x => x.id === id);
  if (!st) return 'the apiary is not finished';
  if (stock(s, 'bee_nuc') < 1) return 'no colony: buy a nucleus in the Shop (Food & farm)';
  if (apiaryOf(s, id).colonies >= HIVES) return `the apiary holds ${HIVES} hives`;
  const { doy } = calendarOf(s.clock), [a, b] = flightDays(s);
  if (doy < a - 10 || doy > b - 60) return 'bees go in in spring, when the first flowers are out';
  return null;
}
export function stockApiary(s: GameState, id: string): string | null {
  const why = stockProblem(s, id);
  if (why) return why;
  const p = apiaryOf(s, id);
  (s.stock as unknown as Record<string, number>).bee_nuc -= 1;
  const n = p.colonies;
  p.strength = (p.strength * n + 0.3) / (n + 1);
  p.mites = (p.mites * n + 0.05) / (n + 1);
  p.stores = (p.stores * n + 15) / (n + 1);
  p.colonies += 1;
  log(s, 'A colony of bees went into the hive. They will build up through the spring.');
  return null;
}

/** Why the honey cannot be taken now (null = it can). */
export function harvestProblem(s: GameState, id: string): string | null {
  const p = apiaryOf(s, id);
  if (p.colonies < 1) return 'no bees in this apiary';
  if (p.surplus < 8) return `only ${Math.floor(p.surplus)} lb above what the bees need for winter`;
  return null;
}
/** Take the surplus honey (the bees keep their winter stores): into the pantry, with the wax. */
export function harvestHoney(s: GameState, id: string): string | null {
  const why = harvestProblem(s, id);
  if (why) return why;
  const p = apiaryOf(s, id), lb = p.surplus;
  p.surplus = 0; p.honeyYear += lb; p.taken = calendarOf(s.clock).year;
  addFood(s, 'honey', lb / 12);
  (s.stock as unknown as Record<string, number>).beeswax = stock(s, 'beeswax') + lb / 40;
  log(s, `Took ${Math.round(lb)} lb of honey from the hives (${Math.floor(lb / 12 * 10) / 10} gallons) and ${Math.round(lb / 40 * 10) / 10} lb of wax. The bees keep their winter stores.`);
  return null;
}

/** Everything the apiary panel shows. */
export interface ApiaryReport { colonies: number; strength: number; stores: number; need: number; surplus: number; mites: number; honeyYear: number; treated: boolean; forage: number; flying: boolean; lostWinter: number; notes: string[] }
export function apiaryReport(s: GameState, id: string): ApiaryReport {
  const p = apiaryOf(s, id), year = calendarOf(s.clock).year, notes: string[] = [];
  const need = winterNeed(s) * p.colonies;
  if (p.colonies > 0 && p.mites > 0.5 && p.treated !== year) notes.push('The mite load is high. Treat in the fall (a year of hive supplies) or lose the colonies this winter.');
  if (p.colonies > 0 && stock(s, 'hive_supplies') < 1 && p.treated !== year) notes.push('No hive supplies: no mite strips for the fall.');
  if (p.colonies > 0 && p.stores * p.colonies < need * 0.7 && !flying(s)) notes.push('Light on winter stores: they may starve before spring.');
  if (!proof(s, 'predators').closed && predatorSpecies(s).includes('bear')) notes.push('Bears live here and the line is open: a bear can wipe out the hives.');
  return { colonies: p.colonies, strength: p.strength, stores: p.stores * p.colonies, need, surplus: p.surplus, mites: p.mites, honeyYear: p.honeyYear, treated: p.treated === year, forage: forage(s), flying: flying(s), lostWinter: p.lostWinter, notes };
}

/** Once a day: the colonies build, make honey, swarm, take mites; the fall treatment; the spring check. Returns log lines. */
export function beesDay(s: GameState): string[] {
  const out: string[] = [];
  const { doy, year } = calendarOf(s.clock), day = Math.floor(s.clock.t + 0.25);
  const care = beeCare(s), F = forage(s), fl = flow(s), [a] = flightDays(s);
  for (const st of apiaries(s)) {
    const p = apiaryOf(s, st.id);
    if (p.year !== year) { p.year = year; p.honeyYear = 0; p.lostWinter = 0; }
    if (p.colonies <= 0) continue;
    const r = mulberry32(s.seed * 7151 + day * 41 + st.id.length * 13 + p.colonies);
    const active = flying(s);
    // building up and the plateau; the cold months the cluster holds on
    if (active) p.strength = Math.min(1, p.strength + (doy < 170 ? 0.02 : 0.004) - (fl <= 0.1 ? 0.01 : 0));
    else p.strength = Math.max(0.2, p.strength - 0.002);
    // nectar: the flow feeds the stores first, then the surplus
    if (active && fl > 0) {
      const lb = 2.2 * fl * p.strength * F * care * p.colonies;
      const fill = Math.max(0, winterNeed(s) * p.colonies - p.stores * p.colonies);
      const toStores = Math.min(lb, fill);
      p.stores += toStores / p.colonies;
      p.surplus += lb - toStores;
    }
    // they eat their stores in the cold months and the dearth
    if (!active) p.stores = Math.max(0, p.stores - (winterNeed(s) / 200));
    // mites build all summer
    if (active) p.mites = Math.min(1, p.mites + 0.0025 * (care < 1 ? 1.5 : 1));
    // May swarms
    if (doy >= 130 && doy <= 160 && p.strength > 0.8 && p.colonies < HIVES + 1 && r() < 0.012 * (care < 0.8 ? 2 : 1)) {
      p.strength = 0.5;
      const catches = Math.max(0, ...s.people.filter((q, i) => !q.kid && s.personState[i]?.needs.died == null).map(q => q.skills.gardener)) >= 4 && r() < 0.6;
      if (catches && p.colonies < HIVES) { p.colonies += 1; out.push('A swarm came off the hives and clustered in the apple tree: it was caught and put in a new hive.'); }
      else { out.push('A swarm went over the fence and into the woods. Half the colony went with it.'); }
    }
    // the fall treatment (day 255)
    if (doy === 255 && p.treated !== year) {
      if (stock(s, 'hive_supplies') >= 1) { (s.stock as unknown as Record<string, number>).hive_supplies -= 1; p.mites = Math.min(p.mites, 0.1); p.treated = year; out.push('Treated the hives for mites and fed the light ones: the bees go into fall clean.'); }
      else if (logGate(s, 'no-hive-supplies', 300)) out.push('No hive supplies for the fall mite treatment: the mites will take the hives this winter.');
    }
    // honey, taken late summer by the family (day 245), as long as they are not behind on the hives
    if (doy === 245 && p.taken !== year && p.surplus >= 8) { harvestHoney(s, st.id); }
    // bears
    if (active && p.colonies > 0 && !proof(s, 'predators').closed && predatorSpecies(s).includes('bear') && r() < 0.002) {
      out.push(`A bear tore the apiary apart in the night: ${p.colonies} colon${p.colonies === 1 ? 'y' : 'ies'} gone, the honey eaten.`);
      p.colonies = 0; p.surplus = 0; p.stores = 0;
      continue;
    }
    // the spring check: who lived
    if (doy === a - 5 && p.checked !== year) {
      p.checked = year;
      let lived = 0;
      const n = p.colonies;
      for (let k = 0; k < n; k++) {
        const stores = Math.min(1, p.stores / winterNeed(s));
        const cold = Math.max(0, regionFor(s.site).cold - 1);
        const live = Math.max(0.05, Math.min(0.95, 0.9 - 0.55 * Math.max(0, p.mites - 0.15) - 0.35 * (1 - stores) - 0.12 * cold - 0.15 * (1 - Math.min(1, p.strength / 0.6))));
        if (r() < live) lived++;
      }
      p.lostWinter = n - lived; p.colonies = lived;
      p.stores = Math.max(8, p.stores * 0.3); p.strength = 0.35; p.mites = Math.min(p.mites, 0.2);
      out.push(n === lived ? `All ${n} colonies came through the winter.` : `${lived} of ${n} colonies came through the winter${p.mites > 0.5 ? ' (the mites, mostly)' : ''}.`);
    }
  }
  return out;
}
