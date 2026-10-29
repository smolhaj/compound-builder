/**
 * Fields, seed and soil (docs/DECISIONS.md "Farm & kitchen"). Pure; the daily step is `cropsDay`.
 *
 *  Crops       a field (a quarter acre) grows one crop a year: potatoes (heavy feeders, they go to the
 *              cellar), dry beans (a legume: they fix nitrogen and leave the soil richer) or wheat (a
 *              grain, dry staples). Left to Auto the family rotates beans > potatoes > wheat, staggered
 *              across the fields so every year brings some of each; the Farm tab can pin a field to a
 *              crop, or rest it under a cover crop. The same crop twice running pays for it (blight in
 *              the potatoes, bean beetle, wheat rust, a tired soil); a legume year before potatoes or
 *              wheat is worth about 6 % more.
 *  Soil        each plot has a fertility (1 = the soil as it was). A harvest draws it down (potatoes
 *              most), a legume year gives a little back, a resting field with cover seed 0.2, and the
 *              ground recovers about 0.075 a year by itself: in a three-year rotation that is a wash.
 *              Manure (your animals' pile or a neighbor's load) and compost (kitchen scraps, weeds)
 *              spread in spring raise it; fertility above 1 leaches 35 % a year. The crop follows it:
 *              yield ×(0.7 + 0.3 × fertility).
 *  Seed        every field is sown each spring from the seed store (one unit a field) inside the sowing
 *              window (before the last frost to ~85 days ahead of the first). Three kinds: hybrid (the
 *              Shop's plain field seed, cheap: about 12 % more crop and a third less hurt by blight and rust
 *              the year it is sown; seed saved from it does not come true and yields ×0.8, recovering 4 % a
 *              year), heirloom (pricier: an ordinary crop, but open-pollinated, so the seed you save
 *              comes true and the line adapts to the place, +1 % a year up to 1.04) and saved (kept back
 *              from your own harvest, at its line's vigor). Harvest days first fill next spring's seed (a
 *              unit a field and a quarter spare, never more than 40 % of a day's crop). A field with no
 *              seed when the window closes is not left fallow: it comes up in weeds and volunteers from
 *              last year's crop, about 40 % of a crop, and the log and the Farm tab say so.
 *  Timing      sown late the crop is short: the Fields duty works the spring `sowing` chore; behind it,
 *              the whole sowing is late (up to ~40 % off). A field planted when it was built counts as
 *              sown that day (inside the window: full crop; later it fades, a catch crop at ~35 %).
 *  Gardens     a garden has the same soil and the number of successions: 1 (one sowing), 2 or 3 (a sowing
 *              every three weeks): +7 % crop and eight days more season each, and a fifth more weeding.
 *  Trouble     some years the weather brings blight (wet), bean beetle or rust: seeded per game and year.
 *              A rotated field takes about half the hit; hybrid seed resists a third of it.
 *
 * The yield formula that uses these is `fieldHarvest` in needs.ts; this file only has the per-plot factors.
 */
import { calendarOf, type GameState, type Structure } from './state';
import { REGIONS, seasons } from './regions';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { logGate } from './nag';
import { farmOf } from './farm';

export type CropId = 'potatoes' | 'beans' | 'wheat' | 'rest';
export const CROP_IDS: readonly CropId[] = ['potatoes', 'beans', 'wheat', 'rest'];
export interface CropDef {
  name: string;
  /** Share of an average crop (the three average 1). */
  share: number;
  /** Goes to the dry store (beans, wheat); potatoes go to the cellar. */
  dry: boolean;
  /** Fertility change at the harvest. */
  fert: number;
  /** A legume: the next crop is worth more. */
  legume: boolean;
  /** What it is, in a line. */
  note: string;
}
export const CROPS: Record<CropId, CropDef> = {
  potatoes: { name: 'Potatoes', share: 1.2, dry: false, fert: -0.14, legume: false, note: 'Heavy feeder; keeps in the cellar through the winter' },
  beans: { name: 'Dry beans', share: 0.85, dry: true, fert: 0, legume: true, note: 'Fix nitrogen; the dry store; the best crop before potatoes or wheat' },
  wheat: { name: 'Wheat', share: 0.95, dry: true, fert: -0.1, legume: false, note: 'Grain for bread; keeps for years' },
  rest: { name: 'Resting', share: 0, dry: false, fert: 0.06, legume: false, note: 'No crop: the soil builds (more with cover-crop seed)' },
};
/** Auto rotation: each crop follows the one that suits it. */
export const CYCLE: readonly CropId[] = ['beans', 'potatoes', 'wheat'];

