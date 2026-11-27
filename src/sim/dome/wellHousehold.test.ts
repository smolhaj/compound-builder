/** A bought dome deep well is a drilled well: the household drinks what the cooling plant does not draw, and the water chip and checklist count it. */
import { describe, expect, it } from 'vitest';
import { newGame, type Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND } from './tiers';
import { buyGeo } from './geothermalLive';
import { domeWellHousehold } from './live';
import { operational } from '../operational';
import { runway } from '../runway';
import { balanceDay, plant } from '../utilities';

function world(tier: 'glass' | 'arcology' = 'glass') {
  const g = newGame(7, 105, 2027); g.money = 1e9;
  const k = DOME_KIND[tier], st: Structure = { id: 'dm0', kind: k, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[k].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st); g.utilities.fittings.push({ building: st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
  return g;
}
describe('dome deep well as household water', () => {
  it('no well: nothing fitted, no water; the checklist still says dig a well', () => {
    const g = world();
    expect(domeWellHousehold(g)).toEqual({ fitted: false, litersPerDay: 0 });
    expect(operational(g).find(i => i.id === 'water')!.done).toBe(false);
  });
  it('a fitted well gives liters a day, counts as the water source, and shows on the runway', () => {
    const g = world(); expect(buyGeo(g, 'deep_well')).toBeNull();
    const w = domeWellHousehold(g);
    expect(w.fitted).toBe(true); expect(w.litersPerDay).toBeGreaterThan(1000);
    const item = operational(g).find(i => i.id === 'water')!;
    expect(item.done).toBe(true); expect(item.line).toBe('A working source');
    const row = runway(g).find(r => r.id === 'water')!;
    expect(row.days).toBeGreaterThanOrEqual(365); expect(row.tone).toBe('good');
  });
  it('a dome with no wiring or a fried one gives nothing but still counts as fitted', () => {
    const g = world(); buyGeo(g, 'deep_well');
    g.utilities.fried.push('dm0');
    expect(domeWellHousehold(g)).toMatchObject({ fitted: true, litersPerDay: 0 });
  });
  it('the arcology well gives more than the glass dome well', () => {
    const a = world('glass'), b = world('arcology'); buyGeo(a, 'deep_well'); buyGeo(b, 'deep_well');
    expect(domeWellHousehold(b).litersPerDay).toBeGreaterThan(domeWellHousehold(a).litersPerDay);
  });
  it('the day balance counts the well: with it the household is not short and its supply is higher', () => {
    const a = world(), b = world(); buyGeo(b, 'deep_well');
    balanceDay(a, plant(a), 0.5); balanceDay(b, plant(b), 0.5);
    expect(b.utilities.report.waterL - a.utilities.report.waterL).toBeCloseTo(domeWellHousehold(b).litersPerDay, 0);
  });
});
