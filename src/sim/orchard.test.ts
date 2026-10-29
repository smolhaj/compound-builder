import { describe, expect, it } from 'vitest';
import { calendarOf, newGame, type GameState, type Structure } from './state';
import { makeLotSite } from './lotListing';
import { orchardCareOf } from './farm';
import { produce, produceParts } from './needs';
import { pollination } from './bees';
import { balanceDay, plant } from './utilities';
import { choreRates } from './daily';
import { calendar } from './farmPlan';
import { REGIONS } from './regions';
import {
  DRAIN_DAYS, FRUIT, FRUITS, KCAL_PER_LB, ORCHARD_TREES, POCKET_DAYS, WATER_DAYS, ageOf, anyBearing, bearing, blossomLoss, calendarOfFruit, frostLoss, frostRisk, fruitLook,
  fruitYear, hardFrostDay, medianFrost, orchardColumns, orchardDay, orchardExpectedKcal, orchardPicking, orchardSiteNote, orchardWaterL, orchardYearKcal, plotReport, plotSite,
  pruneDay, treesOf, type Fruit,
} from './orchard';

const built = (g: GameState, id: string, kind: string, x = 10, z = 10, finishedAt = 0): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 5, done: 0, supplied: true, finishedAt };
  g.structures.push(st);
  return st;
};
/** A game on day `doy`, `years` after the orchard (finished at t = 0) went in. */
const at = (doy: number, years: number, seed = 1) => { const g = newGame(seed, doy); g.clock.t += years * 365; return g; };
const hill = (seed = 7, doy = 150, region: 'pnw' | 'mountain_west' | 'appalachia' = 'mountain_west') => newGame(seed, doy, 2027, { site: makeLotSite({ region, kind: 'hillside', seed: 8, relief: 9, elevM: 2000 }) });

describe('the plots', () => {
  it('a plot is a row of each fruit: 12 trees, 48 in a grove', () => {
    expect(orchardColumns('orchard')).toEqual(['apple', 'pear', 'cherry', 'plum']);
    for (const f of FRUITS) expect(treesOf('orchard', f)).toBe(3);
    for (const f of FRUITS) expect(treesOf('orchard_grove', f)).toBe(12);
    expect(FRUITS.reduce((a, f) => a + treesOf('orchard', f), 0)).toBe(ORCHARD_TREES.orchard);
    expect(FRUITS.reduce((a, f) => a + treesOf('orchard_grove', f), 0)).toBe(ORCHARD_TREES.orchard_grove);
    expect(treesOf('garden', 'apple')).toBe(0);
  });
});

describe('years to fruit (real fruit tree timelines)', () => {
  it('first fruit in the 3rd to 5th year, a full crop in the 7th to 10th', () => {
    for (const f of FRUITS) { expect(FRUIT[f].first).toBeGreaterThanOrEqual(3); expect(FRUIT[f].first).toBeLessThanOrEqual(5); expect(FRUIT[f].full).toBeGreaterThanOrEqual(7); expect(FRUIT[f].full).toBeLessThanOrEqual(10); }
    expect(bearing('plum', 2.9)).toBe(0);
    expect(bearing('plum', 3)).toBeCloseTo(0.2);
    expect(bearing('plum', 7)).toBe(1);
    expect(bearing('apple', 3.9)).toBe(0);
    expect(bearing('apple', 4)).toBeCloseTo(0.2);
    expect(bearing('apple', 8)).toBe(1);
    expect(bearing('pear', 4.9)).toBe(0);
    expect(bearing('pear', 5)).toBeCloseTo(1 / 6);
    expect(bearing('pear', 10)).toBe(1);
    expect(bearing('cherry', 4)).toBeGreaterThan(0);
    expect(bearing('cherry', 20)).toBe(1);
  });
  it('the plums come first, the pears last; a young plot bears nothing', () => {
    const young = at(200, 2); built(young, 'o', 'orchard');
    expect(anyBearing(young)).toBe(false);
    expect(orchardYearKcal(young)).toBe(0);
    const three = at(200, 3.5); built(three, 'o', 'orchard');
    expect(anyBearing(three)).toBe(true);
    expect(fruitYear(three, three.structures[0], 'plum')).toBeGreaterThan(0);
    expect(fruitYear(three, three.structures[0], 'apple')).toBe(0);
    const six = at(200, 6.5); built(six, 'o', 'orchard');
    expect(fruitYear(six, six.structures[0], 'pear')).toBeGreaterThan(0);
    expect(fruitYear(six, six.structures[0], 'pear')).toBeLessThan(fruitYear(six, six.structures[0], 'plum'));
  });
  it('an unfinished plot bears nothing and is not in the yield', () => {
    const g = at(260, 9);
    g.structures.push({ id: 'o', kind: 'orchard', x: 10, z: 10, rot: 0, stage: 2, done: 0, supplied: true, finishedAt: null });
    expect(orchardYearKcal(g)).toBe(0);
    expect(orchardPicking(g).kcal).toBe(0);
  });
});

