import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { bmOf, buyOffer, findContact, offers, priceOfOffer, risk } from './blackMarket';
import { buyGun } from './armory';

const fresh = (seed = 3) => { const g = newGame(seed, 105, 2027); g.money = 400_000; return g; };
const withContact = (g = fresh()) => { bmOf(g).contact = true; return g; };
const collapse = (g: ReturnType<typeof fresh>) => { g.disaster.tracks.law = 0.1; g.disaster.tracks.stores = 0.1; g.disaster.tracks.banks = 0.1; };

describe('the black market', () => {
  it('a contact takes cash in the safe; deals are cash only', () => {
    const g = fresh();
    expect(findContact(g)).toMatch(/cash/);
    g.fin.cash = 10_000;
    expect(findContact(g)).toBeNull();
    expect(findContact(g)).toMatch(/this month|already/);
    const w = withContact();
    const o = offers(w)[0];
    expect(buyOffer(w, o.id)).toMatch(/cash only/);
    w.fin.cash = priceOfOffer(w, o);
    expect(typeof buyOffer(w, o.id, 0.99)).toBe('object');
    expect(w.fin.cash).toBe(0);
  });

  it('contraband never sells at the shop', () => {
    expect(buyGun(fresh(), 'm4_contraband')).toMatch(/no shop/);
  });

  it('stings in peacetime, none after the collapse; payment turns to metal', () => {
    const g = withContact(), o = offers(g)[0];
    const peace = risk(g, o).sting;
    expect(peace).toBeGreaterThan(0);
    collapse(g);
    expect(risk(g, o).sting).toBe(0);
    expect(buyOffer(g, o.id)).toMatch(/gold and silver/);
    g.fin.holdings.push({ kind: 'gold_bar', units: 20, where: 'safe' });
    const res = buyOffer(g, o.id, 0.0);   // the lowest roll: a scam, never a sting
    expect(res).toEqual({ result: 'scam' });
    expect(g.fin.holdings[0].units).toBeLessThan(20);
  });

  it('a sting seizes contraband, fines, burns the contact and raises the next risk', () => {
    const g = withContact();
    g.armory.guns.push({ id: 'gx', model: 'ak_contraband', condition: 1, fired: 0, where: 'safe', carrier: null });
    g.stock.grenades = 3;
    const o = offers(g)[0];
    g.fin.cash = 200_000;
    const before = risk(g, o).sting;
    const res = buyOffer(g, o.id, 0);
    expect(res).toMatchObject({ result: 'sting' });
    expect(g.armory.guns.some(x => x.model.endsWith('_contraband'))).toBe(false);
    expect(g.stock.grenades).toBe(0);
    expect(g.paper.fines).toBeGreaterThan(25_000);
    expect(bmOf(g).contact).toBe(false);
    bmOf(g).contact = true;
    const o2 = offers(g).find(x => x.id !== o.id)!;
    bmOf(g).bought = [];
    expect(risk(g, o2).sting).toBeGreaterThan(before - 0.1);
    expect(risk(g, o).sting).toBeGreaterThan(before);
  });

  it('a trusted contact lowers the risk', () => {
    const g = withContact(), o = offers(g)[0];
    const r0 = risk(g, o);
    bmOf(g).cleanDeals = 5;
    const r1 = risk(g, o);
    expect(r1.sting).toBeLessThan(r0.sting);
    expect(r1.scam).toBeLessThan(r0.scam);
  });

  it('deterministic by seed: offers and outcomes', () => {
    const run = () => { const g = withContact(fresh(11)); g.fin.cash = 500_000; return offers(g).map(o => { const r = buyOffer(g, o.id); return [o.id, typeof r === 'string' ? r : r.result]; }); };
    expect(run()).toEqual(run());
    expect(offers(fresh(11)).length).toBeGreaterThanOrEqual(3);
  });
});
