/**
 * Money sinks for a family that has money (docs/DECISIONS.md "Cozy money sinks"). Three goods, each hung on a mechanic that already exists and
 * each only ever a help (never makes a raid or an illness worse), in the same way as the house hardening chain (sim/houseHardening.ts):
 *
 *   clinic_suite   a fitted exam room above ground. It is the medical bay the bunker builds underground (care.bay in sim/medical.ts: faster healing,
 *                  fewer infections, the sick kept apart), for a family with no bunker, or whose bunker has no medical corner.
 *   radio_mast     a guyed mast, beam antenna, a repeater and a battery cabinet. The set on the shelf hears more and hears truer (sim/radio.ts).
 *   gate_house     a hardened gate house with a vehicle barrier and an intercom at the drive: wall strength and warning (sim/gear.ts).
 *
 * The fourth sink is land (sim/land.ts: an owner who would not sell will take a cash offer well over the asking price).
 * Pure; prices are the 2025 retail figures in sim/materials.ts.
 */
import { isFinished, planProblem } from './construction';
import { kitUsd } from './homeAdvice';
import { orderCost, prices } from './economy';
import type { GameState, OrderLine } from './state';

const n = (s: GameState, m: 'clinic_suite' | 'radio_mast' | 'gate_house'): number => Math.floor(s.stock[m] ?? 0);

/** A fitted clinic room stands in the house. */
export const hasClinic = (s: GameState): boolean => n(s, 'clinic_suite') >= 1;

/** A medical bay in use: the bunker's, or a clinic suite above ground. */
export const medicalBay = (s: GameState): boolean => hasClinic(s) || s.structures.some(x => x.kind === 'bunker_medical' && isFinished(x));

/** The mast is up. */
export const hasMast = (s: GameState): boolean => n(s, 'radio_mast') >= 1;

/** What the mast adds to the set the family listens on: days it hears something, and how true it is. Nothing without a set. */
export const MAST = { hear: 0.15, truthHam: 0.05, truthSw: 0.05, truthCap: 0.95 };

/** The gate house at the drive. */
export const hasGateHouse = (s: GameState): boolean => n(s, 'gate_house') >= 1;
/** Wall strength and warning points it adds at the gate (counted with the rest of the gear in sim/gear.ts). */
export const GATE_HOUSE = { barrier: 10, detection: 6 };

/** One line each, for the shop cards and the defense tab. */
export const SINK_LINE: Record<'clinic_suite' | 'radio_mast' | 'gate_house', string> = {
  clinic_suite: 'Works as a medical bay above ground: wounds heal faster, infections are rarer, the sick can be kept apart.',
  radio_mast: `The radio hears ${Math.round(MAST.hear * 100)} points more often and hears truer (needs a radio).`,
  gate_house: `+${GATE_HOUSE.barrier} wall strength and +${GATE_HOUSE.detection} warning at the gate.`,
};

// ── tier 2: what the Idle-cash card offers a family that has built the basics (docs/DECISIONS.md "Wealth and defense") ─────────────────────────

/** An extra drilled well: the pump of one cannot seize the family's water alone (hard-water scale takes half as long to stop both, sim/water.ts). */
export const WELLS = { KIND: 'well_drilled' } as const;
export const finishedWells = (s: GameState): number => s.structures.filter(x => !x.unplaced && (x.kind === 'well_drilled' || x.kind === 'well_hand') && x.stage >= 5).length;
/** Divides the chance a hard-water scale seizes the (only) pump: two wells share the load and one is always running. */
export const pumpSeizeK = (s: GameState): number => Math.max(1, Math.min(3, finishedWells(s)));

/** A power plant: the solar farm and its battery bank, beside the family's own array. Counted for the offer; the sim's utilities do the rest. */
export const POWER_PLANT_KINDS = ['solar_farm', 'battery_bank'] as const;
export const hasPowerPlant = (s: GameState): boolean => s.structures.some(x => !x.unplaced && x.kind === 'solar_farm');

/** Contract guards past the first three: a hired watch (sim/guards.ts MAX_GUARDS 6): two to a shift, around the clock. */
export const WATCH_FROM = 3;

export interface SinkOffer {
  id: 'clinic_suite' | 'gate_house' | 'extra_well' | 'power_plant' | 'hired_watch';
  name: string;
  usd: number;
  /** What it does, in numbers. */
  effect: string;
  act: { type: 'order'; lines: OrderLine[] } | { type: 'stake'; kind: string } | { type: 'open'; right: 'defense' };
}

/**
 * The second tier of sinks, in the order a rich family should reach for them. Each is offered only if it is not already owned, the spare cash covers it
 * three times over, and the family has a roof (nothing is offered to a family still in tents). Prices are today's shelf and kit prices.
 */
export function sinkOffers(s: GameState, spare: number): SinkOffer[] {
  const out: SinkOffer[] = [];
  const homeUp = s.structures.some(x => !x.unplaced && x.stage >= 5 && x.kind !== 'tent' && /house|cabin|cottage|home|lodge|farm/.test(x.kind));
  if (!homeUp) return out;
  const cost = (m: 'clinic_suite' | 'gate_house'): { lines: OrderLine[]; usd: number } => { const lines = [{ material: m, qty: 1 }]; return { lines, usd: orderCost(lines, prices(s)) }; };
  const fits = (usd: number) => usd * 3 <= spare;
  if (!hasClinic(s)) { const c = cost('clinic_suite'); if (fits(c.usd) && !medicalBay(s)) out.push({ id: 'clinic_suite', name: 'Clinic suite', usd: c.usd, effect: SINK_LINE.clinic_suite, act: { type: 'order', lines: c.lines } }); }
  if (!hasGateHouse(s)) { const c = cost('gate_house'); if (fits(c.usd)) out.push({ id: 'gate_house', name: 'Hardened gate house', usd: c.usd, effect: `${SINK_LINE.gate_house} Guards sleep in it, so more of them are on the road.`, act: { type: 'order', lines: c.lines } }); }
  if (finishedWells(s) < 2 && !planProblem(s, WELLS.KIND)) { const usd = Math.round(kitUsd(s, WELLS.KIND)); if (fits(usd)) out.push({ id: 'extra_well', name: 'A second well', usd, effect: 'Water from two wells: a pump that seizes no longer takes the water down (the hard-water scale that stops one takes twice as long to stop both).', act: { type: 'stake', kind: WELLS.KIND } }); }
  if (!hasPowerPlant(s) && !planProblem(s, 'solar_farm')) { const usd = Math.round(kitUsd(s, 'solar_farm')); if (fits(usd)) out.push({ id: 'power_plant', name: 'A solar power plant', usd, effect: 'A solar farm well past the family array: the pump, freezers and lights run on grid-down power with a margin, so the generator and its noise stay off.', act: { type: 'stake', kind: 'solar_farm' } }); }
  return out;
}
