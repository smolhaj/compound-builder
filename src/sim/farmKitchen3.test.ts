import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { foodUnits } from './pantry';
import { kitchenOf, putByDay, lidCases, spendLids, capacities } from './kitchen';
import { BORN, PIG_CAP, sireFor, swineDay, swineFeedLb, swineOf, WEANED, STUD_FEE } from './swine';
import { balesPerAcre, cuttingBales, cuttingWindows, hayingDay, hayingOf, hayingRate, meadowAcres, openCutting } from './haying';
import { feedDemand, livestockDay } from './livestock';
import { choreRates } from './daily';
import { poultryDay, poultryOf, flockFactor } from './poultry';
import { sellFeeders, sellFeederProblem, FEEDER_USD } from './swine';
import { SAVE_VERSION } from './state';

const built = (g: GameState, id: string, kind: string): Structure => {
  const st: Structure = { id, kind, x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -3000 };
  g.structures.push(st);
  return st;
};
const sk = (g: GameState) => g.stock as unknown as Record<string, number>;
const setDay = (g: GameState, doy: number) => { g.clock.startDoy = doy; g.clock.t = 0.3; };
const home = () => { const g = newGame(1, 250); g.stock.canner = 0; built(g, 'h', 'timber_cabin'); g.disaster.tracks = { ...g.disaster.tracks, stores: 0 }; return g; };

describe('reusable canning lids', () => {
  it('single-use lids go first; reusable sleeves wear one in sixteen cases and seal a little less often', () => {
    const g = home(); g.stock.fresh = 400; g.stock.canner = 1; sk(g).lids = 0; sk(g).lids_reuse = 2;
    expect(lidCases(g)).toBe(2);
    putByDay(g, 8000, 1);
    expect(foodUnits(g, 'home_canned')).toBeCloseTo(1.7 * 0.96, 2);
    expect(sk(g).lids_reuse).toBe(2);
    expect(kitchenOf(g).lidWear).toBeCloseTo(2 / 16);
    for (let i = 0; i < 8; i++) spendLids(g, 2);
    expect(sk(g).lids_reuse).toBeLessThan(2);
  });
  it('the Farm tab sees reusable lids as lids', () => {
    const g = home(); g.stock.fresh = 200; g.stock.canner = 1; sk(g).lids = 0; sk(g).lids_reuse = 1;
    expect(capacities(g, 1).find(c => c.method === 'canning')?.why).toBeNull();
  });
});

describe('breeding swine', () => {
  const farm = () => { const g = newGame(5); sk(g).sow = 2; sk(g).boar = 1; sk(g).pig = 0; return g; };
  const run = (g: GameState, from: number, to: number) => { for (let d = from; d < to; d++) { g.clock.startDoy = 0; g.clock.t = d + 0.3; swineDay(g, 1, false); } };

  it('a sow with a boar farrows in late March and the piglets join the feeders eight weeks on', () => {
    const g = farm();
    run(g, 80, 100);
    expect(swineOf(g).litters.length).toBe(1);
    expect(swineOf(g).litters[0].n).toBeGreaterThan(2 * WEANED * 0.6);
    expect(swineOf(g).litters[0].n).toBeLessThanOrEqual(2 * BORN);
    run(g, 100, 160);
    expect(sk(g).pig).toBeGreaterThan(8);
    expect(sk(g).pig).toBeLessThanOrEqual(PIG_CAP);
    expect(swineOf(g).litters.length).toBe(0);
  });
  it('no boar and no open banks: no litter; peacetime AI costs the fee', () => {
    const g = farm(); sk(g).boar = 0; g.disaster.tracks = { ...g.disaster.tracks, stores: 0 };
    expect(sireFor(g)).toBeNull();
    run(g, 80, 100);
    expect(swineOf(g).litters.length).toBe(0);
    expect(swineOf(g).noSire).toBe(true);
    const h = farm(); sk(h).boar = 0; h.disaster.tracks = { ...h.disaster.tracks, stores: 1, banks: 1 }; h.money = 5000;
    expect(sireFor(h)).toBe('ai');
    run(h, 80, 100);
    expect(h.money).toBe(5000 - STUD_FEE * 2);
  });
  it('a full pen sends the extra piglets to market in peacetime, to the table after', () => {
    const g = farm(); sk(g).pig = PIG_CAP; g.disaster.tracks = { ...g.disaster.tracks, stores: 1, banks: 1 }; g.money = 0;
    run(g, 80, 160);
    expect(sk(g).pig).toBe(PIG_CAP);
    expect(g.money).toBeGreaterThan(500);
  });
  it('they eat the same bags as the feeders, and starve without them', () => {
    const g = farm();
    expect(swineFeedLb(g)).toBe(2 * 7 + 5);
    expect(feedDemand(g).feed).toBeCloseTo(19 / 50);
    sk(g).feed = 0;
    for (let d = 0; d < 40; d++) { setDay(g, 200 + d); livestockDay(g, false); }
    expect(sk(g).sow + sk(g).boar).toBeLessThan(3);
  });
});

