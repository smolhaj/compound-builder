import { describe, expect, it } from 'vitest';
import { crewProblem, crewQuote, hireCrew, hoursLeft } from './crews';
import { isFinished, planStructure } from './construction';
import { step } from './engine';
import { newGame } from './state';
import { CABIN_BLUEPRINT, totalBill } from './blueprints';
import type { MATERIAL_IDS } from './materials';
import { placeOrder } from './economy';

const fullCabinOrder = () => (Object.entries(totalBill(CABIN_BLUEPRINT)) as Array<[typeof MATERIAL_IDS[number], number]>).map(([material, qty]) => ({ material, qty }));

const setup = (crew: boolean) => {
  let g = newGame(4, 105, 2027);
  g.money = 400_000;
  placeOrder(g, fullCabinOrder());
  const st = planStructure(g, 'timber_cabin', 50, 30, 0);
  const q = crewQuote(st);
  if (crew) expect(hireCrew(g, st.id)).toBeNull();
  const start = g.clock.t, money = g.money;
  let d = 0;
  for (; d < 300 && !isFinished(g.structures.find(x => x.id === st.id)!); d++) g = step(g, 1);
  return { g, st, q, days: g.clock.t - start, spent: money - g.money };
};

describe('hired crews', () => {
  it('quote: all the hours left at the crew rate, in weeks of a crew of four', () => {
    const g = newGame(4);
    const st = planStructure(g, 'timber_cabin', 50, 30, 0);
    const q = crewQuote(st);
    expect(q.usd).toBe(Math.round(hoursLeft(st) * 60 / 100) * 100);
    expect(hoursLeft(st)).toBe(1400);
    expect(q.weeks).toBe(Math.ceil(1400 / 180));
  });

  it('a crew gets the cabin up much sooner than the family alone, bills by the hour and goes home', () => {
    const own = setup(false), hired = setup(true);
    expect(hired.days).toBeLessThan(own.days * 0.6);
    expect(hired.spent).toBeLessThan(hired.q.usd * 1.1);
    expect(hired.spent).toBeGreaterThan(own.spent + 20_000);
    const after = step(hired.g, 1);
    expect(after.crews.length).toBe(0);
  });

  it('only one crew per building; nobody hires out crews once the banks and the law are gone', () => {
    const g = newGame(4);
    g.money = 100_000;
    const st = planStructure(g, 'timber_cabin', 50, 30, 0);
    expect(hireCrew(g, st.id)).toBeNull();
    expect(hireCrew(g, st.id)).toMatch(/already/);
    const st2 = planStructure(g, 'timber_cabin', 70, 30, 0);
    g.disaster.tracks.banks = 0.1;
    expect(crewProblem(g, st2)).toMatch(/nobody/);
  });
});
