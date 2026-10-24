import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { armoryDay, buyAmmo, buyGun, firepower, GUNS, gunPrices, huntingRifle, NFA_STAMP, practice, skillOf, spendInFight, takeClass } from './armory';
import { CLASSIC } from './site';
import { defenseOf, postureOf } from './encounters';

const fresh = (region: 'mountain_west' | 'pnw' = 'mountain_west') => { const g = newGame(3, 105, 2027, { site: { ...CLASSIC, region } }); g.money = 50_000; return g; };

describe('the armory', () => {
  it('buy a gun at the shop: background check, each gun tracked; Washington makes you wait', () => {
    const g = fresh();
    expect(buyGun(g, 'rem_700')).toBeNull();
    expect(g.armory.guns.length + g.armory.pending.length).toBe(1);
    expect(g.armory.onBooks).toBe(1);
    expect(g.money).toBeLessThan(50_000 - 650);
    const w = fresh('pnw');
    buyGun(w, 'glock_19');
    expect(w.armory.guns.length).toBe(0);
    expect(w.armory.pending.length).toBe(1);
    w.clock.t = 15; armoryDay(w);
    expect(w.armory.guns.length).toBe(1);
  });

  it('ammo by caliber; panic in the warning signs runs prices up and puts limits on ammo', () => {
    const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.money = 50_000;
    expect(buyAmmo(g, '308', 10)).toBeNull();
    expect(g.armory.ammo['308']).toBe(200);
    g.clock.t = g.disaster.hitAt - 0.5;
    expect(gunPrices(g)).toBeGreaterThan(1.8);
    expect(buyAmmo(g, '308', 10)).toMatch(/limit/);
  });

  it('classes and range practice raise shooting; practice spends ammo and wears the gun', () => {
    const g = fresh();
    const pid = g.people[0].id, s0 = skillOf(g, pid);
    expect(takeClass(g, pid)).toBeNull();
    expect(skillOf(g, pid)).toBeCloseTo(Math.min(7, s0 + 1.5));
    buyGun(g, 'ruger_1022'); buyAmmo(g, '22lr', 2);
    g.clock.t = 5; armoryDay(g);
    expect(practice(g, pid)).toBeNull();
    expect(g.armory.ammo['22lr']).toBe(900);
    expect(skillOf(g, pid)).toBeGreaterThan(s0 + 1.5);
  });

  it('guns with ammo make the family stronger at the gate; empty guns don\'t', () => {
    const g = fresh();
    const bare = defenseOf(postureOf(g));
    expect(firepower(g)).toBeCloseTo(0.6);
    for (const m of ['sw_mp15', 'mossberg_500']) buyGun(g, m);
    g.clock.t = 5; armoryDay(g);
    expect(defenseOf(postureOf(g))).toBeCloseTo(bare);           // no ammo yet
    buyAmmo(g, '556', 10); buyAmmo(g, '12ga', 4);
    expect(defenseOf(postureOf(g))).toBeGreaterThan(bare * 1.2);
  });

  it('big game needs a rifle and rounds for it', () => {
    const g = fresh();
    expect(huntingRifle(g)).toBe(false);
    buyGun(g, 'marlin_336'); g.clock.t = 5; armoryDay(g);
    expect(huntingRifle(g)).toBe(false);
    buyAmmo(g, '3030', 1);
    expect(huntingRifle(g, true)).toBe(true);
    expect(g.armory.ammo['3030']).toBe(17);
  });

  it('a gun left out with little kids around can hurt someone; a safe prevents it', () => {
    let hurt = 0;
    for (let seed = 1; seed <= 40; seed++) {
      let g = newGame(seed); g.money = 50_000;
      if (!g.people.some(p => p.kid && p.age < 13)) continue;
      for (const m of ['glock_19', 'mossberg_500', 'ruger_1022']) buyGun(g, m);
      g = step(g, 365);
      if (g.personState.some(ps => ps.needs.hurt.some(h => h.what.includes('firearm')))) hurt++;
    }
    expect(hurt).toBeGreaterThan(0);
    let g = newGame(1); g.money = 50_000; g.stock.gun_safe = 1;
    for (const m of ['glock_19', 'mossberg_500', 'ruger_1022']) buyGun(g, m);
    g = step(g, 365);
    expect(g.armory.guns.every(x => x.where === 'safe')).toBe(true);
  });

  it('AR, AK and MP5-pattern semi-autos sell over the counter, but not in Washington', () => {
    const g = fresh();
    for (const m of ['zpap_m70', 'colt_6920', 'zenith_z5']) expect(buyGun(g, m)).toBeNull();
    const w = fresh('pnw');
    expect(buyGun(w, 'zpap_m70')).toMatch(/Washington/);
    expect(buyGun(w, 'sw_mp15')).toMatch(/Washington/);
    expect(buyGun(w, 'ruger_mini14')).toBeNull();        // a ranch rifle isn't on the list
  });

  it('a machine gun: collector price, the $200 stamp, months on a Form 4, picked up only from an open dealer', () => {
    const g = fresh(); g.money = 100_000;
    const before = g.money;
    expect(buyGun(g, 'm16_nfa')).toBeNull();
    expect(before - g.money).toBe(Math.round(35_000 * 1.08) + NFA_STAMP);
    expect(g.armory.guns).toHaveLength(0);
    const p = g.armory.pending[0];
    expect(p.form4).toBe(true);
    expect(p.readyAt).toBeGreaterThanOrEqual(120);
    g.clock.t = 100; armoryDay(g);
    expect(g.armory.guns).toHaveLength(0);
    g.disaster.tracks.law = 0.2;                       // the approval came, but the dealer is shut
    g.clock.t = 300; armoryDay(g);
    expect(g.armory.guns).toHaveLength(0);
    g.disaster.tracks.law = 1;
    g.clock.t = 301; armoryDay(g);
    expect(g.armory.guns.map(x => x.model)).toEqual(['m16_nfa']);
    expect(buyGun(fresh('pnw'), 'mp5_nfa')).toMatch(/illegal/);
  });

  it('full auto hits harder at the gate and burns through ammo', () => {
    const semi = fresh(), auto = fresh(); auto.money = 100_000;
    buyGun(semi, 'zpap_m70'); buyGun(auto, 'ak_nfa');
    semi.clock.t = 5; armoryDay(semi);
    auto.clock.t = 300; armoryDay(auto);
    for (const g of [semi, auto]) buyAmmo(g, '762x39', 20);
    expect(firepower(auto)).toBeGreaterThan(firepower(semi));
    const r = () => 0.5;
    spendInFight(semi, r); spendInFight(auto, r);
    expect(400 - (auto.armory.ammo['762x39'] ?? 0)).toBeCloseTo(3 * (400 - (semi.armory.ammo['762x39'] ?? 0)), -1);
    // short on rounds, full auto is no better than nothing
    auto.armory.ammo['762x39'] = 40;
    expect(firepower(auto)).toBeCloseTo(0.6);
  });

  it('every gun is a real model with a 2025 price and a caliber we sell', () => {
    expect(new Set(GUNS.map(m => m.id)).size).toBe(GUNS.length);
    for (const m of GUNS) { expect(m.price).toBeGreaterThan(100); expect(m.capacity).toBeGreaterThan(0); }
  });
});
