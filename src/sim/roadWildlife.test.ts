import { describe, expect, it } from 'vitest';
import { crossingLine, crossingRelief, deerCrossings, hoofedPer40, STRIKE, strikeChance, wildlifeCrossings } from './roadWildlife';
import type { StructureKind } from './roadPlan';
import { REGION_IDS } from './regions';
import { newGame } from './state';
import { makeLotSite } from './lotListing';
import { fleetOf, roadTrouble } from './vehicles';

const plan = (...kinds: StructureKind[]) => ({ structures: kinds.map((kind, i) => ({ kind, s0: 10 * i, s1: 10 * i + 1, x: i, z: i, rot: 0, lengthM: 4, usd: 0, days: 0, choke: false, droppable: false })) });

describe('wildlife on the way in', () => {
  it('knows what crosses under what: a pipe is for the small ones, an arch for deer, a bridge or a ford for all, and deer signs stand at the last two', () => {
    const p = plan('culvert', 'arch_culvert', 'bridge1', 'low_water', 'cattle_guard', 'pass');
    expect(wildlifeCrossings(p).map(c => c.fits)).toEqual(['small', 'deer', 'all', 'all']);
    expect(deerCrossings(p)).toHaveLength(3);
    expect(wildlifeCrossings(plan('cattle_guard'))).toEqual([]);
    expect(crossingLine(plan('cattle_guard'))).toBeNull();
    expect(crossingLine(p)).toMatch(/for deer/);
  });

  it('crossings take away part of the chance, up to a cap, and a pipe alone is worth little', () => {
    expect(crossingRelief(null)).toBe(0);
    expect(crossingRelief(plan())).toBe(0);
    expect(crossingRelief(plan('culvert'))).toBeCloseTo(STRIKE.RELIEF.small, 6);
    expect(crossingRelief(plan('arch_culvert'))).toBeCloseTo(STRIKE.RELIEF.deer + STRIKE.SIGNS, 6);
    expect(crossingRelief(plan('bridge', 'bridge1', 'ford', 'low_water', 'arch_culvert'))).toBe(STRIKE.RELIEF_CAP);
    expect(crossingRelief(plan('bridge1'))).toBeGreaterThan(crossingRelief(plan('culvert')));
  });

  it('the chance grows with the road, with the herds, and falls with crossings; it is capped and zero for no road', () => {
    expect(strikeChance('mountain_west', 0, null)).toBe(0);
    expect(strikeChance('mountain_west', 40, null)).toBeGreaterThan(strikeChance('mountain_west', 10, null));
    expect(strikeChance('mountain_west', 40, plan('bridge1', 'arch_culvert'))).toBeLessThan(strikeChance('mountain_west', 40, null));
    expect(strikeChance('mountain_west', 1e6, null)).toBe(STRIKE.CAP);
    // every region has some hoofed animals on the road
    for (const r of REGION_IDS) expect(hoofedPer40(r)).toBeGreaterThan(0);
    expect(strikeChance('pnw', 60, null)).toBeGreaterThan(0);
    for (const r of REGION_IDS) expect(strikeChance(r, 150, null)).toBeLessThanOrEqual(STRIKE.CAP);
  });

  it('a long run can meet a deer: the vehicle is hurt, and the line is said (on a place with a planned road)', () => {
    const g = newGame(5, undefined, undefined, { site: makeLotSite({ region: 'pnw', kind: 'hillside', relief: 9, acres: 40, seed: 8, elevM: 600 }) });
    const v = fleetOf(g)[0], c0 = v.condition;
    let hits = 0;
    for (let salt = 0; salt < 400 && hits === 0; salt++) {
      v.condition = c0; delete v.down;
      const r = roadTrouble(g, v, 150, salt);
      if (r.line && /deer/.test(r.line)) { hits++; expect(v.condition).toBeCloseTo(c0 - STRIKE.DAMAGE, 6); expect(r.extraDays).toBe(0); }
    }
    expect(hits).toBe(1);
  });
});
