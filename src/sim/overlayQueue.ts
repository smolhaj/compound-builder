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
  /** The raid cutscene is showing its aftermath report: a run that just ended waits behind it (both on screen at once covered the report card's buttons). */
  aftermath?: boolean;
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
  /** The Compound Board is open: a milestone card would cover it, so it waits (and goes by itself later). */
  board?: boolean;
  /** Layout A: the new-game welcome card is waiting (it is a queue entry, not a layer over everything). Classic leaves this unset. */
  welcome?: boolean;
}

/** Tiers (docs/UX_AUDIT.md 11.5): a higher tier is on top, a lower one waits. 'blocking' needs an answer and holds the clock; 'card' is a one-time notice; 'toast' is a corner line. */
export type OverlayTier = 'blocking' | 'card' | 'toast';
export const TIER_OF: Record<'gate' | 'ending' | 'hitMoment' | 'dayCard' | 'feltCard' | 'recap' | 'milestone' | 'welcome', OverlayTier> = {
  ending: 'blocking', gate: 'blocking', hitMoment: 'blocking', dayCard: 'blocking', feltCard: 'blocking', recap: 'card', milestone: 'card', welcome: 'card',
};

export interface OverlayPlan {
  gate: boolean;
  ending: boolean;
  hitMoment: boolean;
  dayCard: boolean;
  feltCard: boolean;
  recap: boolean;
  /** One milestone card at a time. */
  milestone: boolean;
  /** Layout A: the welcome card is up. */
  welcome: boolean;
  /** The title screen is covering something that needs an answer. */
  decisionWaiting: boolean;
}

export function overlayPlan(i: OverlayInputs): OverlayPlan {
  const off = { gate: false, ending: false, hitMoment: false, dayCard: false, feltCard: false, recap: false, milestone: false, decisionWaiting: i.decision, welcome: false };
  if (i.title) return off;
  if (i.ending && !(i.aftermath && i.cutscene !== 'none')) return { ...off, ending: true };
  if (i.cutscene !== 'none') return { ...off, gate: true };
  const gate = i.decision;
  const hitMoment = !gate && !!i.hitMoment;
  const dayCard = !gate && !hitMoment && i.dayCard;
  // a felt card, like the recap, waits for the new-game screen and for a placing tool (it would cover the ghosts)
  const feltCard = !gate && !hitMoment && !dayCard && !i.setup && !i.planning && !!i.feltCard;
  const recap = !gate && !hitMoment && !dayCard && !feltCard && !i.setup && i.recap;
  const milestone = !gate && !hitMoment && !dayCard && !feltCard && !recap && !i.setup && !i.planning && !i.board && i.milestones > 0;
  const welcome = !!i.welcome && !gate && !hitMoment && !dayCard && !feltCard && !recap && !i.setup && !i.planning;
  return { gate, ending: false, hitMoment, dayCard, feltCard, recap, milestone, decisionWaiting: gate, welcome };
}

/** The tier on top right now, or null when the map is clear: toasts wait while it is not. */
export function topTier(p: OverlayPlan): OverlayTier | null {
  if (p.ending || p.gate || p.hitMoment || p.dayCard || p.feltCard) return 'blocking';
  if (p.recap || p.milestone || p.welcome) return 'card';
  return null;
}
