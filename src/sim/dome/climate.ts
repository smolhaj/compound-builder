/**
 * The dome's own climate (docs/DOME_COMPOUND.md 5.2 and 8.3). Heat loss is U x area x temperature gap; sun on a glazed shell is a greenhouse that
 * must be shed. Three player modes set the comfort band the plant holds. A glazed dome must NEVER cook (owner decision of 2026-11-18), so when the
 * air floats above the band the plant sheds heat in a fixed order, cheapest first:
 *
 *   1. vents      open ridge and side vents move air for the price of fans (only while the dome is open: a sealed dome has no vents to open)
 *   2. shade      roof screens drop the sun's share of the heat (a little motor power)
 *   3. evaporative pads and misters take heat out of the air with water (about 1,000 Btu a pound) and a fan; weak in humid country
 *   4. chiller    mechanical cooling, a heat pump run backward, at COP 3.5: the dear last resort
 *
 * Heating is a heat pump at COP 3. Pure (tested). Units: degrees F, Btu per hour, kW, kWh, gallons.
 */
import type { DomeTier } from './tiers';
import { TIER, shellFt } from './tiers';
import { domeGeometry } from './geometry';

export type ClimateMode = 'frost' | 'temperate' | 'comfortable';
export const CLIMATE_MODES: readonly ClimateMode[] = ['frost', 'temperate', 'comfortable'];
/**
 * Target band inside each mode (degrees F). The upper limit is a real ceiling (no more 120 F "frost-free" ovens): 95 F is where tomatoes drop
 * blossoms, lettuce bolts and hens and goats start to pant; 85 F is a good garden day; 78 F is a comfortable house.
 */
export const BAND: Record<ClimateMode, [number, number]> = { frost: [34, 95], temperate: [50, 85], comfortable: [64, 78] };

/** Whole-shell U (Btu per hr per sq ft per degree F) and the share of sunlight that gets through (solar heat gain). */
export const SHELL_U: Record<DomeTier, number> = { earthen: 0.03, geodesic: 0.55, glass: 0.45, arcology: 0.3 };
export const SOLAR_GAIN: Record<DomeTier, number> = { earthen: 0, geodesic: 0.55, glass: 0.4, arcology: 0.3 };
export const BTU_PER_KWH = 3412, PEAK_SUN = 250, COP_HEAT = 3, COP_COOL = 3.5;
/** Ground temperature a berm or earth cover holds (degrees F). */
export const GROUND_F = 52;

/** The cooling ladder's tunables. */
export const COOL = {
  /** Air changes an hour with the vents open (a 60 ft geodesic with ridge and side vents does 20 to 40), and the Btu per cu ft per degree F of air. */
  VENT_ACH: 24, AIR_BTU: 0.018,
  /** Fan power, kW per 1,000 sq ft of floor, vents and the circulation fans. */
  VENT_KW_KSF: 0.35,
  /** Share of the sun's heat left with the roof screens drawn (about 55 percent shading), and their motor and control power, kW per 1,000 sq ft. */
  SHADE_LEFT: 0.45, SHADE_KW_KSF: 0.04,
  /** Evaporative cooling: the most heat it removes per sq ft of floor per hour at the driest air (Btu), the fan and pump power (kW per 1,000 sq ft) and Btu per gallon evaporated. */
  EVAP_BTU_SF: 38, EVAP_KW_KSF: 0.45, BTU_PER_GAL: 8340,
  /** Where the plant holds the air when it must cool: this far under the top of the band (degrees F). */
  HOLD_UNDER: 2,
} as const;

export type CoolStage = 'idle' | 'heating' | 'vent' | 'shade' | 'evap' | 'chill';
export const COOL_STAGES: readonly CoolStage[] = ['idle', 'heating', 'vent', 'shade', 'evap', 'chill'];

export interface Load {
  /** Net heat the plant adds (positive) or removes (negative), kW thermal. */
  kwThermal: number;
  kwElectric: number;
  kwhPerDay: number;
  /** Where the air settles with the plant running (inside its mode's band when it can). */
  indoorF: number;
  /** The plant is asked for more than it has (used by the power check). */
  mode: ClimateMode;
  /** The last rung of the ladder that was needed this hour, and the water the evaporative pads drink (gallons a day at this rate). */
  stage: CoolStage;
  waterGalDay: number;
}

export interface LoadOpts {
  /** Sealed (lockdown): there are no vents to open. */
  sealed?: boolean;
  /** How dry the air is, 0 (humid) to 1 (desert): evaporative cooling works in dry air. */
  dry?: number;
  /** Is the cooling plant powered (false: only the passive part, the vents and screens by hand, none of the machines). */
  powered?: boolean;
  /** Share 0..1 of the roof vents that open (damaged or lost vent hatches, sim/dome/plantUnits.ts). */
  ventK?: number;
}

const earthK = (tier: DomeTier): number => tier === 'earthen' ? 0.6 : tier === 'geodesic' ? 0.12 : 0;
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Temperature the air floats at with no plant running: the outside plus the greenhouse rise, pulled toward the ground temperature for the earth-covered. */
export function passiveF(tier: DomeTier, cells: number, outsideF: number, sun: number): number {
  const g = domeGeometry(tier, shellFt(tier, cells));
  const gain = PEAK_SUN * clamp01(sun) * g.footprintSf * SOLAR_GAIN[tier];
  const rise = gain / (SHELL_U[tier] * g.surfaceSf);
  const earth = earthK(tier);
  return (outsideF + Math.min(rise, 60)) * (1 - earth) + GROUND_F * earth;
}

