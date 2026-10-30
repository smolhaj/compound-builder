import { afterEach, describe, expect, it } from 'vitest';
import { makeLotSite } from './lotListing';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { planRun } from './perimeter';
import { produceParts } from './needs';
import { seasons } from './regions';
import { regionFor } from './climate';
import { balanceDay, plant, repairPump } from './utilities';
import { gardenShift, gardenSeasonK, fieldSiteK, orchardWindK, solarCoolK, arrayStripped, heatWindK, siteNote, windCost, siteClimate, MC } from './microclimate';

afterEach(() => setGroundOverride(null));

// a hollow at (50,50), a knoll at (20,20), a draining slope at (35,10), flat elsewhere
const GROUND = { h: (x: number, z: number) => 3 * Math.exp(-((x - 20) ** 2 + (z - 20) ** 2) / 30) - 1.2 * Math.exp(-((x - 50) ** 2 + (z - 50) ** 2) / 30) + (x > 30 && x < 40 && z < 16 ? 0.25 * (16 - z) : 0) };
const game = (): GameState => { const g = newGame(9); g.site = { ...makeLotSite({ kind: 'hillside', seed: 3 }), creek: false, timber: 0 }; setGroundOverride(GROUND); return g; };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };

describe('frost and wind at a spot', () => {
  it('a hollow is a pocket (a later, shorter garden season), a draining slope starts early, flat is the region\'s', () => {
    const g = game();
    expect(gardenShift(g, { x: 50, z: 50 })).toEqual({ start: MC.GARDEN_POCKET_DAYS, end: MC.GARDEN_POCKET_DAYS });
    expect(gardenShift(g, { x: 35, z: 8 }).start).toBeLessThan(0);
    expect(gardenShift(g, { x: 60, z: 8 })).toEqual({ start: 0, end: 0 });
    const g0 = 160, g1 = 250;
    // early in the season the pocket's bed is a week behind, late it is already closing
    expect(gardenSeasonK(g, { x: 50, z: 50 }, g0 + 30, g0, g1)).toBeLessThan(gardenSeasonK(g, { x: 60, z: 8 }, g0 + 30, g0, g1));
    expect(gardenSeasonK(g, { x: 50, z: 50 }, g0 + 3, g0, g1)).toBe(0);
    expect(gardenSeasonK(g, { x: 50, z: 50 }, g1 - 2, g0, g1)).toBeLessThan(gardenSeasonK(g, { x: 60, z: 8 }, g1 - 2, g0, g1));
  });

  it('the exposed knoll costs fields, gardens and orchards a few percent; a hedge or fence on it halves that; the hollow costs the field 8 %', () => {
    const g = game();
    const knoll = { x: 20, z: 20 }, open = { x: 60, z: 8 }, hollow = { x: 50, z: 50 };
    expect(siteClimate(g, knoll).windy).toBe('exposed');
    expect(fieldSiteK(g, open)).toBe(1);
    expect(fieldSiteK(g, knoll)).toBeCloseTo(1 - MC.FIELD_WIND, 5);
    expect(fieldSiteK(g, hollow)).toBeCloseTo(1 - MC.FIELD_POCKET, 5);
    expect(orchardWindK(g, knoll)).toBeCloseTo(1 - MC.ORCHARD_WIND, 5);
    const r = planRun(g, 'thorn_hedge', [[18, 20], [22, 20]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    expect(windCost(g, knoll, 0.08)).toBeCloseTo(0.04, 5);
    expect(orchardWindK(g, knoll)).toBeCloseTo(1 - MC.ORCHARD_WIND / 2, 5);
  });

  it('the siting card says what the spot does', () => {
    const g = game();
    expect(siteNote(g, 'garden', { x: 50, z: 50 })).toMatch(/cold-air pocket/);
    expect(siteNote(g, 'field', { x: 20, z: 20 })).toMatch(/wind/);
    expect(siteNote(g, 'solar_farm', { x: 20, z: 20 })).toMatch(/strip/);
    expect(siteNote(g, 'wind_turbine', { x: 20, z: 20 })).toMatch(/Wind here is/);
    expect(siteNote(g, 'garden', { x: 60, z: 8 })).toBeNull();
  });
});

describe('on the food', () => {
  it('a bed in a cold-air pocket grows less in the shoulder weeks than the same bed on level ground', () => {
    const veg = (x: number, z: number) => { const g = game(); built(g, 'g1', 'garden', x, z); const [g0] = seasons(regionFor(g.site)).garden; let sum = 0; for (let d = g0; d < g0 + 60; d++) { g.clock.t = ((d - g.clock.startDoy) % 365 + 365) % 365 + 0.5; sum += produceParts(g).veg; } return sum; };
    expect(veg(50, 50)).toBeLessThan(veg(60, 8));
  });
});

describe('solar, wind and wood', () => {
  it('panels in a wind run a little cooler; a gale strips an exposed array and not a sheltered one; two panels and a kit put them back', () => {
    const g = game();
    const exposed = built(g, 'sa', 'solar_farm', 20, 20), sheltered = built(g, 'sb', 'solar_farm', 50, 50);
    expect(solarCoolK(g, exposed)).toBeGreaterThan(1);
    expect(solarCoolK(g, exposed)).toBeLessThanOrEqual(1 + MC.SOLAR_COOL_CAP);
    expect(solarCoolK(g, sheltered)).toBe(1);
    const day = Math.floor(g.clock.t);
    g.weather = { active: { kind: 'derecho', at: day, until: day + 1 }, last: 0 } as GameState['weather'];
    let hit = 0;
    for (let k = 1; k <= 40; k++) { if (arrayStripped(g, { ...exposed, id: 'a' + k })) hit++; expect(arrayStripped(g, { ...sheltered, id: 'b' + k })).toBe(false); }
    expect(hit).toBeGreaterThan(5);
    expect(hit).toBeLessThan(40);
    // no storm, no stripping
    g.weather = { active: null, last: 0 } as GameState['weather'];
    expect(arrayStripped(g, exposed)).toBe(false);
  });

  it('balanceDay: a stripped array makes nothing until it is repaired (hardware + two panels)', () => {
    const g = game();
    g.clock.t = 100.5;
    const arr = built(g, 'sa', 'solar_array', 20, 20), home = built(g, 'h', 'timber_cabin', 22, 24);
    const r = planRun(g, 'power_cable', [[20, 20], [22, 24]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    balanceDay(g, plant(g), 0.99);
    const made = g.utilities.report.solarKwh;
    expect(made).toBeGreaterThan(5);
    expect(g.utilities.lit).toContain(home.id);
    g.utilities.broken.push(arr.id);
    balanceDay(g, plant(g), 0.99);
    expect(g.utilities.report.solarKwh).toBe(0);
    g.stock.hardware = 1; g.stock.solar_panel = 1;
    expect(repairPump(g, arr.id)).toBe(false);
    g.stock.solar_panel = 2;
    expect(repairPump(g, arr.id)).toBe(true);
    expect(g.stock.solar_panel).toBe(0);
    balanceDay(g, plant(g), 0.99);
    expect(g.utilities.report.solarKwh).toBeGreaterThan(5);
  });

  it('an exposed house burns more wood, one in a hollow less', () => {
    const g = game();
    expect(heatWindK(g)).toBe(1);
    built(g, 'h', 'timber_cabin', 20, 20);
    const high = heatWindK(g);
    expect(high).toBeGreaterThan(1);
    g.structures = []; built(g, 'h', 'timber_cabin', 50, 50);
    expect(heatWindK(g)).toBeLessThan(1);
  });
});
