/**
 * The greenhouse and the orchard (food, after the user's reference photo:
 * a glass greenhouse by the raised beds, a block of fruit trees). Pure.
 *
 *  Greenhouse  a 12 × 24 ft hobby greenhouse (aluminum frame, twin-wall
 *              polycarbonate). With one finished, the garden starts six weeks
 *              earlier and runs six weeks later (transplants started under
 *              glass, a cold frame over the late beds), and its peak is 15 %
 *              higher (stronger seedlings). Through the cold months (October
 *              to April) its benches grow winter greens: ≈ 600 kcal a day
 *              where winters are like the Mountain West's, more where they're
 *              mild, less under heavy snow unless it has power for a heater.
 *  Heated      a 9 × 24 m production greenhouse (`greenhouse_heated`, ≈ 8 times the glass): benches of
 *  greenhouse  greens, tomatoes and starts through the cold months, ≈ 4,200 kcal a day when it is
 *              warm; the garden runs 10 weeks longer and the peak is 30 % higher. It is heated either
 *              by electric heat from the compound's power (up to ≈ 34 kWh a day in a hard January,
 *              the load the solar farm is sized for) or by a wood boiler (≈ 0.09 rick a day at full
 *              demand): the player picks, and it falls back to wood when the power fails. Cold and
 *              unheated, the benches freeze back to a third of that. Tended by the Garden duty.
 *  Orchard     twelve semi-dwarf apple, peach and pear trees (`orchard`), or forty-eight on a big
 *              plot (`orchard_grove`). Nothing for
 *              three years after planting, then a quarter, half, three
 *              quarters and from year six the full crop: ≈ 150 lb a tree,
 *              1,800 lb ≈ 900,000 kcal a year, picked August to October into
 *              fresh (the cellar keeps it). A late spring frost on the
 *              blossom takes the whole year's crop about one year in six
 *              (seeded per year). Pruning is a winter chore (the Garden / Fields duty): if the backlog
 *              is high when the buds break the trees bear a fifth less that year. Pests (codling moth,
 *              fire blight) come in some years, worse in neglected trees; hens under the trees help.
 *              The fruit goes in as fresh food: the cellar keeps it, and what the family cannot eat
 *              in five days the kitchen puts up as jars (sim/needs.ts), cooking hours permitting.
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { REGIONS, seasons } from './regions';
import { mulberry32 } from './rng';
import { climate } from './effects';
import { burnRick } from './upkeep';
import { heatDemand } from './heating';
import { farmOf, greenhouseCareOf, orchardCareOf } from './farm';

/** Days the greenhouse moves the garden's start earlier and its end later. */
export const GREENHOUSE_EXTEND = 42;
/** Garden peak with greenhouse-started seedlings. */
export const GREENHOUSE_PEAK = 1.15;
/** Winter greens a greenhouse grows a day in a Mountain West winter (kcal). */
export const GREENS_KCAL = 600;
/** An orchard at full bearing (kcal a year): 12 trees × 150 lb ≈ 1,800 lb of fruit at ≈ 500 kcal a lb. */
export const ORCHARD_KCAL = 900_000;
/** Picking season (day of year): August 1 to October 31. */
export const ORCHARD_PICK: [number, number] = [213, 305];
/** Chance a year's blossom is lost to a late frost. */
export const ORCHARD_FROST = 1 / 6;

const finished = (s: GameState, ...kinds: string[]): Structure[] => s.structures.filter(st => kinds.includes(st.kind) && isFinished(st));

/** The two glasshouse tiers: the 12 × 24 ft hobby kit and the 9 × 24 m production house. */
export const GH_KINDS = ['greenhouse', 'greenhouse_heated'] as const;
export const GH_TIER: Record<string, { name: string; kcal: number; extend: number; peak: number }> = {
  greenhouse: { name: 'Greenhouse', kcal: GREENS_KCAL, extend: GREENHOUSE_EXTEND, peak: GREENHOUSE_PEAK },
  greenhouse_heated: { name: 'Heated greenhouse', kcal: 4200, extend: 70, peak: 1.3 },
};
/** Wood a heated greenhouse burns at full demand (ricks a day), and the power it draws (kWh a day: base and per unit of demand). */
export const GH_WOOD_RICKS = 0.09, GH_BASE_KWH = 4, GH_HEAT_KWH = 30;

export const greenhouses = (s: GameState): Structure[] => finished(s, ...GH_KINDS);
export const hasGreenhouse = (s: GameState) => greenhouses(s).length > 0;

/** The garden's season (day of year), stretched by the best finished greenhouse. */
export function gardenSeason(s: GameState): [number, number] {
  const [g0, g1] = seasons(REGIONS[s.site.region]).garden;
  const x = Math.max(0, ...greenhouses(s).map(st => GH_TIER[st.kind].extend));
  return x > 0 ? [g0 - x, g1 + x] : [g0, g1];
}

