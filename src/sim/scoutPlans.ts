/**
 * Scouts the watch has spotted (user answer: "spotting them gives a warning plus choices: drive them off, capture one, ignore, or prepare"). Pure and
 * seeded. The card shows the four plans with honest odds; `resolve` (sim/encounters.ts) applies the one chosen, `planBattle` reads what is left of it.
 *
 *   drive_off  warning shots over their heads: the scouts run and a crew that sees a place that shoots may think better of it (`driveOffDeters`).
 *              Costs a few rounds. If the crew comes anyway it comes warned and they know you shoot.
 *   capture    a sortie to grab one: the better armed and the more fighters, the likelier; in the dark it is harder. A captured scout is a prisoner you
 *              can question (sim/interrogation.ts) and the crew is two men short with no one to tell it the weak side. A failed grab hurts one of yours.
 *   ignore     do nothing: they saw the place and the crew knows its weak side, as if they had never been spotted.
 *   prepare    shift the defenders to the side they will come from and shut and chain the gates: the family is ready at once and a ram at a gate is
 *              worth 0.75 of what it was. The crew still sees a place that has not shown its teeth, so it may know the weak side half the time.
 */
import type { CrewKind } from './surrender';

export type ScoutPlan = 'drive_off' | 'capture' | 'ignore' | 'prepare';
export const SCOUT_PLANS: readonly ScoutPlan[] = ['drive_off', 'capture', 'ignore', 'prepare'];
export const SCOUT_NAME: Record<ScoutPlan, string> = { drive_off: 'Drive them off', capture: 'Capture one', ignore: 'Ignore them', prepare: 'Prepare' };
export const SCOUT_HINT: Record<ScoutPlan, string> = {
  drive_off: 'Shots over their heads. They run, and the crew may think better of it. A few rounds.',
  capture: 'A sortie to grab one for questioning. Needs rifles and light; a failed grab hurts someone.',
  ignore: 'Nothing. They saw the place, so the crew will know your weak side.',
  prepare: 'Shift the defenders to the near side and chain the gates: ready at once, a ram at the gate is worth less.',
};
/** A shut and chained gate is worth this much of its usual ram odds. */
export const PREPARED_GATE = 0.75;

export interface ScoutCtx { fortress: number; fighters: number; armed: boolean; kind: CrewKind; temper: 'desperate' | 'hard' | 'savage'; night: boolean }

/** The chance warning shots make the crew think better of it. A hungry crew is not put off; a disciplined one weighs it. */
export function driveOffDeters(c: ScoutCtx): number {
  if (c.temper === 'savage' || c.kind === 'horde') return 0.02;
  const base = c.kind === 'looters' ? 0.4 : c.kind === 'militia' || c.kind === 'patrol' || c.kind === 'requisition' ? 0.3 : 0.18;
  return Math.max(0.03, Math.min(0.7, base + c.fortress / 100 * 0.3 + (c.armed ? 0.1 : -0.15) + Math.min(4, c.fighters) * 0.02 - (c.temper === 'desperate' ? 0.1 : 0)));
}

/** The chance a sortie takes one of the two scouts alive. */
export function captureOdds(c: ScoutCtx): number {
  return Math.max(0.05, Math.min(0.8, 0.12 + Math.min(4, c.fighters) * 0.12 + (c.armed ? 0.15 : -0.1) - (c.night ? 0.15 : 0)));
}

/** Whether the crew keeps its knowledge of the weak side after the plan (ignore: yes; prepare: half the time; the others: no). */
export function crewKeepsIntel(plan: ScoutPlan | undefined, r: () => number): boolean {
  return plan === 'ignore' ? true : plan === 'prepare' ? r() < 0.5 : false;
}
