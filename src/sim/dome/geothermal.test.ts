/**
 * Geothermal and heat rejection (save v107): the pure rules (tower by wet-bulb and water, ground loop COP and field limit, well, curtains, prices, exposure), the
 * climate model's new options (defaults leave the flat model alone; monotone), the live purchases, the cost summary and the migration.
 */
import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, TIER } from './tiers';
import { domeLoad, COP_COOL } from './climate';
import { chillerRatedBtu, chillerCapacity } from './plantClimate';
import { COP_LOOP_COOL, COP_LOOP_HEAT, FIELD_MAX_SF, BORE_SF, CURTAIN_LEFT, TOWER_GAL_PER_KWH, copHeatWithLoop, copTower, curtainK, geoExposure, geoLines, geoOptions, geoProblem, geoUsd, loopField, towerCapacity, towerGalDay, unitUsd, wellGalDay, wellKwhDay, wetBulbEstimate } from './geothermal';
import { buyGeo, geoBuyProblem, geoOf } from './geothermalLive';
import { dayLoad, domeOf, stateOf } from './live';
import { climateOpts } from './plantClimateLive';
import { domeCostSummary } from './costSummary';
import { migrate } from '../save/migrations';

const G = TIER.glass.cells, A = TIER.arcology.cells;

describe('tower', () => {
  it('is full to 82 F wet-bulb and dead at 95 F, and never rises with the wet-bulb', () => {
    expect(towerCapacity(70)).toBe(1); expect(towerCapacity(82)).toBe(1); expect(towerCapacity(95)).toBe(0); expect(towerCapacity(99)).toBe(0);
    let prev = 1; for (let wb = 60; wb < 105; wb += 0.5) { const c = towerCapacity(wb); expect(c).toBeLessThanOrEqual(prev + 1e-12); prev = c; }
  });
  it('works in a dry furnace (84 F wet-bulb at 120 F) where the air-cooled unit has lost a third, and not at all in a humid one', () => {
    expect(towerCapacity(84)).toBeGreaterThan(chillerCapacity(120, 'air')); expect(wetBulbEstimate(100, 0.9)).toBeLessThan(wetBulbEstimate(100, 0.1));
    expect(towerCapacity(97)).toBe(0);
  });
  it('drinks 0.65 gallons per kWh of heat moved; COP never rises with wet-bulb', () => {
    expect(towerGalDay(100)).toBeCloseTo(100 * 24 * TOWER_GAL_PER_KWH, 6);
    expect(copTower(90)).toBeLessThanOrEqual(copTower(70)); expect(copTower(120)).toBeGreaterThanOrEqual(3);
  });
});

describe('ground loop', () => {
  it('a full loop covers more than a half, and the field never exceeds the lot limit', () => {
    for (const [t, c] of [['glass', G], ['arcology', A]] as const) {
      const h = loopField(t, c, 'half'), f = loopField(t, c, 'full');
      expect(f.capBtu).toBeGreaterThanOrEqual(h.capBtu); expect(f.fieldSf).toBeLessThanOrEqual(FIELD_MAX_SF); expect(f.fieldSf % BORE_SF).toBe(0);
      expect(f.capBtu).toBeLessThanOrEqual(chillerRatedBtu(t, c, 'temperate') + 1);
    }
  });
  it('the arcology is limited by the field area; the glass dome is not', () => {
    expect(loopField('glass', G, 'full').share).toBeCloseTo(1, 1);
    expect(loopField('arcology', A, 'full').share).toBeLessThan(1);
  });
  it('heat pump COP: 3 with a whole loop, the air number with none, between in proportion, never worse than the air number', () => {
    expect(copHeatWithLoop(1.5, 1)).toBeCloseTo(COP_LOOP_HEAT, 6); expect(copHeatWithLoop(1.5, 0)).toBeCloseTo(1.5, 6);
    expect(copHeatWithLoop(1.5, 0.5)).toBeGreaterThan(1.5); expect(copHeatWithLoop(1.5, 0.5)).toBeLessThan(3);
  });
  it('cuts the cooling electricity on a hot day, with no outdoor derate, and never raises it', () => {
    const base = domeLoad('glass', G, 100, 1, 'temperate', { copCool: 2.5 });
    const loop = domeLoad('glass', G, 100, 1, 'temperate', { copCool: 2.5, loopCapBtu: loopField('glass', G, 'full').capBtu, copLoop: COP_LOOP_COOL });
    expect(loop.kwElectric).toBeLessThan(base.kwElectric);
    const half = domeLoad('glass', G, 100, 1, 'temperate', { copCool: 2.5, loopCapBtu: loopField('glass', G, 'half').capBtu, copLoop: COP_LOOP_COOL });
    expect(half.kwElectric).toBeLessThanOrEqual(base.kwElectric); expect(loop.kwElectric).toBeLessThanOrEqual(half.kwElectric + 1e-9);
  });
  it('the loop carries a hot dome when the chiller has tripped', () => {
    const rated = chillerRatedBtu('glass', G, 'temperate');
    const tripped = domeLoad('glass', G, 130, 1, 'temperate', { chillCapBtu: 0 });
    const loop = domeLoad('glass', G, 130, 1, 'temperate', { chillCapBtu: 0, loopCapBtu: rated, copLoop: COP_LOOP_COOL });
    expect(loop.indoorF).toBeLessThan(tripped.indoorF);
  });
});

