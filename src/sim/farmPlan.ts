/**
 * The Farm tab's readouts (docs/DECISIONS.md "Farm & kitchen"): what to do this season, how long the stores
 * last and in what, what is about to spoil, and a Food plan that says where the year's food will come
 * from and what is missing. Pure; every number comes from the sims that own it.
 */
import { calendarOf, type GameState } from './state';
import { REGIONS, seasons } from './regions';
import { gardenSeason, ORCHARD_PICK, PRUNE_DAY, ORCHARD_KINDS, ORCHARD_TREES, orchardBearing, hasGreenhouse, inGreensSeason } from './greenhouse';
import { sowWindow, fieldsOf, fieldRows, seedOnHand, seedTarget, plotFor, gardensOf, seedsOf } from './crops';
import { bestGardener, FIELD_KCAL, KCAL, needOf } from './needs';
import { SOIL_YIELD } from './site';
import { pantryRows, FOOD } from './pantry';
import { cellarCapacity, cellarKcal, cellarTempC, binShrink, freshSpoilRate, overflow, hasCellar, pantryRoom, pantryLoad } from './storage';
import { capacities, freezerOn, hasCanner, hasKitchen, hasOven, kitchenOf, METHOD_NAME, type Capacity } from './kitchen';
import { cookRatio } from './daily';
import { isFinished } from './construction';
import { apiaries, apiaryOf, colonyCount, flightDays, winterNeed } from './bees';
import { hasMaples, sapSeason, tapsOut, woodsTaps } from './maple';
import { herdOf } from './herd';

export type Tone = 'good' | 'warn' | 'bad';
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
/** Month index (0–11) of a day of the year. */
export const monthOf = (doy: number): number => { let m = 11; while (m > 0 && doy < MONTH_START[m]) m--; return m; };
const wrap = (d: number) => ((d - 1) % 365 + 365) % 365 + 1;
export const dateText = (doy: number): string => `${MONTH_NAMES[monthOf(wrap(doy))]} ${wrap(doy) - MONTH_START[monthOf(wrap(doy))] + 1}`;

export type CalGroup = 'fields' | 'garden' | 'preserve' | 'animals' | 'wild';
export interface CalItem {
  id: string; group: CalGroup; label: string;
  /** Day of year, first and last (a span that crosses New Year has from > to). */
  from: number; to: number;
  /** What the family does, in a line. */
  note: string;
  /** Do we have what it needs (a field, a coop, a cellar…)? Items we cannot do are shown dim. */
  here: boolean;
}
const inSpan = (doy: number, from: number, to: number) => (from <= to ? doy >= from && doy <= to : doy >= from || doy <= to);

