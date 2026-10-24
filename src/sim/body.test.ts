import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { bodyDay, conditionsFor, stockUpRx } from './body';
import { variedFamily } from './family';

const closeTown = (g: ReturnType<typeof newGame>) => { for (const k of Object.keys(g.disaster.tracks) as Array<keyof typeof g.disaster.tracks>) g.disaster.tracks[k] = 0; };
const days = (g: ReturnType<typeof newGame>, n: number) => { for (let d = 0; d < n; d++) { g.clock.t += 1; bodyDay(g); } };

describe('body and household', () => {
  it('conditions follow age: grandparents mostly on blood pressure pills, kids rarely on anything', () => {
    let elders = 0, elderBp = 0, kids = 0, kidRx = 0;
    for (let seed = 1; seed < 300; seed++) for (const p of variedFamily(seed, 0).people) {
      const c = conditionsFor(p, seed);
      if (p.elder) { elders++; if (c.includes('blood_pressure')) elderBp++; }
      if (p.kid) { kids++; if (c.length) kidRx++; }
    }
    expect(elderBp / elders).toBeGreaterThan(0.45);
    expect(kidRx / kids).toBeLessThan(0.15);
  });

  it('refilled monthly while the pharmacy is open; buy up to 90 days ahead; once shut it runs out', () => {
    const g = newGame(1);
    g.people[0].conditions = ['blood_pressure'];
    days(g, 60);
    expect(g.body.rx[g.people[0].id]).toBeGreaterThan(25);
    const m = g.money;
    expect(stockUpRx(g)).toBeGreaterThan(0);
    expect(g.money).toBeLessThan(m);
    expect(g.body.rx[g.people[0].id]).toBe(120);
    closeTown(g);
    days(g, 125);
    expect(g.body.rx[g.people[0].id]).toBe(0);
    expect(g.body.without[g.people[0].id]).toBeGreaterThan(1);
  });

  it('without insulin a type 1 diabetic has weeks; insulin keeps a month without a fridge', () => {
    const g = newGame(1);
    g.people[0].conditions = ['insulin'];
    g.body.rx[g.people[0].id] = 120;
    closeTown(g);
    days(g, 40);
    expect(g.body.rx[g.people[0].id]).toBe(0);         // no fridge: the stash spoiled past ~28 days
    expect(g.personState[0].needs.health).toBeLessThan(80);
  });

  it('once the stores close, hygiene supplies come out of the stockpile; without them morale sinks', () => {
    const g = newGame(1);
    closeTown(g);
    g.stock.hygiene = 4;
    days(g, 20);
    expect(g.stock.hygiene).toBeCloseTo(4 - 20 * 4 / 30, 1);
    const h = newGame(1);
    closeTown(h);
    const m0 = h.personState[0].needs.morale;
    days(h, 30);
    expect(h.personState[0].needs.morale).toBeLessThan(m0 - 8);
  });
});
