import { describe, expect, it } from 'vitest';
import { REGION_FOG, bankCurve, hollowM, fogAt, fogDay, fogForecast, fogReadout, fogSeason, fogSightFactor, fogVisibilityM, sensorSightM, solarFogFactor, type FogPlace } from './fog';
import type { RegionId } from './regions';

const HILL: FogPlace = { campAboveFloorM: 70, ridgeAboveCampM: 120, mountain: true };
const days = (seed: number, region: RegionId, from = 1, to = 365) => Array.from({ length: to - from + 1 }, (_, i) => fogDay(seed, from + i, region));

describe('fog climate', () => {
  it('is deterministic per seed and day', () => {
    expect(fogDay(7, 288, 'pnw')).toEqual(fogDay(7, 288, 'pnw'));
    expect(days(7, 'pnw').some((d, i) => JSON.stringify(d) !== JSON.stringify(days(8, 'pnw')[i]))).toBe(true);
  });
  it('seasons follow the meteorological calendar', () => {
    expect([1, 59, 60, 151, 152, 243, 244, 334, 335, 365].map(fogSeason)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 0, 0]);
  });
  it('the Northwest and Appalachia are fog country, the desert is not', () => {
    const share = (r: RegionId) => { let n = 0; for (const seed of [1, 2, 3, 4, 5]) n += days(seed, r).filter(d => d.valley > 0).length; return n / (5 * 365); };
    expect(share('pnw')).toBeGreaterThan(0.2);
    expect(share('appalachia')).toBeGreaterThan(0.22);
    expect(share('desert')).toBeLessThan(0.08);
    expect(share('pnw')).toBeGreaterThan(share('mountain_west'));
  });
  it('the observed frequency tracks the table (fall in the Northwest)', () => {
    let n = 0, tot = 0;
    for (const seed of [11, 12, 13, 14, 15, 16]) for (let d = 244; d <= 334; d++) { tot++; if (fogDay(seed, d, 'pnw').valley > 0) n++; }
    expect(n / tot).toBeGreaterThan(REGION_FOG.pnw.valley[3] * 0.7);
    expect(n / tot).toBeLessThan(REGION_FOG.pnw.valley[3] * 1.5);
  });
  it('fog comes in spells of a few days, not one-day coin flips', () => {
    const run = (r: RegionId) => { let longest = 0, cur = 0; for (const d of days(3, r, 244, 334)) { cur = d.valley > 0 ? cur + 1 : 0; longest = Math.max(longest, cur); } return longest; };
    expect(run('pnw')).toBeGreaterThanOrEqual(3);
  });
  it('Mountain West fog is a winter inversion that holds all day', () => {
    const inv = Array.from({ length: 20 }, (_, i) => days(i + 1, 'mountain_west', 335, 365).concat(days(i + 1, 'mountain_west', 1, 59))).flat().filter(d => d.inversion);
    expect(inv.length).toBeGreaterThan(0);
    for (const d of inv) { expect(bankCurve(15, d)).toBeGreaterThan(0.4); expect(d.burnOffH).toBe(24); }
    expect(days(1, 'pnw').every(d => !d.inversion)).toBe(true);
  });
  it('a storm is overcast and drizzling', () => {
    const d = fogDay(5, 200, 'plains', { storm: true });
    expect(d.overcast).toBe(1);
    expect(d.drizzle).toBeGreaterThanOrEqual(0.8);
  });
});

