/**
 * The decor of one home from the game state (reads the clock, the stock and the household; no save fields).
 */
import { cozyFrom, type Cozy } from '../buildkit/cozy';
import { dogCount } from '../../sim/pets';
import { daysOfFood } from '../../sim/needs';
import type { GameState, Structure } from '../../sim/state';

const has = (s: GameState, m: string): number => Math.floor((s.stock as unknown as Record<string, number>)[m] ?? 0);
const GARDENS = new Set(['garden', 'greenhouse', 'greenhouse_heated']);

export function cozyForHome(game: GameState, st: Pick<Structure, 'pre' | 'finishedAt'>): Cozy {
  // a home that came with the land has been the family's since the first day; a built one since it was finished
  const since = st.pre ? 0 : st.finishedAt ?? game.clock.t;
  const kids = game.people.some((p, i) => p.kid && game.personState[i]?.needs.died == null);
  const food = daysOfFood(game);
  return cozyFrom({
    days: Math.max(0, game.clock.t - since),
    kids,
    foodDays: Number.isFinite(food) ? food : 0,
    books: has(game, 'novels') + has(game, 'picture_books') > 0,
    candles: has(game, 'beeswax') > 0,
    dog: dogCount(game) >= 1,
    garden: game.structures.some(s => GARDENS.has(s.kind) && s.finishedAt !== null),
  });
}