describe('blossom, frost and the pocket', () => {
  const M = 140;
  it('each fruit blooms in its own days against the median last frost: cherry, plum, pear, then apple', () => {
    const c = Object.fromEntries(FRUITS.map(f => [f, calendarOfFruit(M, f)])) as Record<Fruit, ReturnType<typeof calendarOfFruit>>;
    expect(c.cherry.bloom[0]).toBeLessThan(c.plum.bloom[0]);
    expect(c.plum.bloom[0]).toBeLessThan(c.pear.bloom[0]);
    expect(c.pear.bloom[0]).toBeLessThan(c.apple.bloom[0]);
    for (const f of FRUITS) expect(c[f].bloom[1] - c[f].bloom[0] + 1).toBe(FRUIT[f].bloomDays);
  });
  it('and ripens in order through the year: cherries in early summer, plums, pears, apples into the fall', () => {
    const c = Object.fromEntries(FRUITS.map(f => [f, calendarOfFruit(M, f).pick])) as Record<Fruit, [number, number]>;
    expect(c.cherry[0]).toBeLessThan(c.plum[0]);
    expect(c.plum[0]).toBeLessThan(c.pear[0]);
    expect(c.pear[0]).toBeLessThan(c.apple[0]);
    expect(c.cherry[0]).toBeGreaterThan(150);   // June or later where the last frost is in May
    expect(c.cherry[0]).toBeLessThan(215);
  });
  it('a frost before the buds open takes nothing; one in full bloom takes most; the early bloomers lose the most', () => {
    for (const f of FRUITS) expect(blossomLoss(M - 30, f, M)).toBe(0);
    for (const f of FRUITS) { const mid = calendarOfFruit(M, f).bloom[1]; expect(blossomLoss(mid + 30, f, M)).toBeCloseTo(0.9); }
    // the same frost date, a frost on May 20 against a median of May 20
    expect(blossomLoss(M, 'cherry', M)).toBeGreaterThan(blossomLoss(M, 'plum', M));
    expect(blossomLoss(M, 'plum', M)).toBeGreaterThan(blossomLoss(M, 'pear', M));
    expect(blossomLoss(M, 'pear', M)).toBeGreaterThan(blossomLoss(M, 'apple', M));
  });
  it('the ordinary-year risk: apples are safest, cherries lose a tenth or more; a cold-air pocket makes every fruit worse', () => {
    const r = Object.fromEntries(FRUITS.map(f => [f, frostRisk(M, 0, f)])) as Record<Fruit, number>;
    expect(r.apple).toBeLessThan(r.pear);
    expect(r.pear).toBeLessThan(r.plum);
    expect(r.plum).toBeLessThan(r.cherry);
    expect(r.apple).toBeLessThan(0.08);
    expect(r.cherry).toBeGreaterThan(0.08);
    expect(r.cherry).toBeLessThan(0.4);
    for (const f of FRUITS) {
      expect(frostRisk(M, POCKET_DAYS, f)).toBeGreaterThan(frostRisk(M, 0, f));
      expect(frostRisk(M, DRAIN_DAYS, f)).toBeLessThan(frostRisk(M, 0, f));
    }
    expect(frostRisk(M, POCKET_DAYS, 'apple')).toBeGreaterThan(2 * frostRisk(M, 0, 'apple'));
  });
  it('the frost date is seeded per game and year, about 11 days before the median', () => {
    expect(hardFrostDay(3, 2030, M)).toBe(hardFrostDay(3, 2030, M));
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) for (let y = 2027; y < 2047; y++) { sum += hardFrostDay(seed, y, M); n++; }
    expect(sum / n).toBeGreaterThan(M - 14);
    expect(sum / n).toBeLessThan(M - 8);
  });
  it('the year\'s loss follows the frost date: a late frost takes the cherries and leaves the apples', () => {
    const g = at(200, 9); const st = built(g, 'o', 'orchard');
    const m = medianFrost(g), year = calendarOf(g.clock).year;
    let late: number | null = null;
    for (let seed = 1; seed < 400 && late === null; seed++) { const d = hardFrostDay(seed, year, m); if (d >= calendarOfFruit(m, 'cherry').bloom[0] + 3 && d < calendarOfFruit(m, 'apple').bloom[0]) late = seed; }
    expect(late).not.toBeNull();
    g.seed = late!;
    expect(frostLoss(g, st, 'cherry')).toBeGreaterThan(0.3);
    expect(frostLoss(g, st, 'apple')).toBe(0);
    expect(fruitYear(g, st, 'cherry')).toBeLessThan(0.7 * 3 * FRUIT.cherry.lb * KCAL_PER_LB);
  });
});

