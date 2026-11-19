/**
 * The shared winter engine (docs/scenarios/ash_winter.md section 10): one pure `WinterState` that the ash winter, the asteroid and (later) the
 * nuclear exchange call with their own severity and start. Pure.
 *
 *   growFactor  1 - (1 - fMin) x curve(t): the share of a normal growing season left
 *   coldF       the temperature anomaly (degrees F below normal; negative)
 *   solar       the share of sunlight that reaches the panels
 *   sunDim      the sky's light (for the look)
 *   foodStress  0..1: how short the world is of food (drives prices and hunger raiders)
 *
 * `curve` rises 0 -> 1 over months 1 to 6, holds to month 12, then decays with a half-life of 14 months.
 */
import type { RegionId } from './regions';

export interface WinterState { grow: number; coldF: number; solar: number; sunDim: number; foodStress: number; curve: number }

export const NO_WINTER: WinterState = { grow: 1, coldF: 0, solar: 1, sunDim: 1, foodStress: 0, curve: 0 };

/** How hard the same winter bites by region (1 = the Mountain West / northern tier; the doc's frost-free-day table). */
export const REGION_WINTER: Record<RegionId, number> = {
  mountain_west: 1, north_woods: 1.05, upper_midwest: 0.95, plains: 0.95, new_england: 0.95, rust_belt: 0.9, appalachia: 0.8, pnw: 0.7, ozarks: 0.65, hill_country: 0.65, desert: 0.7,
};

/** 0..1 over time since the winter began (days). */
export function curveAt(days: number): number {
  if (days <= 30) return 0;
  if (days < 180) return (days - 30) / 150;
  if (days <= 365) return 1;
  return Math.pow(0.5, (days - 365) / (14 * 30.4));
}

/**
 * `severity` 1 = a supereruption (fMin 0.15, -10 F), 0.35 a VEI 7, 0 nothing. `days` counts from the start of the winter (the end of the main
 * dust or ash fall; the caller subtracts it). `coldScale` (default 1: no change) multiplies only the temperature anomaly: at the
 * regional k cap (1.2) 3.4 gives about -41 F, the ice age's mean cold; grow, solar and food stress keep their shape.
 */
export function winterAt(days: number, severity: number, region: RegionId, coldScale = 1): WinterState {
  if (severity <= 0 || days < 0) return NO_WINTER;
  const k = Math.min(1.2, severity * REGION_WINTER[region]), c = curveAt(days);
  const fMin = 1 - 0.85 * k;
  const grow = 1 - (1 - fMin) * c;
  const coldF = -10 * k * c * (Number.isFinite(coldScale) ? Math.max(0, coldScale) : 1);
  const solar = 1 - 0.4 * Math.min(1, k) * c;
  // stress follows the lost harvest over the last year, eased by what has been stored (the world has some)
  const foodStress = Math.max(0, Math.min(1, (1 - grow) * 1.15 - 0.05));
  return { grow, coldF, solar, sunDim: 1 - 0.45 * Math.min(1, k) * c, foodStress, curve: c };
}

/** `climate().cold` units (0 to ~0.7) from the anomaly. */
export const coldIndex = (coldF: number): number => Math.min(0.7, Math.max(0, -coldF / 20));

/** Price index on food stress: food x(1 + 3 x stress); a blended shop scalar uses a third of it (the rest of the shelf is not food). */
export const foodPriceIndex = (stress: number): number => 1 + 3 * stress;
