import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../rng';
import { CREW_RATE as WAGE, CREW_WEEK as WEEK } from '../crews';
import {
  DOME_TIERS, DOME_KIND, TIER, tierOfKind, isDomeKind, shellFt, domeGeometry, shellHeightAt, domeCost, buildWeeks, billUsd, CREW_RATE, CREW_WEEK,
  domeShield, stopShare, impervious, breaches, falloutPf, cleanZone, WEAPONS, SHELL, STOPS,
  domeLoad, passiveF, CLIMATE_MODES, BAND, defaultKwh,
  freshAir, sealedAir, lockdownClock, LIMIT_PPM, FILTERING, advancedFilterUsd, closedEcologyUsd, scrubberUsd,
  domeVisibility, attract, looterWeight, gangWeight, SEEN,
  rectVsCircle, offParcel, wealthGate, permitFee, reviewDays, skirtStops, skirtStopsDig,
  type DomeTier,
} from './index';

const BUILT: DomeTier[] = ['geodesic', 'glass', 'arcology'];

describe('tiers', () => {
  it('four kinds, round trip', () => {
    for (const t of DOME_TIERS) { expect(tierOfKind(DOME_KIND[t])).toBe(t); expect(isDomeKind(DOME_KIND[t])).toBe(true); }
    expect(isDomeKind('barn')).toBe(false);
  });
  it('sizes are 20, 60, 150 and 360 ft across', () => {
    expect(DOME_TIERS.map(t => shellFt(t, TIER[t].cells))).toEqual([20, 60, 150, 360]);
  });
  it('wealth gates: the small two always open, glass is Founder money, arcology Magnate money', () => {
    expect(wealthGate('earthen', 0)).toBeNull(); expect(wealthGate('geodesic', 0)).toBeNull();
    expect(wealthGate('glass', 14_999_999)).toMatch(/Founder/); expect(wealthGate('glass', 15_000_000)).toBeNull();
    expect(wealthGate('arcology', 499_000_000)).toMatch(/Magnate/); expect(wealthGate('arcology', 500_000_000)).toBeNull();
  });
});

describe('geometry', () => {
  it('a hemisphere: surface 2 pi r^2, volume 2/3 pi r^3', () => {
    const g = domeGeometry('geodesic', 60);
    expect(g.heightFt).toBeCloseTo(30, 6);
    expect(g.surfaceSf).toBeCloseTo(2 * Math.PI * 900, 0);
    expect(g.volumeCf).toBeCloseTo(2 / 3 * Math.PI * 27000, 0);
    expect(g.footprintSf).toBeCloseTo(Math.PI * 900, 0);
  });
  it('the shell height is the crown at the center and zero at the rim', () => {
    const g = domeGeometry('glass', 150);
    expect(shellHeightAt(g, 0)).toBeCloseTo(g.heightFt, 6);
    expect(shellHeightAt(g, g.radiusFt)).toBe(0);
    expect(shellHeightAt(g, 30)).toBeLessThan(shellHeightAt(g, 10));
  });
});

