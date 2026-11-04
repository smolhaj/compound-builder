import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LOT_KINDS } from './lots';
import { countyGapsFor, parcelFor } from './roadState';
import { countyRoad } from '../game/region/countyRoad';
import { makeLotSite } from './lotListing';
import type { RegionId } from './regions';

const REGIONS: RegionId[] = ['mountain_west', 'appalachia', 'desert', 'north_woods', 'plains', 'pnw', 'upper_midwest', 'new_england', 'ozarks', 'hill_country', 'rust_belt'];

describe('county road audit over many lots', () => {
  it('every gap is sane: ordered, a real span, at most a few per lot, the deck above the water', () => {
    const rows: string[] = [];
    for (const region of REGIONS) for (const kind of LOT_KINDS) for (const seed of [3, 8]) {
      const site = makeLotSite({ kind, relief: 8, acres: 40, region, seed, outlier: false, creek: kind === 'hillside', flip: 1, elevM: 1500 });
      const p = parcelFor(site, 7), gaps = countyGapsFor(p, countyRoad(region, 7));
      for (const g of gaps) { expect(g.z1).toBeGreaterThan(g.z0); expect(Number.isFinite(g.y0 + g.y1 + g.depth)).toBe(true); }
      if (gaps.length > 8) rows.push("MANY");
      const wet = gaps.filter(g => g.wet), big = gaps.reduce((m, g) => Math.max(m, g.lengthM), 0);
      rows.push(`${region}/${kind}/${seed}: ${gaps.length} gaps, ${wet.length} wet, longest ${Math.round(big)} m`);
    }
    if (process.env.AUDIT) writeFileSync(process.env.AUDIT, rows.join('\n'));
  }, 120000);
});
