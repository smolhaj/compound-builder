import { describe, expect, it } from 'vitest';
import { PLAYABLE, REGION_IDS, REGIONS, seasons } from './regions';
import { regionWorld, REGION_WORLD } from '../game/region/regionWorld';
import { CLIMATES } from '../engine/world/season/seasonState';
import { REGION_SKY, REGION_WEATHER } from '../engine/world/weather/weatherState';

describe('region data', () => {
  it('every region is complete and sane', () => {
    for (const id of REGION_IDS) {
      const r = REGIONS[id];
      expect(r.id).toBe(id);
      // frost dates ordered, a season of 3–7 months
      expect(r.frost[0]).toBeGreaterThan(30);
      expect(r.frost[1]).toBeGreaterThan(r.frost[0] + 90);
      expect(r.frost[1]).toBeLessThan(335);
      const s = seasons(r);
      expect(s.garden[0]).toBeLessThan(s.garden[1]);
      expect(s.harvest[0]).toBeLessThan(s.harvest[1]);
      // prices and water
      expect(r.perAcre).toBeGreaterThan(0);
      expect(r.gwDepth[0]).toBeGreaterThan(0);
      expect(r.gwDepth[1]).toBeGreaterThan(r.gwDepth[0]);
      expect(r.gwBad.hard + r.gwBad.iron + r.gwBad.arsenic).toBeLessThan(1);
      expect(r.timber[1]).toBeGreaterThanOrEqual(r.timber[0]);
      // climate
      expect(r.rainMm).toBeGreaterThan(150);
      expect(r.snowCm).toBeGreaterThanOrEqual(0);
      expect(r.julyHighF).toBeGreaterThan(r.janLowF + 30);
      expect(r.zone).toMatch(/^\d[ab]/);
      // something to hunt and to fish, storms, a housing mix that sums to 1
      expect(r.game.length).toBeGreaterThan(2);
      expect(r.game.some(g => ['trout', 'bass', 'catfish', 'salmon', 'panfish'].includes(g)) || id === 'desert').toBe(true);
      expect(Object.keys(r.storms).length).toBeGreaterThan(2);
      for (const p of Object.values(r.storms)) { expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(0.05); }
      const h = r.houses;
      expect(h.farmhouse + h.trailer + h.timber_cabin + h.log_house).toBeCloseTo(1, 6);
      expect(PLAYABLE.has(id)).toBe(true);
    }
  });

  it('the cold country is cold and the desert dry', () => {
    expect(REGIONS.north_woods.frost[1] - REGIONS.north_woods.frost[0]).toBeLessThan(REGIONS.appalachia.frost[1] - REGIONS.appalachia.frost[0]);
    expect(REGIONS.north_woods.cold).toBeGreaterThan(REGIONS.pnw.cold);
    expect(REGIONS.north_woods.snowCm).toBeGreaterThan(REGIONS.appalachia.snowCm);
    expect(REGIONS.desert.rainMm).toBeLessThan(REGIONS.pnw.rainMm / 3);
    expect(REGIONS.desert.gwDepth[0]).toBeGreaterThan(REGIONS.appalachia.gwDepth[0]);
    // land is dear in the Northwest, cheap in the desert
    expect(REGIONS.pnw.perAcre).toBeGreaterThan(REGIONS.desert.perAcre * 3);
  });

  it('every region has a world: trees, a climate, weather and sky', () => {
    for (const id of REGION_IDS) {
      const w = regionWorld(id);
      expect(REGION_WORLD[id]).toBe(w);
      expect(w.trees.timber.length).toBeGreaterThan(0);
      expect(w.trees.timber.reduce((a, t) => a + t.w, 0)).toBeCloseTo(1, 6);
      for (const t of w.trees.timber) expect(t.scale[1]).toBeGreaterThanOrEqual(t.scale[0]);
      expect(CLIMATES[w.climate]?.id).toBe(w.climate);
      expect(REGION_WEATHER[w.climate]).toBeDefined();
      expect(REGION_SKY[w.climate]).toBeDefined();
    }
    // each region is its own world (only the original Mountain West reuses the benches)
    expect(new Set(REGION_IDS.map(id => regionWorld(id).relief)).size).toBe(REGION_IDS.length);
  });
});
