import { describe, expect, it } from 'vitest';
import { applyDust, dustStorm } from './dustStorm';
import { NO_LOOK } from '../../../sim/collapseLook';
import { WeatherSim, blowCurve } from './weatherState';

const base = { region: 'desert_southwest', season: 'summer', wind: 0.9, rain: 0, storm: 0, snow: 0, cloud: 0.2, hour: 15 };
describe('dust storm', () => {
  it('rises in a windy dry desert summer and not in a green region', () => {
    expect(dustStorm(base).dust).toBeGreaterThan(0.8);
    expect(dustStorm({ ...base, region: 'new_england' }).dust).toBe(0);
  });
  it('rain and snow settle it; calm air leaves heat haze instead', () => {
    expect(dustStorm({ ...base, rain: 0.8 }).dust).toBe(0);
    const calm = dustStorm({ ...base, wind: 0.2, cloud: 0 });
    expect(calm.dust).toBe(0); expect(calm.heat).toBeGreaterThan(0.5);
    expect(dustStorm({ ...base, wind: 0.2, hour: 3 }).heat).toBe(0);
  });
  it('browns the look, and leaves it alone when there is nothing', () => {
    const l = applyDust(NO_LOOK, dustStorm(base));
    expect(l.ash).toBeGreaterThan(0.5); expect(l.ashColor[0]).toBeGreaterThan(l.ashColor[2]); expect(l.dim).toBeLessThan(1); expect(l.skyAmt).toBeGreaterThan(0.5);
    expect(applyDust(NO_LOOK, { dust: 0, heat: 0 })).toBe(NO_LOOK);
  });
});

describe('the weather sim reaches the dust storm', () => {
  /** The strongest dust any afternoon of a rainless-day sweep reaches in this region (stepped like the game). */
  const peak = (region: string, season: string, seed: number): number => {
    const w = new WeatherSim(seed); w.region = region;
    let best = 0;
    for (let day = 0; day < 20; day++) for (let i = 0; i < 288; i++) {
      const hour = i / 12, o = w.update(5, season, hour, 'auto');
      best = Math.max(best, dustStorm({ region, season, wind: o.wind, rain: o.rain, storm: o.storm, snow: o.snow, cloud: o.cloud, hour }).dust);
    }
    return best;
  };
  it('has dry blow days in the desert (before, rain came with every wind and dust stayed under 0.07)', () => {
    for (const seed of [1, 2, 3]) expect(peak('desert_southwest', 'summer', seed)).toBeGreaterThan(0.8);
  });
  it('never lifts dust in the green regions', () => {
    for (const r of ['pacific_northwest', 'new_england', 'appalachia', 'north_woods']) expect(peak(r, 'summer', 1)).toBe(0);
  });
  it('the blow builds in the afternoon and drops by night', () => {
    expect(blowCurve(4)).toBe(0); expect(blowCurve(15)).toBe(1); expect(blowCurve(22)).toBe(0);
    expect(blowCurve(11)).toBeGreaterThan(0); expect(blowCurve(11)).toBeLessThan(1);
  });
});