describe('a frost pocket on the lot (sim/terrain.ts: the ground lower than the land round it)', () => {
  it('reads the lot\'s own ground: some places are pockets, some slopes drain the cold air, some neither', () => {
    const g = hill();
    const seen = { pocket: 0, drained: 0, neutral: 0 };
    for (let x = 4; x <= 64; x += 4) for (let z = 4; z <= 64; z += 4) { const p = plotSite(g, { x, z }); if (p.pocket) seen.pocket++; else if (p.drained) seen.drained++; else seen.neutral++; }
    expect(seen.pocket + seen.drained + seen.neutral).toBe(256);
    expect(seen.drained).toBeGreaterThan(0);
    expect(seen.neutral).toBeGreaterThan(0);
  });
  it('a plot with no lot has no pocket', () => {
    expect(plotSite(newGame(1), { x: 20, z: 20 })).toEqual({ pocket: false, drained: false, shift: 0 });
  });
  it('a pocket plot is told so when staked, and loses more blossom than the same trees up the slope', () => {
    const g = hill(7, 200);
    let pocket: [number, number] | null = null, slope: [number, number] | null = null;
    for (let x = 4; x <= 64 && !(pocket && slope); x += 2) for (let z = 4; z <= 64; z += 2) { const p = plotSite(g, { x, z }); if (p.pocket && !pocket) pocket = [x, z]; if (p.drained && !slope) slope = [x, z]; }
    if (pocket) {
      expect(orchardSiteNote(g, pocket[0], pocket[1])).toMatch(/cold-air pocket/);
      if (slope) {
        const a = plotSite(g, { x: pocket[0], z: pocket[1] }), b = plotSite(g, { x: slope[0], z: slope[1] });
        const m = medianFrost(g);
        for (const f of FRUITS) expect(frostRisk(m, a.shift, f)).toBeGreaterThan(frostRisk(m, b.shift, f));
      }
    }
    if (slope) expect(orchardSiteNote(g, slope[0], slope[1])).toMatch(/drain/);
    expect(pocket || slope).not.toBeNull();
  });
});