describe('model defaults and tower water', () => {
  it('no geothermal options is the flat model', () => {
    for (const f of [40, 90, 105]) expect(domeLoad('glass', G, f, 1, 'temperate', {})).toEqual(domeLoad('glass', G, f, 1, 'temperate', { loopCapBtu: 0, towerGalPerKwh: 0, nightLossK: 1 }));
    expect(COP_COOL).toBe(3.5);
  });
  it('a tower adds water to the load, in proportion to the heat the chiller takes', () => {
    const dry = domeLoad('glass', G, 105, 1, 'temperate', { dry: 0.1 }), wet = domeLoad('glass', G, 105, 1, 'temperate', { dry: 0.1, towerGalPerKwh: TOWER_GAL_PER_KWH });
    expect(wet.waterGalDay).toBeGreaterThan(dry.waterGalDay); expect(wet.kwElectric).toBeCloseTo(dry.kwElectric, 9);
  });
});

describe('curtains', () => {
  it('cut night shell loss 40 percent and do nothing by day', () => {
    expect(CURTAIN_LEFT).toBe(0.6); expect(curtainK(true, 0)).toBe(0.6); expect(curtainK(true, 1)).toBe(1); expect(curtainK(false, 0)).toBe(1);
    const a = domeLoad('glass', G, 10, 0, 'frost', {}), b = domeLoad('glass', G, 10, 0, 'frost', { nightLossK: CURTAIN_LEFT });
    expect(b.kwThermal / a.kwThermal).toBeCloseTo(0.6, 6);
    expect(domeLoad('glass', G, 10, 1, 'frost', { nightLossK: 0.6 })).toEqual(domeLoad('glass', G, 10, 1, 'frost', {}));
  });
});

describe('well', () => {
  it('gives more with the yield and the water plant, none with either gone, and the pump draws in proportion', () => {
    expect(wellGalDay('glass', 1)).toBeGreaterThan(wellGalDay('glass', 0.4)); expect(wellGalDay('glass', 1, 0)).toBe(0); expect(wellGalDay('geodesic', 1)).toBe(0);
    expect(wellKwhDay('glass', 1000)).toBeLessThan(wellKwhDay('glass', 4000)); expect(wellKwhDay('earthen', 100)).toBe(0);
  });
});

