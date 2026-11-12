import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { emptyStock } from './materials';
import { hireCrew } from './crews';
import { suggestions } from './guidance';
import { FUNDS_RANGE, startFunds } from './startFunds';
import { generateFamily } from './family';
import { IDLE_FLOOR, IDLE_METALS_CAP, IDLE_MIN, idleCash } from './idleCash';

const fresh = (money: number): GameState => {
  const g = newGame(5); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; g.money = money;
  g.stock.logs = 500;
  return g;
};

describe('idle cash', () => {
  it('says nothing when the cash is tight or there is nothing to spend it on', () => {
    expect(idleCash(fresh(20_000))).toBeNull();
    expect(idleCash(fresh(900_000))).toBeNull();   // rich, but no project to put a crew on and no warning yet
  });
  it('offers a second crew with the materials ordered in the same tap, for a project that is not the home', () => {
    const g = fresh(900_000);
    const home = planStructure(g, 'log_house', 0, 0, 0);
    planStructure(g, 'root_cellar', 20, 0, 0);
    expect(hireCrew(g, home.id)).toBeNull();
    const ic = idleCash(g)!;
    expect(ic).not.toBeNull();
    expect(ic.crew).not.toBeNull();
    expect(ic.crew!.id).not.toBe(home.id);
    expect(ic.crew!.totalUsd).toBeGreaterThanOrEqual(ic.crew!.usd);
    expect(ic.crew!.totalUsd).toBeLessThanOrEqual(ic.spare * 0.6);
    expect(ic.metals).toBe(0);    // metals and guards wait for the warning signs
    expect(ic.guards).toBeNull();
  });
  it('never offers a crew the cash cannot carry, and keeps the living reserve out of the spare cash', () => {
    const g = fresh(IDLE_MIN + 25_000);
    planStructure(g, 'log_house', 0, 0, 0);
    const ic = idleCash(g);
    if (ic) expect(ic.spare).toBeLessThan(g.money);
    expect(ic?.crew ?? null).toBeNull();
  });
  it('offers guards and a capped metals hedge once the warning is up, and stays silent in the collapse', () => {
    const g = fresh(900_000);
    planStructure(g, 'log_house', 0, 0, 0).stage = 99;   // a finished home (guards need something to guard)
    g.disaster.phase = 'warning';
    const ic = idleCash(g)!;
    expect(ic).not.toBeNull();
    expect(ic.metals).toBeGreaterThan(0);
    expect(ic.metals).toBeLessThanOrEqual(IDLE_METALS_CAP);
    g.disaster.phase = 'survival';
    expect(idleCash(g)).toBeNull();
  });
  it('always leaves the cash floor untouched', () => {
    const g = fresh(IDLE_FLOOR + 40_000);
    const home = planStructure(g, 'log_house', 0, 0, 0);
    planStructure(g, 'root_cellar', 20, 0, 0);
    hireCrew(g, home.id);
    expect(idleCash(g)).toBeNull();   // less than IDLE_MIN above the floor
  });
  it('shows as a Next-steps card that only suggests (no purchase is made by looking)', () => {
    const g = fresh(900_000);
    const home = planStructure(g, 'log_house', 0, 0, 0);
    planStructure(g, 'root_cellar', 20, 0, 0);
    hireCrew(g, home.id);
    const before = g.money;
    const card = suggestions(g, 20).find(x => x.id === 'idle_cash');
    expect(card).toBeTruthy();
    expect(card!.acts!.some(a => a.act.type === 'crew')).toBe(true);
    expect(g.money).toBe(before);
  });
});

describe('start funds, independent families', () => {
  it('trims the independent range by about 30 percent', () => {
    expect(FUNDS_RANGE.independent).toEqual([700_000, 1_400_000]);
    for (let seed = 1; seed <= 20; seed++) {
      const f = startFunds(generateFamily(seed), 'independent', seed);
      expect(f.budget).toBeGreaterThanOrEqual(FUNDS_RANGE.independent[0]);
      expect(f.budget).toBeLessThanOrEqual(FUNDS_RANGE.independent[1]);
    }
  });
});
