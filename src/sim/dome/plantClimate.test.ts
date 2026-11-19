/**
 * The dome plant in a climate disaster, pure parts (docs/design/climate_disasters.md PR 4): COP, chiller capacity and trip, battery and transformer,
 * wear, repair lead, and the climate model's optional limits. Monotone properties, tier ordering, and that the defaults leave the flat model alone.
 */
import { describe, expect, it } from 'vitest';
import { domeLoad, COP_COOL, COP_HEAT, BAND } from './climate';
import { TIER, type DomeTier } from './tiers';
import {
  REJECTION, batteryTempK, chillerCapacity, chillerLine, chillerRatedBtu, chillerTripped, copCool, copHeat, evapWbK, leadStretch, plantWear, transformerK,
} from './plantClimate';

const temps = (a: number, b: number, n = 80): number[] => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const TIERS: DomeTier[] = ['geodesic', 'glass', 'arcology'];

describe('COP', () => {
  it('is 3.5 at 95 F and falls 0.035 a degree above it', () => {
    expect(copCool(95)).toBe(3.5);
    expect(copCool(60)).toBe(3.5);
    expect(copCool(125)).toBeCloseTo(2.45, 6);
    expect(copCool(140)).toBeCloseTo(1.925, 6);
    expect(copCool(500)).toBeGreaterThanOrEqual(1.2);
  });
  it('the chiller COP never rises with the temperature above 95 F', () => {
    const t = temps(95, 160); for (let i = 1; i < t.length; i++) expect(copCool(t[i])).toBeLessThanOrEqual(copCool(t[i - 1]) + 1e-12);
  });
  it('the heat pump is 3.0 down to 17 F, then falls to 1.0 at minus 30 F, and never rises as it gets colder', () => {
    expect(copHeat(60)).toBe(3); expect(copHeat(17)).toBe(3); expect(copHeat(-30)).toBe(1); expect(copHeat(-60)).toBe(1);
    expect(copHeat(-6.5)).toBeCloseTo(2, 6);
    const t = temps(17, -60); for (let i = 1; i < t.length; i++) expect(copHeat(t[i])).toBeLessThanOrEqual(copHeat(t[i - 1]) + 1e-12);
  });
});

describe('chiller capacity and trip', () => {
  it('is whole at 95 F, loses 1.2 points a degree, and trips at 125 F (standard)', () => {
    expect(chillerCapacity(70)).toBe(1); expect(chillerCapacity(95)).toBe(1);
    expect(chillerCapacity(105)).toBeCloseTo(0.88, 6);
    expect(chillerCapacity(124)).toBeCloseTo(0.652, 6);
    expect(chillerCapacity(125)).toBe(0); expect(chillerTripped(125)).toBe(true); expect(chillerTripped(124.9)).toBe(false);
  });
  it('the high-ambient package loses 0.8 points a degree and trips at 140 F', () => {
    expect(chillerCapacity(125, 'high_ambient')).toBeCloseTo(0.76, 6);
    expect(chillerCapacity(139, 'high_ambient')).toBeCloseTo(0.648, 6);
    expect(chillerCapacity(140, 'high_ambient')).toBe(0);
    expect(REJECTION.high_ambient.priceK).toBe(1.4);
  });
  it('a higher outside temperature never improves capacity, and the high-ambient package is never worse than the standard one', () => {
    const t = temps(40, 170, 260);
    for (let i = 1; i < t.length; i++) for (const p of ['air', 'high_ambient'] as const) expect(chillerCapacity(t[i], p)).toBeLessThanOrEqual(chillerCapacity(t[i - 1], p) + 1e-12);
    for (const f of t) expect(chillerCapacity(f, 'high_ambient')).toBeGreaterThanOrEqual(chillerCapacity(f, 'air'));
  });
  it('says what the card says', () => {
    expect(chillerLine(90)).toBeNull();
    expect(chillerLine(110)).toMatch(/Chiller at 82 percent: outside is 110 F\. Rated to trip at 125\./);
    expect(chillerLine(126)).toMatch(/tripped/);
  });
  it('the wet-bulb limit on the pads never rises with the wet-bulb', () => {
    expect(evapWbK(60)).toBe(1); expect(evapWbK(80)).toBe(0); expect(evapWbK(95)).toBe(0);
    const t = temps(50, 100); for (let i = 1; i < t.length; i++) expect(evapWbK(t[i])).toBeLessThanOrEqual(evapWbK(t[i - 1]));
  });
});

describe('transformer and battery', () => {
  it('transformers derate 0.4 percent a degree above 104 F', () => {
    expect(transformerK(100)).toBe(1); expect(transformerK(104)).toBe(1); expect(transformerK(124)).toBeCloseTo(0.92, 6);
    const t = temps(60, 200); for (let i = 1; i < t.length; i++) expect(transformerK(t[i])).toBeLessThanOrEqual(transformerK(t[i - 1]));
  });
  it('batteries halve for every 15 F above 77 F and hold about half at 0 F', () => {
    expect(batteryTempK(77)).toBe(1); expect(batteryTempK(92)).toBeCloseTo(0.5, 6); expect(batteryTempK(107)).toBeCloseTo(0.25, 6);
    expect(batteryTempK(0)).toBeCloseTo(0.5, 6);
    expect(batteryTempK(-80)).toBeGreaterThanOrEqual(0.35);
  });
});