/** Gross crop of an ordinary quarter-acre field is the old net FIELD_KCAL plus the seed unit the harvest sets aside. */
export const SEED_UNIT_KCAL = 45_000;
export const FIELD_NET_KCAL = 700_000;
export const GROSS = 1 + SEED_UNIT_KCAL / FIELD_NET_KCAL;

export type SeedLine = 'heirloom' | 'hybrid' | 'saved' | 'volunteer';
/** The lines that come out of the seed store (a field with none is sown with `volunteer`: weeds and last year's strays). */
export type StockLine = Exclude<SeedLine, 'volunteer'>;
/** The plain Shop seed is the hybrid (save v65); the pricier heirloom has its own good. */
export const SEED_STOCK = { heirloom: 'seed_heirloom', hybrid: 'seed', saved: 'seed_saved' } as const;
/** Yield of the line's first sowing; what saved seed of a hybrid is worth; its recovery a year; the adapted heirloom's cap; a field of weeds and volunteers. */
export const VIGOR = { hybrid: 1.12, fromHybrid: 0.8, regain: 0.04, regainCap: 0.96, adapt: 0.01, adaptCap: 1.04, volunteer: 0.4 } as const;
/** Fertility: the start, the yearly recovery, the leaching of what is above 1, the bounds, the gains per load. */
export const FERT = { start: 1, recover: 0.075, leach: 0.35, min: 0.35, max: 1.45, manure: 0.05, compost: 0.035, coverGain: 0.2 } as const;
export const MAX_LOADS = 3;
export const fertFactor = (f: number): number => 0.7 + 0.3 * Math.max(FERT.min, Math.min(FERT.max, f));

export interface Sown {
  /** Year sown, day of the year, seed line and its vigor (yield factor), share of a full crop for the date. */
  y: number; doy: number; line: SeedLine; v: number; late: number;
}
export interface Plot {
  kind: 'field' | 'garden';
  fert: number;
  /** The last two years' crops and this year's (set when sown). */
  prev: CropId | null;
  prev2: CropId | null;
  crop: CropId | null;
  /** The player's choice for a field (absent: Auto). */
  pin?: CropId;
  sown?: Sown;
  /** Loads of manure and compost spread this year; a cover crop was sown this year. */
  loads: number;
  cover: boolean;
  /** Year the plot's season was settled (fertility and rotation updated). */
  settled: number;
  /** The seed the build put in the ground has been dealt with (sown, or too late to count). */
  planted?: boolean;
  /** Garden: sowings a season (1–3). */
  succ?: number;
}
export const newPlot = (kind: Plot['kind']): Plot => ({ kind, fert: FERT.start, prev: null, prev2: null, crop: null, loads: 0, cover: false, settled: -1, ...(kind === 'garden' ? { succ: 1 } : {}) });

export interface Seeds {
  /** Which seed is sown first. */
  first: StockLine;
  /** Vigor of the saved seed on hand (weighted by what was kept back from). */
  savedVigor: number;
  /** This year: fields sown, left unsown, units kept back; the year; the spring summary was told. */
  year: number;
  sown: number;
  unsown: number;
  kept: number;
  told: number;
}
export const newSeeds = (): Seeds => ({ first: 'saved', savedVigor: 1, year: 0, sown: 0, unsown: 0, kept: 0, told: -1 });

// ─────────────────────────────────────────────────────────────────────────
// State access
// ─────────────────────────────────────────────────────────────────────────

export const plotsOf = (s: GameState): Record<string, Plot> => (farmOf(s).plots ??= {});
export const seedsOf = (s: GameState): Seeds => (farmOf(s).seeds ??= newSeeds());
const stock = (s: GameState, k: string): number => (s.stock as unknown as Record<string, number>)[k] ?? 0;

/** Finished or planted fields and gardens (the planting stage is done), in id order. */
export const fieldsOf = (s: GameState, planted = false): Structure[] => s.structures.filter(st => st.kind === 'field' && (isFinished(st) || (planted && st.stage >= 3)));
export const gardensOf = (s: GameState): Structure[] => s.structures.filter(st => st.kind === 'garden' && isFinished(st));

const year = (s: GameState) => calendarOf(s.clock).year;