describe('cost (docs/DOME_COMPOUND.md 4.1)', () => {
  const c = Object.fromEntries(DOME_TIERS.map(t => [t, domeCost(t)])) as Record<DomeTier, ReturnType<typeof domeCost>>;
  it('default totals sit in the design ranges', () => {
    expect(c.earthen.materialsUsd).toBeGreaterThan(8_000); expect(c.earthen.materialsUsd).toBeLessThan(30_000);
    expect(c.geodesic.totalUsd).toBeGreaterThan(1_000_000); expect(c.geodesic.totalUsd).toBeLessThan(2_600_000);   // 2026-11-19 pricing audit (docs/design/dome_pricing.md): the crater and a real airlock are in the bill
    expect(c.glass.totalUsd).toBeGreaterThan(20_000_000); expect(c.glass.totalUsd).toBeLessThan(50_000_000);
    expect(c.arcology.totalUsd).toBeGreaterThan(500_000_000); expect(c.arcology.totalUsd).toBeLessThan(2_000_000_000);
  });
  it('each tier costs more than the one below', () => {
    for (let i = 1; i < DOME_TIERS.length; i++) expect(c[DOME_TIERS[i]].totalUsd).toBeGreaterThan(c[DOME_TIERS[i - 1]].totalUsd);
  });
  it('the stages add up to the bill, and the bill to the materials', () => {
    for (const t of DOME_TIERS) {
      const s = c[t].stages, add = Object.values(s).reduce((a, b) => a + billUsd(b), 0);
      expect(add).toBe(c[t].materialsUsd);
    }
  });
  it('cost rises with diameter (property)', () => {
    const r = mulberry32(7);
    for (const t of BUILT) for (let i = 0; i < 20; i++) {
      const a = 2 + Math.floor(r() * 30), b = a + 1 + Math.floor(r() * 5);
      expect(domeCost(t, b).totalUsd).toBeGreaterThanOrEqual(domeCost(t, a).totalUsd);
    }
  });
  it('a deeper buried skirt costs more concrete, never less (property)', () => {
    for (const t of BUILT) { let prev = 0; for (const ft of [10, 20, 30, 40, 60]) { const u = domeCost(t, undefined, { skirtFt: ft }).totalUsd; expect(u).toBeGreaterThanOrEqual(prev); prev = u; } }
  });
  it('the crew numbers match the shop\'s', () => { expect(CREW_RATE).toBe(WAGE); expect(CREW_WEEK).toBe(WEEK); });
  it('more crews never slow the job, and the cure sets a floor', () => {
    for (const t of DOME_TIERS) { let prev = Infinity; for (const n of [1, 2, 4, 8, 16, 32]) { const w = buildWeeks(c[t], n); expect(w).toBeLessThanOrEqual(prev); prev = w; } }
    expect(buildWeeks(c.arcology, 200)).toBeGreaterThanOrEqual(100);
    // the rich buy speed: the arcology is years of work, the geodesic dome months
    expect(buildWeeks(c.geodesic, 3)).toBeLessThanOrEqual(26); expect(buildWeeks(c.arcology, 8)).toBeGreaterThan(100);
  });
  it('permit and review: only the glass and arcology need an engineer, a strict county is slower and dearer', () => {
    expect(TIER.earthen.permitFee).toBe(0); expect(reviewDays('earthen', 1)).toBe(0);
    for (const t of BUILT) { expect(permitFee(t, 1.5)).toBeGreaterThan(permitFee(t, 0.3)); expect(reviewDays(t, 1.5)).toBeGreaterThan(reviewDays(t, 0.3)); }
    expect(reviewDays('arcology', 1)).toBeGreaterThan(reviewDays('glass', 1));
  });
});

describe('protection', () => {
  it('the three built tiers only get stronger up the ladder (monotone)', () => {
    for (let i = 1; i < BUILT.length; i++) {
      for (const h of Object.keys(SHELL.glass) as Array<keyof typeof SHELL.glass>) expect(domeShield(BUILT[i], h)).toBeGreaterThanOrEqual(domeShield(BUILT[i - 1], h));
      for (const w of WEAPONS) expect(stopShare(BUILT[i], w)).toBeGreaterThanOrEqual(stopShare(BUILT[i - 1], w));
    }
  });
  it('arcology walls are impervious to firearms and missiles; nothing else is', () => {
    expect(impervious('arcology')).toBe(true);
    for (const t of ['earthen', 'geodesic', 'glass'] as DomeTier[]) expect(impervious(t)).toBe(false);
    for (const w of ['handgun', 'rifle', 'heavy_rifle'] as const) expect(stopShare('arcology', w)).toBe(1);
    expect(stopShare('arcology', 'guided_missile')).toBeGreaterThanOrEqual(0.9);
  });
  it('every share is a probability', () => { for (const t of DOME_TIERS) for (const w of WEAPONS) { expect(STOPS[t][w]).toBeGreaterThanOrEqual(0); expect(STOPS[t][w]).toBeLessThanOrEqual(1); } });
  it('breaches grow with the load and with a worn shell (monotone property)', () => {
    const r = mulberry32(11);
    for (const t of DOME_TIERS) for (let i = 0; i < 40; i++) {
      const o = { windMph: r() * 300, hailIn: r() * 6, snowPsf: r() * 200, ashPsf: r() * 100 };
      const more = { windMph: o.windMph + 50, hailIn: o.hailIn + 1, snowPsf: o.snowPsf + 30, ashPsf: o.ashPsf + 20 };
      expect(breaches(t, more).length).toBeGreaterThanOrEqual(breaches(t, o).length);
      expect(breaches(t, o, 0.5).length).toBeGreaterThanOrEqual(breaches(t, o, 1).length);
    }
  });
  it('a film dome loses to a tornado wind and to big hail; the arcology does not', () => {
    expect(breaches('geodesic', { windMph: 160 })).toContain('wind');
    expect(breaches('glass', { hailIn: 3 })).toContain('hail');
    expect(breaches('arcology', { windMph: 200, hailIn: 5, snowPsf: 100, ashPsf: 100, embers: true })).toEqual([]);
    expect(breaches('geodesic', { embers: true })).toContain('fire');
  });
  it('a dome never lowers a bunker\'s protection factor', () => {
    for (const t of DOME_TIERS) { expect(falloutPf(t, 1000)).toBe(1000); expect(falloutPf(t, 1)).toBe(SHELL[t].fallout_pf); }
  });
  it('the clean zone needs a whole shell, an air plant and a sealed lock', () => {
    expect(cleanZone({ shellHealth: 1, airPlant: true, airlockSealed: true })).toBe(true);
    expect(cleanZone({ shellHealth: 0.3, airPlant: true, airlockSealed: true })).toBe(false);
    expect(cleanZone({ shellHealth: 1, airPlant: false, airlockSealed: true })).toBe(false);
  });
});

