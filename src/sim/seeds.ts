/**
 * Seed saving (user-approved: "fields and gardens need seed each spring;
 * keep back about 10 % of the harvest automatically, and show it in
 * Supplies; a total crop loss with no seed in store means buying or
 * bartering seed, or leaving the field fallow; hybrid seed from the store
 * doesn't breed true; heirloom does"). Pure.
 *
 *  Sowing     each finished field takes a season's seed (one unit: seed
 *             potatoes, dry beans, seed wheat for a quarter acre) between
 *             three weeks before the last frost and 100 days before the
 *             first; a garden takes a tenth of that (packets of seed and
 *             the starts). Sown late (past a month after the last frost)
 *             the crop comes in short, down to half at the end of the
 *             window. A field not sown lies fallow: no harvest that year.
 *             A field finished mid-season is sown at once if it's still
 *             the window, else next spring.
 *  Seed       three kinds in store: bought hybrid (`seed`: 10 % more crop,
 *             but seed saved from it doesn't come true, ×0.7 the next year),
 *             bought heirloom (`seed_heirloom`: open-pollinated, comes true)
 *             and saved (`seed_saved`, at its line's vigor: heirloom 1.0;
 *             saved from hybrid 0.7, selection bringing it back 5 % a
 *             generation). The order they're used in is the family's
 *             choice (saved first by default).
 *  Keeping    10 % of the field harvest is kept back as it comes in (the
 *             family can set 0–20 %) until the store holds next spring's
 *             seed for every field and garden with a quarter to spare.
 *             One seed unit is 45,000 kcal of the harvest (an ordinary
 *             quarter acre here makes about 500,000).
 *  Hail       replanting after hail takes seed again; with none in store
 *             the season's crop on that field is lost.
 *
 * Seed potatoes are clonal (any potato saved comes true) and wheat and
 * beans are mostly self-pollinating, so the hybrid penalty is strongest
 * on a garden's corn, squash and tomatoes; the field mix uses one number.
 */
import type { GameState, Structure } from './state';
import { calendarOf } from './state';
import { REGIONS, seasons } from './regions';
import { isFinished } from './construction';
import { gardenSeason } from './greenhouse';
import { book } from './farmWork';

export type SeedLine = 'hybrid' | 'heirloom' | 'saved';
export const SEED_STOCK: Record<SeedLine, 'seed' | 'seed_heirloom' | 'seed_saved'> = { hybrid: 'seed', heirloom: 'seed_heirloom', saved: 'seed_saved' };
/** Yield factor of a crop from each kind of seed, and of seed saved from a hybrid crop. */
export const VIGOR = { hybrid: 1.1, heirloom: 1, savedFromHybrid: 0.7, regain: 0.05 } as const;
/** Harvest kcal kept back per seed unit; a garden's share of a unit; the default keep-back; the margin kept. */
export const SEED_UNIT_KCAL = 45_000, GARDEN_SEED = 0.1, KEEP_DEFAULT = 0.1, KEEP_SPARE = 1.25;
/** Person-hours to sow a field again each spring (by hand; a tractor and drill a fifth of it). */
export const SOW_HOURS = 20, SOW_HOURS_GARDEN = 6;

/** What a field or garden was sown with this year. */
export interface Sown {
  /** Year sown. */
  y: number;
  /** Seed line and its vigor (yield factor). */
  l: SeedLine;
  v: number;
  /** Day of year sown; late sowing's share of a full crop (1 on time). */
  d?: number;
  late?: number;
  /** Hail this year was dealt with (replanted from seed, or the crop lost). */
  hail?: boolean;
  lost?: boolean;
}

export interface Seeds {
  /** Share of the field harvest kept back for seed (0–0.2). */
  keep: number;
  /** Which seed is sown first. */
  first: SeedLine;
  /** Vigor of the saved seed in store (kcal-weighted over what it was saved from). */
  savedVigor: number;
  /** The year's tallies: fields and gardens sown, left fallow; seed units kept back. */
  year: number;
  sown: number;
  fallow: number;
  kept: number;
  /** Year the "no seed" warning went out. */
  warned?: number;
}
export const newSeeds = (): Seeds => ({ keep: KEEP_DEFAULT, first: 'saved', savedVigor: 1, year: 0, sown: 0, fallow: 0, kept: 0 });

const sown = (st: Structure) => st.sown;
const setSown = (st: Structure, v: Sown | undefined) => { st.sown = v; };
const year = (s: GameState) => calendarOf(s.clock).year;

