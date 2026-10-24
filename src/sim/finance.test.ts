import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import type { DisasterKind } from './disaster';
import { step } from './engine';
import { placeOrder, orderProblem } from './economy';
import { buyMetal, buyPrice, financeDay, metalsValue, moveMetal, netWorth, priceOf, sellMetal, sellPrice, transfer } from './finance';

const rich = (kind: DisasterKind = 'grid_down') => { const g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind }); g.money = 600_000; return g; };

describe('money: accounts and metals', () => {
  it('move money between checking, savings, brokerage and cash while the banks work', () => {
    const g = rich();
    expect(transfer(g, 'checking', 'savings', 100_000)).toBeNull();
    expect(transfer(g, 'checking', 'brokerage', 200_000)).toBeNull();
    expect(transfer(g, 'checking', 'cash', 20_000)).toBeNull();
    expect(g.fin.onBooks).toBe(20_000);                 // the bank's cash report
    expect(transfer(g, 'savings', 'checking', 1e9)).toMatch(/not that much/);
    expect(netWorth(g)).toBeCloseTo(600_000);
    g.disaster.tracks.banks = 0.1;
    expect(transfer(g, 'savings', 'checking', 10)).toMatch(/shut/);
  });

  it('gold at spot plus premium, shipped in a week; sold back under spot', () => {
    let g = rich();
    const p = buyPrice(g, 'gold_coin');
    expect(p).toBeGreaterThan(priceOf(g, 'gold_coin'));
    expect(sellPrice(g, 'gold_coin')).toBeLessThan(priceOf(g, 'gold_coin'));
    expect(buyMetal(g, 'gold_coin', 10, 'safe')).toBeNull();
    expect(g.fin.onBooks).toBeGreaterThan(30_000);
    expect(metalsValue(g)).toBe(0);
    g = step(g, 10);
    expect(g.fin.holdings).toEqual([{ kind: 'gold_coin', units: 10, where: 'safe' }]);
    expect(moveMetal(g, 'gold_coin', 'safe', 'buried', 4)).toBeNull();
    expect(sellMetal(g, 'gold_coin', 8)).toMatch(/buried/);
    expect(sellMetal(g, 'gold_coin', 6)).toBeNull();
  });

  it('the market crashes when it hits, and metals run as trust in money fails', () => {
    let g = rich('financial');
    transfer(g, 'checking', 'brokerage', 300_000);
    const gold0 = g.fin.spot.gold;
    g = step(g, g.disaster.hitAt + 40);
    expect(g.fin.crashed).toBe(true);
    expect(g.fin.brokerage).toBeLessThan(300_000 * 0.75);
    expect(g.fin.spot.gold).toBeGreaterThan(gold0 * 1.3);
  });

  it('when the banks shut, cash in the safe still buys while the trucks run and the law holds', () => {
    const g = rich();
    g.fin.cash = 5_000;
    g.disaster.tracks.banks = 0.1; g.disaster.tracks.deliveries = 0.6; g.disaster.tracks.law = 0.6;
    const lines = [{ material: 'lumber' as const, qty: 2 }];
    expect(orderProblem(g, lines)).toBeNull();
    const m = g.money;
    placeOrder(g, lines);
    expect(g.money).toBe(m);
    expect(g.fin.cash).toBeLessThan(5_000);
    g.fin.cash = 0;
    expect(orderProblem(g, lines)).toBe('no_deliveries');
  });

  it('a financial collapse that doesn\'t come all the way back: a bail-in over the insured limit', () => {
    for (let seed = 1; seed < 60; seed++) {
      const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'financial' });
      if (g.disaster.fate === 'full') continue;
      g.money = 1_000_000;
      g.clock.t = g.disaster.hitAt + 31;
      financeDay(g);
      expect(g.money).toBeCloseTo(1_000_000 - 750_000 * 0.3, 0);
      return;
    }
    throw new Error('no partial fate found');
  });
});