/** The year's farm and kitchen calendar for this place. */
export function calendar(s: GameState): CalItem[] {
  const r = REGIONS[s.site.region], se = seasons(r), [w0, w1] = sowWindow(s), [g0, g1] = gardenSeason(s);
  const fin = s.structures.filter(isFinished), has = (k: string) => fin.some(x => x.kind === k);
  const n = (k: string) => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);
  const orchards = fin.some(x => ORCHARD_KINDS.includes(x.kind)), animals = n('goat') + n('pig') + n('steer') + n('sheep') + n('rabbit') > 0;
  const cure = !!(s.pantry?.items.salt);
  const items: CalItem[] = [
    { id: 'sow', group: 'fields', label: 'Sow the fields', from: w0, to: w1, note: 'Seed goes in, manure and compost on. The Fields duty does the spring work; late sowing costs crop.', here: has('field') },
    { id: 'garden', group: 'garden', label: 'Garden in season', from: g0, to: g1, note: 'Weed, water, pick. Later sowings (successions) stretch it.', here: has('garden') },
    { id: 'harvest', group: 'fields', label: 'Harvest: potatoes, beans, wheat', from: se.harvest[0], to: se.harvest[1], note: 'The Fields duty digs and threshes; the first of it is next spring\'s seed. Potatoes go to the cellar bins.', here: has('field') },
    { id: 'prune', group: 'garden', label: 'Prune the orchard', from: 15, to: PRUNE_DAY, note: 'Before the buds break; an unpruned orchard bears a fifth less.', here: orchards },
    { id: 'pick', group: 'garden', label: 'Pick the orchard', from: ORCHARD_PICK[0], to: ORCHARD_PICK[1], note: 'Apples keep in the cellar; the rest is for jars and the dryer.', here: orchards },
    { id: 'greens', group: 'garden', label: 'Winter greens in the greenhouse', from: 274, to: 120, note: 'Benches of greens and starts through the cold months.', here: hasGreenhouse(s) },
    { id: 'canning', group: 'preserve', label: 'Jars, dryer and crocks', from: g0 + 30, to: se.harvest[1], note: 'Anything beyond five days\' eating is put by the day it comes in, while the cook has time.', here: hasKitchen(s) },
    { id: 'sun', group: 'preserve', label: 'Sun-drying weather', from: 140, to: 270, note: 'Screens in the sun on dry days, in jars by evening.', here: hasKitchen(s) },
    { id: 'cure', group: 'preserve', label: 'Curing weather', from: 285, to: 80, note: 'Cold enough to salt-cure pork and game safely (or any time in a cool cellar).', here: cure },
    { id: 'shear', group: 'animals', label: 'Shearing and lambing', from: 100, to: 130, note: 'A wool check, and about 1.3 lambs a ewe.', here: n('sheep') > 0 },
    { id: 'hay', group: 'animals', label: 'Put up hay', from: 150, to: 260, note: 'Buy the winter\'s hay at the fall cutting.', here: animals },
    { id: 'butcher', group: 'animals', label: 'Butchering', from: 305, to: 334, note: 'Pigs, surplus lambs and the steer go to the butcher; fat is rendered into lard.', here: n('pig') + n('steer') + n('sheep') > 0 },
    { id: 'eggs', group: 'animals', label: 'Hens lay best', from: 90, to: 250, note: 'About eight eggs a day from a dozen hens; three in midwinter.', here: has('chicken_coop') },
    { id: 'sap', group: 'garden', label: 'Sap runs: tap, gather, boil', from: sapSeason(s)[0], to: sapSeason(s)[1], note: 'Freeze-thaw days: gather the buckets and boil the same day, 40 gallons of sap to one of syrup.', here: hasMaples(s) && (has('sugar_shack') || n('maple_taps') > 0) },
    { id: 'bees', group: 'garden', label: 'Bees flying', from: flightDays(s)[0], to: flightDays(s)[1], note: 'Inspect weekly; a strong colony in May may swarm. The nectar flow is June to August.', here: apiaries(s).length > 0 },
    { id: 'honey', group: 'preserve', label: 'Honey off, hives treated for mites', from: 245, to: 258, note: 'Take the surplus (the bees keep their winter stores) and treat for mites before the cold.', here: colonyCount(s) > 0 },
    { id: 'kid', group: 'animals', label: 'Kidding and calving', from: 65, to: 100, note: 'Kids on the does, a calf on the cow; milk comes in. Keep the vet kit on the shelf.', here: n('goat') + n('cow') > 0 },
    { id: 'deer', group: 'wild', label: 'Deer season', from: 280, to: 330, note: 'In peacetime a tag; after the collapse, no seasons.', here: r.game.includes('deer') || r.game.includes('elk') },
    { id: 'fish', group: 'wild', label: 'Fishing season', from: 130, to: 300, note: 'A license in peacetime; the pond\'s crayfish are trapped May to October.', here: r.game.some(g => ['trout', 'bass', 'catfish', 'salmon', 'panfish'].includes(g)) || has('pond') },
  ];
  return items;
}

export interface Doing { item: CalItem; state: 'now' | 'soon' | 'later'; days: number }
/** What is on now, what starts within three weeks (for the "this season" list). */
export function thisSeason(s: GameState, horizon = 21): Doing[] {
  const { doy } = calendarOf(s.clock);
  const out: Doing[] = [];
  for (const it of calendar(s)) {
    if (!it.here) continue;
    if (inSpan(doy, it.from, it.to)) out.push({ item: it, state: 'now', days: 0 });
    else { const d = (it.from - doy + 365) % 365; if (d <= horizon) out.push({ item: it, state: 'soon', days: d }); }
  }
  return out.sort((a, b) => (a.state === b.state ? a.days - b.days : a.state === 'now' ? -1 : 1));
}

// ─────────────────────────────────────────────────────────────────────────
// Stores in days
// ─────────────────────────────────────────────────────────────────────────

