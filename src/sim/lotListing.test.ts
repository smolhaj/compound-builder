import { describe, expect, it } from 'vitest';
import { hasLots, lotPriceFactor, makeLotSite, profileChart, REGION_LOTS, siteLot, terrainFacts } from './lotListing';
import { affordable, ANY_WISH, listings, SAVINGS, type Site } from './site';
import { LOT_KINDS, LOT_NAME, type LotKind } from './lots';
import { REGION_IDS } from './regions';

const all = (region: 'mountain_west' | 'appalachia' | 'pnw' | 'north_woods', n = 40, wish = ANY_WISH): Site[] => {
  const out: Site[] = [];
  for (let seed = 1; seed <= n; seed++) out.push(...listings(seed, region, wish));
  return out;
};

describe('lots on the market', () => {
  it('only the mountain and lake regions list varied ground; every other region is as it was', () => {
    for (const region of REGION_IDS) {
      const ls = all(region as never, 6);
      if (hasLots(region)) expect(ls.some(l => l.lot), region).toBe(true);
      else for (const l of ls) expect(l.lot ?? null, region).toBeNull();
    }
    expect(Object.keys(REGION_LOTS).sort()).toEqual(['appalachia', 'mountain_west', 'north_woods', 'pnw']);
  });

  it('the Mountain West offers all eight kinds, with typical relief of 30-80 m and the odd 150-300 m outlier', () => {
    const ls = all('mountain_west', 120).filter(l => l.lot);
    const kinds = new Set(ls.map(l => l.lot!.kind));
    for (const k of LOT_KINDS) expect(kinds.has(k), k).toBe(true);
    const typical = ls.filter(l => !l.lot!.outlier), out = ls.filter(l => l.lot!.outlier);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length / ls.length).toBeLessThan(0.15);
    for (const l of out) expect(['gorge', 'mesa', 'bluff']).toContain(l.lot!.kind);
    const drops = typical.filter(l => !['island', 'bluff'].includes(l.lot!.kind)).map(l => siteLot(l)!.stats.dropM);
    const inRange = drops.filter(d => d >= 25 && d <= 130).length / drops.length;
    expect(inRange).toBeGreaterThan(0.85);
    expect(out.every(l => siteLot(l)!.stats.dropM > 120)).toBe(true);
  });

  it('is deterministic, and lakes and creeks match the kind', () => {
    expect(listings(9, 'mountain_west')).toEqual(listings(9, 'mountain_west'));
    for (const l of all('mountain_west', 40).filter(x => x.lot)) {
      const k = l.lot!.kind;
      if (k === 'bench' || k === 'gorge' || k === 'bluff' || k === 'island') expect(l.creek, k).toBe(true);
      if (k === 'ridge' || k === 'mesa' || k === 'saddle') expect(l.creek, k).toBe(false);
      if (k === 'saddle') expect(l.lot!.creek).toBeUndefined();
      // a hillside with a creek always falls toward the road
      if (k === 'hillside' && l.lot!.creek) expect(l.lot!.flip).toBe(1);
      expect(l.gwDepth).toBeGreaterThanOrEqual(3);
    }
  });

  it('honors what the buyer asked for', () => {
    for (const water of ['creek', 'spring', 'dry'] as const) for (const region of ['mountain_west', 'appalachia', 'pnw'] as const) {
      for (const l of all(region, 12, { ...ANY_WISH, water })) {
        if (water === 'creek') expect(l.creek, `${region} ${l.lot?.kind}`).toBe(true);
        if (water === 'spring') { expect(l.spring).toBe(true); expect(l.creek).toBe(false); }
        if (water === 'dry') { expect(l.spring).toBe(false); expect(l.creek).toBe(false); }
      }
    }
    for (const l of all('mountain_west', 10, { ...ANY_WISH, acres: 20 })) expect(l.acres).toBe(20);
  });

  it('prices follow the ground: flat pads and an easy road raise it, a lake raises it, extreme relief lowers it; something is always affordable', () => {
    const f = (kind: LotKind, over = {}) => lotPriceFactor(makeLotSite({ kind, relief: 7, seed: 5, ...over }));
    for (const k of LOT_KINDS) { const v = f(k); expect(v, k).toBeGreaterThan(0.35); expect(v, k).toBeLessThan(2.1); }
    expect(f('island')).toBeGreaterThan(f('hillside'));
    expect(f('gorge', { relief: 30, outlier: true })).toBeLessThan(f('gorge'));
    // a bench (flat, easy road) over a steep ridge
    expect(f('bench')).toBeGreaterThan(f('ridge'));
    const ls = all('mountain_west', 60);
    for (let seed = 1; seed <= 60; seed++) expect(listings(seed, 'mountain_west').some(l => affordable(l, SAVINGS)), `seed ${seed}`).toBe(true);
    expect(ls.every(l => l.price > 5_000)).toBe(true);
  });

  it('the drive is as long as the run up to the best flat', () => {
    for (const l of all('mountain_west', 20).filter(x => x.lot)) {
      expect(l.improvements.driveFt).toBeGreaterThanOrEqual(150);
      expect(l.improvements.driveFt).toBe(Math.max(150, Math.round(siteLot(l)!.stats.accessM * 3.281 / 10) * 10));
    }
  });
});

describe('the listing card', () => {
  it('has a terrain row set for every kind, in plain US English', () => {
    for (const kind of LOT_KINDS) {
      const s = makeLotSite({ kind, relief: 8, seed: 4 });
      const facts = terrainFacts(s), labels = facts.map(f => f.label);
      for (const need of ['Ground', 'Relief', 'Flat ground', 'Road in', 'Sun', 'Water head', 'High ground', 'Approaches']) expect(labels, `${kind} ${need}`).toContain(need);
      expect(facts.find(f => f.label === 'Ground')!.value).toContain(LOT_NAME[kind]);
      const text = facts.map(f => f.value).join(' ');
      expect(text).not.toMatch(/metre|colour|favour|grey|kerb/);
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(terrainFacts({ lot: null, home: { x0: 0, z0: 0, x1: 67, z1: 67 } })).toEqual([]);
  });

  it('a profile chart for every kind: across the valley for a gorge, along the fall for the rest', () => {
    for (const kind of LOT_KINDS) {
      const s = makeLotSite({ kind, relief: 8, seed: 4 }), c = profileChart(s)!;
      expect(c.pts.length).toBeGreaterThan(20);
      expect(c.minM).toBe(0);
      expect(c.maxM).toBeGreaterThan(5);
      expect(c.padAt).toBeGreaterThanOrEqual(0);
      expect(c.padAt).toBeLessThanOrEqual(c.lengthM);
      expect(c.axis).toBe(kind === 'bench' || kind === 'gorge' ? 'S-N' : kind === 'ridge' || kind === 'saddle' ? c.axis : 'W-E');
    }
    expect(profileChart(makeLotSite({ kind: "bluff" }))!.waterM).not.toBeNull();
    expect(profileChart(makeLotSite({ kind: 'ridge' }))!.waterM).toBeNull();
  });
});
