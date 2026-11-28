import { describe, expect, it } from 'vitest';
import { COUNTY_DEV, COUNTY_GRADE, countyBedOf, countyProfile, limitGrade, profileAt } from './countyBed';

/** Rolling ground with hummocks a few units across (what the county road used to ride). */
const bumpy = (z: number) => 3 + 0.002 * z + 0.12 * Math.sin(z * 1.3) + 0.08 * Math.sin(z * 0.45 + 1);
const none = () => null;

describe('county road profile', () => {
  it('smooths hummocks: the line does not bounce with the ground', () => {
    const p = countyProfile(bumpy, none, -50, 50);
    // (the audit's bounce: how far a point strays from the mean of its own 6 u window)
    const bounceOf = (f: (z: number) => number) => {
      let worst = 0;
      for (let z = -30; z <= 30; z += 0.25) { let a = 0; for (let k = -12; k <= 12; k++) a += f(z + k * 0.25); worst = Math.max(worst, Math.abs(f(z) - a / 25)); }
      return worst;
    };
    expect(bounceOf(bumpy)).toBeGreaterThan(0.1);                 // the ground itself bounces
    expect(bounceOf(z => profileAt(p, z)!)).toBeLessThan(0.02);    // the road does not
  });
  it('holds the grade limit on moderate ground and never strays more than COUNTY_DEV from the ground', () => {
    // a 25 % hill 8 units long: 10 % is held by cutting and filling inside the allowance
    const hill = (z: number) => 0.25 * Math.max(0, Math.min(8, z + 4));
    const p = countyProfile(hill, none, -60, 60);
    for (let z = -50; z < 50; z += 0.5) expect(Math.abs(profileAt(p, z + 0.5)! - profileAt(p, z)!) / 0.5).toBeLessThanOrEqual(COUNTY_GRADE + 1e-6);
    const sm = countyProfile(z => hill(z), none, -60, 60);
    expect(sm.y.length).toBe(121);
  });
  it('keeps to the tube on a long steep slope rather than digging a canyon', () => {
    const ramp = (z: number) => 0.3 * z;   // 30 % for 120 units
    const p = countyProfile(ramp, none, -60, 60);
    let worst = 0;
    for (let z = -40; z <= 40; z += 1) worst = Math.max(worst, Math.abs(profileAt(p, z)! - ramp(z)));
    expect(worst).toBeLessThanOrEqual(COUNTY_DEV + 0.05);
  });
  it('pins a deck: the profile meets the deck height and the bed leaves the span alone', () => {
    const deck = (z: number) => (z >= 0 && z <= 6 ? 5 : null);
    const p = countyProfile(() => 4, deck, -30, 30);
    expect(profileAt(p, 3)).toBeCloseTo(5, 6);
    const bed = countyBedOf(p, () => 0, [{ z0: 0, z1: 6, y0: 5, y1: 5, depth: 3, wet: true, lengthM: 36 }]);
    expect(bed.apply(0, 3, 1).h).toBe(1);        // ground under the deck untouched
    expect(Math.abs(bed.apply(0.2, -20, 2).h - profileAt(p, -20)!)).toBeLessThan(1e-9);   // on the bench: the road's own height
  });
  it('limitGrade is exact and moves a pinned station never', () => {
    const s = Float64Array.from([0, 0, 2, 2, 2, 2]), pin = Uint8Array.from([1, 0, 0, 0, 0, 1]);
    const y = limitGrade(s, pin, 0.5);
    for (let i = 0; i + 1 < y.length; i++) expect(Math.abs(y[i + 1] - y[i])).toBeLessThanOrEqual(0.5 + 1e-4);
    expect(y[0]).toBe(0); expect(y[5]).toBe(2);
  });
});