/** The garden's peak, raised by the best greenhouse's strong seedlings (1 with none). */
export const greenhousePeak = (s: GameState): number => Math.max(1, ...greenhouses(s).map(st => GH_TIER[st.kind].peak));

/** The cold months the greenhouse benches are in greens (October through April). */
export const inGreensSeason = (doy: number) => doy >= 274 || doy <= 120;

/** How a region's winter sets the greens: mild winters more, heavy snow less (unless the greenhouse is heated). */
export function greensFactor(cold: number, heated: boolean): number {
  if (cold <= 1) return 1 + 0.6 * (1 - cold);
  return heated ? 1 : Math.max(0.3, 1 - 0.6 * (cold - 1));
}

/** Today's cold the heater has to meet: 0 in summer, about 1 in a Mountain West January, up to 2 in a snap. */
export function heatNeed(s: GameState): number {
  return Math.max(0, Math.min(2, heatDemand(calendarOf(s.clock).doy) * REGIONS[s.site.region].cold + climate(s).cold));
}

/** A greenhouse's power draw today (kWh): the hobby house's fans, or the production house's fans plus electric heat. */
export function greenhouseKwh(s: GameState, st: Structure): number {
  if (st.kind !== 'greenhouse_heated') return 1;
  return greenhouseCareOf(s, st.id).heat === 'wood' ? GH_BASE_KWH * 0.6 : GH_BASE_KWH + GH_HEAT_KWH * heatNeed(s);
}

/** Is this greenhouse warm for the winter benches? (the hobby house: powered; the production house: its boiler or heater worked yesterday) */
export function isHeated(s: GameState, st: Structure): boolean {
  return st.kind === 'greenhouse_heated' ? greenhouseCareOf(s, st.id).heated : s.utilities.lit.includes(st.id);
}

/** Winter greens from the greenhouses today (kcal, before the climate and the tending chore). */
export function greenhouseGreens(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  if (!inGreensSeason(doy)) return 0;
  const cold = REGIONS[s.site.region].cold;
  return greenhouses(s).reduce((a, st) => a + GH_TIER[st.kind].kcal * greensFactor(cold, isHeated(s, st)), 0);
}

/**
 * Once a day: the production greenhouses' heat. Electric (when the heater has power) or wood (a
 * boiler that burns ricks); with the power out it falls back to wood, and with no wood the benches
 * freeze back. Returns log lines.
 */
export function greenhouseDay(s: GameState): string[] {
  const out: string[] = [];
  const need = heatNeed(s), day = Math.floor(s.clock.t);
  for (const st of finished(s, 'greenhouse_heated')) {
    const c = greenhouseCareOf(s, st.id), was = c.by;
    if (need < 0.08) { c.heated = true; c.by = 'none'; continue; }
    if (c.heat === 'electric' && s.utilities.lit.includes(st.id)) { c.heated = true; c.by = 'electric'; }
    else {
      c.burned += GH_WOOD_RICKS * need;
      let ok = true;
      while (c.burned >= 1) { if (!burnRick(s)) { ok = false; c.burned = 1; break; } c.burned -= 1; }
      c.heated = ok; c.by = ok ? 'wood' : 'none';
      if (!ok && day - c.warned > 6) { c.warned = day; out.push('The greenhouse boiler is out of wood: the benches will freeze back.'); }
    }
    if (c.by !== was && c.by === 'wood' && c.heat === 'electric') out.push('The greenhouse heater has no power: the boiler is burning wood instead.');
  }
  return out;
}

/** Winter greens, the garden and the extra from the greenhouse tiers are summed in needs.ts. */

/** Fruit trees in an orchard kind (a grove is four plots). */
export const ORCHARD_TREES: Record<string, number> = { orchard: 12, orchard_grove: 48 };
export const ORCHARD_KINDS = Object.keys(ORCHARD_TREES);

/** How much of a full crop an orchard planted (finished) `years` ago bears: nothing for three years, full from the sixth. */
export function orchardBearing(years: number): number {
  if (years < 3) return 0;
  return Math.min(1, (Math.floor(years) - 2) / 4);
}

/** Did a late spring frost take this year's fruit? (Seeded per game and year: about one in six.) */
export function orchardFrost(seed: number, year: number): boolean {
  return mulberry32(seed * 7919 + year * 104_729 + 31)() < ORCHARD_FROST;
}