/** The sowing window (day of year): two weeks before the last frost to 85 days ahead of the first. */
export function sowWindow(s: GameState): [number, number] {
  const [last, first] = REGIONS[s.site.region].frost;
  return [last - 14, Math.max(last + 20, first - 85)];
}
/** The days of the window the spring work is piling up (the first six weeks of it). */
export const SOW_DAYS = 42;
/** Backlog per field a day in the sowing work, and the share of a full crop a very late sowing keeps. */
export const SOW_RATE = 1.5, CATCH_CROP = 0.35;

/** A crop sown on `doy`: a full crop inside the window, fading over six weeks to the catch crop, nothing late in the season. */
export function lateFactor(s: GameState, doy: number): number {
  const [, w1] = sowWindow(s), first = REGIONS[s.site.region].frost[1];
  if (doy <= w1) return 1;
  if (doy > first - 55) return 0;
  return Math.max(CATCH_CROP, 1 - (1 - CATCH_CROP) * (doy - w1) / 42);
}

/** The sowing work behind: the whole season's sowing is late by up to 40 %. */
export const sowDelay = (s: GameState): number => 1 - 0.4 * Math.max(0, ((s.daily?.chores.levels as Record<string, number> | undefined)?.sowing ?? 0) - 20) / 80;

/** Sowing-chore growth a day (sim/daily.ts `choreRates`): spring only. */
export function sowingRate(s: GameState): number {
  const { doy } = calendarOf(s.clock), [w0] = sowWindow(s);
  return doy >= w0 && doy < w0 + SOW_DAYS ? SOW_RATE * (fieldsOf(s).length + 0.4 * gardensOf(s).length) : 0;
}

// ─────────────────────────────────────────────────────────────────────────
// The plot's yield factors
// ─────────────────────────────────────────────────────────────────────────

/** The crop Auto picks after `prev`: the rotation's next; no cellar means no potatoes (they would rot in the kitchen). */
export function autoCrop(s: GameState, prev: CropId | null, index: number): CropId {
  let c: CropId = prev === null ? CYCLE[index % CYCLE.length] : prev === 'rest' ? 'potatoes' : CYCLE[(CYCLE.indexOf(prev) + 1) % CYCLE.length];
  if (c === 'potatoes' && !s.structures.some(st => st.kind === 'root_cellar' && isFinished(st)) && !s.structures.some(st => st.kind === 'bunker_stores' && isFinished(st))) c = 'wheat';
  return c;
}

/** Yield factor of `crop` after `prev` (and the year before): the rotation, 1 for a fine one. */
export function rotationFactor(crop: CropId, prev: CropId | null, prev2: CropId | null, coverLast = false): number {
  if (crop === 'rest') return 1;
  if (prev === crop) return crop === 'potatoes' ? (prev2 === crop ? 0.7 : 0.78) : 0.9;
  if ((prev === 'beans' || (prev === 'rest' && coverLast)) && crop !== 'beans') return 1.06;
  if (prev === 'rest') return 1.03;
  return 1;
}

/** Seeded year of trouble: blight in the potatoes (wet years), bean beetle, wheat rust. Returns the yield multiplier on each crop. */
export function troubleOf(seed: number, y: number): { name: string; crop: CropId; hit: number } | null {
  const a = mulberry32(seed * 4421 + y * 9173 + 17)();
  if (a < 0.1) return { name: 'late blight', crop: 'potatoes', hit: 0.8 };
  if (a < 0.17) return { name: 'bean beetle', crop: 'beans', hit: 0.85 };
  if (a < 0.24) return { name: 'wheat rust', crop: 'wheat', hit: 0.85 };
  return null;
}

/** Share of this year's trouble a plot takes: rotation halves it, hybrid seed resists a third. */
export function troubleFactor(s: GameState, p: Plot): number {
  const t = troubleOf(s.seed, year(s));
  if (!t || p.crop !== t.crop) return 1;
  let hit = 1 - t.hit;
  if (p.prev !== p.crop) hit *= 0.5; else hit *= 1.6;
  if (p.sown?.line === 'hybrid') hit *= 0.67;
  return 1 - hit;
}

/** A plot nobody has recorded (an old save or a hand-built state): the field as it was, sown on time, fertility 1. */
function legacyPlot(s: GameState, st: Structure, index: number): Plot {
  const p = newPlot(st.kind === 'garden' ? 'garden' : 'field');
  if (st.kind === 'field') { p.crop = autoCrop(s, null, index); p.sown = { y: year(s), doy: 150, line: 'heirloom', v: 1, late: 1 }; }
  return p;
}

