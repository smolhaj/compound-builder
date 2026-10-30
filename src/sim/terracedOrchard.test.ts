import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { makeLotSite } from './lotListing';
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { FRUIT, ORCHARD_TREES, POCKET_DAYS, DRAIN_DAYS, TERRACE, fruitYear, isOrchard, isTerraced, orchardColumns, orchardWaterL, plotSite, terraceSunK, treesOf } from './orchard';
import { KIT } from '../game/buildkit/kit';
import { orchardTrees } from '../game/buildkit/foodBuildings';

afterEach(() => setGroundOverride(null));
// a hollow at (50,50); a south-facing slope (ground falls toward +z) in x 5..30; a north-facing one (falls toward -z) in x 35..60 along z 5..30
const GROUND = { h: (x: number, z: number) => -1.2 * Math.exp(-((x - 50) ** 2 + (z - 50) ** 2) / 30) + (x < 32 ? -0.2 * z * 0.2 : 0.2 * z * 0.2) };
const game = (): GameState => { const g = newGame(17); g.site = { ...makeLotSite({ kind: 'hillside', seed: 3 }), creek: false, timber: 0 }; setGroundOverride(GROUND); return g; };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };

describe('the terraced orchard', () => {
  it('is an orchard: 48 trees in the grove\'s columns, on three benches of two rows', () => {
    expect(isOrchard('orchard_terraced')).toBe(true);
    expect(isTerraced('orchard_terraced')).toBe(true);
    expect(ORCHARD_TREES.orchard_terraced).toBe(48);
    expect(orchardColumns('orchard_terraced')).toEqual(orchardColumns('orchard_grove'));
    expect(treesOf('orchard_terraced', 'apple')).toBe(treesOf('orchard_grove', 'apple'));
    const trees = orchardTrees(KIT.orchard_terraced);
    expect(trees).toHaveLength(48);
    expect(new Set(trees.map(t => t.z)).size).toBe(6);
  });

  it('the walls break up a hollow\'s cold pool (half the late-frost shift) and level ground counts as a draining slope', () => {
    const g = game();
    const plain = plotSite(g, { x: 50, z: 50, kind: 'orchard_grove' }), terr = plotSite(g, { x: 50, z: 50, kind: 'orchard_terraced' });
    expect(plain.pocket).toBe(true);
    expect(plain.shift).toBe(POCKET_DAYS);
    expect(terr.shift).toBe(Math.round(POCKET_DAYS * TERRACE.POCKET_HALVED));
    const flat = plotSite(g, { x: 62, z: 8, kind: 'orchard_terraced' });
    expect(flat.drained).toBe(true);
    expect(flat.shift).toBe(DRAIN_DAYS);
  });

  it('drip water is 30 % lower, and the benches take the slope\'s aspect: a south face gains, a north face loses, at most 6 %', () => {
    const g = game(); const a = built(g, 't', 'orchard_terraced', 62, 8);
    const w1 = (g.clock.t = 160, orchardWaterL(g));
    g.structures = []; built(g, 'g', 'orchard_grove', 62, 8);
    expect(w1).toBeCloseTo(orchardWaterL(g) * TERRACE.WATER_K, 4);
    const south = terraceSunK(g, { x: 15, z: 15, kind: 'orchard_terraced' }), north = terraceSunK(g, { x: 48, z: 15, kind: 'orchard_terraced' });
    expect(south).toBeGreaterThan(1);
    expect(north).toBeLessThan(1);
    expect(Math.abs(south - 1)).toBeLessThanOrEqual(TERRACE.SUN_CAP + 1e-9);
    expect(terraceSunK(g, { x: 15, z: 15, kind: 'orchard_grove' })).toBe(1);
    void a;
  });

  it('a terraced plot out-yields the grove in a hollow in a frost year', () => {
    const g = game(); g.clock.t = 12 * 365 + 4 / 24;
    setGroundOverride({ h: (x, z) => -1.2 * Math.exp(-((x - 50) ** 2 + (z - 50) ** 2) / 30) });   // a hollow on level ground: no aspect either way
    const ter = built(g, 't', 'orchard_terraced', 50, 50), gro = built(g, 'g', 'orchard_grove', 50, 50);
    ter.finishedAt = 0; gro.finishedAt = 0;
    let better = 0, worse = 0;
    for (const f of Object.keys(FRUIT) as Array<keyof typeof FRUIT>) for (let y = 0; y < 12; y++) { const a = fruitYear(g, ter, f, 1, g.clock.startYear + y), b = fruitYear(g, gro, f, 1, g.clock.startYear + y); if (a > b + 1) better++; else if (a < b - 1) worse++; }
    expect(better).toBeGreaterThan(worse);
  });

  it('priced from the one table, staged: stone and a long job', () => {
    const cost = Object.entries(totalBill(BLUEPRINTS.orchard_terraced)).reduce((a, [m, n]) => a + (MATERIALS[m as MaterialId].price ?? 0) * n, 0);
    expect(BLUEPRINTS.orchard_terraced.stages).toHaveLength(5);
    expect(cost).toBeGreaterThan(12_000); expect(cost).toBeLessThan(25_000);
    expect(totalHours(BLUEPRINTS.orchard_terraced)).toBeGreaterThan(700);
    expect(totalBill(BLUEPRINTS.orchard_terraced).fieldstone).toBeGreaterThanOrEqual(30);
    expect(totalHours(BLUEPRINTS.orchard_terraced)).toBeGreaterThan(totalHours(BLUEPRINTS.orchard_grove));
  });
});
