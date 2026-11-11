/**
 * Freezing without heat (GDS §10.5). The stove burns firewood (sim/heating.ts);
 * when the woodpile is bare on a hard winter night the house is as cold as the
 * night. People in it risk frostbite; the little and the old much more; a tent
 * or an unfinished house is worse than a roofed one. Cozy never hurts; Standard
 * is gentle (half); Hardcore is the full risk. Pure; medical.ts rolls the dice.
 *
 * Survival realism (decided with the user: "Yes, cold hurts"): while the town
 * works nobody freezes (a furnace on grid power, or propane heaters from the
 * farm store at about $6 a day at full demand; broke, it is energy assistance
 * and the warming center). And a cold night in bed (sim/housing.ts works out
 * how warm it is there: the shelter, the stove, the bag) below freezing
 * builds hypothermia night after night: it takes health fast, the little and
 * the old first, and it ends within a day or two of being warm. The slow
 * wear of a cool bedroom is housing.ts's `harm`; this is the killer.
 */
import { demandNow } from './heating';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import type { Person } from './family';
import type { Needs } from './needs';
import type { GameState } from './state';
import { chillFrost } from './stealth';

/** Heating demand below this is a mild night: no risk. */
export const COLD_FLOOR = 0.45;
/** Daily chance of frostbite for an exposed adult at exposure 1. */
export const FROST_DAILY = 0.05;

/** 0 (warm or mild) to 1 (the stove is cold on a hard-freeze night). */
export function coldExposure(s: GameState): number {
  if (s.heat.burned < 1 || townHeat(s)) return chillFrost(s);   // a dusk-only stove (sim/stealth.ts) lets the house go cold by morning even with wood in hand
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

/** Propane heaters at the farm store, or a furnace on the grid, when the stove is out of wood and the town still works. */
export const PROPANE_USD = 6;
export function townHeat(s: GameState): 'furnace' | 'propane' | null {
  if (s.heat.burned < 1) return null;   // the stove has wood: nothing to add
  const home = s.structures.find(x => isHome(x.kind) && isFinished(x));
  if (home && s.utilities.lit.includes(home.id) && s.utilities.grid && s.disaster.tracks.grid > 0.5) return 'furnace';
  if (s.disaster.tracks.stores > 0.5 && s.disaster.tracks.deliveries > 0.25) return 'propane';
  return null;
}

/** Once a day: the propane bill on a cold day with the woodpile bare (peacetime; the money can run out, then it is assistance). */
export function propaneDay(s: GameState): void {
  const d = demandNow(s);
  if (d > 0 && townHeat(s) === 'propane' && s.money > 0) s.money = Math.max(0, s.money - PROPANE_USD * d);
}

/** How much faster the cold takes someone: babies and the elderly first. */
export function frailty(p: Pick<Person, 'age'>, what: 'cold' | 'thirst'): number {
  if (what === 'cold') return p.age < 2 ? 2 : p.age < 6 ? 1.5 : p.age >= 75 ? 2 : p.age >= 65 ? 1.5 : 1;
  return p.age < 3 ? 1.6 : p.age < 10 ? 1.3 : p.age >= 75 ? 1.4 : p.age >= 65 ? 1.25 : 1;
}

/** Bed temperature (°F) below which the body loses more heat than it makes. */
export const HYPOTHERMIA_F = 32;
const HYPO = 'hypothermia';
export const isColdHurt = (what: string) => what.startsWith(HYPO);

/**
 * One person's night in bed: returns the change to health today (needs.ts adds it). `effF` is how warm it was
 * in bed (sim/housing.ts); absent (nobody counted them in) lets strain ease. Cozy never kills.
 */
export function coldDay(p: Person, n: Needs, effF: number | undefined, cozy: boolean, out: string[]): number {
  const f = frailty(p, 'cold');
  const chill0 = n.chill ?? 0;
  // strain builds a half a point a degree C below freezing (×frailty); warmth eases it
  n.chill = effF !== undefined && effF < HYPOTHERMIA_F ? chill0 + (HYPOTHERMIA_F - effF) / 1.8 * 0.5 * f : Math.max(0, chill0 - (effF === undefined || effF >= 41 ? 10 : 2));
  const h = n.hurt.find(x => isColdHurt(x.what));
  if (n.chill >= 10) {
    const sev = Math.min(90, 20 + n.chill * 1.5);
    if (h) h.sev = sev;
    else { n.hurt.push({ what: `${HYPO}: shivering, slurred, clumsy`, sev }); out.push(`${p.first} is hypothermic: too cold for too many nights. They need a heated room.`); }
    return cozy ? -Math.min(sev / 30, 1) : -sev / 30;
  }
  if (h) { n.hurt = n.hurt.filter(x => x !== h); out.push(`${p.first} has warmed up.`); }
  return 0;
}
