/** The slow climate kinds' look (PR 7): pure curves are monotone, clamped and finite; the look rises smoothly with the anomaly; snow is not thinned by snowfall. */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { collapseLook, withWeather, NO_LOOK } from './collapseLook';
import { climateTune } from './slowClimate';
import {
  COLD_SUN_SCALE, HEAT_SUN_SCALE, scorchOf, shellBleachOf, shellFrostOf, shimmerOf, snowCoverOf, sunLowerOf, sunScaleOf, waterLockOf, windowSnowDim,
} from './climateLook';

const seq = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);
const mono = (f: (x: number) => number, up = true) => { const v = seq(40).map(f); for (let i = 1; i < v.length; i++) { if (up) expect(v[i]).toBeGreaterThanOrEqual(v[i - 1] - 1e-12); else expect(v[i]).toBeLessThanOrEqual(v[i - 1] + 1e-12); } };

describe('climate look curves', () => {
  it('are monotone in the anomaly, clamped and finite for any input', () => {
    mono(scorchOf); mono(sunLowerOf); mono(waterLockOf); mono(snowCoverOf, true); mono(windowSnowDim);
    mono(s => sunScaleOf(s, 0)); mono(f => sunScaleOf(0, f), false);
    mono(s => shellBleachOf(s, 110)); mono(f => shellFrostOf(0 - 40 * f, 0 - 40 * f));
    for (const bad of [NaN, Infinity, -Infinity, -5, 5, 1e9]) {
      for (const v of [scorchOf(bad), sunLowerOf(bad), waterLockOf(bad), snowCoverOf(bad), shellBleachOf(bad, bad), shellFrostOf(bad, bad), shimmerOf(bad, bad), windowSnowDim(bad)]) {
        expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(sunScaleOf(bad, bad))).toBe(true);
    }
  });
  it('the sun swells in the heat, shrinks in the cold and is normal in peace', () => {
    expect(sunScaleOf(0, 0)).toBe(1);
    expect(sunScaleOf(1, 0)).toBeCloseTo(HEAT_SUN_SCALE, 9);
    expect(sunScaleOf(0, 1)).toBeCloseTo(COLD_SUN_SCALE, 9);
    expect(sunLowerOf(0)).toBe(0);
  });
  it('a heated dome stays clear, an unheated one frosts, a mild day never does', () => {
    expect(shellFrostOf(10, 68)).toBe(0);
    expect(shellFrostOf(10, 10)).toBeGreaterThan(0.5);
    expect(shellFrostOf(-20, -20)).toBeCloseTo(1, 1);
    expect(shellFrostOf(55, 55)).toBe(0);
    expect(shellFrostOf(20, 20)).toBeGreaterThan(shellFrostOf(20, 50));
  });
  it('bleach follows the scorch and the day, shimmer peaks mid-afternoon and is zero at night', () => {
    expect(shellBleachOf(0, 120)).toBe(0);
    expect(shellBleachOf(1, 120)).toBeGreaterThan(shellBleachOf(1, 70));
    expect(shimmerOf(1, 14)).toBeGreaterThan(shimmerOf(1, 10));
    expect(shimmerOf(1, 2)).toBe(0); expect(shimmerOf(0, 14)).toBe(0);
  });
  it('water does not lock in the first year of the cold, and does by the third', () => {
    expect(waterLockOf(0.2)).toBe(0); expect(waterLockOf(1)).toBe(1);
  });
});

const slowAt = (kind: 'runaway_heat' | 'ice_age', years: number, region = kind === 'ice_age' ? 'north_woods' : 'plains', doy?: number): GameState => {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant: kind === 'ice_age' ? 'dimmed_sun' : 'dry_furnace', difficulty: 'standard' });
  g.site.region = region as GameState['site']['region'];
  g.clock.t = g.disaster.hitAt + 365 * years * climateTune(g.disaster.difficulty).stretch;
  if (doy) g.clock.startDoy = doy - Math.floor(g.clock.t);
  return g;
};

describe('the look through the kinds (smooth with the anomaly)', () => {
  it('heat: scorch and sun size rise with the years and are zero at the hit', () => {
    const v = [0, 0.5, 1, 2, 3, 4].map(y => collapseLook(slowAt('runaway_heat', y)));
    expect(v[0].scorch).toBeLessThan(0.2); expect(v[0].sunScale).toBeLessThan(1.25);   // (the warning's small start, 8 F, is already in the anomaly)
    for (let i = 1; i < v.length; i++) { expect(v[i].scorch).toBeGreaterThanOrEqual(v[i - 1].scorch); expect(v[i].sunScale).toBeGreaterThanOrEqual(v[i - 1].sunScale); }
    expect(v[5].scorch).toBeGreaterThan(0.5); expect(v[5].sunScale).toBeGreaterThan(1.5);
    expect(v[5].snowCover).toBe(0); expect(v[5].freeze).toBe(0);
  });
  it('ice age: freeze, snow cover and a lower, smaller sun rise with the years', () => {
    const v = [0, 0.5, 1, 2, 3].map(y => collapseLook(slowAt('ice_age', y, 'north_woods', 25)));
    expect(v[0].freeze).toBeLessThanOrEqual(0.15); expect(v[0].snowCover).toBe(0); expect(v[0].sunLower).toBeLessThan(0.05);
    for (let i = 1; i < v.length; i++) { expect(v[i].freeze).toBeGreaterThanOrEqual(v[i - 1].freeze); expect(v[i].snowCover).toBeGreaterThanOrEqual(v[i - 1].snowCover); expect(v[i].sunLower).toBeGreaterThanOrEqual(v[i - 1].sunLower); }
    expect(v[4].snowCover).toBeGreaterThan(0.5); expect(v[4].sunScale).toBeLessThan(1); expect(v[4].scorch).toBe(0);
  });
  it('a snowfall does not thin the ice age snow pack (it does thin ash)', () => {
    const l = collapseLook(slowAt('ice_age', 3, 'north_woods', 25));
    const w = withWeather(l, { rain: 0, snow: 1, season: 'winter' });
    expect(w.snowCover).toBe(l.snowCover);
    expect(NO_LOOK.snowCover).toBe(0);
  });
  it('is nothing for other kinds', () => {
    const g = newGame(7);
    expect(collapseLook(g)).toBe(NO_LOOK);
  });
});
