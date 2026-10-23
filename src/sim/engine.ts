/**
 * Simulation step: advance the game clock and run the systems on a fixed
 * quarter-hour sub-step (deterministic regardless of frame rate or speed).
 * Systems mutate a draft; `step` returns a fresh state object.
 */
import { addWork, blockedReason, isFinished } from './construction';
import { deliverOrders } from './economy';
import { buildRate } from './family';
import { routineAt, taskFor } from './schedule';
import { hourOf, type GameState, type Structure } from './state';

/** Sub-step in days (15 game minutes). */
export const SUBSTEP = 0.25 / 24;

/** Structure the family works on next: the oldest one that can go on. */
export function nextBuildTarget(s: GameState): Structure | null {
  for (const st of s.structures) if (!isFinished(st) && blockedReason(s, st) === null) return st;
  return null;
}

function subStep(s: GameState): void {
  deliverOrders(s);
  const h = hourOf(s.clock.t);
  const target = nextBuildTarget(s);
  for (const p of s.people) {
    const ps = s.personState.find(x => x.id === p.id)!;
    const task = taskFor(routineAt(p, h), target !== null);
    ps.task = task;
    ps.target = task === 'build' && target ? target.id : null;
    if (task === 'build' && target) addWork(s, target, SUBSTEP * 24 * buildRate(p));
  }
}

/** Advance `days` of game time. Returns a new state (the input is not mutated). */
export function step(state: GameState, days: number): GameState {
  if (days <= 0) return state;
  const s: GameState = structuredClone(state);
  // whole sub-steps on an integer counter, so chopping time up differently gives the same result
  const end = s.clock.t + days;
  const target = Math.floor(end / SUBSTEP + 1e-6);
  while (s.clock.ticks < target) {
    s.clock.ticks++;
    s.clock.t = s.clock.ticks * SUBSTEP;
    subStep(s);
  }
  s.clock.t = end;
  return s;
}
