import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { askPrice, goldFactor, goToMarket, haggle, isMarketDay, marketDay, marketOf, marketOpen, marketPrices, MARKET_SETTLE_DAYS, MARKET_WEEKDAY, offerValue, refuses, repMarkup, roadHome } from './market';
import { barterPrices } from './barter';
import { bagOf } from './tradeGoods';
import { ensurePlaces, scavengeOf } from './scavenge';
import { exposure } from './opsec';
import { isAway } from './rescue';
import { mulberry32 } from './rng';

/** A market day, `days` or so after the hit, with the law partly back. */
function marketGame(seed = 1, days = 120): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + days;
  while (dayIndex(g.clock.t) % 7 !== MARKET_WEEKDAY) g.clock.t += 1;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0.4, stores: 0, deliveries: 0, banks: 0, fuel: 0, medical: 0 };
  g.stock.canned = 30; g.stock.fuel = 10; g.stock.meds = 4;
  g.armory.ammo['22lr'] = 1000;
  return g;
}
const adult = (g: GameState) => g.people.find(p => !p.kid)!.id;

describe('market: when', () => {
  it('opens ten weeks after the hit if the law is partly back, or the neighbors organize', () => {
    const g = marketGame();
    expect(marketOpen(g)).toBe(true);
    expect(isMarketDay(g)).toBe(true);
    g.clock.t = g.disaster.hitAt + MARKET_SETTLE_DAYS - 5;
    expect(marketOpen(g)).toBe(false);
    const h = marketGame();
    h.disaster.tracks.law = 0;
    expect(marketOpen(h)).toBe(false);
    h.locals!.group = { kind: 'coop', name: 'the Valley Co-op', founded: 0, leader: h.neighbors[0].id, members: [] };
    expect(marketOpen(h)).toBe(true);
  });
});

describe('market: scarcity pricing', () => {
  it('ammo, salt, coffee, batteries climb with time; gold is worth far less than spot early', () => {
    const early = marketPrices(marketGame(1, 75)), late = marketPrices(marketGame(1, 500));
    expect(late['bag:coffee']).toBeGreaterThan(early['bag:coffee']);
    expect(late['bag:salt']).toBeGreaterThan(early['bag:salt'] * 1.2);
    expect(early['bag:coffee']).toBeGreaterThan(9 * 2);
    const g = marketGame(1, 75);
    expect(marketPrices(g)['metal:gold_coin']).toBeLessThan(barterPrices(g)['metal:gold_coin'] * 0.5);
    expect(goldFactor(1200)).toBeGreaterThan(goldFactor(60) * 2);
    // silver holds up better than gold
    const ratio = (k: 'metal:gold_coin' | 'metal:silver_coin') => marketPrices(g)[k] / barterPrices(g)[k];
    expect(ratio('metal:silver_coin')).toBeGreaterThan(ratio('metal:gold_coin'));
  });
  it('fuel and meds climb as the gas station and pharmacy are stripped', () => {
    const g = marketGame();
    ensurePlaces(g);
    const before = marketPrices(g);
    for (const p of scavengeOf(g).places) for (const k of Object.keys(p.left)) (p.left as Record<string, number>)[k] = 0;
    const after = marketPrices(g);
    expect(after.fuel).toBeGreaterThan(before.fuel * 2);
    expect(after.meds).toBeGreaterThan(before.meds * 1.5);
  });
});

