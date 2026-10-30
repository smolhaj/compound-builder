/**
 * Grief: the ONE implementation of what a death does to the household's
 * mood. It replaces the old flat "-15 morale while anyone is dead" in
 * needs.ts with a grief that fades with time, fades much faster once the
 * family has held a funeral (sim/gatherings.ts calls `mourn`), and stacks
 * (up to a cap) over several deaths. Pure.
 *
 * Both the daily-life branch (funerals) and the people-depth branch (a
 * per-person mind model) wanted this; to avoid two competing versions this
 * module is the shared home. A later per-person model should read
 * `lossesOf` / call `griefMorale`, not add a second fade of its own.
 *
 *   a death, no funeral    9 points, easing to 6 over a year (about two thirds after a year)
 *   a death, a funeral     3 points, plus 12 that fade over a month or two
 *   several deaths         add up, never past 25 points
 */
import type { GameState } from './state';

/** One death in the household and whether it has been mourned. */
export interface Loss { id: string; at: number; mourned: boolean }

/** The ledger (lazily made, so old saves and hand-built test states work). */
export const lossesOf = (s: GameState): Loss[] => (s.losses ??= []);

/** Once a day: note anyone who has died since (taken children are not deaths; they are missed, not buried). */
export function noteLosses(s: GameState): void {
  const ledger = lossesOf(s);
  for (const ps of s.personState) {
    if (ps.needs.died == null || ps.needs.taken || ps.needs.left || ledger.some(l => l.id === ps.id)) continue;
    ledger.push({ id: ps.id, at: ps.needs.died, mourned: false });
  }
}

/** A funeral was held (for one person, or everyone still unmourned). */
export function mourn(s: GameState, id?: string): void {
  for (const l of lossesOf(s)) if (!id || l.id === id) l.mourned = true;
}

/** Deaths nobody has buried yet. */
export const unmourned = (s: GameState): Loss[] => lossesOf(s).filter(l => !l.mourned);

/** Grief points for one loss, `days` after it. */
export function griefPoints(mourned: boolean, days: number): number {
  const d = Math.max(0, days);
  return mourned ? 3 + 12 * Math.exp(-d / 30) : 9 + 6 * Math.exp(-d / 120);
}

/** Morale-target points from grief now (zero or negative). A child taken counts like a death nobody could bury. */
export function griefMorale(s: GameState): number {
  let sum = 0;
  for (const ps of s.personState) {
    if (ps.needs.died == null || ps.needs.left) continue;
    const l = s.losses?.find(x => x.id === ps.id);
    sum += griefPoints(!!l?.mourned, s.clock.t - (l?.at ?? ps.needs.died));
  }
  return sum > 0 ? -Math.min(25, sum) : 0;
}