describe('prices and problems', () => {
  it('full loop is 3 times an air-cooled unit (doc), half is less, the refit is the 0.4 over the unit', () => {
    for (const [t, c] of [['glass', G], ['arcology', A]] as const) {
      const u = unitUsd(t, c);
      expect(geoUsd(t, c, 'loop_full')!).toBeGreaterThan(2.9 * u - 1000); expect(geoUsd(t, c, 'loop_full')!).toBeLessThan(3.1 * u + 1000);
      expect(geoUsd(t, c, 'loop_half')!).toBeLessThan(geoUsd(t, c, 'loop_full')!);
      expect(geoUsd(t, c, 'high_ambient')!).toBeLessThan(u);
    }
    expect(geoUsd('arcology', A, 'deep_well')!).toBeGreaterThan(geoUsd('glass', G, 'deep_well')!);
  });
  it('only glass and arcology can buy; no double purchase', () => {
    expect(geoOptions('geodesic', TIER.geodesic.cells)).toEqual([]); expect(geoOptions('earthen', TIER.earthen.cells)).toEqual([]);
    expect(geoUsd('geodesic', 1, 'tower')).toBeNull(); expect(geoProblem('earthen', {}, 'loop_full')).toMatch(/only a glass/);
    expect(geoProblem('glass', { groundLoop: 'full' }, 'loop_half')).toBeTruthy(); expect(geoProblem('glass', { rejection: 'tower' }, 'high_ambient')).toBeTruthy();
    expect(geoProblem('glass', {}, 'tower')).toBeNull();
  });
  it('lines are the bought options and the cost summary counts them in the grand total', () => {
    const spec = { rejection: 'tower' as const, groundLoop: 'full' as const, deepWell: true, curtains: true };
    const lines = geoLines('glass', G, spec);
    expect(lines.map(l => l.id).sort()).toEqual(['geo_curtains', 'geo_deep_well', 'geo_loop_full', 'geo_tower']);
    const plain = domeCostSummary('glass', G), full = domeCostSummary('glass', G, [], spec);
    expect(full.grandUsd - plain.grandUsd).toBe(lines.reduce((a, l) => a + l.usd, 0)); expect(full.totalUsd).toBe(plain.totalUsd);
    expect(plain.options.some(o => o.id === 'geo_loop_full')).toBe(true);
    expect(domeCostSummary('geodesic').options.some(o => o.id.startsWith('geo_'))).toBe(false);
  });
});

describe('exposure', () => {
  it('only the header trench is reachable; none with no loop or well', () => {
    expect(geoExposure({})).toEqual([]);
    const e = geoExposure({ groundLoop: 'full' }); expect(e).toHaveLength(1); expect(e[0].depthFt).toBe(8); expect(e[0].learned).toBeGreaterThanOrEqual(e[0].plain);
  });
});