/** The plot of a field or garden (a stand-in when none is recorded; the stand-in is not stored). */
export function plotFor(s: GameState, st: Structure): Plot {
  const P = farmOf(s).plots;
  const have = P?.[st.id];
  if (have) return have;
  const idx = s.structures.filter(x => x.kind === st.kind).indexOf(st);
  return legacyPlot(s, st, Math.max(0, idx));
}

/** What a field's crop is worth this year against an average one (1 = the old flat field). 0 when it was not sown. */
export interface FieldFactor { crop: CropId; sown: boolean; share: number; fert: number; rotation: number; vigor: number; timing: number; trouble: number; total: number }
export function fieldFactor(s: GameState, st: Structure): FieldFactor {
  const p = plotFor(s, st), y = year(s);
  const crop = p.crop ?? 'beans';
  const sown = !!p.sown && p.sown.y === y && crop !== 'rest';
  const share = CROPS[crop].share, f = fertFactor(p.fert), rot = rotationFactor(crop, p.prev, p.prev2, p.cover), vig = p.sown?.v ?? 1, tim = p.sown?.late ?? 1;
  const tr = troubleFactor(s, p);
  return { crop, sown, share, fert: f, rotation: rot, vigor: vig, timing: tim, trouble: tr, total: sown ? share * f * rot * vig * tim * tr : 0 };
}

/** The garden's factor: fertility and successions (the season length is `successionDays`). */
export function gardenFactor(s: GameState): number {
  const gs = gardensOf(s);
  if (!gs.length) return 1;
  return gs.reduce((a, st) => { const p = plotFor(s, st); return a + fertFactor(p.fert) * (1 + 0.07 * ((p.succ ?? 1) - 1)); }, 0) / gs.length;
}
/** Days the best-tended garden adds to the end of its season (the later sowings). */
export const successionDays = (s: GameState): number => Math.max(0, ...gardensOf(s).map(st => 8 * ((plotFor(s, st).succ ?? 1) - 1)));
/** The weeding backlog's multiplier: a fifth more per extra sowing. */
export const weedFactor = (s: GameState): number => { const gs = gardensOf(s); return gs.length ? gs.reduce((a, st) => a + 1 + 0.2 * ((plotFor(s, st).succ ?? 1) - 1), 0) / gs.length : 1; };

// ─────────────────────────────────────────────────────────────────────────
// Seed
// ─────────────────────────────────────────────────────────────────────────

/** Seed units on hand by line. */
export const seedOnHand = (s: GameState): Record<StockLine, number> => ({ heirloom: stock(s, 'seed_heirloom'), hybrid: stock(s, 'seed'), saved: stock(s, 'seed_saved') });
export const seedTotal = (s: GameState): number => { const h = seedOnHand(s); return h.heirloom + h.hybrid + h.saved; };
/** Seed wanted for next spring: a unit a field and a quarter spare. */
export const seedTarget = (s: GameState): number => Math.ceil(fieldsOf(s, true).length * 1.25 - 1e-9);

/** Vigor a line's first sowing has, given the saved seed's vigor. */
export const lineVigor = (s: GameState, line: SeedLine): number => (line === 'hybrid' ? VIGOR.hybrid : line === 'saved' ? seedsOf(s).savedVigor : line === 'volunteer' ? VIGOR.volunteer : 1);

/** The order seed is drawn in. */
function lineOrder(first: StockLine): StockLine[] {
  const all: StockLine[] = ['saved', 'heirloom', 'hybrid'];
  return [first, ...all.filter(x => x !== first)];
}

/** Take one unit of seed (the player's order first); null when there is none. */
export function takeSeed(s: GameState, first: StockLine = seedsOf(s).first): { line: StockLine; v: number } | null {
  for (const line of lineOrder(first)) {
    const k = SEED_STOCK[line];
    if (stock(s, k) >= 0.999) { (s.stock as unknown as Record<string, number>)[k] = stock(s, k) - 1; return { line, v: lineVigor(s, line) }; }
  }
  return null;
}

/** What seed saved from a crop sown with `sown` is worth next year. */
export function offspringVigor(sown: Sown): number {
  if (sown.line === 'hybrid') return VIGOR.fromHybrid;
  const v = sown.v;
  return v < 1 ? Math.min(VIGOR.regainCap, v + VIGOR.regain) : Math.min(VIGOR.adaptCap, v + VIGOR.adapt);
}