/** The day's fruit from the orchards (kcal, before the climate, pests and pruning). */
export function orchardHarvest(s: GameState): number {
  const { doy, year } = calendarOf(s.clock);
  if (doy < ORCHARD_PICK[0] || doy >= ORCHARD_PICK[1] || orchardFrost(s.seed, year)) return 0;
  const perDay = ORCHARD_KCAL / (ORCHARD_PICK[1] - ORCHARD_PICK[0]);
  return finished(s, ...ORCHARD_KINDS).reduce((a, st) => a + perDay * ORCHARD_TREES[st.kind] / 12 * orchardBearing((s.clock.t - (st.finishedAt ?? s.clock.t)) / 365), 0);
}

/** This year's pest: nothing in most years, codling moth in some, fire blight in a few (seeded per game and year). */
export function orchardPest(seed: number, year: number): { name: string; loss: number } {
  const r = mulberry32(seed * 6089 + year * 7717 + 13)();
  if (r < 0.55) return { name: 'none', loss: 0 };
  if (r < 0.85) return { name: 'codling moth', loss: 0.2 };
  return { name: 'fire blight', loss: 0.4 };
}

/** Share of the crop the pests take this year: halved by pruned trees (airy limbs), a fifth less with hens running under them. */
export function orchardPestLoss(s: GameState): number {
  const { year } = calendarOf(s.clock);
  const pest = orchardPest(s.seed, year).loss;
  if (pest <= 0) return 0;
  const pruned = !finished(s, ...ORCHARD_KINDS).some(st => orchardCareOf(s, st.id).unprunedYear === year);
  const hens = finished(s, 'chicken_coop').length > 0;
  return pest * (pruned ? 0.5 : 1) * (hens ? 0.8 : 1);
}

/** The orchards' fruit after pruning, pests: what the family picks (kcal a day; the tending chore is applied in needs.ts). */
export function orchardYield(s: GameState): number {
  const { year } = calendarOf(s.clock);
  const unpruned = finished(s, ...ORCHARD_KINDS).filter(st => orchardCareOf(s, st.id).unprunedYear === year);
  const all = finished(s, ...ORCHARD_KINDS);
  const base = orchardHarvest(s);
  if (base <= 0) return 0;
  const pruneFactor = all.length ? 1 - 0.2 * unpruned.length / all.length : 1;
  return base * pruneFactor * (1 - orchardPestLoss(s));
}

/** Day of the year the winter pruning is judged (the buds break) and the pest report is read. */
export const PRUNE_DAY = 95, PEST_DAY = 150;

/** Once a day: judge the pruning, read the pest report. `choreLevel` is the orchard chore backlog (0–100). Returns log lines. */
export function orchardDay(s: GameState, choreLevel: number): string[] {
  const out: string[] = [];
  const { doy, year } = calendarOf(s.clock);
  const mine = finished(s, ...ORCHARD_KINDS);
  if (!mine.length) return out;
  if (doy === PRUNE_DAY) {
    const missed = choreLevel >= 50;
    for (const st of mine) orchardCareOf(s, st.id).unprunedYear = missed ? year : -1;
    if (missed) out.push('The orchard went into bloom unpruned: crowded limbs, a lighter crop and more for the pests.');
  }
  if (doy === PEST_DAY) {
    const p = orchardPest(s.seed, year);
    if (p.name !== 'none' && mine.some(st => orchardBearing((s.clock.t - (st.finishedAt ?? s.clock.t)) / 365) > 0)) out.push(`${p.name[0].toUpperCase()}${p.name.slice(1)} is in the orchard this year${orchardPestLoss(s) < p.loss ? ' (the pruning and the hens are holding it down)' : ''}.`);
  }
  return out;
}

/** The chore backlogs the self-sufficient interior adds (sim/daily.ts `choreRates`): pruning and picking, the greenhouses, feeding the fish. */
export function selfSufficiencyRates(s: GameState, doy: number): { orchard: number; greenhouse: number; pond: number } {
  const orchards = finished(s, ...ORCHARD_KINDS).reduce((a, st) => a + ORCHARD_TREES[st.kind] / 12, 0);
  const prune = doy >= 15 && doy < PRUNE_DAY, pick = doy >= ORCHARD_PICK[0] && doy < ORCHARD_PICK[1];
  const houses = greenhouses(s);
  const [g0, g1] = gardenSeason(s);
  const gh = houses.reduce((a, st) => a + (st.kind === 'greenhouse_heated' ? 6 : 3), 0);
  const growing = (doy >= g0 && doy <= g1) || inGreensSeason(doy);
  const stocked = finished(s, 'pond').filter(st => { const p = farmOf(s).ponds[st.id]; return !!p && p.trout + p.crayfish > 0; }).length;
  return {
    orchard: prune || pick ? Math.min(14, 2.6 * Math.min(6, orchards)) : 0,
    greenhouse: growing ? Math.min(30, gh) : 0,
    pond: Math.min(24, 6 * stocked),
  };
}