describe('haying', () => {
  const ranch = () => {
    const g = newGame(2); g.site.acres = 20; sk(g).goat = 4; sk(g).hay = 0; g.disaster.kind = null;
    return g;
  };
  it('the meadow is part of the pasture and makes more in a wet region', () => {
    const g = ranch();
    expect(meadowAcres(g)).toBeGreaterThan(1);
    expect(balesPerAcre(g)).toBeGreaterThanOrEqual(25);
    expect(balesPerAcre(g)).toBeLessThanOrEqual(60);
    expect(cuttingBales(g)).toBeGreaterThan(20);
  });
  it('two cuttings are put up over their windows into the hay store; unattended hay is lost', () => {
    const g = ranch();
    const [w0] = cuttingWindows(g);
    for (let d = w0[0]; d <= w0[1] + 1; d++) { setDay(g, d); hayingDay(g); }
    const h = hayingOf(g);
    expect(h.made).toBeGreaterThan(cuttingBales(g) * 0.85);
    expect(sk(g).hay).toBe(h.made);
    const n = ranch(); n.daily!.chores.levels.haying = 100;
    for (let d = w0[0]; d <= w0[1] + 1; d++) { setDay(n, d); hayingDay(n); }
    expect(hayingOf(n).made).toBeLessThan(h.made);
  });
  it('the chore grows only in a window, only with a herd', () => {
    const g = ranch(); const [w0] = cuttingWindows(g);
    setDay(g, w0[0] + 2);
    expect(openCutting(g)).toBe(0);
    expect(hayingRate(g)).toBeGreaterThan(0);
    expect(choreRates(g).haying).toBeGreaterThan(0);
    setDay(g, w0[0] - 30); expect(hayingRate(g)).toBe(0);
    sk(g).goat = 0; setDay(g, w0[0] + 2); expect(hayingRate(g)).toBe(0);
  });
  it('drought halves the crop', () => {
    const g = ranch(); const full = cuttingBales(g);
    g.disaster.kind = 'drought'; g.disaster.hitAt = -1; g.clock.t = 5;
    expect(cuttingBales(g)).toBe(Math.floor(full / 2));
  });
});

it('the save version moved', () => { expect(SAVE_VERSION).toBeGreaterThanOrEqual(91); });

describe('the flock', () => {
  const coop = () => { const g = newGame(4); built(g, 'c', 'chicken_coop'); return g; };
  const at = (g: GameState, d: number) => { g.clock.startDoy = 0; g.clock.t = d + 0.3; return poultryDay(g); };
  it('a spring hatch with a rooster raises chicks; cockerels go in the pot, old hens are culled in October', () => {
    const g = coop(); const before = g.stock.fresh + g.stock.frozen + g.stock.canned;
    at(g, 105);
    expect(poultryOf(g).hatchedN).toBe(6);
    for (let d = 106; d < 310; d++) at(g, d);
    expect(poultryOf(g).potted).toBe(3);
    expect(poultryOf(g).cullN).toBe(3);
    expect(g.stock.fresh + g.stock.frozen + g.stock.canned).toBeGreaterThan(before);
    expect(poultryOf(g).age).toBeLessThan(1.4);
  });
  it('no rooster, no chicks; the flock ages and lays less', () => {
    const g = coop(); poultryOf(g).rooster = false;
    const lines = at(g, 105);
    expect(poultryOf(g).hatchedN).toBe(0);
    expect(lines.join(' ')).toMatch(/no rooster/);
    expect(flockFactor(g)).toBeGreaterThan(0.999);
    poultryOf(g).age = 3;
    expect(flockFactor(g)).toBeCloseTo(0.7, 2);
    poultryOf(g).age = 9;
    expect(flockFactor(g)).toBe(0.55);
  });
});

describe('selling live feeders', () => {
  it('pays in peacetime, refuses after', () => {
    const g = newGame(6); sk(g).pig = 3; g.disaster.tracks = { ...g.disaster.tracks, stores: 1, banks: 1 }; g.money = 0;
    expect(sellFeeders(g, 2)).toBeNull();
    expect(sk(g).pig).toBe(1);
    expect(g.money).toBe(2 * FEEDER_USD);
    g.disaster.tracks = { ...g.disaster.tracks, stores: 0 };
    expect(sellFeederProblem(g, 1)).toMatch(/nobody/);
    expect(sellFeederProblem(g, 5)).toMatch(/not 5/);
  });
});