describe('wear', () => {
  const kinds = ['chiller', 'substation', 'air'] as const;
  it('is about half a percent a day for a chiller at 125 F working at its rating, and nil on a mild day', () => {
    expect(plantWear({ kind: 'chiller', outF: 125, load: 1, spare: false }).p).toBeCloseTo(0.0002 * 27 * 1.5, 5);
    expect(plantWear({ kind: 'chiller', outF: 70, load: 1, spare: false }).p).toBe(0);
    expect(plantWear({ kind: 'water', outF: 125, load: 1, spare: false }).p).toBe(0);
  });
  it('never falls as it gets hotter or as the load rises, and a spare only lowers it', () => {
    for (const kind of kinds) {
      const t = temps(95, 150, 40);
      for (let i = 1; i < t.length; i++) expect(plantWear({ kind, outF: t[i], load: 1, spare: false }).p, `${kind} ${t[i]}`).toBeGreaterThanOrEqual(plantWear({ kind, outF: t[i - 1], load: 1, spare: false }).p);
      for (const f of [60, 100, 125]) {
        for (let l = 0.1; l <= 1.5; l += 0.1) expect(plantWear({ kind, outF: f, load: l + 0.1, spare: false }).p).toBeGreaterThanOrEqual(plantWear({ kind, outF: f, load: l, spare: false }).p - 1e-12);
        expect(plantWear({ kind, outF: f, load: 1, spare: true }).p).toBeLessThanOrEqual(plantWear({ kind, outF: f, load: 1, spare: false }).p);
      }
    }
  });
  it('never falls as the night gets colder under 17 F', () => {
    const t = temps(17, -60, 40);
    for (let i = 1; i < t.length; i++) expect(plantWear({ kind: 'chiller', outF: t[i], load: 0.5, spare: false }).p).toBeGreaterThanOrEqual(plantWear({ kind: 'chiller', outF: t[i - 1], load: 0.5, spare: false }).p);
    expect(plantWear({ kind: 'chiller', outF: -30, load: 0.5, spare: false }).cause).toBe('cold');
  });
  it('names the cause: heat, or load when the plant is past its rating', () => {
    expect(plantWear({ kind: 'chiller', outF: 120, load: 0.8, spare: false }).cause).toBe('heat');
    expect(plantWear({ kind: 'chiller', outF: 96, load: 1.5, spare: false }).cause).toBe('load');
  });
  it('is bounded', () => { for (const k of kinds) expect(plantWear({ kind: k, outF: 300, load: 9, spare: false }).p).toBeLessThanOrEqual(0.08); });
});

describe('repair lead', () => {
  it('stretches as deliveries fall, up to 4 times, and never shortens', () => {
    expect(leadStretch(1)).toBe(1); expect(leadStretch(0.5)).toBe(2); expect(leadStretch(0.1)).toBe(4); expect(leadStretch(0)).toBe(4);
    let prev = 0; for (let d = 1; d >= 0; d -= 0.05) { const k = leadStretch(d); expect(k).toBeGreaterThanOrEqual(prev); prev = k; }
  });
});

describe('the rating and the climate model', () => {
  it('has no rating for an earthen dome and grows up the tier ladder', () => {
    expect(chillerRatedBtu('earthen', TIER.earthen.cells, 'temperate')).toBe(0);
    const r = TIERS.map(t => chillerRatedBtu(t, TIER[t].cells, 'temperate'));
    expect(r[0]).toBeGreaterThan(0); expect(r[1]).toBeGreaterThan(r[0]); expect(r[2]).toBeGreaterThan(r[1]);
  });
  it('with no limits given, domeLoad is exactly the flat model', () => {
    for (const t of TIERS) for (const f of [20, 90, 125]) for (const mode of Object.keys(BAND) as Array<keyof typeof BAND>) {
      const a = domeLoad(t, TIER[t].cells, f, 1, mode, { dry: 0.5 }), b = domeLoad(t, TIER[t].cells, f, 1, mode, { dry: 0.5, copCool: COP_COOL, copHeat: COP_HEAT, chillCapBtu: Infinity, evapK: 1 });
      expect(b).toEqual(a);
    }
  });
  it('a smaller chiller capacity never cools the air more, and never uses more power', () => {
    for (const t of TIERS) {
      const rated = chillerRatedBtu(t, TIER[t].cells, 'temperate');
      let prevIn = -Infinity, prevKw = Infinity;
      for (let k = 1.2; k >= 0; k -= 0.1) {
        const l = domeLoad(t, TIER[t].cells, 120, 1, 'temperate', { dry: 0.2, chillCapBtu: rated * k });
        expect(l.indoorF).toBeGreaterThanOrEqual(prevIn - 1e-9); expect(l.kwElectric).toBeLessThanOrEqual(prevKw + 1e-9);
        prevIn = l.indoorF; prevKw = l.kwElectric;
      }
    }
  });
  it('a tripped chiller lets a glazed dome float up toward the outside; a worse COP costs more power', () => {
    const t = 'glass' as const, n = TIER[t].cells;
    const held = domeLoad(t, n, 120, 1, 'temperate', { dry: 0.2 }), off = domeLoad(t, n, 120, 1, 'temperate', { dry: 0.2, chillCapBtu: 0 });
    expect(off.indoorF).toBeGreaterThan(held.indoorF + 10);
    const lo = domeLoad(t, n, 120, 1, 'temperate', { dry: 0.2, copCool: 3.5 }), hi = domeLoad(t, n, 120, 1, 'temperate', { dry: 0.2, copCool: 2 });
    expect(hi.kwElectric).toBeGreaterThan(lo.kwElectric);
  });
  it('a colder day with a weaker heat pump draws more power for the same heat', () => {
    const t = 'glass' as const, n = TIER[t].cells;
    let prev = 0; for (const f of [20, 0, -20, -40]) { const l = domeLoad(t, n, f, 0, 'frost', { copHeat: copHeat(f) }); expect(l.kwElectric).toBeGreaterThan(prev); prev = l.kwElectric; }
  });
});
