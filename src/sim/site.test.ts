import { describe, expect, it } from 'vitest';
import { markSown } from './seeds';
import { affordable, CLASSIC, drillExtra, HOME_RECT, listings, SAVINGS, siteProblem, type Acres, type LandWish } from './site';
import { REGION_IDS, SIZE_FACTOR } from './regions';
import { newGame } from './state';
import { acresOf, buyProblem, ownsAt } from './land';
import { planProblem } from './construction';
import { fieldHarvest } from './needs';
import { addWork, planStructure } from './construction';

const overlap = (a: { x0: number; z0: number; x1: number; z1: number }, b: typeof a) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;

describe('the land you buy', () => {
  it('six listings per region: one of each size first, the creek and a dry one, priced by region; some always affordable', () => {
    for (const region of REGION_IDS) for (let seed = 1; seed < 60; seed++) {
      const ls = listings(seed, region);
      expect(ls.length).toBe(6);
      expect(ls.slice(0, 4).map(l => l.acres)).toEqual([5, 20, 40, 80]);
      expect(ls.some(l => l.creek)).toBe(true);
      expect(ls.some(l => !l.creek)).toBe(true);
      expect(ls.filter(l => affordable(l)).length).toBeGreaterThan(0);
      for (const l of ls) {
        expect(l.region).toBe(region);
        expect(l.price).toBeGreaterThan(5_000);
        expect(Math.abs(acresOf(l.home) - l.acres)).toBeLessThan(1.5);
      }
    }
    expect(listings(7)).toEqual(listings(7));
    // the Northwest is dear, the desert cheap
    const avg = (r: 'pnw' | 'desert') => listings(3, r).reduce((a, l) => a + l.price / l.acres / SIZE_FACTOR[l.acres], 0);
    expect(avg('pnw')).toBeGreaterThan(avg('desert') * 3);
  });

  it('the filters are honored', () => {
    const wish: LandWish = { acres: 20, water: 'spring', timber: 'heavy', town: 'near' };
    for (const l of listings(11, 'appalachia', wish)) {
      expect(l.acres).toBe(20); expect(l.spring).toBe(true); expect(l.creek).toBe(false);
      expect(l.timber).toBeGreaterThan(1.1); expect(l.miles).toBeLessThanOrEqual(10);
    }
  });

  it('the price comes out of savings; the old game (no listing) is the 40 with the creek', () => {
    const site = listings(3)[1];
    const g = newGame(3, 105, 2027, { site });
    expect(g.money).toBe(SAVINGS - Math.round(site.price * 1.03));   // closing costs
    expect(g.site).toEqual(site);
    expect(newGame(3).site).toEqual(CLASSIC);
  });

  it('for every size: the neighbor land rings the place without overlapping it, and you own only your own', () => {
    for (const acres of [5, 20, 40, 80] as Acres[]) {
      const site = { ...listings(5).find(l => l.acres === acres)! };
      const g = newGame(5, 105, 2027, { site });
      const h = HOME_RECT[acres];
      for (const p of g.land.parcels) expect(overlap(p.rect, h)).toBe(false);
      for (let i = 0; i < g.land.parcels.length; i++) for (let j = i + 1; j < g.land.parcels.length; j++) expect(overlap(g.land.parcels[i].rect, g.land.parcels[j].rect)).toBe(false);
      expect(ownsAt(g, (h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2)).toBe(true);
      const p = g.land.parcels[0];
      expect(ownsAt(g, (p.rect.x0 + p.rect.x1) / 2, (p.rect.z0 + p.rect.z1) / 2)).toBe(false);
      // something next door can be bought (a neighbor who'll sell, money in hand)
      g.money = 1e7;
      for (const q of g.land.parcels) q.forSale = true;
      expect(g.land.parcels.some(q => buyProblem(g, q) === null)).toBe(true);
    }
  });

  it('a hand-dug well needs water within 9 m; deep water costs the driller more', () => {
    const shallow = { ...CLASSIC, gwDepth: 7 }, deep = { ...CLASSIC, gwDepth: 95 };
    expect(siteProblem(shallow, 'well_hand')).toBeNull();
    expect(siteProblem(deep, 'well_hand')).toMatch(/too deep/);
    expect(planProblem(newGame(1, 105, 2027, { site: deep }), 'well_hand')).toMatch(/too deep/);
    expect(drillExtra(deep)).toBeGreaterThan(0);
    expect(drillExtra(shallow)).toBe(0);
    const g = newGame(1, 105, 2027, { site: deep });
    g.money = 100_000; g.stock.drilling = 1;
    const st = planStructure(g, 'well_drilled', 30, 30, 0);
    addWork(g, st, 10);       // stake it out and drill
    expect(g.money).toBe(100_000 - drillExtra(deep));
  });

  it('deep soil grows more than thin', () => {
    const grow = (soil: 'thin' | 'deep') => {
      const g = newGame(1, 250, 2027, { site: { ...CLASSIC, soil } });
      g.structures.push({ id: 'f', kind: 'field', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
      markSown(g);
      return fieldHarvest(g);
    };
    expect(grow('deep')).toBeGreaterThan(grow('thin') * 1.4);
  });
});
