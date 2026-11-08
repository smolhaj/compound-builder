import { describe, expect, it } from 'vitest';
import { PREPARED_GATE, SCOUT_HINT, SCOUT_NAME, SCOUT_PLANS, captureOdds, crewKeepsIntel, driveOffDeters, type ScoutCtx } from './scoutPlans';

const c = (o: Partial<ScoutCtx> = {}): ScoutCtx => ({ fortress: 40, fighters: 2, armed: true, kind: 'gang', temper: 'hard', night: false, ...o });

describe('plans for scouts the watch spotted', () => {
  it('four plans, each named and explained', () => { expect(SCOUT_PLANS).toEqual(['drive_off', 'capture', 'ignore', 'prepare']); for (const p of SCOUT_PLANS) { expect(SCOUT_NAME[p].length).toBeGreaterThan(3); expect(SCOUT_HINT[p].length).toBeGreaterThan(20); } });
  it('warning shots work better on a hard-looking place and on looters than on gangs; never on a savage crew; honest bounds', () => {
    expect(driveOffDeters(c({ fortress: 90 }))).toBeGreaterThan(driveOffDeters(c({ fortress: 10 })));
    expect(driveOffDeters(c({ kind: 'looters' }))).toBeGreaterThan(driveOffDeters(c({ kind: 'gang' })));
    expect(driveOffDeters(c({ temper: 'savage' }))).toBeLessThan(0.05);
    for (const f of [0, 50, 100]) for (const n of [0, 2, 8]) { const p = driveOffDeters(c({ fortress: f, fighters: n })); expect(p).toBeGreaterThan(0); expect(p).toBeLessThanOrEqual(0.7); }
  });
  it('a capture needs rifles and light: more fighters help, the dark hurts, bare hands are poor', () => {
    expect(captureOdds(c({ fighters: 4 }))).toBeGreaterThan(captureOdds(c({ fighters: 1 })));
    expect(captureOdds(c({ night: true }))).toBeLessThan(captureOdds(c({ night: false })));
    expect(captureOdds(c({ armed: false }))).toBeLessThan(captureOdds(c({ armed: true })));
    expect(captureOdds(c({ fighters: 0, armed: false, night: true }))).toBeGreaterThanOrEqual(0.05);
  });
  it('the crew keeps what its scouts learned if the family ignored them, half the time if it only prepared, never otherwise', () => {
    expect(crewKeepsIntel('ignore', () => 0.99)).toBe(true); expect(crewKeepsIntel('prepare', () => 0.3)).toBe(true); expect(crewKeepsIntel('prepare', () => 0.7)).toBe(false);
    expect(crewKeepsIntel('drive_off', () => 0)).toBe(false); expect(crewKeepsIntel('capture', () => 0)).toBe(false); expect(crewKeepsIntel(undefined, () => 0)).toBe(false);
    expect(PREPARED_GATE).toBeLessThan(1);
  });
});
