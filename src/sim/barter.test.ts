import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { barterOf, barterPrices, mutualAidDay, trade, AID_CHANCE } from './barter';

function afterHit(seed = 1, days = 20): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0, fuel: 0, medical: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.armory.ammo['22lr'] = 500;
  return g;
}

describe('barter prices', () => {
  it('peacetime values are shop prices; scarcity raises food, fuel, meds, ammo', () => {
    const g = newGame(1);
    const p0 = barterPrices(g);
    expect(p0.canned).toBeCloseTo(38);
    expect(p0['ammo:9mm']).toBeCloseTo(16 / 50);
    const p1 = barterPrices(afterHit());
    expect(p1.canned).toBeGreaterThan(p0.canned * 2);
    expect(p1.fuel).toBeGreaterThan(p0.fuel * 3);
    expect(p1.meds).toBeGreaterThan(p0.meds * 3);
    expect(p1['ammo:9mm']).toBeGreaterThan(p0['ammo:9mm'] * 3);
    expect(p1.labor).toBeLessThan(p0.labor);
    expect(p1['metal:silver_coin']).toBeGreaterThan(0);
  });
  it('drifts up with time since the hit', () => {
    expect(barterPrices(afterHit(1, 150)).canned).toBeGreaterThan(barterPrices(afterHit(1, 5)).canned);
  });
});

describe('trade', () => {
  it('a fair trade goes through and raises disposition', () => {
    const g = afterHit();
    const n = g.neighbors.find(x => x.status === 'home')!;
    n.disposition = 60;
    const before = g.stock.meds;
    const r = trade(g, [{ good: 'canned', qty: 4 }], [{ good: 'meds', qty: 1 }], n.id);
    const p = barterPrices(g);
    expect(r.ok).toBe(4 * p.canned >= p.meds);
    if (r.ok) { expect(g.stock.meds).toBe(before + 1); expect(g.stock.canned).toBe(16); expect(n.disposition).toBeGreaterThan(60); }
  });
  it('ammo changes hands by the round', () => {
    const g = afterHit();
    const n = g.neighbors.find(x => x.status === 'home')!;
    n.disposition = 70;
    const r = trade(g, [{ good: 'ammo:22lr', qty: 200 }], [{ good: 'staples', qty: 0.1 }], n.id);
    expect(r.ok).toBe(true);
    expect(g.armory.ammo['22lr']).toBe(300);
  });
  it('lopsided offers, short stock and unfriendly neighbors fail', () => {
    const g = afterHit();
    const n = g.neighbors.find(x => x.status === 'home')!;
    n.disposition = 60;
    expect(trade(g, [{ good: 'canned', qty: 1 }], [{ good: 'meds', qty: 2 }], n.id).problem).toBe('unfair');
    expect(trade(g, [{ good: 'fuel', qty: 99 }], [{ good: 'canned', qty: 1 }], n.id).problem).toBe('short');
    n.disposition = -30;
    expect(trade(g, [{ good: 'canned', qty: 5 }], [{ good: 'fuel', qty: 1 }], n.id).problem).toBe('unfriendly');
  });
  it('wary neighbors want a markup', () => {
    const g = afterHit();
    const n = g.neighbors.find(x => x.status === 'home')!;
    const p = barterPrices(g);
    const qty = p.meds / p.canned * 1.05; // 5 % over par
    n.disposition = 60;
    expect(trade(structuredClone(g), [{ good: 'canned', qty }], [{ good: 'meds', qty: 1 }], n.id).ok).toBe(true);
    n.disposition = 10;
    expect(trade(g, [{ good: 'canned', qty }], [{ good: 'meds', qty: 1 }], n.id).problem).toBe('unfair');
  });
  it('labor given is owed', () => {
    const g = afterHit();
    const n = g.neighbors.find(x => x.status === 'home')!;
    n.disposition = 80;
    expect(trade(g, [{ good: 'labor', qty: 3 }], [{ good: 'canned', qty: 1 }], n.id).ok).toBe(true);
    expect(barterOf(g).laborOwed).toBe(3);
  });
});

describe('mutual aid', () => {
  it('nothing while money works', () => {
    const g = newGame(1);
    for (const n of g.neighbors) n.disposition = 90;
    expect(mutualAidDay(g)).toEqual([]);
  });
  it('friendly neighbors help and ask over a season; helping raises humanity', () => {
    const g = afterHit();
    for (const n of g.neighbors) n.disposition = 90;
    g.stock.canned = 500;
    g.food.daysLeft = 3;
    const h0 = g.gate.humanity;
    let lines = 0;
    for (let d = 0; d < Math.ceil(4 / AID_CHANCE); d++) { g.clock.t += 1; lines += mutualAidDay(g).length; }
    const b = barterOf(g);
    expect(lines).toBeGreaterThan(0);
    expect(b.aidReceived).toBeGreaterThan(0);
    expect(b.aidGiven).toBeGreaterThan(0);
    expect(g.gate.humanity).toBeGreaterThan(h0);
  });
  it('unfriendly neighbors do nothing', () => {
    const g = afterHit();
    for (const n of g.neighbors) n.disposition = 20;
    for (let d = 0; d < 200; d++) { g.clock.t += 1; expect(mutualAidDay(g)).toEqual([]); }
  });
});
