import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { armoryDay, buyAmmo, buyGun, firepower, gunPrices, huntingRifle, practice, skillOf, takeClass } from './armory';
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
});
