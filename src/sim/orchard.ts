/**
 * The orchard (docs/DECISIONS.md "Orchard plots"): apple, pear, cherry and plum trees in rows, each with its own real
 * timeline. Pure; the daily step is `orchardDay`, the day's fruit is `orchardPicking`.
 *
 *  Plots     `orchard` (12 trees) and `orchard_grove` (48): one row of trees (a column of the grid) per kind of fruit, so
 *            every plot has the four and they pollinate each other. A plot's fruit is what is planted, never saved.
 *  Years     a semi-dwarf tree from a nursery bears nothing for a few years, then a quarter, half, three quarters and a
 *            full crop of its own: plum first fruit in year 3 and full at 7, apple and sweet cherry 4 / 8, pear 5 / 10.
 *  Blossom   each kind blooms at its own time against the place's median last frost (cherry 8 days before it, plum 6,
 *            pear 3, apple a day after), for 8-10 days. A hard frost (28 °F or colder: the last one falls about 11 days
 *            before the median, give or take 9, seeded per game and year) takes the share of the blossom that is open:
 *            the early bloomers lose most, the apple least. A plot in a cold-air pocket (sim/terrain.ts: the ground is
 *            lower than the land round it, so cold air drains in and pools) is hit 9 days later in the season, a plot on
 *            a slope that drains the cold air away 4 days earlier. The region's own altitude and pocket (sim/climate.ts)
 *            move the median itself.
 *  Fruit     it ripens a fixed time after bloom (cherry 62 days, plum 118, pear 128, apple 140) and is picked over 3 to 9
 *            weeks, so the year runs cherries in early summer, plums, pears, then apples into the fall. Apples and pears
 *            keep in the cellar bins; cherries and plums are eaten, jarred and dried within days (the kitchen does it).
 *  Bees      most kinds need an insect on the blossom: bees (sim/bees.ts `pollination`) raise the crop most for the cherry
 *            and the least for the plum; wild bees alone carry the usual crop.
 *  Pruning   done in winter, judged when the buds are about to break (14 days before the median last frost); an unpruned
 *            plot bears a fifth less and the pests come in. The Garden duty's orchard chore does it (and the watering, and
 *            the picking).
 *  Water     young trees need about 7 L a day each through the dry months, bearing trees a few: it comes off the pond, then
 *            the well (sim/utilities.ts `orchardWaterL`).
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { regionFor } from './climate';
import { mulberry32 } from './rng';
import { orchardCareOf } from './farm';
import { groundOf } from './terrainState';
import { logGate } from './nag';

export type Fruit = 'apple' | 'pear' | 'cherry' | 'plum';
export const FRUITS: readonly Fruit[] = ['apple', 'pear', 'cherry', 'plum'];

export interface FruitDef {
  name: string;
  /** Whole years after planting before the first fruit, and when the tree bears its full crop (semi-dwarf rootstock). */
  first: number; full: number;
  /** Pounds a tree bears at full bearing, on a good site and a good year. */
  lb: number;
  /** Days from the median last frost to the first open blossom (negative: before it), and how long the bloom lasts. */
  bloom: number; bloomDays: number;
  /** Days from the first blossom to the first ripe fruit, and how many days it is picked over. */
  ripe: number; pick: number;
  /** Share of the crop that keeps in the cellar bins (the rest is eaten fresh, jarred or dried). */
  keeps: number;
  /** Share of the crop that needs an insect on the blossom to set. */
  insects: number;
  /** Which year's pests hit it. */
  pests: ReadonlyArray<'codling moth' | 'fire blight'>;
  /** Blossom color (renders) and what is picked. */
  blossom: string; fruit: string;
}

/** What a pound of the fruit is worth, put up: the same ≈ 500 kcal a lb the orchard has always been counted at (jarred with sugar, dried, cellared). */
export const KCAL_PER_LB = 500;