describe('the crop', () => {
  it('a mature plot bears about 700,000 kcal in an ordinary year (apples and pears about two thirds of it)', () => {
    const g = at(1, 11); const st = built(g, 'o', 'orchard');
    const expected = orchardExpectedKcal(g);
    expect(expected).toBeGreaterThan(550_000);
    expect(expected).toBeLessThan(700_000);
    const full = FRUITS.reduce((a, f) => a + treesOf('orchard', f) * FRUIT[f].lb * KCAL_PER_LB, 0);
    expect(full).toBe(675_000);
    const pome = (treesOf('orchard', 'apple') * FRUIT.apple.lb + treesOf('orchard', 'pear') * FRUIT.pear.lb) * KCAL_PER_LB;
    expect(pome / full).toBeGreaterThan(0.6);
    expect(plotReport(g, st).fruits.map(f => f.fruit)).toEqual(['apple', 'pear', 'cherry', 'plum']);
  });
  it('is picked fruit by fruit through the year, and the days add up to the year\'s crop', () => {
    const find = () => { for (let seed = 1; seed < 80; seed++) { const g = at(1, 12, seed); const y = calendarOf(g.clock).year; if (frostLoss(g, { x: 10, z: 10 }, 'cherry', y) === 0 && frostLoss(g, { x: 10, z: 10 }, 'apple', y) === 0) return seed; } throw new Error('none'); };
    const seed = find();
    let total = 0; const seen = new Set<Fruit>();
    for (let d = 0; d < 365; d++) {
      const g = at(1, 12, seed); g.clock.t += d; built(g, 'o', 'orchard');
      const p = orchardPicking(g);
      total += p.kcal;
      for (const f of FRUITS) if ((p.byFruit[f] ?? 0) > 0) seen.add(f);
    }
    expect(seen.size).toBe(4);
    const g = at(1, 12, seed); built(g, 'o', 'orchard');
    expect(total).toBeCloseTo(orchardYearKcal(g), -2);
    expect(total).toBeLessThanOrEqual(675_000 * 1.19);
  });
  it('apples and pears keep in the cellar bins; cherries and plums go straight to the table and the jars', () => {
    const g = at(1, 12); built(g, 'o', 'orchard');
    const day = (f: Fruit) => { const h = at(1, 12); built(h, 'o', 'orchard'); h.clock.t += calendarOfFruit(medianFrost(h), f).pick[0] - 1 + 3; return produceParts(h); };
    const apple = day('apple'), cherry = day('cherry');
    if (apple.orchard > 0) expect(apple.orchardKeep / apple.orchard).toBeGreaterThan(0.5);
    expect(cherry.orchard).toBeGreaterThan(0);
    expect(cherry.orchardKeep / cherry.orchard).toBeLessThan(0.2);
  });
  it('bees on the blossom raise the crop, the cherry most and the plum least; with none the wild bees carry the usual crop', () => {
    const g = at(1, 12); const st = built(g, 'o', 'orchard');
    const none = (f: Fruit) => fruitYear(g, st, f, 1), bees = (f: Fruit) => fruitYear(g, st, f, 1.18);
    for (const f of FRUITS) expect(bees(f)).toBeGreaterThan(none(f));
    expect(bees('cherry') / none('cherry')).toBeGreaterThan(bees('apple') / none('apple'));
    expect(bees('apple') / none('apple')).toBeGreaterThan(bees('plum') / none('plum'));
    expect(bees('apple') / none('apple')).toBeCloseTo(1.18, 3);
    expect(pollination(g)).toEqual({ garden: 1, orchard: 1 });
  });
  it('an unpruned plot bears a fifth less', () => {
    const g = at(1, 12); const st = built(g, 'o', 'orchard');
    const a = fruitYear(g, st, 'apple');
    orchardCareOf(g, 'o').unprunedYear = calendarOf(g.clock).year;
    expect(fruitYear(g, st, 'apple')).toBeCloseTo(0.8 * a);
  });
  it('the produce reads the fruit seasons', () => {
    const g = at(1, 12, 5); g.clock.t += calendarOfFruit(medianFrost(g), 'plum').pick[0] + 5; built(g, 'o', 'orchard');
    expect(ageOf(g, g.structures[0])).toBeGreaterThan(11);
    expect(produce(g)).toBeGreaterThan(0);
  });
});

