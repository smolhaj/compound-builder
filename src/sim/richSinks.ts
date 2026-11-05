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
import { isFinished } from './construction';
import type { GameState } from './state';

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
