/**
 * The dome's own climate (docs/DOME_COMPOUND.md 5.2). Heat loss is U x area x temperature gap; sun on a glazed shell is a greenhouse that must be shed.
 * Three player modes set how hard the plant works. Pure (tested). Units: degrees F, Btu per hour, kW, kWh.
 */
import type { DomeTier } from './tiers';
import { TIER, shellFt } from './tiers';
import { domeGeometry } from './geometry';

export type ClimateMode = 'frost' | 'temperate' | 'comfortable';
export const CLIMATE_MODES: readonly ClimateMode[] = ['frost', 'temperate', 'comfortable'];
/** Target band inside each mode (degrees F). */
export const BAND: Record<ClimateMode, [number, number]> = { frost: [34, 120], temperate: [45, 85], comfortable: [65, 78] };

/** Whole-shell U (Btu per hr per sq ft per degree F) and the share of sunlight that gets through (solar heat gain). */
export const SHELL_U: Record<DomeTier, number> = { earthen: 0.03, geodesic: 0.55, glass: 0.45, arcology: 0.3 };
export const SOLAR_GAIN: Record<DomeTier, number> = { earthen: 0, geodesic: 0.55, glass: 0.4, arcology: 0.3 };
const BTU_PER_KWH = 3412, PEAK_SUN = 250, COP_HEAT = 3, COP_COOL = 3.5;
/** Ground temperature a berm or earth cover holds (degrees F). */
export const GROUND_F = 52;

export interface Load {
  /** Net heat the plant adds (positive) or removes (negative), kW thermal. */
  kwThermal: number;
  kwElectric: number;
  kwhPerDay: number;
  /** Where the air settles with the plant running (inside its mode's band when it can). */
  indoorF: number;
  /** The plant is asked for more than it has (used by the power check). */
  mode: ClimateMode;
}

/** Temperature the air floats at with no plant running: the outside plus the greenhouse rise, pulled toward the ground temperature for the earth-covered. */
export function passiveF(tier: DomeTier, cells: number, outsideF: number, sun: number): number {
  const g = domeGeometry(tier, shellFt(tier, cells));
  const gain = PEAK_SUN * Math.max(0, Math.min(1, sun)) * g.footprintSf * SOLAR_GAIN[tier];
  const rise = gain / (SHELL_U[tier] * g.surfaceSf);
  const earth = tier === 'earthen' ? 0.6 : tier === 'geodesic' ? 0.12 : 0;
  return (outsideF + Math.min(rise, 60)) * (1 - earth) + GROUND_F * earth;
}

/** Plant load to hold the mode. `sun` is 0..1 of clear-sky noon. */
export function domeLoad(tier: DomeTier, cells: number, outsideF: number, sun: number, mode: ClimateMode): Load {
  const g = domeGeometry(tier, shellFt(tier, cells));
  const free = passiveF(tier, cells, outsideF, sun);
  const [lo, hi] = BAND[mode];
  const target = free < lo ? lo : free > hi ? hi : free;
  // net flow: heat lost through the shell at the target, less the sun's gain (negative = cooling needed)
  const earth = tier === 'earthen' ? 0.6 : tier === 'geodesic' ? 0.12 : 0;
  const ref = outsideF * (1 - earth) + GROUND_F * earth;
  const loss = SHELL_U[tier] * g.surfaceSf * (target - ref);
  const gain = PEAK_SUN * Math.max(0, Math.min(1, sun)) * g.footprintSf * SOLAR_GAIN[tier];
  const net = target === free ? 0 : loss - gain;     // Btu per hr the plant must add
  const kwT = net / BTU_PER_KWH;
  const kwE = net >= 0 ? kwT / COP_HEAT : -kwT / COP_COOL;
  return { kwThermal: kwT, kwElectric: Math.abs(kwE), kwhPerDay: Math.abs(kwE) * 24, indoorF: target, mode };
}

/** The line the build card shows: "this dome needs about N kWh a day to stay frost-free on a 20 F night" (night, no sun). */
export function nightKwhPerDay(tier: DomeTier, cells: number, outsideF: number, mode: ClimateMode): number { return domeLoad(tier, cells, outsideF, 0, mode).kwhPerDay; }
export const defaultKwh = (tier: DomeTier, outsideF: number, mode: ClimateMode): number => nightKwhPerDay(tier, TIER[tier].cells, outsideF, mode);
