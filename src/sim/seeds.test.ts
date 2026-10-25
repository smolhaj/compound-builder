import { describe, expect, it } from 'vitest';
import { calendarOf, newGame, type GameState, type Structure } from './state';
import { cropFactor, keepSeed, lateFactor, nextVigor, SEED_UNIT_KCAL, seedNeed, seedsDay, sowWindow, VIGOR } from './seeds';
import { fieldHarvest, liveDay } from './needs';
import { REGIONS, seasons } from './regions';
import { CLASSIC } from './site';

const field = (g: GameState, id = 'f', kind = 'field'): Structure => { const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
/** Step the seed day by day from the start through `days`. */
const days = (g: GameState, n: number) => { const out: string[] = []; for (let d = 0; d < n; d++) { g.clock.t += 1; out.push(...seedsDay(g)); } return out; };

describe('seed saving', () => {
  it('a field is sown in the spring window from the seed store; without seed it lies fallow and grows nothing', () => {
    const [w0] = sowWindow(newGame(1));
    const g = newGame(1, w0 - 5);
    const f = field(g);
    g.stock.seed_saved = 1;
    days(g, 10);
    expect(f.sown?.y).toBe(calendarOf(g.clock).year);
    expect(g.stock.seed_saved).toBeCloseTo(0);
    const h = newGame(1, w0 - 5);
    const e = field(h);
    const lines = days(h, 120);
    expect(cropFactor(h, e)).toBe(0);
    expect(lines.some(l => /no seed/i.test(l))).toBe(true);
    expect(lines.some(l => /fallow/.test(l))).toBe(true);
    // at harvest time the fallow field makes nothing, the sown one its crop
    const [h0] = seasons(REGIONS[g.site.region]).harvest;
    g.clock.t += h0 - calendarOf(g.clock).doy + 5; h.clock.t += h0 - calendarOf(h.clock).doy + 5;
    expect(fieldHarvest(g)).toBeGreaterThan(0);
    expect(fieldHarvest(h)).toBe(0);
  });

  it('hybrid seed yields 10 % more; seed saved from it doesn\'t come true; heirloom does', () => {
    expect(VIGOR.hybrid).toBeGreaterThan(VIGOR.heirloom);
    expect(nextVigor('hybrid', VIGOR.hybrid)).toBeLessThan(0.8);
    expect(nextVigor('heirloom', 1)).toBe(1);
    expect(nextVigor('saved', 0.7)).toBeCloseTo(0.75);      // selection brings a line back slowly
    const [w0] = sowWindow(newGame(1));
    const a = newGame(1, w0), b = newGame(1, w0);
    const fa = field(a), fb = field(b);
    a.stock.seed = 1; a.farm.seeds.first = 'hybrid';
    b.stock.seed_heirloom = 1; b.farm.seeds.first = 'heirloom';
    seedsDay(a); seedsDay(b);
    expect(cropFactor(a, fa) / cropFactor(b, fb)).toBeCloseTo(1.1);
    // seed kept off the hybrid crop carries its weak vigor
    a.stock.seed_saved = 0;
    keepSeed(a, 100_000);
    expect(a.farm.seeds.savedVigor).toBeCloseTo(VIGOR.savedFromHybrid);
    b.stock.seed_saved = 0;
    keepSeed(b, 100_000);
    expect(b.farm.seeds.savedVigor).toBeCloseTo(1);
  });

  it('about 10 % of the field harvest is kept back, until next spring\'s seed is in with a quarter to spare', () => {
    const g = newGame(1, 250);
    field(g); field(g, 'f2');
    const k = keepSeed(g, 100_000);
    expect(k).toBeCloseTo(10_000);
    expect(g.stock.seed_saved).toBeCloseTo(10_000 / SEED_UNIT_KCAL);
    for (let i = 0; i < 40; i++) keepSeed(g, 100_000);
    expect(g.stock.seed_saved).toBeCloseTo(seedNeed(g) * 1.25);
    expect(keepSeed(g, 100_000)).toBe(0);
    g.farm.seeds.keep = 0;
    g.stock.seed_saved = 0;
    expect(keepSeed(g, 100_000)).toBe(0);
  });

  it('a season of the eating step keeps seed back from a sown field automatically', () => {
    const [w0] = sowWindow(newGame(1));
    const g = newGame(1, w0 + 2);
    g.disaster.tracks = { ...g.disaster.tracks, stores: 0, banks: 0 };
    g.stock.staples = 40;
    field(g);
    g.stock.seed_heirloom = 1;
    for (let d = 0; d < 230; d++) { g.clock.t += 1; liveDay(g, 0.5); }
    expect(g.stock.seed_saved).toBeGreaterThan(1);           // next spring's seed and some to spare
  });

  it('sown late (a long-season region), the crop comes in short', () => {
    const g = newGame(1, 100, 2027, { site: { ...CLASSIC, region: 'appalachia' } });
    const [last] = REGIONS[g.site.region].frost, [, w1] = sowWindow(g);
    expect(lateFactor(g, last)).toBe(1);
    expect(lateFactor(g, w1)).toBeCloseTo(0.5);
  });

  it('after hail the crop is replanted from the seed store, or lost without seed', () => {
    const [w0] = sowWindow(newGame(1));
    const g = newGame(1, w0 + 1);
    const f = field(g);
    g.stock.seed_saved = 1;
    seedsDay(g);
    const c = calendarOf(g.clock);
    g.weather = { active: null, last: -999, hail: { year: c.year, doy: c.doy + 20 } };
    days(g, 25);
    expect(f.sown?.lost).toBe(true);
    const h = newGame(1, w0 + 1);
    const e = field(h);
    h.stock.seed_saved = 2;
    seedsDay(h);
    h.weather = { active: null, last: -999, hail: { year: c.year, doy: c.doy + 20 } };
    days(h, 25);
    expect(e.sown?.lost).toBeFalsy();
    expect(h.stock.seed_saved).toBeCloseTo(0);
  });
});
