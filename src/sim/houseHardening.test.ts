import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { LAYERS, emberK, hardenedSafeRoom, hasSafeRoom, houseBarrier, houseCoverK, layerTier, upgradeLayer, upgradeQuote } from './houseHardening';
import { gearPosture } from './gear';
import { defenseReport } from './defenseReport';
import { MATERIALS } from './materials';
import { SHELVES } from './shelves';
import { effectsDay } from './effects';

const game = (): GameState => { const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); g.money = 200_000; return g; };

describe('house hardening chain', () => {
  it('the old goods count exactly as before: two steel doors +10, bars +8', () => {
    const g = game();
    expect(houseBarrier(g)).toBe(0);
    g.stock.steel_door = 3; expect(houseBarrier(g)).toBe(10);
    g.stock.window_bars = 1; expect(houseBarrier(g)).toBe(18);
    expect(gearPosture(g, 2).barrier).toBe(18);
  });

  it('each tier is stronger than the one below, and only the two best doors and the best window layer count', () => {
    const g = game();
    g.stock.steel_door = 1; g.stock.security_door = 2;
    expect(houseBarrier(g)).toBe(18);
    g.stock.window_bars = 1; g.stock.window_shutters = 1; expect(houseBarrier(g)).toBe(18 + 14);
    g.stock.ballistic_panels = 1; expect(houseBarrier(g)).toBe(18 + 22);
    for (const l of Object.values(LAYERS)) for (let i = 1; i < l.tiers.length; i++) expect(MATERIALS[l.tiers[i].good].price).toBeGreaterThan(MATERIALS[l.tiers[i - 1].good].price ?? 0);
  });

  it('shutters and panels keep embers out of a house and make it a better firing position', () => {
    const g = game();
    expect(emberK(g)).toBe(1); expect(houseCoverK(g)).toBe(1);
    g.stock.window_bars = 1; expect(houseCoverK(g)).toBeLessThan(1);
    g.stock.window_shutters = 1; const e = emberK(g); expect(e).toBeLessThan(1);
    g.stock.ballistic_panels = 1; expect(emberK(g)).toBeLessThanOrEqual(e); expect(houseCoverK(g)).toBeLessThan(0.7);
  });

  it('shutters cut the share of houses a wildfire front takes', () => {
    const burned = (shutters: boolean): number => {
      let n = 0;
      for (let seed = 1; seed <= 80; seed++) {
        const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'wildfire' });
        g.clock.t = g.disaster.hitAt + 0.1;
        const st: Structure = { id: 'c', kind: 'timber_cabin', x: 10, z: 10, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 };
        g.structures.push(st);
        g.disaster.fuel = { c: 14 };
        if (shutters) g.stock.window_shutters = 1;
        effectsDay(g);
        if (st.finishedAt === null) n++;
      }
      return n;
    };
    const a = burned(false), b = burned(true);
    expect(a).toBeGreaterThan(20);
    expect(b).toBeLessThan(a - 8);
  });

  it('the safe room chain: a hardened room is a safe room, and it shows in the report', () => {
    const g = game();
    expect(hasSafeRoom(g)).toBe(false);
    g.stock.safe_room = 1; expect(hasSafeRoom(g)).toBe(true); expect(hardenedSafeRoom(g)).toBe(false);
    expect(gearPosture(g, 2).safeRoom).toBe(true);
    g.stock.safe_room = 0; g.stock.safe_room_hardened = 1;
    expect(hasSafeRoom(g)).toBe(true); expect(hardenedSafeRoom(g)).toBe(true);
    expect(gearPosture(g, 2).safeRoom).toBe(true);
    expect(defenseReport(g).shelter.find(c => c.id === 'safe')!.detail).toMatch(/vault/);
  });

  it('upgrading swaps one unit at half credit for doors and the safe room, and adds over the windows', () => {
    const g = game();
    g.stock.steel_door = 2; g.stock.window_bars = 1; g.stock.safe_room = 1;
    const d = upgradeQuote(g, 'doors')!;
    expect(d.credit).toBe(600); expect(d.cost).toBe(2600 - 600);
    const m0 = g.money;
    expect(upgradeLayer(g, 'doors')).toBeNull();
    expect(g.stock.steel_door).toBe(1); expect(g.stock.security_door).toBe(1); expect(g.money).toBe(m0 - 2000);
    expect(layerTier(g, 'doors')).toBe(2);
    expect(upgradeLayer(g, 'windows')).toBeNull();
    expect(g.stock.window_bars).toBe(1); expect(g.stock.window_shutters).toBe(1);   // over, not instead
    expect(upgradeLayer(g, 'windows')).toBeNull(); expect(layerTier(g, 'windows')).toBe(3);
    expect(upgradeLayer(g, 'windows')).toMatch(/top tier/);
    expect(upgradeLayer(g, 'safe')).toBeNull();
    expect(g.stock.safe_room).toBe(0); expect(g.stock.safe_room_hardened).toBe(1);
  });

  it('cannot be fitted without money or with the stores closed', () => {
    const g = game(); g.money = 100;
    expect(upgradeLayer(g, 'doors')).toMatch(/money/);
    g.money = 100_000; g.disaster.tracks.stores = 0.1;
    expect(upgradeLayer(g, 'doors')).toMatch(/closed/);
  });

  it('every tier is on the defense shelf', () => {
    for (const l of Object.values(LAYERS)) for (const t of l.tiers) expect(SHELVES.defense).toContain(t.good);
    expect(SHELVES.defense).toContain('bugout_bag'); expect(SHELVES.defense).toContain('bugout_cache');
  });
});
