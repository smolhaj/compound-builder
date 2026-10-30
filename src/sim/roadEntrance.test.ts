import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { makeLotSite } from './lotListing';
import { entranceChoiceFor, entranceOptions, entranceProblem, setEntrance } from './roadEntrance';
import { entranceRange, habitualEntrance, roadPlanFor } from './roadState';
import { pinSeed } from './lotSeed';
import { roadLine } from './roadFx';

const hill = () => makeLotSite({ region: 'pnw', kind: 'hillside', relief: 9, acres: 40, seed: 8, elevM: 600 });
const game = () => { const g = newGame(7, undefined, undefined, { site: hill() }); return g; };

describe('choosing where the road comes in', () => {
  it('offers several entrances, each with its own road, cost and winter numbers, and suggests the cheapest that stays open', () => {
    const c = entranceOptions(hill(), 7);
    expect(c.options.length).toBeGreaterThanOrEqual(3);
    const gates = c.options.map(o => o.gateZ);
    expect(new Set(gates.map(z => Math.round(z))).size).toBe(gates.length);          // all different places
    for (const o of c.options) {
      expect(o.usd).toBeGreaterThan(0);
      expect(o.plan.gate.z).toBeCloseTo(o.gateZ, 6);
      expect(o.notes).toHaveLength(4);
      expect(o.shutWithBlade).toBeLessThanOrEqual(o.shutPerWinter);   // a blade never makes it worse
    }
    const s = c.options[c.suggested];
    expect(c.options.every(o => o.shutPerWinter >= s.shutPerWinter)).toBe(true);
    expect(c.options.filter(o => o.shutPerWinter === s.shutPerWinter).every(o => o.usd >= s.usd)).toBe(true);
    expect(c.options.filter(o => o.current)).toHaveLength(1);
    expect(c.options.find(o => o.current)!.habitual).toBe(true);                       // nothing chosen yet: the habitual one is in use
  });

  it('is pure: the same place gives the same options', () => {
    const a = entranceOptions(hill(), 7), b = entranceOptions(hill(), 7);
    expect(a.options.map(o => [o.gateZ, o.usd])).toEqual(b.options.map(o => [o.gateZ, o.usd]));
  });

  it('puts the road where the family chose: the plan, the quote and the card all follow it', () => {
    const g = game();
    const c = entranceChoiceFor(g), other = c.options.find(o => !o.current)!;
    expect(setEntrance(g, other.z)).toBeNull();
    expect(g.site.entrance).toBeCloseTo(other.z, 0);
    const p = roadPlanFor(g.site, g.seed);
    expect(Math.abs(p.gate.z - other.gateZ)).toBeLessThan(2.5);
    expect(roadLine(g)).toBeTruthy();
    const after = entranceChoiceFor(g);
    expect(after.options.find(o => o.current)!.gateZ).toBeCloseTo(other.gateZ, 0);
  });

  it('can be chosen only before the drive is ordered, and only on the frontage', () => {
    const g = game();
    const [lo, hi] = entranceRange(g.site);
    expect(setEntrance(g, lo - 5)).toMatch(/frontage/);
    expect(setEntrance(g, hi + 5)).toMatch(/frontage/);
    g.siteJobs.drive = 10;
    expect(entranceProblem(g)).toMatch(/books/);
    expect(setEntrance(g, (lo + hi) / 2)).toMatch(/books/);
    g.siteJobs.drive = null; g.site.improvements.drive = true;
    expect(setEntrance(g, (lo + hi) / 2)).toMatch(/poured/);
  });

  it('the habitual entrance is seeded by the lot, so a listed lot has one road in the listing and in the game', () => {
    const site = { ...hill(), listed: true };
    expect(pinSeed(site, 123)).toBe(site.lot!.seed);
    expect(pinSeed(hill(), 123)).toBe(123);                                          // a QA lot keeps the game's seed
    expect(habitualEntrance(site, 1)).toBeCloseTo(habitualEntrance(site, 99), 9);
    const a = roadPlanFor(site, 1), b = roadPlanFor(site, 99);
    expect(a.signature).toBe(b.signature);
    expect(a.gate.z).toBeCloseTo(b.gate.z, 9);
  });
});
