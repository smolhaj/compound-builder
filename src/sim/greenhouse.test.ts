import { describe, expect, it } from 'vitest';
import { calendarOf, newGame, type GameState, type Structure } from './state';
import { produce } from './needs';
import { gardenSeason, greenhouseGreens, GREENHOUSE_EXTEND, greensFactor, orchardBearing, orchardFrost, orchardHarvest, ORCHARD_KCAL, ORCHARD_PICK } from './greenhouse';
import { REGIONS, seasons } from './regions';
import { BLUEPRINTS, totalBill } from './blueprints';
import { billCost } from './materials';
import { needsPermit } from './paperwork';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';
import { markSown } from './seeds';

const built = (g: GameState, id: string, kind: string, finishedAt = 0): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt };
  g.structures.push(st);
  markSown(g);         // sown this spring (sim/seeds.ts)
  return st;
};
/** A game on day-of-year `doy` of its `years`-th year. */
const at = (doy: number, years = 0, seed = 1) => { const g = newGame(seed, doy); g.clock.t += years * 365; return g; };

describe('greenhouse', () => {
  it('starts the garden six weeks earlier and ends it six weeks later', () => {
    const g = newGame(1);
    const [g0, g1] = seasons(REGIONS[g.site.region]).garden;
    built(g, 'g', 'garden');
    expect(gardenSeason(g)).toEqual([g0, g1]);
    built(g, 'h', 'greenhouse');
    expect(gardenSeason(g)).toEqual([g0 - GREENHOUSE_EXTEND, g1 + GREENHOUSE_EXTEND]);
    // a few weeks before the garden would start: nothing without the greenhouse, beds growing with it
    const early = g0 - 20;
    const a = at(early), b = at(early);
    built(a, 'g', 'garden'); built(b, 'g', 'garden'); built(b, 'h', 'greenhouse');
    expect(produce(a)).toBe(0);
    expect(produce(b)).toBeGreaterThan(0);
  });

  it('seedlings raise the garden peak about 15 %', () => {
    const a = at(220), b = at(220);
    built(a, 'g', 'garden'); built(b, 'g', 'garden'); built(b, 'h', 'greenhouse');
    expect(produce(b) / produce(a)).toBeCloseTo(1.15, 2);
  });

  it('grows winter greens October to April: ≈ 600 kcal a day here, more where mild, less under heavy snow unless heated', () => {
    const w = at(20);
    built(w, 'h', 'greenhouse');
    expect(REGIONS[w.site.region].cold).toBe(1);
    expect(greenhouseGreens(w)).toBeCloseTo(600);
    expect(produce(w)).toBeCloseTo(600);
    const summer = at(200);
    built(summer, 'h', 'greenhouse');
    expect(greenhouseGreens(summer)).toBe(0);
    expect(greensFactor(0.35, false)).toBeGreaterThan(1.3);
    expect(greensFactor(1.5, false)).toBeLessThan(0.75);
    expect(greensFactor(1.5, true)).toBe(1);
    // the greenhouse being built is not enough: it has to be finished
    const half = at(20);
    half.structures.push({ id: 'h', kind: 'greenhouse', x: 0, z: 0, rot: 0, stage: 3, done: 0, supplied: true, finishedAt: null });
    expect(greenhouseGreens(half)).toBe(0);
  });

  it('costs about a kit and a base, ~60 hours, and needs a small permit', () => {
    const bp = BLUEPRINTS.greenhouse;
    expect(bp.stages.length).toBe(5);
    const hours = bp.stages.reduce((a, s) => a + s.hours, 0);
    expect(hours).toBeGreaterThanOrEqual(50); expect(hours).toBeLessThanOrEqual(70);
    const cost = billCost(totalBill(bp));
    expect(cost).toBeGreaterThan(4500); expect(cost).toBeLessThan(6500);
    expect(needsPermit('greenhouse')).toBe(true);
    expect(needsPermit('orchard')).toBe(false);
  });
});

describe('orchard', () => {
  /** A seed and year with (or without) a late frost. */
  const yearOf = (g: GameState) => calendarOf(g.clock).year;
  const findSeed = (frost: boolean, years: number) => {
    for (let seed = 1; seed < 500; seed++) { const g = at(240, years, seed); if (orchardFrost(seed, yearOf(g)) === frost) return seed; }
    throw new Error('no seed');
  };

  it('bears nothing for three years, then ramps to full by the sixth', () => {
    expect(orchardBearing(0)).toBe(0);
    expect(orchardBearing(2.9)).toBe(0);
    expect(orchardBearing(3)).toBeCloseTo(0.25);
    expect(orchardBearing(4.5)).toBeCloseTo(0.5);
    expect(orchardBearing(6)).toBe(1);
    expect(orchardBearing(20)).toBe(1);
    for (const years of [1, 2]) { const seed = findSeed(false, years); const g = at(240, years, seed); built(g, 'o', 'orchard'); expect(orchardHarvest(g)).toBe(0); }
    const seed = findSeed(false, 7), g = at(240, 7, seed);
    built(g, 'o', 'orchard');
    expect(orchardHarvest(g)).toBeCloseTo(ORCHARD_KCAL / (ORCHARD_PICK[1] - ORCHARD_PICK[0]));
  });

  it('is picked August to October only, ≈ 900,000 kcal a year at full', () => {
    const seed = findSeed(false, 7);
    let year = 0;
    for (let d = 0; d < 365; d++) {
      const g = at(1, 7, seed); g.clock.t += d;
      built(g, 'o', 'orchard');
      if (orchardFrost(seed, yearOf(g))) continue;
      const k = orchardHarvest(g);
      const doy = calendarOf(g.clock).doy;
      if (doy < ORCHARD_PICK[0] || doy >= ORCHARD_PICK[1]) expect(k).toBe(0);
      year += k;
    }
    expect(year).toBeGreaterThan(0);
    expect(year).toBeLessThanOrEqual(ORCHARD_KCAL + 1);
  });

  it('a late frost takes a year\'s crop about one year in six', () => {
    const seed = findSeed(true, 7), g = at(240, 7, seed);
    built(g, 'o', 'orchard');
    expect(orchardHarvest(g)).toBe(0);
    let frosts = 0;
    for (let s = 1; s <= 200; s++) for (let y = 2026; y < 2056; y++) if (orchardFrost(s, y)) frosts++;
    expect(frosts / 6000).toBeGreaterThan(0.13);
    expect(frosts / 6000).toBeLessThan(0.2);
  });

  it('costs ≈ $600 and ≈ 30 hours', () => {
    const bp = BLUEPRINTS.orchard;
    expect(bp.stages.reduce((a, s) => a + s.hours, 0)).toBe(30);
    const cost = billCost(totalBill(bp));
    expect(cost).toBeGreaterThan(500); expect(cost).toBeLessThan(700);
  });
});

describe('save', () => {
  it(`a v34 save gets the new goods at zero (v${SAVE_VERSION})`, () => {
    const g = newGame(1) as unknown as Record<string, unknown>;
    const stock = { ...(g.stock as Record<string, number>) };
    delete stock.greenhouse_kit; delete stock.fruit_trees;
    const up = migrate({ ...g, version: 34, stock });
    expect(up.version).toBe(SAVE_VERSION);
    expect(up.stock.greenhouse_kit).toBe(0);
    expect(up.stock.fruit_trees).toBe(0);
  });
});
