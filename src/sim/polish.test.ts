import { describe, expect, it } from 'vitest';
import { landPriceRange, listings, ANY_WISH } from './site';
import { REGION_IDS } from './regions';

describe('landPriceRange (setup card text comes from the listing price model)', () => {
  it('brackets what raw listings really cost per acre, in every region', () => {
    for (const id of REGION_IDS) {
      const [lo, hi] = landPriceRange(id);
      expect(lo).toBeGreaterThan(0);
      expect(hi).toBeGreaterThan(lo);
      const per = listings(3, id, { ...ANY_WISH, built: 'raw' }, 6, Infinity).map(l => l.price / l.acres);
      const inside = per.filter(p => p >= lo * 0.5 && p <= hi * 1.5).length;
      expect(inside).toBeGreaterThanOrEqual(4);
    }
  });
});

import { NEW_GAME_START } from './state';
describe('the start date', () => {
  it('is a Monday, the weekday the sim counts day 0 as', () => {
    const d = new Date(Date.UTC(NEW_GAME_START.year, 0, NEW_GAME_START.doy));
    expect(d.getUTCDay()).toBe(1);
  });
});
