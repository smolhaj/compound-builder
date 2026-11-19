import { describe, expect, it } from 'vitest';
import { CLIMATES, NO_OVERLAY, applyClimateOverlay, seasonTargets, SEASON_KEYS } from './seasonState';

describe('climate overlay on the season targets', () => {
  const c = CLIMATES.north_woods ?? Object.values(CLIMATES)[0];
  it('returns the same object when there is nothing to bend', () => {
    const t = seasonTargets(c, 200);
    expect(applyClimateOverlay(t, c, undefined)).toBe(t);
    expect(applyClimateOverlay(t, c, NO_OVERLAY)).toBe(t);
  });
  it('cold keeps a snow pack and frozen water in July, and never lowers a season value', () => {
    const t = seasonTargets(c, 200), r = applyClimateOverlay(t, c, { scorch: 0, snow: 0.8, freeze: 1 });
    expect(r.snow).toBeCloseTo(0.8, 9); expect(r.ice).toBe(1); expect(r.dormant).toBeGreaterThan(0.8);
    for (const k of ['snow', 'ice', 'dormant', 'cold', 'bare'] as const) expect(r[k]).toBeGreaterThanOrEqual(t[k]);
  });
  it('heat dries the lawn and thins the crowns in summer, and does nothing under a winter snow', () => {
    const t = seasonTargets(c, 200), r = applyClimateOverlay(t, c, { scorch: 1, snow: 0, freeze: 0 });
    expect(r.dry).toBe(1); expect(r.dormant).toBeGreaterThan(0.5); expect(r.fresh).toBe(0);
    const w = seasonTargets(c, 20), rw = applyClimateOverlay(w, c, { scorch: 1, snow: 0, freeze: 0 });
    expect(rw.dry).toBeLessThanOrEqual(Math.max(w.dry, 1 - Math.min(1, w.snow * 1.5)));
  });
  it('is monotone in each input and stays within 0 to 1', () => {
    for (const key of ['scorch', 'snow', 'freeze'] as const) {
      let prev = applyClimateOverlay(seasonTargets(c, 200), c, NO_OVERLAY);
      for (let i = 1; i <= 10; i++) {
        const o = { ...NO_OVERLAY, [key]: i / 10 };
        const r = applyClimateOverlay(seasonTargets(c, 200), c, o);
        for (const k of SEASON_KEYS) { expect(r[k]).toBeGreaterThanOrEqual(0); expect(r[k]).toBeLessThanOrEqual(1); }
        if (key === 'freeze') for (const k of ['ice', 'dormant', 'bare', 'cold'] as const) expect(r[k]).toBeGreaterThanOrEqual(prev[k] - 1e-12);
        if (key === 'scorch') for (const k of ['dry', 'dormant'] as const) expect(r[k]).toBeGreaterThanOrEqual(prev[k] - 1e-12);
        if (key === 'snow') expect(r.snow).toBeGreaterThanOrEqual(prev.snow - 1e-12);
        prev = r;
      }
    }
  });
  it('NaN inputs read as zero', () => {
    const r = applyClimateOverlay(seasonTargets(c, 200), c, { scorch: NaN, snow: NaN, freeze: 1 });
    for (const k of SEASON_KEYS) expect(Number.isFinite(r[k])).toBe(true);
  });
});
