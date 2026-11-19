import { describe, it, expect } from 'vitest';
import {
  heatAnomaly, coldAnomaly, heatPeakF, heatWinterLowF, iceJulyHighF, iceJanLowF, snowLoadPsf, wetBulbF, afternoonRh, outdoorWorkShare, canSleepOutdoors,
  outdoorGrowFactor, HEAT_PEAK_F, HEAT_WINTER_LOW_F, ICE_AGE, JAN_LOW_Y0_F, JULY_HIGH_Y0_F, CLIMATE_REGIONS,
} from './climateCurve';
import { REGIONS, REGION_IDS } from './regions';
import { winterAt, curveAt, REGION_WINTER, NO_WINTER, type WinterState } from './winter';

const grid = (n: number, a: number, b: number) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

describe('anomaly curves', () => {
  it('are zero before the hit, one at the plateau, finite and clamped', () => {
    for (const f of [heatAnomaly, coldAnomaly]) {
      expect(f(-5)).toBe(0); expect(f(0)).toBe(0); expect(f(100)).toBe(1);
      expect(f(NaN)).toBe(0);
    }
    expect(heatAnomaly(4)).toBe(1); expect(heatAnomaly(3.9)).toBeLessThan(1);
    expect(coldAnomaly(3)).toBe(1); expect(coldAnomaly(2.9)).toBeLessThan(1);
  });
  it('are monotone nondecreasing in time', () => {
    for (const f of [heatAnomaly, coldAnomaly]) {
      let prev = -1;
      for (const y of grid(200, -1, 6)) { const v = f(y); expect(v).toBeGreaterThanOrEqual(prev); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); prev = v; }
    }
  });
});