export interface StoreLine { id: string; label: string; kcal: number; days: number; note: string | null; tone: Tone }
export interface Stores { needPerDay: number; lines: StoreLine[]; totalDays: number }

/** The family's food in kcal and days, by where it is kept. */
export function stores(s: GameState): Stores {
  const need = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
  const days = (k: number) => (need > 0 ? k / need : Infinity);
  const rows = pantryRows(s, need);
  const sum = (ids: string[]) => rows.filter(r => ids.includes(r.id)).reduce((a, r) => a + r.kcal * r.value, 0);
  const L = (id: string, label: string, kcal: number, note: string | null = null, tone: Tone = 'good'): StoreLine => ({ id, label, kcal, days: days(kcal), note, tone });
  const fresh = s.stock.fresh * KCAL.fresh, roots = sum(['cellar_roots']);
  const lines: StoreLine[] = [
    L('fresh', 'Fresh from the place', fresh, fresh > 5 * need ? `rotting ${Math.round(freshSpoilRate(s) * 100 * 10) / 10} % a day${hasCellar(s) ? '' : ' with no cellar'}` : null, fresh > 5 * need && !hasCellar(s) ? 'warn' : 'good'),
    L('roots', 'Cellar bins (potatoes, apples)', roots, hasCellar(s) ? `${Math.round(cellarKcal(s) / Math.max(1, cellarCapacity(s)) * 100)} % of the bins, shrinking ${(binShrink(cellarTempC(s)) * 100).toFixed(2)} % a day` : roots > 0 ? 'no cellar' : null),
    L('jars', 'Home jars, dried and fermented', sum(['home_canned', 'dried_produce', 'ferments'])),
    L('dry', 'Dry staples', sum(['rice_bucket', 'rice_bag', 'beans_bucket', 'black_beans', 'wheat_bucket', 'flour', 'oats', 'cornmeal', 'pasta', 'home_dry', 'sugar', 'honey', 'oil', 'lard', 'milk_powder', 'peanut_butter', 'freeze_dried'])),
    L('meat', 'Meat: cured, smoked, frozen', sum(['cured_meat', 'smoked_meat', 'freezer_meat', 'game_meat']), s.stock.frozen > 0.05 && !freezerOn(s) ? 'the freezer has no power: it is thawing' : null, s.stock.frozen > 0.05 && !freezerOn(s) ? 'bad' : 'good'),
    L('cans', 'Shop cans and snacks', sum(['canned_veg', 'canned_fruit', 'canned_meat', 'canned_soup', 'snacks'])),
  ].filter(l => l.kcal > 1);
  return { needPerDay: need, lines, totalDays: days(lines.reduce((a, l) => a + l.kcal, 0)) };
}

// ─────────────────────────────────────────────────────────────────────────
// The year's food
// ─────────────────────────────────────────────────────────────────────────

export interface Outlook {
  fieldsKcal: number; gardenKcal: number; orchardKcal: number; eggsKcal: number;
  yearNeed: number; storedKcal: number;
  /** (stored + expected harvest) over a year's need. */
  coverage: number;
}
/** Roughly what a year on this place grows, from the fields' crop plan, soil and rotation, the gardens, the orchards and the hens. */
export function outlook(s: GameState): Outlook {
  const skill = bestGardener(s), grow = (0.6 + 0.08 * skill) * SOIL_YIELD[s.site.soil];
  const fieldsKcal = fieldRows(s).reduce((a, r) => a + FIELD_KCAL * grow * r.factor.share * r.factor.fert * r.factor.rotation * (r.factor.vigor || 1), 0) * (fieldsOf(s).length ? 1 : 0);
  const gardens = gardensOf(s);
  const gardenKcal = gardens.reduce((a, g) => a + 250_000 * grow * (0.7 + 0.3 * plotFor(s, g).fert) * (1 + 0.07 * ((plotFor(s, g).succ ?? 1) - 1)), 0);
  const orchardKcal = s.structures.filter(x => isFinished(x) && ORCHARD_KINDS.includes(x.kind)).reduce((a, x) => a + 900_000 * ORCHARD_TREES[x.kind] / 12 * orchardBearing((s.clock.t - (x.finishedAt ?? s.clock.t)) / 365) * (5 / 6), 0);
  const eggsKcal = s.structures.filter(x => isFinished(x) && x.kind === 'chicken_coop').length * 180_000;
  const need = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0) * 365;
  const stored = stores(s).lines.reduce((a, l) => a + l.kcal, 0);
  return { fieldsKcal, gardenKcal, orchardKcal, eggsKcal, yearNeed: need, storedKcal: stored, coverage: need > 0 ? (stored + fieldsKcal + gardenKcal + orchardKcal + eggsKcal) / need : Infinity };
}