describe('fog through the day', () => {
  const day = (() => { for (let d = 244; d < 334; d++) { const x = fogDay(2, d, 'pnw'); if (x.valley > 0.7 && !x.inversion) return x; } throw new Error('no deep fog day'); })();
  it('forms before dawn, is deepest early and burns off by late morning', () => {
    expect(bankCurve(2, day)).toBeLessThan(bankCurve(6, day));
    expect(bankCurve(6, day)).toBe(1);
    expect(bankCurve(7.9, day)).toBe(1);
    expect(bankCurve(day.burnOffH + 0.1, day)).toBe(0);
    expect(bankCurve(13, day)).toBe(0);
    expect(bankCurve(23, day)).toBeGreaterThan(0);
    for (let h = 5; h < day.burnOffH; h += 0.25) expect(bankCurve(h + 0.25, day)).toBeLessThanOrEqual(bankCurve(h, day) + 1e-9);
  });
  it('the top is below a camp that stands high over the valley, and swallows a low camp', () => {
    const high = fogAt(day, 6.5, { ...HILL, campAboveFloorM: 400 }), low = fogAt(day, 6.5, { ...HILL, campAboveFloorM: 10 });
    expect(high.belowCampM).toBeGreaterThan(0);
    expect(high.inFog).toBe(false);
    expect(low.inFog).toBe(true);
    expect(low.belowCampM).toBeLessThan(0);
    expect(low.sightM).toBeLessThan(high.sightM);
  });
  it('flat country gets only a shallow ground layer', () => {
    const flat = fogAt(day, 6.5, { campAboveFloorM: 5, ridgeAboveCampM: 20, mountain: false }), mtn = fogAt(day, 6.5, { campAboveFloorM: 5, ridgeAboveCampM: 20, mountain: true });
    expect(flat.bankM).toBeLessThan(mtn.bankM * 0.6);
    expect(flat.bankM).toBeGreaterThan(4);
    expect(flat.inFog).toBe(true);
  });
  it('the bank is a share of the full bank: a camp up the slope is above it, one in the bottom is in it', () => {
    expect(hollowM({ campAboveFloorM: 100, ridgeAboveCampM: 50, mountain: true })).toBe(110);
    expect(hollowM({ campAboveFloorM: 3, ridgeAboveCampM: 10, mountain: false })).toBe(40);
    const hi = { campAboveFloorM: 300, ridgeAboveCampM: 80, mountain: true }, lo = { campAboveFloorM: 12, ridgeAboveCampM: 80, mountain: true };
    expect(fogAt(day, 6.5, hi).inFog).toBe(false);
    expect(fogAt(day, 6.5, lo).inFog).toBe(true);
  });
  it('no fog, no bank', () => {
    const clear = fogDay(1, 200, 'desert');
    expect(fogAt(clear, 6.5, HILL).bankM).toBe(0);
    expect(fogAt(clear, 6.5, HILL).sightM).toBeGreaterThan(4000);
  });
});

describe('what fog does to sight', () => {
  it('visibility falls steeply with density', () => {
    expect(fogVisibilityM(0)).toBe(5000);
    expect(fogVisibilityM(1)).toBe(40);
    expect(fogVisibilityM(0.5)).toBeGreaterThan(250);
    expect(fogVisibilityM(0.5)).toBeLessThan(450);
    expect(fogVisibilityM(0.8)).toBeLessThan(fogVisibilityM(0.5));
  });
  const place: FogPlace = { campAboveFloorM: 8, ridgeAboveCampM: 80, mountain: true };
  const dense = (() => { for (let seed = 1; seed < 60; seed++) for (let d = 244; d < 334; d++) { const x = fogDay(seed, d, 'appalachia'); if (x.valley > 0.9 && !x.inversion) return fogAt(x, 6.5, place); } throw new Error('none'); })();
  it('dense fog cuts the eye, the camera and the night-vision tube, and the thermal camera mostly ignores it', () => {
    expect(dense.inFog).toBe(true);
    expect(fogSightFactor(dense, 'eye')).toBeLessThan(0.3);
    expect(fogSightFactor(dense, 'camera')).toBeLessThan(0.35);
    expect(fogSightFactor(dense, 'nvg')).toBeLessThan(0.35);
    expect(fogSightFactor(dense, 'thermal')).toBeGreaterThan(0.6);
    expect(sensorSightM(dense, 'thermal')).toBeGreaterThan(sensorSightM(dense, 'eye') * 5);
  });
  it('clear air costs nothing', () => {
    const clear = fogAt(fogDay(1, 200, 'desert'), 12, place);
    for (const k of ['eye', 'camera', 'nvg', 'thermal'] as const) expect(fogSightFactor(clear, k)).toBe(1);
  });
  it('a camp above the bank keeps its sight (the valley below is hidden, not the view)', () => {
    const d = (() => { for (let s = 1; s < 60; s++) for (let n = 244; n < 334; n++) { const x = fogDay(s, n, 'pnw'); if (x.valley > 0.6 && x.overcast < 0.5 && x.drizzle === 0) return x; } throw new Error('none'); })();
    const above = fogAt(d, 6.5, { campAboveFloorM: 500, ridgeAboveCampM: 300, mountain: true });
    expect(above.inFog).toBe(false);
    expect(above.belowCampM).toBeGreaterThan(0);
    expect(above.sightM).toBeGreaterThan(2000);
  });
});