describe('region tables', () => {
  it('cover every region and agree with regions.ts at year 0', () => {
    expect([...CLIMATE_REGIONS].sort()).toEqual([...REGION_IDS].sort());
    for (const id of REGION_IDS) {
      expect(HEAT_PEAK_F[id]).toBeDefined(); expect(ICE_AGE[id]).toBeDefined(); expect(HEAT_WINTER_LOW_F[id]).toBeDefined();
      expect(JULY_HIGH_Y0_F[id]).toBe(REGIONS[id].julyHighF); expect(JAN_LOW_Y0_F[id]).toBe(REGIONS[id].janLowF); expect(HEAT_PEAK_F[id][0]).toBe(REGIONS[id].julyHighF);
    }
  });
  it('heat: peaks rise year over year, winters lift, bounds sane', () => {
    for (const id of REGION_IDS) {
      let prev = -Infinity;
      for (const y of grid(40, 0, 8)) { const v = heatPeakF(id, y); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
      expect(heatPeakF(id, 0)).toBe(HEAT_PEAK_F[id][0]); expect(heatPeakF(id, 2)).toBe(HEAT_PEAK_F[id][1]); expect(heatPeakF(id, 4)).toBe(HEAT_PEAK_F[id][2]);
      expect(heatPeakF(id, 9)).toBe(HEAT_PEAK_F[id][2]); expect(heatPeakF(id, -3)).toBe(HEAT_PEAK_F[id][0]);
      expect(heatPeakF(id, 4)).toBeLessThan(135);
      expect(heatWinterLowF(id, 0)).toBe(REGIONS[id].janLowF); expect(heatWinterLowF(id, 6)).toBeGreaterThan(REGIONS[id].janLowF);
    }
  });
  it('ice: temperatures fall and snow load rises with time, doc values at year 3', () => {
    for (const id of REGION_IDS) {
      let hp = Infinity, lp = Infinity, sp = -1;
      for (const y of grid(40, 0, 6)) {
        const h = iceJulyHighF(id, y), l = iceJanLowF(id, y), s = snowLoadPsf(id, y);
        expect(h).toBeLessThanOrEqual(hp); expect(l).toBeLessThanOrEqual(lp); expect(s).toBeGreaterThanOrEqual(sp); hp = h; lp = l; sp = s;
      }
      expect(iceJulyHighF(id, 3)).toBe(ICE_AGE[id].july3); expect(iceJanLowF(id, 3)).toBe(ICE_AGE[id].jan3); expect(snowLoadPsf(id, 3)).toBe(ICE_AGE[id].snowPsf);
      expect(snowLoadPsf(id, -1)).toBe(0);
    }
    expect(snowLoadPsf('north_woods', 5)).toBe(180); expect(snowLoadPsf('desert', 5)).toBe(10);
  });
  it('snow load is monotone in cold scale', () => {
    for (const id of REGION_IDS) { let prev = -1; for (const s of grid(30, 0, 1.6)) { const v = snowLoadPsf(id, 4, s); expect(v).toBeGreaterThanOrEqual(prev); prev = v; } }
  });
});

describe('wet-bulb', () => {
  it('matches the design doc check values (within about 1.5 F; Stull is fitted to 122 F air)', () => {
    expect(Math.abs(wetBulbF(110, 40) - 88)).toBeLessThan(1);
    expect(Math.abs(wetBulbF(105, 70) - 96)).toBeLessThan(1);
    expect(Math.abs(wetBulbF(120, 20) - 84)).toBeLessThan(1);
    expect(Math.abs(wetBulbF(130, 30) - 98)).toBeLessThan(1.5);
  });
  it('is monotone in temperature and in humidity, and never above the air temperature', () => {
    for (const rh of [5, 20, 40, 70, 95]) { let prev = -Infinity; for (const t of grid(60, 40, 130)) { const w = wetBulbF(t, rh); expect(w).toBeGreaterThanOrEqual(prev); prev = w; } }
    for (const t of [60, 90, 110, 130]) { let prev = -Infinity; for (const rh of grid(60, 5, 99)) { const w = wetBulbF(t, rh); expect(w).toBeGreaterThanOrEqual(prev); expect(w).toBeLessThanOrEqual(t + 0.5); prev = w; } }
  });
  it('is finite for junk input', () => { expect(Number.isFinite(wetBulbF(NaN, NaN))).toBe(true); expect(Number.isFinite(wetBulbF(500, 500))).toBe(true); });
  it('humidity from rain: drier regions are drier, bounded', () => {
    for (const id of REGION_IDS) { const rh = afternoonRh(REGIONS[id].rainMm); expect(rh).toBeGreaterThanOrEqual(18); expect(rh).toBeLessThanOrEqual(76); }
    expect(afternoonRh(REGIONS.desert.rainMm)).toBeLessThan(afternoonRh(REGIONS.ozarks.rainMm));
    let prev = Infinity; for (const r of grid(30, 0, 2000)) { const v = afternoonRh(r); expect(v).toBeGreaterThanOrEqual(prev === Infinity ? 0 : prev - 1e-9); prev = v; }
  });
});

describe('outdoor limits', () => {
  it('work share: 1 under 80, 0 above 90, linear, monotone nonincreasing', () => {
    expect(outdoorWorkShare(70)).toBe(1); expect(outdoorWorkShare(80)).toBe(1); expect(outdoorWorkShare(85)).toBeCloseTo(0.5); expect(outdoorWorkShare(90)).toBe(0); expect(outdoorWorkShare(99)).toBe(0);
    let prev = 2; for (const w of grid(100, 60, 110)) { const v = outdoorWorkShare(w); expect(v).toBeLessThanOrEqual(prev); prev = v; }
  });
  it('no sleeping outdoors above 85 F wet-bulb', () => { expect(canSleepOutdoors(85)).toBe(true); expect(canSleepOutdoors(85.1)).toBe(false); });
  it('grow factor: doc values, monotone nonincreasing', () => {
    expect(outdoorGrowFactor(80)).toBe(1); expect(outdoorGrowFactor(98)).toBeCloseTo(0.75); expect(outdoorGrowFactor(108)).toBeCloseTo(0.5);
    expect(outdoorGrowFactor(120)).toBeCloseTo(0.2); expect(outdoorGrowFactor(128)).toBe(0); expect(outdoorGrowFactor(200)).toBe(0);
    let prev = 2; for (const t of grid(120, 60, 140)) { const v = outdoorGrowFactor(t); expect(v).toBeLessThanOrEqual(prev); expect(v).toBeGreaterThanOrEqual(0); prev = v; }
  });
});

/** The pre-coldScale winterAt, copied verbatim, to prove the default is unchanged. */
function winterRef(days: number, severity: number, region: keyof typeof REGION_WINTER): WinterState {
  if (severity <= 0 || days < 0) return NO_WINTER;
  const k = Math.min(1.2, severity * REGION_WINTER[region]), c = curveAt(days);
  const fMin = 1 - 0.85 * k;
  const grow = 1 - (1 - fMin) * c;
  const coldF = -10 * k * c;
  const solar = 1 - 0.4 * Math.min(1, k) * c;
  const foodStress = Math.max(0, Math.min(1, (1 - grow) * 1.15 - 0.05));
  return { grow, coldF, solar, sunDim: 1 - 0.45 * Math.min(1, k) * c, foodStress, curve: c };
}

describe('winterAt coldScale', () => {
  it('default (and explicit 1) is identical to the old output across days, severities and regions', () => {
    for (const r of REGION_IDS) for (const sev of [-1, 0, 0.1, 0.35, 0.7, 1, 1.5, 3]) for (const d of [-5, 0, 10, 30, 31, 100, 180, 300, 365, 366, 500, 900, 3000]) {
      expect(winterAt(d, sev, r)).toEqual(winterRef(d, sev, r));
      expect(winterAt(d, sev, r, 1)).toEqual(winterRef(d, sev, r));
    }
  });
  it('a larger scale reaches about -40 F at the cap and only changes coldF', () => {
    const base = winterAt(300, 1.5, 'north_woods'), big = winterAt(300, 1.5, 'north_woods', 3.4);
    expect(big.coldF).toBeLessThan(-39); expect(big.coldF).toBeGreaterThan(-45);
    expect({ ...big, coldF: 0 }).toEqual({ ...base, coldF: 0 });
    expect(winterAt(300, 1.5, 'north_woods', NaN).coldF).toBe(base.coldF);
    let prev = 1; for (const s of grid(20, 0, 4)) { const v = winterAt(300, 1, 'plains', s).coldF; expect(v).toBeLessThanOrEqual(prev); prev = v; }
  });
});