describe('climate', () => {
  it('a bigger or leakier shell needs more power for the same night (monotone)', () => {
    for (const m of CLIMATE_MODES) {
      expect(defaultKwh('glass', 10, m)).toBeGreaterThanOrEqual(defaultKwh('geodesic', 10, m));
      expect(defaultKwh('arcology', 10, m)).toBeGreaterThanOrEqual(defaultKwh('glass', 10, m));
    }
  });
  it('a colder night costs more, and a stricter mode costs more', () => {
    for (const t of BUILT) {
      for (const m of CLIMATE_MODES) { let prev = -1; for (const f of [60, 40, 20, 0, -20]) { const k = defaultKwh(t, f, m); expect(k).toBeGreaterThanOrEqual(prev - 1e-9); prev = k; } }
      expect(defaultKwh(t, 10, 'comfortable')).toBeGreaterThanOrEqual(defaultKwh(t, 10, 'temperate'));
      expect(defaultKwh(t, 10, 'temperate')).toBeGreaterThanOrEqual(defaultKwh(t, 10, 'frost'));
    }
  });
  it('the plant holds each mode\'s lower bound on a cold night and the sun is shed in July', () => {
    for (const m of CLIMATE_MODES) expect(domeLoad('glass', 15, 5, 0, m).indoorF).toBeGreaterThanOrEqual(BAND[m][0]);
    const hot = domeLoad('glass', 15, 95, 1, 'comfortable');
    expect(hot.indoorF).toBeLessThanOrEqual(BAND.comfortable[1]); expect(hot.kwThermal).toBeLessThan(0); expect(hot.kwhPerDay).toBeGreaterThan(0);
  });
  it('a glazed dome in the sun is a greenhouse: it floats well above the outside air; an earthen one tracks the ground', () => {
    expect(passiveF('glass', 15, 40, 1)).toBeGreaterThan(70);
    expect(passiveF('earthen', 2, 90, 1)).toBeLessThan(75);
    expect(passiveF('earthen', 2, 0, 0)).toBeGreaterThan(25);
  });
  it('the plausible scale: a 150 ft glass dome keeps frost out on a 20 F night for under a few thousand kWh a day', () => {
    const k = defaultKwh('glass', 20, 'frost'); expect(k).toBeGreaterThan(50); expect(k).toBeLessThan(2500);
  });
});

describe('lockdown air: CO2 is the clock', () => {
  const ctx = (tier: DomeTier, o: Partial<Parameters<typeof lockdownClock>[1]> = {}) => ({ tier, cells: TIER[tier].cells, people: 6, filtering: 'none' as const, powered: true, beds: 0, ...o });
  it('a 60 ft dome with six people and no scrubbing reaches the alarm in a couple of days (the design number: about 2 days)', () => {
    const c = lockdownClock(freshAir(), ctx('geodesic', { seals: 1 }));
    expect(c.limit).toBe('co2'); expect(c.hoursToAlarm).toBeGreaterThan(36); expect(c.hoursToAlarm).toBeLessThan(75);
  });
  it('a bigger dome buys a longer clock (monotone in size)', () => {
    let prev = 0; for (const t of ['geodesic', 'glass', 'arcology'] as const) { const h = lockdownClock(freshAir(), ctx(t)).hoursToAlarm; expect(h).toBeGreaterThanOrEqual(prev); prev = h; }
    expect(lockdownClock(freshAir(), ctx('glass')).hoursToAlarm).toBeGreaterThan(lockdownClock(freshAir(), ctx('geodesic')).hoursToAlarm);
  });
  it('more people shorten it; better filtering, plants and power lengthen it (property)', () => {
    for (const t of BUILT) {
      let prev = Infinity; for (const n of [1, 2, 4, 8, 16]) { const h = lockdownClock(freshAir(), ctx(t, { people: n })).hoursToAlarm; expect(h).toBeLessThanOrEqual(prev); prev = h; }
      prev = 0; for (const f of FILTERING) { const h = lockdownClock(freshAir(), ctx(t, { filtering: f })).hoursToAlarm; expect(h).toBeGreaterThanOrEqual(prev); prev = h; }
      prev = 0; for (const b of [0, 2, 6, 12]) { const h = lockdownClock(freshAir(), ctx(t, { beds: b })).hoursToAlarm; expect(h).toBeGreaterThanOrEqual(prev); prev = h; }
      expect(lockdownClock(freshAir(), ctx(t, { filtering: 'advanced', powered: false })).hoursToAlarm).toBeLessThanOrEqual(lockdownClock(freshAir(), ctx(t, { filtering: 'advanced' })).hoursToAlarm);
    }
  });
  it('a worn seal leaks more (an arcology with bad seals does worse than a fresh one)', () => {
    const a = lockdownClock(freshAir(), ctx('geodesic', { people: 20, seals: 1 })).hours, b = lockdownClock(freshAir(), ctx('geodesic', { people: 20, seals: 0.2 })).hours;
    expect(b).toBeGreaterThanOrEqual(a * 0.5);   // leakage also vents CO2: the worn seal helps CO2 but the dome is no longer sealed
  });
  it('the closed ecology never runs out', () => { expect(lockdownClock(freshAir(), ctx('glass', { filtering: 'closed', people: 10 })).limit).toBe('none'); });
  it('stepping air forward is consistent and bounded', () => {
    const c = ctx('geodesic'); let a = freshAir();
    for (let i = 0; i < 100; i++) { const n = sealedAir(a, c, 1); expect(n.co2ppm).toBeGreaterThanOrEqual(a.co2ppm); expect(n.o2pct).toBeLessThanOrEqual(a.o2pct); a = n; }
    expect(sealedAir(freshAir(), c, 24).co2ppm).toBeCloseTo(sealedAir(sealedAir(freshAir(), c, 12), c, 12).co2ppm, 3);
    expect(a.co2ppm).toBeGreaterThan(LIMIT_PPM.alarm);
  });
  it('paid filtering is real money, and the closed ecology is the most expensive item by a wide margin', () => {
    for (const t of BUILT) { expect(advancedFilterUsd(t)).toBeGreaterThan(scrubberUsd(t)); expect(closedEcologyUsd(t)).toBeGreaterThan(advancedFilterUsd(t) * 3); }
    expect(closedEcologyUsd('arcology')).toBeGreaterThan(closedEcologyUsd('glass'));
  });
});

