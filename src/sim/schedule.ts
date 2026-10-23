/**
 * Daily routine (GDS §3 "jobs are assigned by schedule", Rimworld-lite).
 * Adults: chores at dawn, 8 h of work in two blocks, chores / garden in the
 * late afternoon, evening at home, sleep 22–06. Kids: school in the morning,
 * an hour or three of helping in the afternoon, bed earlier.
 */
import { workHoursPerDay, type Person } from './family';
import type { TaskKind } from './state';

export type Slot = 'sleep' | 'chores' | 'work' | 'school' | 'leisure';

/** What a person's routine says to do at an hour (0–24). */
export function routineAt(p: Person, hour: number): Slot {
  const h = ((hour % 24) + 24) % 24;
  if (p.kid) {
    const bed = p.age < 12 ? 20.5 : 22;
    if (h >= bed || h < 7) return 'sleep';
    if (h < 8) return 'chores';
    if (h < 13) return 'school';
    if (h < 13 + workHoursPerDay(p)) return 'work';
    return 'leisure';
  }
  if (h >= 22 || h < 6) return 'sleep';
  if (h < 7) return 'chores';
  if (h < 12) return 'work';
  if (h < 13) return 'chores';
  if (h < 16) return 'work';
  if (h < 18) return 'chores';
  return 'leisure';
}

/** Task for a slot, given whether there is building work to do. */
export function taskFor(slot: Slot, canBuild: boolean): TaskKind {
  if (slot === 'work') return canBuild ? 'build' : 'chores';
  return slot;
}