describe('fruit on the trees (what the world draws)', () => {
  it('leaf, blossom and fruit follow each kind\'s own days', () => {
    const g = at(1, 12); const st = built(g, 'o', 'orchard');
    const m = medianFrost(g), year = calendarOf(g.clock).year;
    // a year with no frost on the blossom
    let seed = 1; while (frostLoss({ ...g, seed } as GameState, st, 'cherry', year) > 0 || frostLoss({ ...g, seed } as GameState, st, 'apple', year) > 0) seed++;
    g.seed = seed;
    const cb = calendarOfFruit(m, 'cherry'), ab = calendarOfFruit(m, 'apple');
    expect(fruitLook(g, st, 'cherry', 20, year)).toEqual({ leaf: false, bloom: false, fruit: false });
    expect(fruitLook(g, st, 'cherry', cb.bloom[0] + 2, year).bloom).toBe(true);
    expect(fruitLook(g, st, 'apple', cb.bloom[0] + 2, year).bloom).toBe(false);   // the cherries are out first
    expect(fruitLook(g, st, 'apple', ab.bloom[0] + 2, year).bloom).toBe(true);
    expect(fruitLook(g, st, 'cherry', cb.pick[0], year).fruit).toBe(true);
    expect(fruitLook(g, st, 'cherry', cb.pick[1] + 30, year).fruit).toBe(false);
    expect(fruitLook(g, st, 'apple', calendarOfFruit(m, 'apple').pick[0] + 5, year).fruit).toBe(true);
    expect(fruitLook(g, st, 'apple', 360, year).leaf).toBe(false);   // bare in winter
  });
  it('a frost that killed the blossom hides it; young trees show no fruit', () => {
    const g = at(200, 12); const st = built(g, 'o', 'orchard');
    const m = medianFrost(g), year = calendarOf(g.clock).year;
    for (let seed = 1; seed < 500; seed++) {
      g.seed = seed;
      const hit = hardFrostDay(seed, year, m);
      if (hit >= calendarOfFruit(m, 'cherry').bloom[0] + 6 && hit < calendarOfFruit(m, 'cherry').bloom[1]) {
        expect(frostLoss(g, st, 'cherry', year)).toBeGreaterThanOrEqual(0.5);
        expect(fruitLook(g, st, 'cherry', hit - 1, year).bloom).toBe(true);
        expect(fruitLook(g, st, 'cherry', hit + 1, year).bloom).toBe(false);
        break;
      }
    }
    const young = at(200, 1); const ys = built(young, 'y', 'orchard');
    expect(fruitLook(young, ys, 'plum', calendarOfFruit(medianFrost(young), 'plum').pick[0] + 3, calendarOf(young.clock).year).fruit).toBe(false);
  });
});