/**
 * Harvest days: set next spring's seed aside from the crop. `flow` is the day's field harvest (kcal);
 * returns the kcal kept back (the food that does not reach the table). Never more than 40 % of the day's crop.
 */
export function keepSeed(s: GameState, flow: number): number {
  if (flow <= 0) return 0;
  const sd = seedsOf(s), want = seedTarget(s) - seedTotal(s);
  if (want <= 1e-6) return 0;
  const kcal = Math.min(flow * 0.4, want * SEED_UNIT_KCAL), units = kcal / SEED_UNIT_KCAL;
  // the new seed's vigor: the average of what the sown plots would give
  const sown = fieldsOf(s).map(st => plotFor(s, st).sown).filter((x): x is Sown => !!x);
  const v = sown.length ? sown.reduce((a, x) => a + offspringVigor(x), 0) / sown.length : 1;
  const have = stock(s, 'seed_saved');
  sd.savedVigor = have + units > 0 ? (sd.savedVigor * have + v * units) / (have + units) : v;
  (s.stock as unknown as Record<string, number>).seed_saved = have + units;
  sd.kept += units;
  return kcal;
}

// ─────────────────────────────────────────────────────────────────────────
// The daily step
// ─────────────────────────────────────────────────────────────────────────

/** Manure a head makes a day (loads of a pickup): the barn pile. */
export const MANURE: Record<string, number> = { goat: 0.012, pig: 0.016, steer: 0.035, sheep: 0.01, rabbit: 0.002, cow: 0.04 };
/** Loads the pile and the heap can hold. */
export const PILE_MAX = 40;

