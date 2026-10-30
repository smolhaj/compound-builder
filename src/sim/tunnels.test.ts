import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { makeLotSite } from './lotListing';
import { BLUEPRINTS, totalBill } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { gardenSeason, greenhouseGreens, greenhousePeak, GH_TIER } from './greenhouse';
import { glassSound, pendingFixes } from './improvements';
import { FILM_YEARS, TUNNEL, filmLight, filmYears, tearChance, tunnelDay, tunnelPestK, tunnelPestLoss, tunnelStorm, tunnelWaterL } from './tunnels';
import { seasons } from './regions';
import { regionFor } from './climate';
import { addFixWork } from './improvements';
import { choreRates } from './daily';

afterEach(() => setGroundOverride(null));
const game = (): GameState => { const g = newGame(11); g.site = { ...makeLotSite({ kind: 'hillside', seed: 3 }), creek: false, timber: 0 }; setGroundOverride({ h: () => 0 }); return g; };
const built = (g: GameState, id: string, kind: string, x = 30, z = 30): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const at = (g: GameState, doy: number, year = 0) => { g.clock.t = year * 365 + (((doy - g.clock.startDoy) % 365) + 365) % 365 + 0.5; };

describe('tunnels', () => {
  it('they join the greenhouse tiers: a longer garden season and a higher peak, a high tunnel more than a poly one, less than glass', () => {
    const base = newGame(11); base.site = game().site;
    const [g0] = gardenSeason(base);
    const a = game(); built(a, 'p', 'polytunnel');
    const b = game(); built(b, 'h', 'high_tunnel');
    const c = game(); built(c, 'g', 'greenhouse_heated');
    expect(gardenSeason(a)[0]).toBe(g0 - TUNNEL.polytunnel.extend);
    expect(gardenSeason(b)[0]).toBe(g0 - 35);
    expect(gardenSeason(c)[0]).toBeLessThan(gardenSeason(b)[0]);
    expect(greenhousePeak(b)).toBeGreaterThan(greenhousePeak(a));
    expect(GH_TIER.high_tunnel.kcal).toBeGreaterThan(GH_TIER.polytunnel.kcal);
    expect(GH_TIER.high_tunnel.kcal).toBeLessThan(GH_TIER.greenhouse_heated.kcal);
  });

  it('winter greens under film: a high tunnel makes some, the film ages after four years, a fresh re-cover restores it', () => {
    const g = game(); const st = built(g, 'h', 'high_tunnel');
    at(g, 20, 1);
    const fresh = greenhouseGreens(g);
    expect(fresh).toBeGreaterThan(0);
    expect(filmLight(g, st)).toBe(1);
    at(g, 20, 7);
    expect(filmYears(g, st)).toBeGreaterThan(FILM_YEARS);
    expect(filmLight(g, st)).toBeLessThan(1);
    expect(greenhouseGreens(g)).toBeLessThan(fresh);
    // queued for a re-cover; doing the job starts the four years again
    const lines = tunnelDay(g);
    expect(lines[0]).toMatch(/four years old/);
    const fix = pendingFixes(st).find(f => f.part === 'film')!;
    expect(fix).toBeTruthy();
    g.stock.poly_film = 5; g.stock.hardware = 2;
    addFixWork(g, st, fix, 40);
    expect(filmLight(g, st)).toBe(1);
    expect(pendingFixes(st)).toHaveLength(0);
    expect(tunnelDay(g)).toHaveLength(0);
  });

  it('wind tears the film more on an exposed spot, a windbreak halves it, a blizzard loads a high tunnel more than a poly one, and a tear costs output until patched', () => {
    setGroundOverride({ h: (x, z) => 3 * Math.exp(-((x - 20) ** 2 + (z - 20) ** 2) / 30) });
    const g = game(); setGroundOverride({ h: (x, z) => 3 * Math.exp(-((x - 20) ** 2 + (z - 20) ** 2) / 30) });
    const knoll = built(g, 'k', 'high_tunnel', 20, 20), flat = built(g, 'f', 'high_tunnel', 55, 55);
    expect(tearChance(g, knoll, 'derecho')).toBeGreaterThan(tearChance(g, flat, 'derecho'));
    expect(tearChance(g, flat, 'tornado')).toBeGreaterThan(tearChance(g, flat, 'windstorm'));
    expect(tearChance(g, flat, 'hail')).toBe(0);
    const poly = built(g, 'p', 'polytunnel', 55, 40);
    expect(tearChance(g, flat, 'blizzard')).toBeGreaterThan(tearChance(g, poly, 'blizzard'));
    const out: string[] = [];
    let n = 0; const r = () => (n++ % 2 === 0 ? 0.0 : 0.9);   // always tears, never badly
    tunnelStorm(g, 'derecho', r, out);
    expect(out.length).toBeGreaterThan(0);
    expect(glassSound(knoll)).toBeLessThan(1);
    expect(pendingFixes(knoll)[0].part).toBe('film');
  });

  it('water, pests and chores: drip lines draw in the growing months; an outbreak is seeded and halved by tended vents; the greenhouse chore counts them', () => {
    const g = game(); built(g, 'p', 'polytunnel'); built(g, 'h', 'high_tunnel');
    at(g, 200, 1); expect(tunnelWaterL(g)).toBe(120 + 420);
    at(g, 20, 1); expect(tunnelWaterL(g)).toBe(0);
    const y0 = g.clock.startYear, years = Array.from({ length: 30 }, (_, y) => tunnelPestLoss(g, y0 + y).loss);
    expect(years.some(l => l > 0)).toBe(true);
    expect(years.some(l => l === 0)).toBe(true);
    expect(Math.max(...years)).toBeLessThanOrEqual(0.2);
    const y = years.findIndex(l => l > 0.1); at(g, 100, y);
    expect(tunnelPestK(g, 0)).toBeGreaterThan(tunnelPestK(g, 90));
    const [g0] = seasons(regionFor(g.site)).garden; at(g, g0 + 30, 1);
    expect(choreRates(g).greenhouse).toBeGreaterThanOrEqual(6);
  });

  it('priced from the one table, staged and cheaper than glass', () => {
    const cost = (k: string) => Object.entries(totalBill(BLUEPRINTS[k])).reduce((a, [m, n]) => a + (MATERIALS[m as MaterialId].price ?? 0) * n, 0);
    for (const k of ['polytunnel', 'high_tunnel', 'aquaponics']) { expect(BLUEPRINTS[k].stages).toHaveLength(5); for (const m of Object.keys(totalBill(BLUEPRINTS[k]))) expect(MATERIALS[m as MaterialId].price, m).not.toBeNull(); }
    expect(cost('polytunnel')).toBeGreaterThan(2000); expect(cost('polytunnel')).toBeLessThan(4000);
    expect(cost('high_tunnel')).toBeGreaterThan(9000); expect(cost('high_tunnel')).toBeLessThan(15000);
    expect(cost('high_tunnel')).toBeLessThan(cost('greenhouse_heated') + 5000);
    expect(cost('aquaponics')).toBeGreaterThan(10000);
  });
});