describe('the daily log', () => {
  it('says when each kind is in blossom, once, with or without hives', () => {
    const g = at(1, 12); built(g, 'o', 'orchard');
    const m = medianFrost(g), c = calendarOfFruit(m, 'cherry');
    g.clock.t += c.bloom[0] - 1;
    const lines = orchardDay(g, 0);
    expect(lines.join(' ')).toMatch(/cherrys? are in blossom|cherries are in blossom|cherrys are in blossom/i);
    expect(lines.join(' ')).toMatch(/No hives/);
    expect(orchardDay(g, 0).filter(l => /blossom/.test(l))).toEqual([]);   // not again
    built(g, 'a', 'apiary', 20, 20);
    const h = at(1, 12); built(h, 'o', 'orchard'); built(h, 'a', 'apiary', 20, 20); h.clock.t += c.bloom[0] - 1;
    expect(orchardDay(h, 0).join(' ')).toMatch(/bees are working/);
  });
  it('reports what a hard frost took, the day after, once', () => {
    const g = at(200, 12); built(g, 'o', 'orchard');
    const m = medianFrost(g), year = calendarOf(g.clock).year;
    for (let seed = 1; seed < 500; seed++) {
      const hit = hardFrostDay(seed, year, m);
      if (hit >= calendarOfFruit(m, 'cherry').bloom[0] + 4 && hit < calendarOfFruit(m, 'apple').bloom[0]) {
        const h = at(1, 12, seed); built(h, 'o', 'orchard'); h.clock.t += hit;   // doy = hit + 1
        expect(calendarOf(h.clock).doy).toBe(hit + 1);
        const lines = orchardDay(h, 0).filter(l => /frost/.test(l));
        expect(lines.length).toBe(1);
        expect(lines[0]).toMatch(/cherrys? \(\d+ %\)|cherries \(\d+ %\)/);
        return;
      }
    }
    throw new Error('no seed');
  });
});

describe('water and the duty', () => {
  it('young trees drink most, bearing trees less, nothing outside the dry months', () => {
    const g = at(200, 1); built(g, 'o', 'orchard');
    expect(orchardWaterL(g)).toBeCloseTo(12 * 7 * (REGIONS[g.site.region].rainMm > 1000 ? 0.5 : 1));
    const old = at(200, 10); built(old, 'o', 'orchard');
    expect(orchardWaterL(old)).toBeLessThan(orchardWaterL(g));
    expect(orchardWaterL(old)).toBeGreaterThan(0);
    const winter = at(20, 1); built(winter, 'o', 'orchard');
    expect(orchardWaterL(winter)).toBe(0);
    const grove = at(200, 1); built(grove, 'o', 'orchard_grove');
    expect(orchardWaterL(grove)).toBeCloseTo(4 * orchardWaterL(g));
    expect(WATER_DAYS[0]).toBeLessThan(WATER_DAYS[1]);
  });
  it('comes off the well or the pond in the utilities day', () => {
    const a = at(200, 2), b = at(200, 2);
    built(b, 'o', 'orchard');
    for (const g of [a, b]) { g.stock.greywater = 0; balanceDay(g, plant(g), 0.5); }
    expect(b.utilities.report.useL).toBeGreaterThan(a.utilities.report.useL);
    expect(b.utilities.report.useL - a.utilities.report.useL).toBeCloseTo(orchardWaterL(b), 0);
  });
  it('the orchard chore builds a backlog in the winter pruning, the dry-month watering of young trees and the fruit weeks', () => {
    const rate = (doy: number, years: number) => { const g = at(doy, years); built(g, 'o', 'orchard'); return choreRates(g).orchard; };
    const m = medianFrost(at(1, 0));
    expect(rate(40, 9)).toBeGreaterThan(0);                                   // pruning
    expect(rate(pruneDay(at(1, 0)) + 10, 9)).toBe(0);                         // bloom: nothing
    expect(rate(190, 1)).toBeGreaterThan(rate(190, 12) - 1e-9);               // watering the young trees
    expect(rate(calendarOfFruit(m, 'apple').pick[0] + 5, 12)).toBeGreaterThan(0);   // picking
    expect(rate(40, 0) * 1).toBeGreaterThan(0);
    expect(choreRates(at(40, 0)).orchard).toBe(0);
  });
  it('the farm calendar has the blossom, the watering and each fruit\'s picking', () => {
    const g = at(100, 5); built(g, 'o', 'orchard');
    const ids = calendar(g).filter(c => c.here).map(c => c.id);
    for (const id of ['prune', 'bloom', 'water-trees', 'pick-apple', 'pick-pear', 'pick-cherry', 'pick-plum']) expect(ids).toContain(id);
    expect(calendar(newGame(1)).filter(c => c.here).map(c => c.id)).not.toContain('pick-apple');
  });
});