/** Once a day (before the eating step): the compost heap, the manure pile, planting, the spring sowing, the season's close. Returns log lines. */
export function cropsDay(s: GameState): string[] {
  const out: string[] = [];
  const { doy, year: y } = calendarOf(s.clock);
  const P = plotsOf(s), sd = seedsOf(s), [w0, w1] = sowWindow(s);
  const H = seasons(REGIONS[s.site.region]).harvest;
  const st = s.stock as unknown as Record<string, number>;
  if (sd.year !== y) { sd.year = y; sd.sown = 0; sd.unsown = 0; sd.kept = 0; }
  // the heap: kitchen scraps, weeds and straw
  const heads = s.personState.filter(ps => ps.needs.died == null).length, gardens = gardensOf(s).length;
  st.compost = Math.min(PILE_MAX, (st.compost ?? 0) + heads * 0.005 + (doy >= 120 && doy <= 280 ? gardens * 0.01 : 0));
  // the plots: make one for every field and garden, plant what was planted when it was built
  const fields = fieldsOf(s, true);
  fields.forEach((f, i) => {
    let p = P[f.id];
    if (!p) { p = P[f.id] = newPlot('field'); }
    if (!p.planted && f.stage >= 3) {
      // the planting stage of the build put the seed in the ground today (a field finished long ago, in an old save or a test state, was sown on time)
      p.planted = true;
      const old = f.finishedAt !== null && s.clock.t - f.finishedAt > 5;
      const late = old ? 1 : lateFactor(s, doy);
      p.crop = p.pin && p.pin !== 'rest' ? p.pin : autoCrop(s, p.prev, i);
      // the planting stage used the plain Shop seed: hybrid (a field finished long ago, in an old save or a test state, was heirloom)
      p.sown = old ? { y, doy, line: 'heirloom', v: 1, late: late * sowDelay(s) } : { y, doy, line: 'hybrid', v: VIGOR.hybrid, late: late * sowDelay(s) };
      if (late <= 0) { p.sown = undefined; p.crop = null; if (logGate(s, `late-plant:${f.id}`, 300)) out.push('A field was planted too late in the year to make a crop: it will be sown properly next spring.'); }
      else if (late < 0.99 && logGate(s, `late-plant:${f.id}`, 300)) out.push(`The new field went in late: about ${Math.round(late * 100)} % of a crop this year.`);
    }
  });
  for (const g of gardensOf(s)) P[g.id] ??= newPlot('garden');
  // the spring sowing: every plot not sown this year draws a unit of seed, inside the window and the weeks after it
  if (doy >= w0 && doy <= w1 + 28) {
    const todo = fields.filter(f => { const p = P[f.id]; return !!p && p.planted && (!p.sown || p.sown.y !== y); });
    let sown = 0, rested = 0, unsown = 0, loads = 0, volunteers = 0;
    todo.forEach(f => {
      const p = P[f.id];
      if (p.pin === 'rest') {
        const cover = st.seed_cover >= 1; if (cover) st.seed_cover -= 1;
        p.crop = 'rest'; p.cover = cover; p.sown = { y, doy, line: 'heirloom', v: 1, late: 1 }; p.loads = 0; rested++;
        return;
      }
      const got = takeSeed(s);
      if (!got) {
        // the window is closing and the seed never came: the field comes up in weeds and last year's strays, a poor crop and not a bare one
        if (doy >= w1 + 28) {
          p.crop = p.pin ?? autoCrop(s, p.prev, fields.indexOf(f));
          p.cover = false; p.loads = 0;
          p.sown = { y, doy, line: 'volunteer', v: VIGOR.volunteer, late: 1 };
          volunteers++;
        } else unsown++;
        return;
      }
      p.crop = p.pin ?? autoCrop(s, p.prev, fields.indexOf(f));
      p.cover = false; p.loads = 0;
      const late = lateFactor(s, doy);
      p.sown = { y, doy, line: got.line, v: got.v, late: late * sowDelay(s) };
      sown++;
    });
    // manure and compost go on the sown fields
    if (sown + rested > 0) {
      for (const f of todo) {
        const p = P[f.id];
        if (!p || p.sown?.y !== y || p.loads > 0) continue;
        while (p.loads < MAX_LOADS && (st.manure >= 1 || st.compost >= 1)) {
          if (st.manure >= 1) { st.manure -= 1; p.fert += FERT.manure; } else { st.compost -= 1; p.fert += FERT.compost; }
          p.loads++; loads++;
        }
      }
    }
    sd.sown += sown; sd.unsown = unsown + volunteers;
    if (sown + rested + unsown + volunteers > 0 && sd.told !== y) {
      sd.told = y;
      const parts = [sown ? `${sown} field${sown === 1 ? '' : 's'} sown` : '', rested ? `${rested} resting under cover` : '', loads ? `${loads} loads of manure and compost spread` : ''].filter(Boolean);
      if (parts.length) out.push(`Spring work: ${parts.join(', ')}.`);
    }
    if (unsown > 0 && logGate(s, 'no-seed', 20)) out.push(`No seed left for ${unsown} field${unsown === 1 ? '' : 's'}: buy field seed in the Shop, trade for it or find some before the sowing window closes, or ${unsown === 1 ? 'it comes' : 'they come'} up in weeds at about 40 % of a crop.`);
    if (volunteers > 0 && logGate(s, 'volunteers', 200)) out.push(`No seed came for ${volunteers} field${volunteers === 1 ? '' : 's'}, so ${volunteers === 1 ? 'it was' : 'they were'} left to weeds and volunteers from last year: about 40 % of a crop, and seed saved from it is poor. Seed is bought in the Shop, traded for or found scavenging.`);
  }
  // the season's close (the last day of the harvest window): fertility, rotation, the year's trouble
  if (doy === H[1] % 365) {
    for (const f of fields) {
      const p = P[f.id];
      if (!p || p.settled === y) continue;
      p.settled = y;
      const crop = p.sown?.y === y ? p.crop : null;
      let df = FERT.recover;
      if (crop) df += CROPS[crop].fert + (crop === 'rest' && p.cover ? FERT.coverGain - CROPS.rest.fert : 0);
      else df += 0.02;
      p.fert = Math.max(FERT.min, Math.min(FERT.max, p.fert + df));
      if (p.fert > 1) p.fert = 1 + (p.fert - 1) * (1 - FERT.leach);
      p.prev2 = p.prev; p.prev = crop ?? p.prev; p.crop = null; p.sown = undefined; p.loads = 0;
    }
    for (const g of gardensOf(s)) {
      const p = P[g.id];
      if (!p || p.settled === y) continue;
      p.settled = y;
      p.fert = Math.max(FERT.min, Math.min(FERT.max, p.fert + FERT.recover - 0.1 + Math.min(0.12, p.loads * 0.03)));
      if (p.fert > 1) p.fert = 1 + (p.fert - 1) * (1 - FERT.leach);
      p.loads = 0;
    }
  }
  // the year's trouble, told once (blight shows in July)
  if (doy === 200) {
    const t = troubleOf(s.seed, y);
    if (t && fields.some(f => P[f.id]?.crop === t.crop)) out.push(t.name === 'late blight' ? 'Late blight has come through in the wet weather: the potatoes are blackening. Rotated fields and hybrid seed took less of it.' : t.name === 'bean beetle' ? 'Bean beetles are in the beans this summer.' : 'Rust on the wheat this year.');
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Player choices
// ─────────────────────────────────────────────────────────────────────────

/** Pin a field to a crop (null: back to Auto). A field already sown this year takes it next spring. */
export function pinField(s: GameState, id: string, crop: CropId | null): string | null {
  const st = s.structures.find(x => x.id === id && x.kind === 'field');
  if (!st) return 'no such field';
  const p = (plotsOf(s)[id] ??= newPlot('field'));
  if (crop === null) delete p.pin; else p.pin = crop;
  return null;
}
/** Garden sowings a season (1–3). */
export function setSuccession(s: GameState, id: string, n: number): string | null {
  const st = s.structures.find(x => x.id === id && x.kind === 'garden');
  if (!st) return 'no such garden';
  (plotsOf(s)[id] ??= newPlot('garden')).succ = Math.max(1, Math.min(3, Math.round(n)));
  return null;
}
export function setSeedFirst(s: GameState, line: StockLine): void { seedsOf(s).first = line; }

/** A warning for the Farm tab and the Next-step cards: fields still to sow with too little seed (before the window closes), or fields that came up in weeds. */
export function seedWarning(s: GameState): { text: string; tone: 'warn' | 'bad'; fields: number } | null {
  const fields = fieldsOf(s, true);
  if (!fields.length) return null;
  const { doy } = calendarOf(s.clock), [w0, w1] = sowWindow(s), P = plotsOf(s), y = year(s);
  const weedy = fields.filter(f => P[f.id]?.sown?.y === y && P[f.id]?.sown?.line === 'volunteer').length;
  if (weedy) return { text: `${weedy} field${weedy === 1 ? '' : 's'} came up in weeds and volunteers this year because no seed came: about 40 % of a crop. Buy field seed in the Shop before next spring.`, tone: 'bad', fields: weedy };
  if (doy < w0 - 30 || doy > w1 + 28) return null;
  const need = fields.filter(f => { const p = P[f.id]; return p?.pin !== 'rest' && !(p?.sown && p.sown.y === y); }).length, have = seedTotal(s);
  if (need <= 0 || have >= need - 1e-6) return null;
  const left = w1 + 28 - doy;
  return { text: `${need} field${need === 1 ? '' : 's'} to sow and ${have >= 10 ? Math.round(have) : have.toFixed(1)} unit${have === 1 ? '' : 's'} of seed on hand: buy field seed in the Shop, trade for it or find some${left > 1 ? ` in the next ${left} days` : left >= 0 ? ' today' : ''}, or the rest come up in weeds at about 40 % of a crop.`, tone: doy > w1 ? 'bad' : 'warn', fields: need - Math.floor(have) };
}

/** Spreading and sowing in numbers for the Farm tab: the average field's fertility, the worst, and whether the rotation is clean. */
export interface FieldRow { id: string; crop: CropId; pinned: boolean; fert: number; prev: CropId | null; factor: FieldFactor; note: string | null; /** Sown with weeds and volunteers this year: no seed came. */ weedy: boolean }
export function fieldRows(s: GameState): FieldRow[] {
  return fieldsOf(s, true).map((f, i) => {
    const p = plotFor(s, f), ff = fieldFactor(s, f);
    const crop = p.crop ?? p.pin ?? autoCrop(s, p.prev, i);
    let note: string | null = null;
    const weedy = !!p.sown && p.sown.y === year(s) && p.sown.line === 'volunteer';
    if (weedy) note = 'No seed came: weeds and volunteers, about 40 % of a crop. Buy field seed in the Shop for next spring';
    else if (p.fert < 0.8) note = 'Tired soil: rest it under a cover crop or spread manure';
    else if (p.prev === crop && crop !== 'rest') note = `${CROPS[crop].name} after ${CROPS[crop].name.toLowerCase()}: the yield pays for it`;
    else if (p.sown && p.sown.y === year(s) && p.sown.late < 0.8) note = 'Sown late this year';
    return { id: f.id, crop, pinned: !!p.pin, fert: p.fert, prev: p.prev, factor: ff, note, weedy };
  });
}
