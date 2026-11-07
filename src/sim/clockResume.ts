/**
 * The sim clock stops when a decision card (a stranger at the gate, an aftermath, a rescue) arrives. When the card
 * is answered it picks up again at the speed it was running at; a clock the player paused by hand stays paused.
 */
import type { GameState, Speed } from './state';

/** True while something is waiting on the player: the clock must stay stopped. */
export function decisionOpen(g: Pick<GameState, 'gate' | 'ending'>, cutscene: unknown): boolean {
  return !!cutscene || !!g.gate.pending || !!g.gate.aftermath || !!g.gate.card || !!(g.ending && !g.ending.continued);
}

/** The speed to resume at, or null to leave the clock alone. `resumeTo` is the speed remembered when a card paused it. */
export function resumeSpeed(resumeTo: Speed | null, speed: Speed, open: boolean): Speed | null {
  return resumeTo && resumeTo > 0 && speed === 0 && !open ? resumeTo : null;
}

/**
 * The clock holds while the player is planning: a build / draw / place tool is armed, or the starter-compound proposal is open
 * (QA run 6: 39 minutes and 3.5 hours of game time went by while a plan card or a water line was being drawn). The speed
 * setting is left alone, so the clock picks up where it was the moment the tool is put away.
 */
export const planningHold = (tool: string | null, planOpen: boolean): boolean => tool !== null || planOpen;