export interface Risk { text: string; tone: Tone }
/** What is about to go off or go wrong. */
export function spoilageRisks(s: GameState): Risk[] {
  const out: Risk[] = [];
  const need = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
  const fresh = s.stock.fresh * KCAL.fresh;
  if (fresh > 6 * need && need > 0) out.push({ text: `${Math.round(fresh / need)} days of fresh food on hand and ${Math.round(freshSpoilRate(s) * 100)} % of it rotting a day${hasCellar(s) ? ' (cellar)' : ': a root cellar would cut that to a fifth'}. Can, dry or ferment it.`, tone: 'warn' });
  const o = overflow(s);
  if (o > 0.1) out.push({ text: `Stores ${Math.round(o * 100)} % past the shelves (${Math.round(pantryLoad(s) / 1000).toLocaleString('en-US')}k kcal in ${Math.round(pantryRoom(s) / 1000).toLocaleString('en-US')}k of room): cool-kept goods keep worse.`, tone: 'warn' });
  if (cellarKcal(s) > 100_000 && cellarTempC(s) > 9) out.push({ text: `The cellar is ${Math.round(cellarTempC(s))} °C: the bins lose ${(binShrink(cellarTempC(s)) * 100).toFixed(1)} % a day. Eat the potatoes first.`, tone: 'warn' });
  for (const r of pantryRows(s, need).filter(x => FOOD[x.id].kcal > 0 && x.left < 90).slice(0, 3)) out.push({ text: `${FOOD[r.id].name.split(',')[0]} ${r.left <= 0 ? 'is past its date' : `keeps ${Math.max(0, Math.round(r.left))} more days`}.`, tone: r.left <= 0 ? 'bad' : 'warn' });
  if (s.stock.frozen > 0.05 && !freezerOn(s)) out.push({ text: 'Frozen meat with no power to the cellar freezer: it thaws and spoils.', tone: 'bad' });
  return out;
}