function world() {
  const g = newGame(7, 105, 2027); g.money = 1e9;
  const k = DOME_KIND.glass, st: Structure = { id: 'dm0', kind: k, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[k].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st); g.utilities.fittings.push({ building: st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
  return g;
}
describe('live purchases', () => {
  it('buy, charge and persist; refuse a second; the dome reads them back', () => {
    const g = world(), d = domeOf(g)!;
    const before = g.money;
    expect(buyGeo(g, 'tower')).toBeNull(); expect(before - g.money).toBe(geoUsd('glass', d.cells, 'tower'));
    expect(stateOf(g, d).heatRejection).toBe('tower'); expect(buyGeo(g, 'tower')).toBe('already fitted');
    expect(buyGeo(g, 'loop_full')).toBeNull(); expect(buyGeo(g, 'deep_well')).toBeNull(); expect(buyGeo(g, 'curtains')).toBeNull();
    expect(geoOf(stateOf(g, d))).toEqual({ rejection: 'tower', groundLoop: 'full', deepWell: true, curtains: true });
    g.money = 10; expect(geoBuyProblem(g, 'high_ambient')).toBeTruthy();
    expect(JSON.parse(JSON.stringify(stateOf(g, d))).groundLoop).toBe('full');
  });
  it('options reach the climate model: loop and tower and curtains, in any weather', () => {
    const g = world(), d = domeOf(g)!; buyGeo(g, 'tower'); buyGeo(g, 'loop_full'); buyGeo(g, 'curtains');
    const o = climateOpts(g, d, stateOf(g, d), 100);
    expect(o.towerGalPerKwh).toBe(TOWER_GAL_PER_KWH); expect(o.copLoop).toBe(COP_LOOP_COOL); expect(o.loopCapBtu).toBeGreaterThan(0); expect(o.nightLossK).toBe(0.6);
  });
  it('a deep well covers cooling water, draws pump power, and goes dry with the water plant or a drought', () => {
    const g = world(), d = domeOf(g)!; buyGeo(g, 'tower'); g.clock.t = 200; g.clock.ticks = Math.round(g.clock.t / 0.25 * 1);
    const none = dayLoad(g, d); expect(none.wellGal).toBe(0);
    buyGeo(g, 'deep_well'); const withWell = dayLoad(g, d);
    expect(withWell.wellGal).toBeLessThanOrEqual(withWell.waterGal); expect(withWell.wellGal).toBeGreaterThanOrEqual(0);
    if (withWell.wellGal > 0) expect(withWell.kwh).toBeGreaterThan(none.kwh - 1e-9);
  });
});

describe('save', () => {
  it('is at v107 and a v106 save loads with the options absent', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(107);
    const g = world(); const raw = JSON.parse(JSON.stringify(g)); raw.version = 106;
    const m = migrate(raw); expect(m.version).toBe(SAVE_VERSION);
    expect(domeOf(m) ? stateOf(m, domeOf(m)!).groundLoop : undefined).toBeUndefined();
  });
});

import { plantLayout } from './plant';
import { geoField, inField, FIELD_DRAW_MAX } from './geothermal';
describe('plant layout', () => {
  it('no geo option leaves the yard exactly as it was; each adds parts, deterministically', () => {
    for (const t of ['glass', 'arcology'] as const) {
      const r = t === 'glass' ? 6 : 12, base = plantLayout(t, r, 'advanced', {});
      expect(plantLayout(t, r, 'advanced', { geo: {} }).parts).toEqual(base.parts);
      const all = plantLayout(t, r, 'advanced', { geo: { tower: true, loop: true, bores: 40, well: true } });
      expect(all.parts.length).toBeGreaterThan(base.parts.length + 100);
      expect(plantLayout(t, r, 'advanced', { geo: { tower: true, loop: true, bores: 40, well: true } }).parts).toEqual(all.parts);
      for (const o of [{ tower: true }, { loop: true, bores: 10 }, { well: true }]) expect(plantLayout(t, r, 'advanced', { geo: o }).parts.length).toBeGreaterThan(base.parts.length);
    }
  });
  it('the drawn field is a 20 ft grid, capped, and the clearing test covers it', () => {
    const f = geoField({ D: 1.5 }, 500); expect(f.caps).toHaveLength(FIELD_DRAW_MAX);
    expect(f.caps[1].u - f.caps[0].u).toBeCloseTo(1, 9);
    for (const c of f.caps) expect(inField({ D: 1.5 }, 500, c.u, c.v)).toBe(true);
    expect(inField({ D: 1.5 }, 0, 0, 3)).toBe(false); expect(inField({ D: 1.5 }, 40, 50, 3)).toBe(false);
  });
});

describe('bore field on wet ground', () => {
  const yard = { D: 1.5 };
  it('no cap lands on a wet cell, and the count is kept by moving bores to dry ground', () => {
    const wet = (_u: number, v: number): boolean => v > 3.2 && v < 6.5;   // a creek band across the field
    const f = geoField(yard, 60, wet);
    expect(f.placed).toBe(60);
    for (const c of f.caps) expect(wet(c.u, c.v)).toBe(false);
    expect(Math.max(...f.caps.map(c => c.v))).toBeGreaterThan(6.5);
    expect(geoField(yard, 60, () => false).caps).toEqual(geoField(yard, 60).caps);
  });
  it('a lot with no room shrinks the field (fewer placed) and the clearing box still covers every cap', () => {
    const f = geoField(yard, 60, (_u, v) => v > 3.2);
    expect(f.placed).toBeLessThan(60);
    const all = geoField(yard, 60, (u, v) => v > 5 && u > 0);
    for (const c of all.caps) expect(inField(yard, 60, c.u, c.v)).toBe(true);
  });
});
