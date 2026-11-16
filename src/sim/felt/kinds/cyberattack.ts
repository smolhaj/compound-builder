import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/cyberattack';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { genericCards } from '../cardLibrary';

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for cyberattack: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...genericCards('cyberattack')]); },
  get goals() { return (g ??= toFeltGoals('cyberattack_first_week', 'The cyberattack: the first week', 'warning', goals)); },
};