/** Everything the Food plan says should be done, most pressing first. */
export function foodPlan(s: GameState): Risk[] {
  const out: Risk[] = [];
  const { doy } = calendarOf(s.clock), [w0] = sowWindow(s), se = seasons(REGIONS[s.site.region]);
  const fields = fieldsOf(s, true), o = outlook(s);
  if (fields.length) {
    const have = seedOnHand(s), tot = have.heirloom + have.hybrid + have.saved, want = seedTarget(s);
    if (tot < fields.length && doy >= w0 - 40 && doy <= w0 + 20) out.push({ text: `Seed for ${fields.length} fields needed by ${dateText(w0)} and only ${tot.toFixed(1)} units on hand: buy field seed in the Shop, trade for it or the fields lie fallow.`, tone: 'bad' });
    else if (tot < want && doy < se.harvest[0]) out.push({ text: `Next spring's seed: ${tot.toFixed(1)} of ${want} units. The harvest will set it aside first.`, tone: 'good' });
    if (have.saved > 0 && seedsOf(s).savedVigor < 0.95) out.push({ text: `Your saved seed is from a hybrid line: it yields about ${Math.round(seedsOf(s).savedVigor * 100)} % of a true crop (it recovers 4 % a year). Heirloom seed saves true.`, tone: 'warn' });
    for (const r of fieldRows(s)) if (r.note && r.note.startsWith('Tired')) out.push({ text: `A field's soil is tired (fertility ${Math.round(r.fert * 100)} %). ${r.note.replace('Tired soil: ', '')}.`, tone: 'warn' });
    const cropKcal: Record<string, number> = {};
    for (const r of fieldRows(s)) cropKcal[r.crop] = (cropKcal[r.crop] ?? 0) + 1;
    if ((cropKcal.potatoes ?? 0) > 0 && !hasCellar(s)) out.push({ text: 'Potatoes with no root cellar rot in the kitchen within weeks. Build a cellar before the harvest.', tone: 'bad' });
  }
  if (hasKitchen(s) && (s.stock.lids ?? 0) >= 1 && !hasCanner(s)) out.push({ text: 'No pressure canner: only tomatoes, fruit and pickles (about a third of a glut) can be put in jars. Vegetables and meat need a pressure canner.', tone: 'warn' });
  if (hasKitchen(s) && (fields.length || gardensOf(s).length) && (s.stock.lids ?? 0) < 12 && !(s.stock.crocks >= 1) && !(s.stock.dehydrator >= 1)) out.push({ text: 'Nothing to put the harvest up in: lids for jars (canner), a dehydrator, or crocks and salt for ferments.', tone: 'warn' });
  const ratio = cookRatio(s);
  if (ratio < 0.6 && hasKitchen(s)) out.push({ text: 'Nobody has been cooking: no canning or drying happens until the Cooking duty is staffed.', tone: 'warn' });
  if (o.coverage < 0.9 && o.yearNeed > 0) out.push({ text: `What is put by plus a normal year's harvest covers ${Math.round(o.coverage * 100)} % of a year's eating.`, tone: o.coverage < 0.6 ? 'bad' : 'warn' });
  else if (o.yearNeed > 0 && isFinite(o.coverage)) out.push({ text: `Stores plus a normal harvest cover about ${Math.round(o.coverage * 100)} % of a year.`, tone: 'good' });
  if (!hasOven(s) && (s.stock.grain_mill ?? 0) < 1 && (s.pantry?.items.wheat_bucket?.q ?? 0) + (s.pantry?.items.home_dry?.q ?? 0) > 1) out.push({ text: 'Whole wheat boiled again and again: a grain mill and a wood oven would make bread.', tone: 'warn' });
  // the herd, the bees, the sugar bush
  const hd = herdOf(s);
  const sick = Object.values(hd.sick).reduce<number>((a, v) => a + (v ?? 0), 0);
  if (sick > 0) out.push({ text: `${sick} sick animal${sick === 1 ? '' : 's'} in the barnyard: a vet kit (Shop) or the vet.`, tone: 'warn' });
  for (const st of apiaries(s)) {
    const p = apiaryOf(s, st.id);
    if (p.colonies > 0 && p.mites > 0.5 && p.treated !== calendarOf(s.clock).year && (s.stock.hive_supplies ?? 0) < 1 && doy > 150) out.push({ text: 'The bees will not winter without a mite treatment: buy hive supplies.', tone: 'bad' });
    if (p.colonies > 0 && p.stores * p.colonies < winterNeed(s) * p.colonies * 0.6 && doy > 270) out.push({ text: 'The hives are light on winter stores: leave them their honey.', tone: 'warn' });
  }
  if (hasMaples(s) && woodsTaps(s) > 30 && tapsOut(s) === 0 && doy > sapSeason(s)[0] - 30 && doy < sapSeason(s)[0] + 5) out.push({ text: `Sugar maples on the place (about ${woodsTaps(s)} taps): tapping sets and a sugar shack would make syrup this spring.`, tone: 'good' });
  return out;
}

/** The kitchen's methods for the panel: what each can do today and why not. */
export function methodLines(s: GameState): Array<Capacity & { name: string; off: boolean; todayKcal: number; yearKcal: number }> {
  const k = kitchenOf(s);
  return capacities(s, cookRatio(s)).map(c => ({ ...c, name: METHOD_NAME[c.method], off: k.off.includes(c.method), todayKcal: k.today[c.method] ?? 0, yearKcal: k.yearKcal[c.method] ?? 0 }));
}

/** Greens and starts under glass, for the calendar's "in season" line. */
export const greensNow = (s: GameState): boolean => hasGreenhouse(s) && inGreensSeason(calendarOf(s.clock).doy);


/** A dot on the Farm tab when something needs doing now: the Food plan's most pressing line. */
export function farmAlert(game: GameState): Tone | undefined {
  const plan = foodPlan(game);
  return plan.some(p => p.tone === 'bad') ? 'bad' : plan.some(p => p.tone === 'warn') ? 'warn' : undefined;
}
