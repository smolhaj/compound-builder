/**
 * The people layer's entry points (mind.ts, medical.ts, skills.ts), so the
 * engine and the fight code each call one thing. Pure.
 *
 * Hooks for other systems:
 *  - `practice(s, pid, skill, hours)`       skills.ts: any task awards practice
 *  - `teach(s, teacher, learner, skill, h)` skills.ts: teaching time
 *  - `gathering(s, kind, { for, who })`     mind.ts: parties, funerals, memorials, music, prayer, meals
 *  - `shock(s, pid, kind, amount)`          mind.ts: any other traumatic event
 *  - `startCase(s, pid, kind, sev)`         medical.ts: a new medical condition
 *  - `personWork(s, pid)`                   the state of mind and body on the work rate
 */
import type { Battle } from './battleTypes';
import { afterFight, mindDay, mindWork } from './mind';
import { medicalDay, medicalWork } from './medical';
import { learningOf, practice, skillsDay } from './skills';
import type { GameState } from './state';

export { practice, teach } from './skills';
export { gathering, shock } from './mind';
export { startCase } from './medical';

/** Work rate from mind and body (1 = as they'd normally do). */
export function personWork(s: GameState, pid: string): number {
  return mindWork(s, pid) * medicalWork(s, pid);
}

/** Once a day, at midnight after eating and medicine: illness and injury, then the mind, then practice and rust. */
export function peopleDay(s: GameState): string[] {
  const out = [...medicalDay(s), ...mindDay(s), ...skillsDay(s)];
  learningOf(s).today = {};
  return out;
}

/** After a fight (battle.ts, rescue.ts): the mind's toll, and the shooting practice a real fight is. */
export function peopleAfterFight(s: GameState, b: Battle): void {
  afterFight(s, b, (pid, hours) => practice(s, pid, 'shooting', hours));
}