/** The field sowing window (day of year): three weeks before the last frost to 100 days before the first. */
export function sowWindow(s: GameState): [number, number] {
  const [last, first] = REGIONS[s.site.region].frost;
  return [last - 21, Math.max(last + 10, first - 100)];
}
/** The garden's: a month either side of when it starts producing (greenhouse.gardenSeason). */
export function gardenWindow(s: GameState): [number, number] {
  const [g0] = gardenSeason(s);
  return [g0 - 45, g0 + 30];
}

/** Late sowing's share of a full crop on day `doy`. */
export function lateFactor(s: GameState, doy: number): number {
  const [last] = REGIONS[s.site.region].frost, [, end] = sowWindow(s), onTime = last + 30;
  return doy <= onTime ? 1 : Math.max(0.5, 1 - 0.5 * (doy - onTime) / Math.max(1, end - onTime));
}

/** A field's (or garden's) crop factor this year: 0 fallow or lost, else its seed's vigor × late sowing. */
export function cropFactor(s: GameState, st: Structure): number {
  const w = sown(st);
  if (!w || w.y !== year(s) || w.lost) return 0;
  return w.v * (w.late ?? 1);
}
/** Finished fields weighted by their crop factor (needs.ts fieldHarvest). */
export function sownFields(s: GameState): number {
  let n = 0;
  for (const st of s.structures) if (st.kind === 'field' && isFinished(st)) n += cropFactor(s, st);
  return n;
}
/** The same for the kitchen gardens. */
export function sownGardens(s: GameState): number {
  let n = 0;
  for (const st of s.structures) if (st.kind === 'garden' && isFinished(st)) n += cropFactor(s, st);
  return n;
}

/** Seed units in store, by line. */
export const seedOnHand = (s: GameState): Record<SeedLine, number> => ({ hybrid: s.stock.seed ?? 0, heirloom: s.stock.seed_heirloom ?? 0, saved: s.stock.seed_saved ?? 0 });
/** Seed units next spring's sowing takes (every finished or planned field and garden). */
export function seedNeed(s: GameState): number {
  const f = s.structures.filter(st => st.kind === 'field').length, g = s.structures.filter(st => st.kind === 'garden').length;
  return f + g * GARDEN_SEED;
}

/** The order the lines are used in: the family's first choice, then the others (saved, heirloom, hybrid). */
function order(first: SeedLine): SeedLine[] {
  const rest: SeedLine[] = (['saved', 'heirloom', 'hybrid'] as SeedLine[]).filter(l => l !== first);
  return [first, ...rest];
}

/** Take `units` of seed. Returns the line used (and its vigor), or null with too little of any one line. */
function takeSeed(s: GameState, units: number): { l: SeedLine; v: number } | null {
  const sd = s.farm.seeds;
  for (const l of order(sd.first)) {
    const k = SEED_STOCK[l];
    if ((s.stock[k] ?? 0) >= units - 1e-9) {
      s.stock[k] = Math.max(0, s.stock[k] - units);
      return { l, v: l === 'hybrid' ? VIGOR.hybrid : l === 'heirloom' ? VIGOR.heirloom : sd.savedVigor };
    }
  }
  return null;
}

/** The vigor of seed saved off a crop sown with line `l` at vigor `v`. */
export const nextVigor = (l: SeedLine, v: number) => l === 'hybrid' ? VIGOR.savedFromHybrid : l === 'heirloom' ? 1 : Math.min(1, v + VIGOR.regain);

/**
 * Keep back seed from the day's field harvest (needs.ts, before it's
 * stored). Returns the kcal kept back.
 */
export function keepSeed(s: GameState, fieldKcal: number): number {
  const sd = s.farm.seeds;
  if (!(fieldKcal > 0) || sd.keep <= 0) return 0;
  const have = s.stock.seed_saved ?? 0, target = seedNeed(s) * KEEP_SPARE;
  if (have >= target) return 0;
  const kcal = Math.min(fieldKcal * sd.keep, (target - have) * SEED_UNIT_KCAL);
  // the line it comes from: the fields' sowings, weighted by their crop
  let w = 0, v = 0;
  for (const st of s.structures) {
    if (st.kind !== 'field' || !isFinished(st)) continue;
    const f = cropFactor(s, st), x = sown(st);
    if (f > 0 && x) { w += f; v += f * nextVigor(x.l, x.v); }
  }
  const vig = w > 0 ? v / w : 1, units = kcal / SEED_UNIT_KCAL;
  sd.savedVigor = (sd.savedVigor * have + vig * units) / Math.max(1e-9, have + units);
  s.stock.seed_saved = have + units;
  sd.kept += units;
  return kcal;
}