export const FRUIT: Record<Fruit, FruitDef> = {
  apple:  { name: 'Apple',  first: 4, full: 8,  lb: 150, bloom: 1,  bloomDays: 10, ripe: 140, pick: 60, keeps: 0.85, insects: 0.85, pests: ['codling moth', 'fire blight'], blossom: 'pink and white', fruit: 'red apples' },
  pear:   { name: 'Pear',   first: 5, full: 10, lb: 140, bloom: -3, bloomDays: 9,  ripe: 128, pick: 30, keeps: 0.6,  insects: 0.9,  pests: ['codling moth', 'fire blight'], blossom: 'white', fruit: 'yellow pears' },
  cherry: { name: 'Cherry', first: 4, full: 8,  lb: 60,  bloom: -8, bloomDays: 9,  ripe: 62,  pick: 21, keeps: 0,    insects: 0.95, pests: [], blossom: 'white', fruit: 'dark red cherries' },
  plum:   { name: 'Plum',   first: 3, full: 7,  lb: 100, bloom: -6, bloomDays: 8,  ripe: 118, pick: 35, keeps: 0.05, insects: 0.8,  pests: ['codling moth'], blossom: 'white', fruit: 'purple plums' },
};

/** The plots: the grid of trees (columns run front to back: one column, one row of trees, one kind of fruit). */
export const ORCHARD_KINDS: readonly string[] = ['orchard', 'orchard_grove'];
export type OrchardKind = 'orchard' | 'orchard_grove';
export const ORCHARD_GRID: Record<OrchardKind, { cols: number; rows: number }> = { orchard: { cols: 4, rows: 3 }, orchard_grove: { cols: 8, rows: 6 } };
export const ORCHARD_TREES: Record<string, number> = { orchard: 12, orchard_grove: 48 };
export const isOrchard = (kind: string): kind is OrchardKind => ORCHARD_KINDS.includes(kind);

/** The fruit of each column of a plot, left to right. */
export function orchardColumns(kind: OrchardKind): Fruit[] {
  return kind === 'orchard_grove' ? ['apple', 'apple', 'pear', 'pear', 'cherry', 'cherry', 'plum', 'plum'] : ['apple', 'pear', 'cherry', 'plum'];
}
/** How many trees of a fruit a plot holds. */
export function treesOf(kind: string, fruit: Fruit): number {
  if (!isOrchard(kind)) return 0;
  const g = ORCHARD_GRID[kind];
  return orchardColumns(kind).filter(f => f === fruit).length * g.rows;
}

const finished = (s: GameState): Structure[] => s.structures.filter(st => isOrchard(st.kind) && isFinished(st));
/** Years since the trees went in (the plot was finished). */
export const ageOf = (s: GameState, st: Structure): number => Math.max(0, (s.clock.t - (st.finishedAt ?? s.clock.t)) / 365);

/** Share of a full crop a tree of this age bears: nothing before the first year of fruit, then a fifth to a sixth more each year to the full crop. */
export function bearing(fruit: Fruit, age: number): number {
  const d = FRUIT[fruit];
  if (age < d.first) return 0;
  return Math.min(1, (Math.floor(age) - d.first + 1) / (d.full - d.first + 1));
}

// ── the season: bloom, frost, ripening ──

/** The place's median last spring frost (day of year; the region's, moved for the lot's altitude and cold pocket). */
export const medianFrost = (s: GameState): number => regionFor(s.site).frost[0];

/** Days a hard frost's date is seeded around: the last 28 °F night falls this long before the median 32 °F one, ± this spread. */
export const KILL_BEFORE_MEDIAN = 11, KILL_SPREAD = 9;
/** A cold-air pocket pulls the last hard frost this many days later, a slope that drains the cold air away this many earlier. */
export const POCKET_DAYS = 9, DRAIN_DAYS = -4;

/** Where one plot stands against the cold air (read from the lot's ground; a place with no lot has none). */
export interface PlotSite { pocket: boolean; drained: boolean; /** Days added to the date of the last hard frost. */ shift: number }
const NEUTRAL: PlotSite = { pocket: false, drained: false, shift: 0 };
const siteCache = new Map<string, PlotSite>();

/**
 * Cold air runs downhill and pools: a plot lower than the land round it (8 units ≈ 50 m out) on near-level ground is a
 * frost pocket (the same test as the Terrain overlay's white cells); a plot on a slope that lets it drain away is spared.
 */
