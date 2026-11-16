import { describe, it, expect } from 'vitest';
import { QUIET_DAYS, breakPosseOdds, lawlessMix, lawlessPrice, pactBetray, rampUp, titheDue, titheOf, variantOf } from './lawlessMath';

describe('lawless numbers', () => {
  it('the old collapse id is the walkout', () => { expect(variantOf('collapse')).toBe('walkout'); expect(variantOf('drift')).toBe('drift'); expect(variantOf('blackout_of_order')).toBe('blackout_of_order'); });
  it('the first days are quiet; Cozy longest, Hardcore shortest', () => {
    expect(QUIET_DAYS.cozy).toBe(14); expect(rampUp(5, 'standard')).toBe(0); expect(rampUp(14, 'standard')).toBe(1);
    expect(rampUp(10, 'cozy')).toBe(0); expect(rampUp(4, 'hardcore')).toBeGreaterThan(0);
  });
  it('looters double early, gangs 2.5x from week three, posse from month two, traders thin', () => {
    const m = (d: number) => lawlessMix(d, 'standard', 'plains', 'walkout');
    expect(m(20).looters).toBeCloseTo(2); expect(m(40).looters).toBeCloseTo(1); expect(m(25).gang).toBeCloseTo(2.5); expect(m(9).gang).toBeCloseTo(2 / 7, 2); expect(m(3).looters).toBe(0);
    expect(m(30).posse).toBe(0); expect(m(70).posse).toBeGreaterThan(0); expect(m(30).tollkeeper).toBeGreaterThan(0); expect(m(10).tollkeeper).toBe(0); expect(m(30).trader).toBe(0.4); expect(m(30).refugees).toBe(1.2);
  });
  it('the rust belt raids more than the north woods', () => { expect(lawlessMix(30, 'standard', 'rust_belt', 'walkout').gang).toBeGreaterThan(lawlessMix(30, 'standard', 'north_woods', 'walkout').gang * 2); });
  it('prices climb with the days and with the banks failing', () => { expect(lawlessPrice(90, 0.1)).toBeGreaterThan(lawlessPrice(7, 1)); expect(lawlessPrice(0, 1)).toBe(1); expect(lawlessPrice(30, 0)).toBeGreaterThan(lawlessPrice(30, 1)); });
  it('the tithe is a tenth every 30 days, first at month two', () => {
    expect(titheOf({ canned: 25, staples: 4, fuel: 9 })).toEqual({ canned: 2 });
    expect(titheDue(59, -1)).toBe(false); expect(titheDue(60, -1)).toBe(true); expect(titheDue(80, 60)).toBe(false); expect(titheDue(90, 60)).toBe(true);
  });
  it('breaking the posse needs numbers; a pact helps', () => { expect(breakPosseOdds(3, 4, 50)).toBeGreaterThan(breakPosseOdds(0, 4, 50)); expect(breakPosseOdds(9, 9, 100)).toBeLessThanOrEqual(0.8); });
  it('the committee betrays more as the deal ages, never if you did not join', () => { expect(pactBetray(100, true)).toBeGreaterThan(pactBetray(0, true)); expect(pactBetray(100, false)).toBe(0); });
});
