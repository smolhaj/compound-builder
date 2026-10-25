/**
 * The farm's day (one hook from the eating step, needs.ts): the seed and
 * the sowing, the barnyard, the pond and the maple sugaring. The kitchen's
 * preserving runs after the eating (preserving.ts preserveDay). Pure.
 */
import type { GameState } from './state';
import { log } from './economy';
import { newFarm } from './farmState';
import { seedsDay } from './seeds';
import { livestockDay } from './livestock';
import { pondDay } from './pond';
import { mapleDay, mapleSummary } from './maple';
import { workDay } from './farmWork';

/** The farm record, made if an old state lacks it (and any part it lacks). */
export function farmOf(s: GameState) {
  const f = (s.farm ??= newFarm()), d = newFarm();
  f.preserve ??= d.preserve; f.seeds ??= d.seeds; f.maple ??= d.maple; f.work ??= d.work;
  if (f.pond === undefined) f.pond = null;
  return f;
}

/** Once a day, before the eating: sowing, the animals, the pond, the sap. Returns kcal brought in (milk, meat, fish, syrup). */
export function farmDay(s: GameState, freezer: boolean): number {
  farmOf(s);
  workDay(s);
  for (const line of seedsDay(s)) log(s, line);
  let kcal = livestockDay(s, freezer);
  kcal += pondDay(s, freezer);
  kcal += mapleDay(s);
  const m = mapleSummary(s);
  if (m) log(s, m);
  return kcal;
}
