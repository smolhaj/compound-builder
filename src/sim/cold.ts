/**
 * Freezing without heat (GDS §10.5). The stove burns firewood (sim/heating.ts);
 * when the woodpile is bare on a hard winter night the house is as cold as the
 * night. People in it risk frostbite; the little and the old much more; a tent
 * or an unfinished house is worse than a roofed one. Cozy never hurts; Standard
 * is gentle (half); Hardcore is the full risk. Pure; medical.ts rolls the dice.
 */
import { demandNow } from './heating';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import type { Person } from './family';
import type { GameState } from './state';

/** Heating demand below this is a mild night: no risk. */
export const COLD_FLOOR = 0.45;
/** Daily chance of frostbite for an exposed adult at exposure 1. */
export const FROST_DAILY = 0.05;

/** 0 (warm or mild) to 1 (the stove is cold on a hard-freeze night). */
export function coldExposure(s: GameState): number {
  if (s.heat.burned < 1) return 0;
  const d = demandNow(s);
  if (d < COLD_FLOOR) return 0;
  return Math.min(1, (d - COLD_FLOOR) / 1.0);
}

/** Housed (a finished home) or camping. */
export const sheltered = (s: GameState): boolean => s.structures.some(x => isHome(x.kind) && isFinished(x) && !x.roofLost);

export function vulnerability(p: Person): number {
  return p.age < 5 ? 2.2 : p.elder || p.age >= 70 ? 1.8 : 1;
}

const DIFF: Record<string, number> = { cozy: 0, standard: 0.5, hardcore: 1 };

/** Daily frostbite chance for one person. */
export function frostChance(s: GameState, p: Person): number {
  const e = coldExposure(s);
  if (e <= 0) return 0;
  return FROST_DAILY * e * vulnerability(p) * (sheltered(s) ? 0.6 : 1.5) * (DIFF[s.disaster.difficulty ?? 'standard'] ?? 0.5);
}
