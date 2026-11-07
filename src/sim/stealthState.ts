/**
 * Full-stealth settings (docs/DECISIONS.md "Stealth"): the small leaf module everything else reads, so lights, heating, work and the
 * exposure sum can ask "is the family keeping quiet?" without importing each other. Pure; every field is optional (absent = off), so
 * old saves read as "no stealth" and need no migration.
 *
 *  full      one switch that sets light, smoke and noise together: lights out (sim/blackout.ts), the stove burned at dusk only,
 *            quiet hours (wall insulation and trained dogs are bought separately).
 *  burn      the wood stove at night: normal | smokeless (dry hardwood, a cleaner burn: 15 % more wood) | dusk (fed at dusk and left to die
 *            before the small hours: 20 % less wood, a cold house in cold weather).
 *  quiet     quiet hours: no outdoor work and no feeding of animals between 21:00 and 05:00 (night work at half rate).
 *  dogsQuiet dogs trained to alert without barking (a trainer's fee per dog, paid once; they still warn the family as before).
 */
import { isHome } from './blueprints';
import { isFinished } from './construction';
import type { GameState } from './state';

export type BurnMode = 'normal' | 'smokeless' | 'dusk';
export interface Stealth { full?: boolean; burn?: BurnMode; quiet?: boolean; dogsQuiet?: boolean; /** Dogs the trainer has been paid for. */ dogsPaid?: number }
export const BURN_MODES: readonly BurnMode[] = ['normal', 'smokeless', 'dusk'];
export const BURN_NAME: Record<BurnMode, string> = { normal: 'Burn as needed', smokeless: 'Smokeless (dry hardwood)', dusk: 'Dusk only' };
export const BURN_HELP: Record<BurnMode, string> = {
  normal: 'The stove runs whenever it is cold, all night: a plume of smoke against the sky.',
  smokeless: 'Seasoned hardwood, hot and clean: a faint haze instead of a plume, for about 15% more wood.',
  dusk: 'Fed at dusk and left to die: almost no smoke after midnight and a fifth less wood, but the house is cold by morning when it freezes.',
};
/** Smoke at the chimney against a plain burn; wood used against a plain burn. */
export const SMOKE_K: Record<BurnMode, number> = { normal: 1, smokeless: 0.3, dusk: 0.2 };
export const WOOD_K: Record<BurnMode, number> = { normal: 1, smokeless: 1.15, dusk: 0.8 };
/** Dollars a trainer charges per dog to make it a quiet one. */
export const DOG_TRAINER = 150;

export const stealthOf = (s: Pick<GameState, 'opsec'>): Stealth => (s.opsec as { stealth?: Stealth } | undefined)?.stealth ?? {};
export const fullStealth = (s: Pick<GameState, 'opsec'>): boolean => !!stealthOf(s).full;
/** The stove mode in force: full stealth burns at dusk only. */
export const burnMode = (s: Pick<GameState, 'opsec'>): BurnMode => (fullStealth(s) ? 'dusk' : stealthOf(s).burn ?? 'normal');
export const quietHours = (s: Pick<GameState, 'opsec'>): boolean => fullStealth(s) || !!stealthOf(s).quiet;
export const dogsQuiet = (s: Pick<GameState, 'opsec'>): boolean => !!stealthOf(s).dogsQuiet;
/** Multiplier on the firewood the stove burns. */
export const woodK = (s: Pick<GameState, 'opsec'>): number => WOOD_K[burnMode(s)];

/** Insulated walls: sets of wall insulation (a household good, one per house), as a share of the houses. */
export const INSULATION_GOOD = 'wall_insulation' as const;
export function insulationCover(s: Pick<GameState, 'stock' | 'structures'>): number {
  const sets = Math.floor((s.stock as unknown as Record<string, number>)[INSULATION_GOOD] ?? 0);
  const houses = Math.max(1, s.structures.filter(st => isFinished(st) && isHome(st.kind)).length);
  return Math.min(1, sets / houses);
}
/** The stove's demand with insulated walls: up to 10 % less heat needed. */
export const insulationHeat = (s: Pick<GameState, 'stock' | 'structures'>): number => 1 - 0.1 * insulationCover(s);
/** What the walls keep in: sound from inside (a party, a radio, a chainsaw in the shop), up to half. */
export const soundK = (s: Pick<GameState, 'stock' | 'structures' | 'opsec'>): number => (1 - 0.5 * insulationCover(s)) * (quietHours(s) ? 0.6 : 1);