describe('market: haggling and reputation', () => {
  function atStall(seed = 1) {
    const g = marketGame(seed);
    const pid = adult(g);
    expect(goToMarket(g, pid, false)).toBeNull();
    expect(isAway(g, pid)).toBe(true);
    const st = marketOf(g).stalls[0];
    return { g, pid, st };
  }
  it('a fair honest deal goes through; the name improves a little', () => {
    const { g, st } = atStall();
    const ask = askPrice(g, st, 0, 1);
    const per = marketPrices(g)['ammo:22lr'] * (st.wants.includes('ammo:22lr') ? 1 : 0.6);
    const qty = Math.ceil(ask * 1.05 / per);
    g.armory.ammo['22lr'] = qty + 10;
    const r = haggle(g, st.id, 0, 1, [{ good: 'ammo:22lr', qty }], 'honest');
    expect(r.ok).toBe(true);
    expect(marketOf(g).rep).toBeGreaterThan(0);
    expect(g.armory.ammo['22lr']).toBe(10);
  });
  it('a lowball is refused', () => {
    const { g, st } = atStall();
    const r = haggle(g, st.id, 0, 1, [{ good: 'ammo:22lr', qty: 1 }], 'honest');
    expect(r.ok).toBe(false);
  });
  it('better prices with a good name; stalls refuse a bad one', () => {
    expect(repMarkup(80)).toBeLessThan(repMarkup(0));
    expect(repMarkup(-100)).toBeGreaterThan(repMarkup(0));
    const { g, st } = atStall();
    const fair = askPrice(g, st, 0, 1);
    marketOf(g).rep = 90;
    expect(askPrice(g, st, 0, 1)).toBeLessThan(fair);
    marketOf(g).rep = -100;
    const refused = marketOf(g).stalls.filter(x => refuses(g, x)).length;
    expect(refused).toBeGreaterThan(0);
  });
  it('cheating: caught at the stall, or found out later; either way the name suffers and the vendor won\'t deal', () => {
    let caught = 0, later = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { g, st } = atStall(seed);
      const ask = askPrice(g, st, 0, 1);
      const per = marketPrices(g).canned * (st.wants.includes('canned') ? 1 : 0.6);
      const qty = Math.ceil(ask / 1.3 / per) + 1;
      const r = haggle(g, st.id, 0, 1, [{ good: 'canned', qty }], 'cheat');
      if (r.caught) { caught++; expect(marketOf(g).rep).toBeLessThan(0); expect(refuses(g, st)).toBe(true); continue; }
      if (!marketOf(g).exposed.length) continue;
      later++;
      g.clock.t += 30;
      marketDay(g);
      expect(marketOf(g).rep).toBeLessThan(0);
    }
    expect(caught).toBeGreaterThan(2);
    expect(later).toBeGreaterThan(1);
  });
  it('generosity spreads to the neighbors', () => {
    const { g, st } = atStall(4);
    const ask = askPrice(g, st, 0, 1);
    const n = g.neighbors.find(x => x.status === 'home')!;
    const d0 = n.disposition;
    const per = marketPrices(g)['ammo:22lr'] * (st.wants.includes('ammo:22lr') ? 1 : 0.6);
    g.armory.ammo['22lr'] = 100000;
    const r = haggle(g, st.id, 0, 1, [{ good: 'ammo:22lr', qty: Math.ceil(ask * 1.4 / per) }], 'generous');
    expect(r.ok).toBe(true);
    expect(n.disposition).toBeGreaterThan(d0);
    expect(offerValue(g, st, [{ good: 'ammo:22lr', qty: 1 }])).toBeGreaterThan(0);
  });
});

describe('market: the road home', () => {
  it('followed home raises OPSEC exposure; robbed loses the day\'s buys', () => {
    let followed = 0, robbed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = marketGame(seed);
      g.disaster.tracks.law = 0.25;
      const pid = adult(g);
      g.people.find(p => p.id === pid)!.skills.hunter = 0;
      for (const q of g.people) q.skills.negotiator = 0;   // (the family is drawn by seed: don't depend on a smooth talker; the household's best one lowers exposure)
      goToMarket(g, pid, false);
      const m = marketOf(g);
      m.trip!.carried = 500;
      m.trip!.bought = [{ good: 'bag:coffee', qty: 3 }];
      bagOf(g).coffee = 3;
      const ex = exposure(g);
      g.clock.t += 1;
      roadHome(g, mulberry32(seed * 77));
      if (bagOf(g).coffee === 0) robbed++;
      if (m.heat > 0) { followed++; expect(exposure(g)).toBeGreaterThan(ex); }
    }
    expect(robbed).toBeGreaterThan(2);
    expect(followed).toBeGreaterThan(2);
  });
});
