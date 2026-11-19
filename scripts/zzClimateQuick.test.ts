import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { play, siteFor, type Strategy } from './playtest.test';
import type { RegionId } from '../src/sim/regions';
import type { DisasterKind } from '../src/sim/disaster';

const OUT = process.env.QUICK_OUT ?? '/tmp/climate_quick.jsonl';
const CELLS: Array<[DisasterKind, RegionId, number]> = [['runaway_heat', 'plains', 1], ['runaway_heat', 'ozarks', 2], ['runaway_heat', 'desert', 3], ['ice_age', 'north_woods', 4], ['ice_age', 'mountain_west', 5], ['ice_age', 'hill_country', 6]];
describe.skipIf(!process.env.QUICK)('climate quick', () => {
  it('plays', () => {
    for (const strat of (process.env.QUICK_STRATS ?? 'homestead,prepper').split(',') as Strategy[]) for (const [kind, region, n] of CELLS) {
      process.env.DIFF = 'standard'; process.env.LIFESTYLE = 'fulltime';
      const seed = 9100 + n, t0 = Date.now();
      const res = play(strat, kind, seed, 'short', siteFor(seed, region), 0, Number(process.env.QUICK_DAYS ?? 1100));
      const s = res.s, living = s.personState.filter(p => p.needs.died == null).length, total = s.personState.filter(p => !p.needs.left).length;
      appendFileSync(OUT, JSON.stringify({ strat, kind, region, seed, ending: res.ending, causes: res.causes, alive: living, total, day: Math.round(s.clock.t - s.disaster.hitAt), grade: res.grade, ms: Date.now() - t0 }) + '\n');
    }
  }, 3 * 3_600_000);
});
