/**
 * Which stance is highlighted when a raid prompt opens (UX playtest: Hide was lit even with the family armed behind a closed wall).
 * Defend is the default when the family is armed and the wall line is up; otherwise the first stance on the card (Hide), unchanged.
 * Display default only: every stance stays available and nothing is chosen until the player presses Watch. Pure (tested).
 */
import type { Posture, Stance } from './encounters';

/** The wall line counts as closed and holding at this barrier score (the same cut the detection score uses for "walls you can trust"). */
export const WALLED_BARRIER = 50;

export function defaultStance(stances: readonly Stance[], p: Pick<Posture, 'armed' | 'barrier'>): Stance {
  if (stances.includes('defend') && p.armed && p.barrier >= WALLED_BARRIER) return 'defend';
  return stances[0];
}