/**
 * Once a day (farm.ts): sow what's due in the window, deal with hail,
 * reset the year's tallies. Returns log lines.
 */
export function seedsDay(s: GameState): string[] {
  const out: string[] = [];
  const sd = s.farm.seeds, { doy, year: y } = calendarOf(s.clock);
  if (sd.year !== y) { sd.year = y; sd.sown = 0; sd.fallow = 0; sd.kept = 0; }
  const [w0, w1] = sowWindow(s), [g0, g1] = gardenWindow(s);
  const tractor = (s.vehicles ?? []).some(v => v.kind === 'tractor' && v.fuel > 0);
  let fallowNow = 0;
  for (const st of s.structures) {
    if ((st.kind !== 'field' && st.kind !== 'garden') || !isFinished(st)) continue;
    const garden = st.kind === 'garden', [a, b] = garden ? [g0, g1] : [w0, w1];
    const cur = sown(st);
    if (cur?.y === y) continue;
    if (doy < a) continue;
    if (doy > b) {
      // the window closed with it unsown: fallow this year (counted once)
      if (cur?.y !== y) { setSown(st, { y, l: 'saved', v: 0, lost: true }); sd.fallow++; fallowNow++; }
      continue;
    }
    const got = takeSeed(s, garden ? GARDEN_SEED : 1);
    if (!got) continue;     // keep waiting for seed until the window closes
    setSown(st, { y, l: got.l, v: got.v, d: doy, late: garden ? 1 : lateFactor(s, doy) });
    sd.sown++;
    book(s, 'sowing', (garden ? SOW_HOURS_GARDEN : SOW_HOURS) * (tractor && !garden ? 0.2 : 1), true);
  }
  if (fallowNow > 0) out.push(fallowNow === 1 ? 'No seed for one of the plots: it lies fallow this year.' : `No seed for ${fallowNow} plots: they lie fallow this year.`);
  // seed short with the window open: say so once a year
  const waiting = s.structures.filter(st => (st.kind === 'field' || st.kind === 'garden') && isFinished(st) && sown(st)?.y !== y).length;
  if (waiting > 0 && doy >= w0 && doy <= w1 && sd.warned !== y && (s.stock.seed ?? 0) + (s.stock.seed_heirloom ?? 0) + (s.stock.seed_saved ?? 0) < 1) {
    sd.warned = y;
    out.push(`Planting time, and no seed for ${waiting === 1 ? 'a plot' : `${waiting} plots`}: buy or trade for seed before the window closes.`);
  }
  // hail: the crops it shredded are replanted from seed, or lost
  const h = s.weather?.hail;
  if (h && h.year === y && doy >= h.doy) {
    for (const st of s.structures) {
      const w = sown(st);
      if (!w || w.y !== y || w.lost || w.hail || (w.d ?? 0) > h.doy || (st.kind !== 'field' && st.kind !== 'garden')) continue;
      w.hail = true;
      const got = takeSeed(s, st.kind === 'garden' ? GARDEN_SEED : 1);
      if (!got) { w.lost = true; out.push(`No seed left to replant the ${st.kind === 'garden' ? 'garden' : 'field'} after the hail: this year's crop on it is gone.`); }
    }
  }
  return out;
}

/** Mark every finished field and garden sown this year (old saves; the tests' set-up). */
export function markSown(s: GameState, line: SeedLine = 'heirloom'): void {
  const y = year(s);
  for (const st of s.structures) if ((st.kind === 'field' || st.kind === 'garden') && isFinished(st)) setSown(st, { y, l: line, v: line === 'hybrid' ? VIGOR.hybrid : 1 });
}

/** A field's sowing in words (the Supplies tab). */
export function fieldState(s: GameState, st: Structure): string {
  const w = sown(st), y = year(s);
  if (!w || w.y !== y) { const [a, b] = st.kind === 'garden' ? gardenWindow(s) : sowWindow(s), doy = calendarOf(s.clock).doy; return doy < a ? 'to sow this spring' : doy <= b ? 'waiting for seed' : 'fallow'; }
  if (w.lost) return w.v === 0 ? 'fallow' : 'crop lost';
  return `sown, ${w.l} seed${w.l === 'saved' && w.v < 0.99 ? ` (${Math.round(w.v * 100)} %)` : ''}${(w.late ?? 1) < 0.99 ? ', late' : ''}`;
}

/** The harvest season of the fields (for the UI). */
export const harvestWindow = (s: GameState) => seasons(REGIONS[s.site.region]).harvest;
