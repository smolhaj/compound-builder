/** Dome geometry in U.S. units: a spherical cap on a circular footprint. Pure (tested). */
import { TIER, type DomeTier } from './tiers';

export interface DomeGeom {
  diameterFt: number;
  radiusFt: number;
  heightFt: number;
  footprintSf: number;
  /** Curved surface of the shell (sq ft). */
  surfaceSf: number;
  /** Enclosed air (cu ft). */
  volumeCf: number;
  /** Length of the ring beam / skirt wall (ft). */
  ringFt: number;
  /** Rain caught by the shell per inch of rain (gallons): the footprint. */
  catchGalPerInch: number;
}

/** The cap of a sphere of height h over base radius r: surface 2 pi R h, volume pi h (3 r^2 + h^2) / 6. */
export function domeGeometry(tier: DomeTier, diameterFt: number): DomeGeom {
  const r = diameterFt / 2, h = r * 2 * TIER[tier].heightRatio;
  const R = (r * r + h * h) / (2 * h);
  return {
    diameterFt, radiusFt: r, heightFt: h,
    footprintSf: Math.PI * r * r,
    surfaceSf: 2 * Math.PI * R * h,
    volumeCf: Math.PI * h * (3 * r * r + h * h) / 6,
    ringFt: 2 * Math.PI * r,
    catchGalPerInch: Math.PI * r * r * 0.623,
  };
}

/** Height of the shell above its base at distance `d` ft from the center (0 outside). */
export function shellHeightAt(g: DomeGeom, dFt: number): number {
  if (dFt >= g.radiusFt) return 0;
  const h = g.heightFt, r = g.radiusFt, R = (r * r + h * h) / (2 * h);
  return Math.sqrt(R * R - dFt * dFt) - (R - h);
}
