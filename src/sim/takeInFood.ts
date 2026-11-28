/**
 * Food after newcomers (playtest: a hard-careful run took in five people with no food on the shelf, starved and was wiped, and "Take them in" was the
 * lit default). Pure: the days of food the household would have once the party is inside, counting what they carry. When that is under a week the
 * card shows the honest cost line and lights no default; every stance stays available.
 */
import type { GameState } from './state';
import type { Encounter } from './encounters';
import { FOODS, KCAL, needOf } from './needs';
import { RUNWAY } from './runway';
import { pluralize } from './words';

export const TAKE_IN_SAFE_DAYS = RUNWAY.food.bad;

export interface TakeInFood { days: number; before: number; mouths: number; risky: boolean; line: string }

export function takeInFood(s: GameState, e: Pick<Encounter, 'people' | 'brings' | 'stances'>): TakeInFood | null {
  const people = e.people ?? [];
  if (!people.length || !e.stances.includes('take_in')) return null;
  const kcal = (o: Partial<Record<string, number>> | undefined) => FOODS.reduce((a, f) => a + (o?.[f] ?? 0) * KCAL[f], 0);
  const need = s.people.reduce((a, p, i) => a + (s.personState[i]?.needs?.died == null ? needOf(p) : 0), 0);
  const add = people.reduce((a, p) => a + needOf(p), 0);
  const have = kcal(s.stock as unknown as Record<string, number>), total = have + kcal(e.brings as Record<string, number> | undefined);
  const days = need + add > 0 ? total / (need + add) : Infinity;
  const before = need > 0 ? have / need : Infinity;
  const mouths = s.people.length + people.length;
  const d = Math.floor(days);
  const risky = days < TAKE_IN_SAFE_DAYS;
  const line = risky
    ? `Food if they join: ${d < 1 ? 'less than a day' : pluralize(d, 'day')} for ${mouths} people. Taking them in now means going hungry.`
    : `Food if they join: about ${pluralize(Math.min(d, 999), 'day')} for ${mouths} people.`;
  return { days, before, mouths, risky, line };
}
