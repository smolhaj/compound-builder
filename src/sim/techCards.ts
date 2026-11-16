/**
 * The decision cards and signature goals of the tech-and-money kinds (solar_flare, emp, cyberattack, grid_down, financial), in one place
 * for the screen. Each card is defined in its kind's module (sim/disasters/<kind>.ts) and offered from that kind's hooks.
 */
import type { GameState } from './state';
import type { DisasterKind } from './disaster';
import { cards as solar, goals as solarGoals } from './disasters/solar_flare';
import { cards as emp, goals as empGoals } from './disasters/emp';
import { cards as cyber, goals as cyberGoals } from './disasters/cyberattack';
import { cards as grid, goals as gridGoals } from './disasters/grid_down';
import { cards as fin, goals as finGoals } from './disasters/financial';
import { answerFrom, cardState, type CardOption, type CardOutcome, type Goal, type TechCard } from './techFx';
import { mulberry32 } from './rng';
import { dayIndex } from './state';

export const TECH_CARDS: Partial<Record<DisasterKind, TechCard[]>> = { solar_flare: solar, emp, cyberattack: cyber, grid_down: grid, financial: fin };
export const TECH_GOALS: Partial<Record<DisasterKind, Goal[]>> = { solar_flare: solarGoals, emp: empGoals, cyberattack: cyberGoals, grid_down: gridGoals, financial: finGoals };

export interface OpenCard { id: string; title: string; text: string; options: CardOption[] }

/** The decision waiting for the family, if any. */
export function openTechCard(s: GameState): OpenCard | null {
  const k = s.disaster.kind;
  if (!k) return null;
  const defs = TECH_CARDS[k];
  const id = s.disaster.fx ? cardState(s).open : null;
  const c = defs?.find(x => x.id === id);
  return c ? { id: c.id, title: c.title, text: c.text(s), options: c.options(s) } : null;
}

/** Answer it. Returns the outcome (also kept in `fx.cards.last` for the screen) or why not. */
export function answerTechCard(s: GameState, option: string): CardOutcome | string {
  const k = s.disaster.kind;
  const defs = k ? TECH_CARDS[k] : undefined;
  if (!defs) return 'no decision is waiting';
  const cs = cardState(s);
  return answerFrom(s, defs, option, mulberry32(s.seed * 5953 + dayIndex(s.clock.t) * 11 + (cs.open?.length ?? 0)));
}

/** The kind's first-week goal chain with where the family stands (data for the screen and the felt layer). */
export function signatureGoals(s: GameState): Array<Goal & { met: boolean }> {
  const k = s.disaster.kind;
  return (k ? TECH_GOALS[k] ?? [] : []).map(g => ({ ...g, met: g.done(s) }));
}

/** The last outcome, for a toast. */
export const lastOutcome = (s: GameState): (CardOutcome & { card: string }) | null => (s.disaster.fx?.cards ? cardState(s).last ?? null : null);
