import { describe, it, expect } from 'vitest';
import {
  SYNODIC_MONTH, moonPhase, moonIllumination, moonAngle, moonPhaseName, skyDarkness,
  milkyWayVisibility, starVisibility, godRayStrength,
} from './skyState';

describe('skyState — moon', () => {
  it('phase runs 0→1 over a synodic month and wraps', () => {
    const p0 = moonPhase(0);
    expect(moonPhase(SYNODIC_MONTH)).toBeCloseTo(p0, 6);
    expect(moonPhase(SYNODIC_MONTH / 2)).toBeCloseTo((p0 + 0.5) % 1, 6);
    for (let d = -40; d < 80; d += 0.7) {
      const p = moonPhase(d);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
  });

  it('illumination: dark at new moon, full at 0.5, half at the quarters', () => {
    expect(moonIllumination(0)).toBeCloseTo(0, 6);
    expect(moonIllumination(0.5)).toBeCloseTo(1, 6);
    expect(moonIllumination(0.25)).toBeCloseTo(0.5, 6);
    expect(moonIllumination(0.75)).toBeCloseTo(0.5, 6);
  });

  it('a full moon stands opposite the sun; a new moon sits with it', () => {
    const sun = 1.1;
    expect(Math.cos(moonAngle(sun, 0.5) - sun)).toBeCloseTo(-1, 6);
    expect(Math.cos(moonAngle(sun, 0) - sun)).toBeCloseTo(1, 6);
  });

  it('names the phases', () => {
    expect(moonPhaseName(0)).toBe('new moon');
    expect(moonPhaseName(0.5)).toBe('full moon');
    expect(moonPhaseName(0.25)).toBe('first quarter');
    expect(moonPhaseName(0.1)).toBe('waxing crescent');
    expect(moonPhaseName(0.9)).toBe('waning crescent');
  });
});

describe('skyState — dark skies', () => {
  it('rural Mountain West is darkest; a city campus is bright; a bigger town brightens the sky', () => {
    expect(skyDarkness('mountain_west', false, 0)).toBeGreaterThan(skyDarkness('southern_california', false, 0));
    expect(skyDarkness('new_england', true, 0)).toBeLessThan(0.2);
    expect(skyDarkness('midwest_plains', false, 4)).toBeLessThan(skyDarkness('midwest_plains', false, 0));
    expect(skyDarkness('nowhere', false, 9)).toBeGreaterThanOrEqual(0.1);
  });

  it('the Milky Way needs a dark site, no bright moon and a clear sky', () => {
    const dark = skyDarkness('mountain_west', false, 0);
    expect(milkyWayVisibility(dark, 0, false, 0)).toBeGreaterThan(0.8);
    expect(milkyWayVisibility(dark, 1, true, 0)).toBeLessThan(0.25);
    expect(milkyWayVisibility(dark, 0, false, 0.8)).toBe(0);
    expect(milkyWayVisibility(skyDarkness('new_england', true, 0), 0, false, 0)).toBe(0);
  });

  it('stars: always a few, more at dark sites, fewer under a full moon', () => {
    expect(starVisibility(1, 0, false)).toBeGreaterThan(starVisibility(0.1, 0, false));
    expect(starVisibility(1, 1, true)).toBeLessThan(starVisibility(1, 1, false));
    expect(starVisibility(0, 1, true)).toBeGreaterThanOrEqual(0.15);
  });
});

describe('skyState — god rays', () => {
  it('need a low sun on screen and gaps in the cloud', () => {
    expect(godRayStrength(0, 1, 0.5, 0)).toBe(0);
    expect(godRayStrength(1, 0, 0.5, 0)).toBe(0);
    expect(godRayStrength(1, 1, 0.5, 1)).toBe(0);
    expect(godRayStrength(1, 1, 0.6, 0)).toBeGreaterThan(godRayStrength(1, 1, 0, 0));
    expect(godRayStrength(1, 1, 0.6, 0)).toBeLessThanOrEqual(1);
  });
});
