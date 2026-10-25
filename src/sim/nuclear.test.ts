import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { bestShelter, doseBetween, doseRate, falloutDay, faradayShare, strike, winterFactor } from './nuclear';
import { step } from './engine';
import { replaceFried } from './utilities';

const built = (g: GameState, id: string, kind: string, extra: Partial<Structure> = {}): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0, ...extra };
  g.structures.push(st);
  return st;
};
const war = (variant = 'distant', seed = 1) => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'nuclear', variant });

describe('nuclear war', () => {
  it('the 7-10 rule: seven times the hours, a tenth the dose rate', () => {
    expect(doseRate('distant', 49) / doseRate('distant', 7)).toBeCloseTo(0.1, 1);
    expect(doseRate('distant', 2)).toBe(0);                      // before the fallout arrives
    // unsheltered from arrival to two weeks: lethal; most of it in the first two days
    const total = doseBetween('distant', 0, 24 * 14), first2 = doseBetween('distant', 0, 48);
    expect(total).toBeGreaterThan(2.5);
    expect(first2 / total).toBeGreaterThan(0.6);
  });

  it('shelter: an unhardened bunker room beats the root cellar beats the house', () => {
    const g = war();
    built(g, 'c', 'timber_cabin');
    expect(bestShelter(g)[0]).toBe(3);
    built(g, 'r', 'root_cellar');
    expect(bestShelter(g)[1]).toBe('the root cellar');
    const d = built(g, 'd', 'bunker_dorm');
    expect(bestShelter(g)[0]).toBe(40);                          // root cellar 40 vs an unhardened bunker 20
    d.hardening = { fallout: 2 };
    expect(bestShelter(g)).toEqual([1000, 'the bunker']);
  });

  it('two weeks in a PF 1,000 bunker vs a frame cabin', () => {
    const run = (hardened: boolean) => {
      const g = war();
      if (hardened) { built(g, 'd', 'bunker_dorm', { hardening: { fallout: 2 } }); built(g, 'w', 'cistern'); } else built(g, 'c', 'timber_cabin');   // the bunker family drinks from a covered cistern, not the creek
      g.clock.t = g.disaster.hitAt;
      for (let d = 0; d < 14; d++) { falloutDay(g); g.clock.t += 1; }
      return g.personState[0].needs.dose;
    };
    expect(run(true)).toBeLessThan(0.05);
    expect(run(false)).toBeGreaterThan(0.6);
  });

  it('fallout in the produce goes by how much of the diet it is, not how big the harvest is', () => {
    const run = (produced: number) => {
      const g = war();
      built(g, 'd', 'bunker_dorm', { hardening: { fallout: 2 } }); built(g, 'w', 'cistern');
      g.clock.t = g.disaster.hitAt + 20;
      g.food = { ...g.food, needKcal: 10_000, producedKcal: produced };
      falloutDay(g);
      return g.personState[0].needs.dose;
    };
    expect(run(150_000)).toBeCloseTo(run(10_000), 6);    // a sixteen-field harvest feeds the same mouths as a garden that covers them
    expect(run(150_000)).toBeLessThan(0.01);
    expect(run(5_000)).toBeLessThan(run(10_000));
  });

  it('the EMP fries electronics; spares in a Faraday room come through', () => {
    const bare = war(), caged = war();
    for (const g of [bare, caged]) { built(g, 's', 'solar_array'); g.stock.inverter = 4; g.stock.hardware = 2; g.clock.t = g.disaster.hitAt; }
    built(caged, 'f', 'bunker_stores', { hardening: { faraday: 3 } });
    expect(faradayShare(caged)).toBe(1);
    strike(bare); strike(caged);
    expect(bare.utilities.fried).toContain('s');
    expect(bare.stock.inverter).toBe(0);
    expect(caged.stock.inverter).toBe(4);
    expect(replaceFried(bare, 's')).toMatch(/spare/);
    expect(replaceFried(caged, 's')).toBeNull();
    expect(caged.utilities.fried).not.toContain('s');
  });

  it('in the sim: everyone shelters two weeks, then gets back to work', () => {
    let g = war('distant', 3);
    built(g, 'd', 'bunker_dorm', { hardening: { fallout: 2 } });
    g.stock.canned = 40;
    g = step(g, g.disaster.hitAt - g.clock.t + 2.5);
    expect(g.personState.filter(ps => ps.needs.died == null).every(ps => ps.task === 'shelter' || ps.task === 'sleep')).toBe(true);
    g = step(g, 16);
    expect(g.personState.some(ps => ps.task !== 'shelter')).toBe(true);
    expect(Math.max(...g.personState.map(ps => ps.needs.dose))).toBeLessThan(0.5);
  });

  it('a full exchange brings a nuclear winter that lifts over 1–3 years', () => {
    const g = war('exchange');
    g.clock.t = g.disaster.hitAt + 100;
    expect(winterFactor(g).grow).toBeLessThan(0.3);
    g.clock.t = g.disaster.hitAt + 365 * 3;
    expect(winterFactor(g).grow).toBe(1);
    const d = war('distant');
    d.clock.t = d.disaster.hitAt + 100;
    expect(winterFactor(d).grow).toBe(1);
  });
});
