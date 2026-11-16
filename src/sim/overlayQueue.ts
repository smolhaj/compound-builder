/**
 * One queue for the cards that sit over the map, so they never stack or hide each other (docs/DECISIONS.md, "Overlay queue").
 * Pure: the UI reads the flags and renders only the cards that are up. Highest first:
 *   title screen > ending > raid cutscene > decision (a gate prompt, an event) > hit moment > "the day it happened" > felt decision card > recap > milestone card.
 * A card that has to wait is not lost; it comes up when everything above it has been answered.
 */
export interface OverlayInputs {
  /** The title screen is up. */
  title: boolean;
  /** The new-game screen is up. */
  setup: boolean;
  /** The run is over (the ending report is up). */
  ending: boolean;
  /** A raid cutscene is on: it owns the screen, except for its own stance prompt. */
  cutscene: 'none' | 'prompt' | 'playing';
  /** A decision card is waiting (someone at the gate, an event). */
  decision: boolean;
  /** "The day it happened" is waiting. */
  dayCard: boolean;
  /** The "Where we left off" recap is waiting. */
  recap: boolean;
  /** Milestone cards waiting. */
  milestones: number;
  /** The disaster's hit moment is waiting to play (src/sim/felt, FL1). */
  hitMoment?: boolean;
  /** A felt decision card is waiting (src/sim/felt, FL4); the clock is held while it is up. */
  feltCard?: boolean;
  /** A placing tool or the starter proposal is open (the planning pause): a card would cover the ghosts, so it waits. */
  planning?: boolean;
}

export interface OverlayPlan {
  gate: boolean;
  ending: boolean;
  hitMoment: boolean;
  dayCard: boolean;
  feltCard: boolean;
  recap: boolean;
  /** One milestone card at a time. */
  milestone: boolean;
  /** The title screen is covering something that needs an answer. */
  decisionWaiting: boolean;
}

export function overlayPlan(i: OverlayInputs): OverlayPlan {
  const off = { gate: false, ending: false, hitMoment: false, dayCard: false, feltCard: false, recap: false, milestone: false, decisionWaiting: i.decision };
  if (i.title) return off;
  if (i.ending) return { ...off, ending: true };
  if (i.cutscene !== 'none') return { ...off, gate: true };
  const gate = i.decision;
  const hitMoment = !gate && !!i.hitMoment;
  const dayCard = !gate && !hitMoment && i.dayCard;
  // a felt card, like the recap, waits for the new-game screen and for a placing tool (it would cover the ghosts)
  const feltCard = !gate && !hitMoment && !dayCard && !i.setup && !i.planning && !!i.feltCard;
  const recap = !gate && !hitMoment && !dayCard && !feltCard && !i.setup && i.recap;
  const milestone = !gate && !hitMoment && !dayCard && !feltCard && !recap && !i.setup && !i.planning && i.milestones > 0;
  return { gate, ending: false, hitMoment, dayCard, feltCard, recap, milestone, decisionWaiting: gate };
}