/** Plant load to hold the mode. `sun` is 0..1 of clear-sky noon. */
export function domeLoad(tier: DomeTier, cells: number, outsideF: number, sun: number, mode: ClimateMode, o: LoadOpts = {}): Load {
  const g = domeGeometry(tier, shellFt(tier, cells));
  const free = passiveF(tier, cells, outsideF, sun);
  const [lo, hi] = BAND[mode];
  const earth = earthK(tier), ref = outsideF * (1 - earth) + GROUND_F * earth;
  const ksf = g.footprintSf / 1000, powered = o.powered !== false;
  const base = { mode, stage: 'idle' as CoolStage, waterGalDay: 0 };
  // cold side: a heat pump holds the floor of the band
  if (free < lo) {
    if (!powered) return { ...base, kwThermal: 0, kwElectric: 0, kwhPerDay: 0, indoorF: free };
    const loss = SHELL_U[tier] * g.surfaceSf * (lo - ref);
    const gain = PEAK_SUN * clamp01(sun) * g.footprintSf * SOLAR_GAIN[tier];
    const net = Math.max(0, loss - gain), kwT = net / BTU_PER_KWH, kwE = kwT / COP_HEAT;
    return { ...base, kwThermal: kwT, kwElectric: kwE, kwhPerDay: kwE * 24, indoorF: lo, stage: 'heating' };
  }
  if (free <= hi) return { ...base, kwThermal: 0, kwElectric: 0, kwhPerDay: 0, indoorF: free };
  // hot side: shed heat down the ladder until the air sits under the top of the band
  const hold = hi - COOL.HOLD_UNDER;
  const solar = PEAK_SUN * clamp01(sun) * g.footprintSf * SOLAR_GAIN[tier];
  const through = (target: number) => SHELL_U[tier] * g.surfaceSf * (target - ref);
  let gain = solar, kwE = 0, water = 0, stage: CoolStage = 'idle';
  const need = () => gain - through(hold);   // Btu per hour still to shed at the hold temperature
  if (need() > 0 && !o.sealed && outsideF < hold - 3) {
    const cap = COOL.VENT_ACH * g.volumeCf * COOL.AIR_BTU * (hold - outsideF) * clamp01(o.ventK ?? 1);
    const take = Math.min(need(), cap);
    // fans run in proportion to how hard the vents work
    kwE += COOL.VENT_KW_KSF * ksf * Math.min(1, take / Math.max(1, cap)) + 0.0001;
    stage = 'vent';
    gain -= take;
  }
  if (need() > 0) { gain = Math.min(gain, solar * COOL.SHADE_LEFT + Math.max(0, gain - solar)); kwE += COOL.SHADE_KW_KSF * ksf; stage = 'shade'; }
  if (need() > 0 && powered) {
    const cap = COOL.EVAP_BTU_SF * g.footprintSf * clamp01(o.dry ?? 0.5);
    const take = Math.min(need(), cap);
    kwE += COOL.EVAP_KW_KSF * ksf * Math.min(1, take / Math.max(1, cap)); water += take / COOL.BTU_PER_GAL * 24; gain -= take; stage = 'evap';
  }
  if (need() > 0 && powered) { kwE += need() / BTU_PER_KWH / COP_COOL; stage = 'chill'; gain -= need(); }
  const left = need();
  const indoor = left > 0 ? Math.min(free, hold + left / (SHELL_U[tier] * g.surfaceSf)) : hold;
  return { ...base, kwThermal: -(solar - gain) / BTU_PER_KWH, kwElectric: kwE, kwhPerDay: kwE * 24, indoorF: Math.max(hold, Math.min(free, indoor)), stage, waterGalDay: water };
}

/** The line the build card shows: "this dome needs about N kWh a day to stay frost-free on a 20 F night" (night, no sun). */
export function nightKwhPerDay(tier: DomeTier, cells: number, outsideF: number, mode: ClimateMode): number { return domeLoad(tier, cells, outsideF, 0, mode).kwhPerDay; }
export const defaultKwh = (tier: DomeTier, outsideF: number, mode: ClimateMode): number => nightKwhPerDay(tier, TIER[tier].cells, outsideF, mode);

/** Is an indoor temperature inside the band of a mode (for comfort, plants and animals)? */
export const inBand = (f: number, mode: ClimateMode): boolean => f >= BAND[mode][0] - 0.5 && f <= BAND[mode][1] + 0.5;

/**
 * Livestock and plant comfort 0..1 at an indoor temperature: 1 across the comfortable range (55 to 82 F), falling to 0 at 25 F and 108 F.
 * (Chickens lay best 55 to 80 F; most vegetables like 60 to 85 F; heat stress starts near 90 F and cold stress below about 40 F.)
 */
export function comfortAt(f: number): number {
  if (f >= 55 && f <= 82) return 1;
  return f < 55 ? clamp01((f - 25) / 30) : clamp01((108 - f) / 26);
}