export function plotSite(s: GameState, st: Pick<Structure, 'x' | 'z'>): PlotSite {
  if (!s.site.lot) return NEUTRAL;
  const g = groundOf(s);
  if (!g) return NEUTRAL;
  const key = `${s.seed}|${s.site.region}|${JSON.stringify(s.site.lot)}|${Math.round(st.x * 2)},${Math.round(st.z * 2)}`;
  const hit = siteCache.get(key);
  if (hit) return hit;
  const h0 = g.h(st.x, st.z), e = 0.5;
  const slope = Math.hypot((g.h(st.x + e, st.z) - g.h(st.x - e, st.z)) / (2 * e), (g.h(st.x, st.z + e) - g.h(st.x, st.z - e)) / (2 * e));
  let ring = 0;
  for (let q = 0; q < 8; q++) ring += g.h(st.x + Math.cos(q * Math.PI / 4) * 8, st.z + Math.sin(q * Math.PI / 4) * 8);
  const pocket = slope < 0.12 && ring / 8 - h0 >= 0.3;
  const drained = !pocket && slope >= 0.08;
  const out: PlotSite = { pocket, drained, shift: pocket ? POCKET_DAYS : drained ? DRAIN_DAYS : 0 };
  if (siteCache.size > 400) siteCache.clear();
  siteCache.set(key, out);
  return out;
}