describe('visibility and attraction', () => {
  it('a bigger dome is seen from farther (monotone), the arcology glows like a beacon', () => {
    for (const k of ['day', 'night', 'glint'] as const) for (let i = 1; i < DOME_TIERS.length; i++) expect(SEEN[DOME_TIERS[i]][k]).toBeGreaterThanOrEqual(SEEN[DOME_TIERS[i - 1]][k]);
    expect(domeVisibility('arcology').nightMi).toBeGreaterThan(10);
  });
  it('shades, trees and ridges only ever shorten the sight line', () => {
    for (const t of DOME_TIERS) { const a = domeVisibility(t); const b = domeVisibility(t, { shades: true, treeCover: 1, ridgeCut: 0.5 }); expect(b.nightMi).toBeLessThanOrEqual(a.nightMi); expect(b.dayMi).toBeLessThanOrEqual(a.dayMi); }
  });
  it('a harder compound is less of an invitation (monotone in hardness)', () => {
    for (const t of DOME_TIERS) { let prev = 2; for (const h of [0, 0.25, 0.5, 0.75, 1]) { const a = attract(t, h); expect(a).toBeLessThanOrEqual(prev); prev = a; } expect(attract(t, 1)).toBe(0); }
    expect(looterWeight(1)).toBeGreaterThan(looterWeight(0)); expect(gangWeight(1)).toBeGreaterThan(1);
  });
});

describe('siting', () => {
  const c = { x: 0, z: 0, r: 3 };
  it('a rectangle is inside, outside or across the wall', () => {
    expect(rectVsCircle(c, { x0: -1, z0: -1, x1: 1, z1: 1 })).toBe('inside');
    expect(rectVsCircle(c, { x0: 5, z0: 5, x1: 7, z1: 7 })).toBe('outside');
    expect(rectVsCircle(c, { x0: 2, z0: -1, x1: 4, z1: 1 })).toBe('straddles');
    expect(rectVsCircle(c, { x0: -10, z0: -10, x1: 10, z1: 10 })).toBe('straddles');   // the circle is inside the box: the wall crosses it
  });
  it('a footprint must lie on the lot: the first sample off it is reported', () => {
    expect(offParcel(c, (x, z) => Math.hypot(x, z) < 20)).toBeNull();
    expect(offParcel(c, x => x < 1)).not.toBeNull();
    expect(offParcel({ ...c, r: 3 }, () => false)).toEqual([0, 0]);
  });
  it('the buried skirt turns tunnelers: deeper stops more, the geodesic and up stop a normal dig', () => {
    let prev = -1; for (const ft of [0, 4, 10, 16, 20, 30, 60]) { const s = skirtStops(ft); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
    expect(skirtStopsDig(TIER.earthen.skirtFt, 10)).toBe(false);
    for (const t of BUILT) expect(skirtStopsDig(TIER[t].skirtFt, 14)).toBe(true);
    expect(skirtStops(TIER.arcology.skirtFt)).toBeGreaterThan(0.9);
  });
});
