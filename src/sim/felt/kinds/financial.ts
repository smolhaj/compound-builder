import type { DecisionCard, FeltSpec, GoalChain } from '../types';
import { cards, goals } from '../../disasters/financial';
import { toFeltCards, toFeltGoals } from '../../techFelt';
import { genericCards } from '../cardLibrary';

let c: DecisionCard[] | null = null, g: GoalChain | null = null;
/**
 * Felt layer for financial: the teeth package's decision cards (plus the generic library, so every phase keeps its cards) and its first-week goal
 * chain. Lazy: the teeth module imports the sim, which imports the felt registry (hit moment, marks and radio lines are still to come).
 */
export const felt: FeltSpec = {
  get cards() { return (c ??= [...toFeltCards(cards), ...genericCards('financial')]); },
  get goals() { return (g ??= toFeltGoals('financial_first_week', 'The money collapse: the first week', 'warning', goals)); },
};