/** Standard normal draw (seeded), clamped to ±2.2. */
function gauss(r: () => number): number {
  const u = Math.max(1e-9, r()), v = r();
  return Math.max(-2.2, Math.min(2.2, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

/** The day of the year of this year's last hard frost (28 °F), before the plot's own cold air is counted. */
export function hardFrostDay(seed: number, year: number, median: number): number {
  const r = mulberry32(seed * 7919 + year * 104_729 + 31);
  return Math.round(median - KILL_BEFORE_MEDIAN + KILL_SPREAD * gauss(r));
}

/** Days of the year a fruit is in blossom and is picked, at this place and plot. */
export interface FruitCalendar { bloom: [number, number]; pick: [number, number] }
export function calendarOfFruit(median: number, fruit: Fruit): FruitCalendar {
  const d = FRUIT[fruit];
  const b0 = Math.round(median + d.bloom), p0 = b0 + d.ripe;
  return { bloom: [b0, b0 + d.bloomDays - 1], pick: [p0, p0 + d.pick] };
}

/** Share of the blossom a hard frost takes if it is the last of the spring on `frostDay`: what is open when it hits, nine tenths of it. */
export function blossomLoss(frostDay: number, fruit: Fruit, median: number): number {
  const d = FRUIT[fruit], b0 = calendarOfFruit(median, fruit).bloom[0];
  if (frostDay < b0) return 0;
  return Math.min(0.95, Math.min(1, (frostDay - b0 + 1) / d.bloomDays) * 0.9);
}

/** The share of this year's crop of a fruit that a plot lost to frost on the blossom. */
export function frostLoss(s: GameState, st: Pick<Structure, 'x' | 'z'>, fruit: Fruit, year = calendarOf(s.clock).year): number {
  const m = medianFrost(s), p = plotSite(s, st);
  return blossomLoss(hardFrostDay(s.seed, year, m) + p.shift, fruit, m);
}

/** 24 equally likely standard-normal quantiles (the risk a plot runs in an ordinary year, without rolling dice). */
const QUANTILES: readonly number[] = (() => {
  // Acklam's rational approximation of the inverse normal CDF
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const inv = (p: number): number => {
    const lo = 0.02425;
    if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };
  return Array.from({ length: 24 }, (_, i) => Math.max(-2.2, Math.min(2.2, inv((i + 0.5) / 24))));
})();

/** The share of the crop a fruit loses to frost in an ordinary year at a place (the average over the years the frost date could fall on). */
export function frostRisk(median: number, shift: number, fruit: Fruit): number {
  let sum = 0;
  for (const z of QUANTILES) sum += blossomLoss(Math.round(median - KILL_BEFORE_MEDIAN + KILL_SPREAD * z) + shift, fruit, median);
  return sum / QUANTILES.length;
}

// ── pests and pruning ──

/** This year's pest: nothing in most years, codling moth in some, fire blight in a few (seeded per game and year). */
export function orchardPest(seed: number, year: number): { name: string; loss: number } {
  const r = mulberry32(seed * 6089 + year * 7717 + 13)();
  if (r < 0.55) return { name: 'none', loss: 0 };
  if (r < 0.85) return { name: 'codling moth', loss: 0.2 };
  return { name: 'fire blight', loss: 0.4 };
}

/** The day the winter pruning is judged (the buds are about to break) and the pest report is read. */
export const pruneDay = (s: GameState): number => Math.max(60, Math.round(medianFrost(s)) - 14);
export const pestDay = (s: GameState): number => Math.round(medianFrost(s)) + 25;
/** Pruning is done from mid-January. */
export const PRUNE_FROM = 15;

/** The share of a fruit's crop the pests take this year in a plot: halved by pruned trees (airy limbs), a fifth less with hens running under them. */
export function pestLoss(s: GameState, st: Structure, fruit: Fruit, year = calendarOf(s.clock).year): number {
  const pest = orchardPest(s.seed, year);
  if (pest.loss <= 0 || !FRUIT[fruit].pests.includes(pest.name as 'codling moth')) return 0;
  const pruned = orchardCareOf(s, st.id).unprunedYear !== year;
  const hens = s.structures.some(x => x.kind === 'chicken_coop' && isFinished(x));
  return pest.loss * (pruned ? 0.5 : 1) * (hens ? 0.8 : 1);
}

// ── the crop ──

/**
 * What one fruit in one plot bears this year, kcal, before the care chore and the climate: trees × pounds × the share the
 * age gives × what the frost left × the pruning × what the pests left × the bees.
 * `bees`: the apiary's orchard bonus (sim/bees.ts `pollination().orchard`: 1 with no bees, up to 1.18).
 */
export function fruitYear(s: GameState, st: Structure, fruit: Fruit, bees = 1, year = calendarOf(s.clock).year): number {
  const d = FRUIT[fruit], n = treesOf(st.kind, fruit);
  if (!n) return 0;
  const age = ageOf(s, st), bear = bearing(fruit, age);
  if (bear <= 0) return 0;
  const pruneK = orchardCareOf(s, st.id).unprunedYear === year ? 0.8 : 1;
  const beeK = 1 + (bees - 1) * d.insects / 0.85;
  return n * d.lb * KCAL_PER_LB * bear * (1 - frostLoss(s, st, fruit, year)) * pruneK * (1 - pestLoss(s, st, fruit, year)) * beeK;
}

/** Today's fruit from the orchards: kcal, and the share that goes to the cellar bins (apples, pears). */
export function orchardPicking(s: GameState, bees = 1): { kcal: number; keep: number; byFruit: Partial<Record<Fruit, number>> } {
  const { doy, year } = calendarOf(s.clock), m = medianFrost(s);
  let kcal = 0, keep = 0;
  const byFruit: Partial<Record<Fruit, number>> = {};
  for (const st of finished(s)) for (const f of FRUITS) {
    const { pick } = calendarOfFruit(m, f);
    if (doy < pick[0] || doy >= pick[1]) continue;
    const k = fruitYear(s, st, f, bees, year) / FRUIT[f].pick;
    if (k <= 0) continue;
    kcal += k; keep += k * FRUIT[f].keeps;
    byFruit[f] = (byFruit[f] ?? 0) + k;
  }
  return { kcal, keep, byFruit };
}

/** The orchards' fruit today (kcal; the care chore and the climate are applied in needs.ts). */
export const orchardYield = (s: GameState, bees = 1): number => orchardPicking(s, bees).kcal;

/** Roughly what the orchards bear in a year at the age they are (kcal): the planning figure for the Farm tab. */
export function orchardYearKcal(s: GameState): number {
  let sum = 0;
  for (const st of finished(s)) for (const f of FRUITS) sum += fruitYear(s, st, f);
  return sum;
}

/** The same in an ordinary year: the frost the plot's cold air usually takes and the pests that usually come, without rolling this year's dice (the planning figure). */
export function orchardExpectedKcal(s: GameState): number {
  const m = medianFrost(s);
  let sum = 0;
  for (const st of finished(s)) {
    const site = plotSite(s, st), age = ageOf(s, st);
    for (const f of FRUITS) {
      const n = treesOf(st.kind, f), d = FRUIT[f];
      sum += n * d.lb * KCAL_PER_LB * bearing(f, age) * (1 - frostRisk(m, site.shift, f)) * (d.pests.length ? 0.92 : 1);
    }
  }
  return sum;
}

/** Does any plot bear fruit yet? */
export const anyBearing = (s: GameState): boolean => finished(s).some(st => FRUITS.some(f => treesOf(st.kind, f) > 0 && bearing(f, ageOf(s, st)) > 0));

/** What the orchards' fruit looks like on the trees today, per fruit (the engine reads it): leafed out, in blossom, ripe fruit on the limbs. */
export interface FruitLook { leaf: boolean; bloom: boolean; fruit: boolean }
export function fruitLook(s: GameState, st: Pick<Structure, 'x' | 'z' | 'finishedAt'>, fruit: Fruit, doy = calendarOf(s.clock).doy, year = calendarOf(s.clock).year): FruitLook {
  const m = medianFrost(s), first = regionFor(s.site).frost[1], cal = calendarOfFruit(m, fruit);
  const leaf = doy >= cal.bloom[0] - 6 && doy < first + 25;
  const killed = frostLoss(s, st, fruit, year) >= 0.5 && doy >= hardFrostDay(s.seed, year, m) + plotSite(s, st).shift;
  const bloom = doy >= cal.bloom[0] && doy <= cal.bloom[1] + 2 && !killed;
  const age = Math.max(0, (s.clock.t - (st.finishedAt ?? s.clock.t)) / 365);
  const set = bearing(fruit, age) > 0 && frostLoss(s, st, fruit, year) < 0.9;
  const fruitOn = set && doy >= cal.pick[0] - 14 && doy < cal.pick[1] + 3;
  return { leaf, bloom, fruit: fruitOn };
}

// ── what a plot reports (the Farm panel) ──

export interface FruitReport {
  fruit: Fruit; trees: number; age: number; bearing: number; yearsToFruit: number;
  bloom: [number, number]; pick: [number, number];
  /** Share of the crop an ordinary year's frost takes here. */
  risk: number;
  /** This year: what the frost already took (0 before the bloom), and kcal expected. */
  lostThisYear: number; kcal: number;
}
export interface PlotReport { id: string; kind: string; trees: number; site: PlotSite; unpruned: boolean; fruits: FruitReport[]; bees: boolean }

export function plotReport(s: GameState, st: Structure, bees = 1): PlotReport {
  const m = medianFrost(s), site = plotSite(s, st), { doy, year } = calendarOf(s.clock), age = ageOf(s, st);
  const fruits = FRUITS.filter(f => treesOf(st.kind, f) > 0).map((f): FruitReport => {
    const cal = calendarOfFruit(m, f), bear = bearing(f, age);
    const hit = hardFrostDay(s.seed, year, m) + site.shift;
    return {
      fruit: f, trees: treesOf(st.kind, f), age, bearing: bear, yearsToFruit: Math.max(0, FRUIT[f].first - Math.floor(age)),
      bloom: cal.bloom, pick: cal.pick, risk: frostRisk(m, site.shift, f),
      lostThisYear: doy >= hit ? blossomLoss(hit, f, m) : 0, kcal: fruitYear(s, st, f, bees, year),
    };
  });
  return { id: st.id, kind: st.kind, trees: ORCHARD_TREES[st.kind], site, unpruned: orchardCareOf(s, st.id).unprunedYear === year, fruits, bees: bees > 1 };
}

/** A note for the place a plot is being staked: a frost pocket (the bloom will be lost), a draining slope, or nothing. */
export function orchardSiteNote(s: GameState, x: number, z: number): string | null {
  const p = plotSite(s, { x, z });
  if (p.pocket) return 'This is a cold-air pocket: late frosts will take the blossom here, the cherries and plums most often. A slope above the hollow drains the cold air away.';
  if (p.drained) return 'A slope that lets the cold air drain away: the blossom is spared more late frosts than in a hollow.';
  return null;
}

// ── water ──

/** Days of the year the trees are watered (dry months) and what a tree drinks a day: a young one 7 L, one that bears 4, in a wet region half that. */
export const WATER_DAYS: [number, number] = [152, 258];
export function orchardWaterL(s: GameState): number {
  const { doy } = calendarOf(s.clock);
  if (doy < WATER_DAYS[0] || doy > WATER_DAYS[1]) return 0;
  const wet = regionFor(s.site).rainMm > 1000 ? 0.5 : 1;
  let l = 0;
  for (const st of finished(s)) {
    const age = ageOf(s, st);
    l += ORCHARD_TREES[st.kind] * (age < 3 ? 7 : 4) * wet;
  }
  return l;
}

// ── the days of the year ──

/**
 * Once a day: judge the pruning when the buds are about to break, read the pest report, say when the blossom is out and what
 * the frost did to it. `choreLevel` is the orchard chore backlog (0-100). Returns log lines.
 */
export function orchardDay(s: GameState, choreLevel: number): string[] {
  const out: string[] = [];
  const { doy, year } = calendarOf(s.clock), mine = finished(s);
  if (!mine.length) return out;
  const m = medianFrost(s);
  if (doy === pruneDay(s)) {
    const missed = choreLevel >= 50;
    for (const st of mine) orchardCareOf(s, st.id).unprunedYear = missed ? year : -1;
    if (missed) out.push('The orchard went into bloom unpruned: crowded limbs, a lighter crop and more for the pests.');
  }
  // the blossom opens, the frost comes (the day after it: the family finds the brown petals)
  for (const f of FRUITS) {
    const cal = calendarOfFruit(m, f);
    const bearingNow = mine.some(st => bearing(f, ageOf(s, st)) > 0 && treesOf(st.kind, f) > 0);
    if (doy === cal.bloom[0] && bearingNow && logGate(s, `bloom:${f}`, 300)) {
      const bees = s.structures.some(st => st.kind === 'apiary' && isFinished(st));
      out.push(`The ${FRUIT[f].name.toLowerCase()}s are in blossom, ${FRUIT[f].blossom} on every limb.${bees ? ' The bees are working them.' : ' No hives: it is up to the wild bees.'}`);
    }
  }
  for (const st of mine) {
    const hit = hardFrostDay(s.seed, year, m) + plotSite(s, st).shift;
    if (doy !== hit + 1) continue;
    const lost = FRUITS.filter(f => treesOf(st.kind, f) > 0 && bearing(f, ageOf(s, st)) > 0).map(f => ({ f, l: blossomLoss(hit, f, m) })).filter(x => x.l >= 0.15);
    if (lost.length && logGate(s, `frost:${st.id}`, 300)) {
      const list = lost.map(x => `${FRUIT[x.f].name.toLowerCase()}s (${Math.round(x.l * 100)} %)`).join(', ');
      out.push(`A hard frost caught the orchard in blossom: it took the ${list}.${plotSite(s, st).pocket ? ' The cold air pooled in the hollow where it stands.' : ''}`);
    }
  }
  if (doy === pestDay(s)) {
    const p = orchardPest(s.seed, year);
    if (p.name !== 'none' && mine.some(st => FRUITS.some(f => bearing(f, ageOf(s, st)) > 0 && FRUIT[f].pests.includes(p.name as 'codling moth')))) {
      const held = mine.some(st => FRUITS.some(f => pestLoss(s, st, f, year) < p.loss && FRUIT[f].pests.length > 0));
      out.push(`${p.name[0].toUpperCase()}${p.name.slice(1)} is in the orchard this year${held ? ' (the pruning and the hens are holding it down)' : ''}.`);
    }
  }
  return out;
}

/** The orchard chore's growth a day: pruning in the winter, watering the young trees in the dry months, picking through the fruit seasons. */
export function orchardChoreRate(s: GameState, doy: number): number {
  const plots = finished(s);
  if (!plots.length) return 0;
  const m = medianFrost(s), n = plots.reduce((a, st) => a + ORCHARD_TREES[st.kind] / 12, 0);
  const prune = doy >= PRUNE_FROM && doy < pruneDay(s);
  const pick = FRUITS.some(f => { const c = calendarOfFruit(m, f); return doy >= c.pick[0] && doy < c.pick[1] && plots.some(st => bearing(f, ageOf(s, st)) > 0); });
  const water = doy >= WATER_DAYS[0] && doy <= WATER_DAYS[1] ? plots.reduce((a, st) => a + (ageOf(s, st) < 3 ? ORCHARD_TREES[st.kind] / 12 * 1.4 : ORCHARD_TREES[st.kind] / 12 * 0.5), 0) : 0;
  return Math.min(16, (prune || pick ? 2.6 * Math.min(6, n) : 0) + water);
}
