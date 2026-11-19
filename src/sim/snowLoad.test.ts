/** Snow on roofs and dome shells (docs/design/climate_disasters.md PR 5): the 0.7 roof share, the shell's shape factors and shedding, the verdict, the panels a breach takes. */
import { describe, expect, it } from 'vitest';
import { ROOF_CAP } from './ashfall';
import { DOME_SHAPE, SHED_SHARE, ROOF_SNOW_SHARE, breachChance, domeSnowPsf, panelsLost, roofLoad, roofSnowPsf, shellRating, shellSnow, shovelRoofHours, ventsIced } from './snowLoad';
import { SHELL } from './dome/protection';
import { PANELS } from './dome/standing';
import type { DomeTier } from './dome/tiers';

const TIERS: DomeTier[] = ['geodesic', 'glass', 'arcology'];
const ALL: DomeTier[] = ['earthen', 'geodesic', 'glass', 'arcology'];
const grid = (n = 60, max = 300): number[] => Array.from({ length: n + 1 }, (_, i) => max * i / n);
const ORDER = ['ok', 'strain', 'risk', 'collapse'];

describe('building roofs', () => {
  it('carry 0.7 of the ground load, less what was shoveled off', () => {
    expect(roofSnowPsf(100)).toBeCloseTo(70, 9); expect(roofSnowPsf(100, 40)).toBeCloseTo(42, 9); expect(roofSnowPsf(30, 80)).toBe(0);
  });
  it('a timber cabin (50 psf) is at its limit at about 90 psf of ground load; a braced roof carries 1.35 times; a barn goes first', () => {
    expect(roofLoad('timber_cabin', 90)!.ratio).toBeGreaterThan(0.5);
    expect(roofLoad('barn', 90)!.ratio).toBeGreaterThan(roofLoad('timber_cabin', 90)!.ratio);
    expect(roofLoad('timber_cabin', 90, { braced: true })!.ratio).toBeCloseTo(roofLoad('timber_cabin', 90)!.ratio / 1.35, 9);
    expect(roofLoad('bunker_basic', 90)).toBeNull();
  });
  it('snow never falls as the ground load rises, and the verdict never improves with more snow (any die)', () => {
    for (const kind of Object.keys(ROOF_CAP)) for (const u of [0, 0.3, 0.7, 0.99]) {
      let prevRatio = -1, prevV = 0;
      for (const g of grid()) {
        const rl = roofLoad(kind, g)!;
        expect(rl.psf).toBeGreaterThanOrEqual(0); expect(rl.ratio).toBeGreaterThanOrEqual(prevRatio);
        const v = ORDER.indexOf(rl.verdict(u)); expect(v).toBeGreaterThanOrEqual(prevV);
        prevRatio = rl.ratio; prevV = v;
      }
    }
  });
  it('shoveling hours grow with the snow and the roof', () => {
    expect(shovelRoofHours('barn', 40)).toBeGreaterThan(shovelRoofHours('barn', 20));
    expect(shovelRoofHours('barn', 30)).toBeGreaterThan(shovelRoofHours('chicken_coop', 30));
  });
});

describe('dome shells', () => {
  it('carry 0.7 x ground x shape x (1 minus 0.85 x climate share)', () => {
    expect(ROOF_SNOW_SHARE).toBe(0.7); expect(SHED_SHARE).toBe(0.85);
    expect(domeSnowPsf('geodesic', 100, 0)).toBeCloseTo(56, 9);
    expect(domeSnowPsf('glass', 100, 0)).toBeCloseTo(49, 9);
    expect(domeSnowPsf('arcology', 100, 0)).toBeCloseTo(42, 9);
    expect(domeSnowPsf('earthen', 100, 0)).toBeCloseTo(70, 9);
    expect(domeSnowPsf('glass', 100, 1)).toBeCloseTo(49 * 0.15, 9);
  });
  it('snow on the shell never falls as the ground load rises, and never rises as more of the plant runs', () => {
    for (const t of ALL) {
      let prev = -1; for (const g of grid()) { const p = domeSnowPsf(t, g, 0.4); expect(p).toBeGreaterThanOrEqual(prev); prev = p; }
      for (const g of [40, 120, 220]) { let q = Infinity; for (let c = 0; c <= 1.0001; c += 0.1) { const p = domeSnowPsf(t, g, c); expect(p).toBeLessThanOrEqual(q + 1e-12); q = p; } }
    }
  });
  it('the breach never improves with more snow or with more panels down, and a whole shell is never worse than a damaged one', () => {
    for (const t of ALL) for (const c of [0, 0.5, 1]) {
      let prev = 0; for (const g of grid(80, 400)) { const r = shellSnow(t, g, c, 1).ratio; expect(r).toBeGreaterThanOrEqual(prev - 1e-12); prev = r; }
      for (const g of [60, 150]) { let q = -1; for (let h = 1; h >= 0.2; h -= 0.1) { const r = shellSnow(t, g, c, h).ratio; expect(r).toBeGreaterThanOrEqual(q - 1e-12); q = r; } }
    }
  });
  it('keeps the tier ordering of the ratings, and an unheated geodesic goes before glass before the arcology', () => {
    expect(shellRating('geodesic')).toBeLessThan(shellRating('glass')); expect(shellRating('glass')).toBeLessThan(shellRating('arcology'));
    for (const g of [60, 90, 120, 180, 250]) {
      const [a, b, c] = TIERS.map(t => shellSnow(t, g, 0).ratio);
      expect(a).toBeGreaterThanOrEqual(b); expect(b).toBeGreaterThanOrEqual(c);
    }
    expect(shellSnow('geodesic', 90, 0).breach).toBe(true);   // Mountain West plateau, dark plant
    expect(shellSnow('glass', 90, 0).breach).toBe(false);
    expect(shellSnow('glass', 180, 0).breach).toBe(true);    // North Woods, dark
    expect(shellSnow('glass', 180, 1).breach).toBe(false);   // the heated shell sheds it
    expect(shellSnow('arcology', 180, 0).breach).toBe(false);
  });
  it('is the same decision protection.breaches makes', () => {
    for (const t of ALL) for (const g of grid(20, 400)) expect(shellSnow(t, g, 0.3, 0.7).breach).toBe(domeSnowPsf(t, g, 0.3) > SHELL[t].snow * 0.7);
  });
  it('a breach takes more panels and is likelier the further past the rating, never over a third of the shell', () => {
    for (const t of ALL) {
      expect(panelsLost(PANELS[t], 0.9)).toBe(0);
      let prev = 0; for (let r = 1.01; r < 6; r += 0.1) { const n = panelsLost(PANELS[t], r); expect(n).toBeGreaterThanOrEqual(prev); expect(n).toBeLessThanOrEqual(Math.ceil(PANELS[t] / 3)); prev = n; }
    }
    expect(breachChance(1)).toBe(0); let p = 0; for (let r = 1.01; r < 4; r += 0.1) { expect(breachChance(r)).toBeGreaterThanOrEqual(p); p = breachChance(r); }
    expect(DOME_SHAPE.earthen).toBe(1);
  });
});

describe('vents in ice', () => {
  it('stick only below minus 10 F with the plant dark, on 30 percent of days', () => {
    expect(ventsIced(-20, false, 0.1)).toBe(true); expect(ventsIced(-20, false, 0.5)).toBe(false);
    expect(ventsIced(-20, true, 0.1)).toBe(false); expect(ventsIced(0, false, 0.1)).toBe(false);
  });
});