describe('solar under cloud and fog', () => {
  it('overcast cuts the day, clear air does not', () => {
    const clear = fogDay(1, 200, 'desert');
    expect(solarFogFactor(clear)).toBe(1);
    const over = { ...clear, overcast: 1, drizzle: 0.5 };
    expect(solarFogFactor(over)).toBeLessThan(0.4);
    expect(solarFogFactor(over)).toBeGreaterThan(0.18);
  });
  it('panels in the morning bank lose more than panels above it', () => {
    const d = { ...fogDay(1, 200, 'desert'), valley: 1, depth: 1, burnOffH: 12, overcast: 0 };
    const inside = solarFogFactor(d, { campAboveFloorM: 20, ridgeAboveCampM: 80, mountain: true });
    const above = solarFogFactor(d, { campAboveFloorM: 300, ridgeAboveCampM: 80, mountain: true });
    expect(inside).toBeLessThan(above);
    expect(above).toBe(1);
  });
});

describe('readout and forecast', () => {
  it('says how far the fog is below the camp and the sight range', () => {
    const d = (() => { for (let s = 1; s < 60; s++) for (let n = 244; n < 334; n++) { const x = fogDay(s, n, 'pnw'); if (x.valley > 0.6) return x; } throw new Error('none'); })();
    const t = fogReadout(fogAt(d, 6.5, { campAboveFloorM: 400, ridgeAboveCampM: 100, mountain: true }));
    expect(t).toMatch(/Fog down to \d+ m below camp, sight range/);
    const t2 = fogReadout(fogAt(d, 6.5, { campAboveFloorM: 5, ridgeAboveCampM: 100, mountain: true }));
    expect(t2).toMatch(/Camp in fog/);
    expect(fogReadout(fogAt(fogDay(1, 200, 'desert'), 12, HILL))).toBe('');
  });
  it('forecasts the next morning only when something is coming', () => {
    let lines = 0, nulls = 0;
    for (let d = 1; d < 365; d++) { const f = fogForecast(4, d, 'pnw', HILL); if (f) { lines++; expect(f).toMatch(/^Forecast:/); } else nulls++; }
    expect(lines).toBeGreaterThan(20);
    expect(nulls).toBeGreaterThan(20);
    expect(fogForecast(4, 100, 'desert', HILL)).toBeNull();
  });
});

describe('low cloud', () => {
  const place: FogPlace = { campAboveFloorM: 73, ridgeAboveCampM: 60, mountain: true };
  it('a drizzling day puts the cloud base on the ridgelines, a clear one has none', () => {
    const rainy = fogAt({ ...fogDay(1, 200, 'desert'), overcast: 1, drizzle: 0.7, valley: 0.3, depth: 0.3 }, 10, place);
    expect(rainy.cloudBaseM).toBeGreaterThan(100);
    expect(rainy.cloudBaseM).toBeLessThan(200);
    const gray = fogAt({ ...fogDay(1, 200, 'desert'), overcast: 0.85, drizzle: 0.3 }, 10, place);
    expect(gray.cloudBaseM).toBeGreaterThan(rainy.cloudBaseM);
    const clear = fogAt(fogDay(1, 200, 'desert'), 10, place);
    expect(clear.cloudBaseM).toBeGreaterThan(1200);
    expect(clear.lowCloud).toBe(0);
  });
  it('the readout names the cloud when it is low', () => {
    const rainy = fogAt({ ...fogDay(1, 200, 'desert'), overcast: 1, drizzle: 0.9, valley: 0, depth: 0 }, 10, place);
    expect(fogReadout(rainy)).toMatch(/^Cloud \d+ m over the camp, sight range/);
  });
});
