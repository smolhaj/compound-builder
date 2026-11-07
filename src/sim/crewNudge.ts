/**
 * The pacing gap (QA run 5: a family with $938k reached day 350 with no house because the Build tab never said
 * how long the family's own hands take). When the family would need more than a few weeks to finish the home and
 * the cash covers a crew, say so with a price and a one-click hire; when they choose to keep building
 * themselves, offer tents so nobody sleeps outside meanwhile. Pure (tested); costs come from `crewQuote`, the
 * same figure the Projects tab and the hire button use.
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { crewProblem, crewQuote } from './crews';
import { housingShortfall, TENT_PRICE, TENT_SEATS } from './housing';
import { eta, paceOf, weeksUntil } from './pace';
import { KIT } from '../game/buildkit/kit';
import { pluralize } from './words';
import type { GameState } from './state';

/** The family's own pace is "slow" past this many weeks for the home. */
export const CREW_NUDGE_WEEKS = 3;
/** Cash to keep on top of the crew's bill (the weekend crew card uses the same slack). */
export const CREW_NUDGE_SLACK = 6000;
/**
 * The card shows once the cash covers this share of the crew's quote plus the slack, not the whole quote: the crew bills only the hours it works
 * and goes home cleanly when the account runs dry, so the family finishes the last part by hand (balance pass: a poor family waited about eight
 * months building by hand while the card waited for quote + $6,000; docs/DECISIONS.md).
 */
export const CREW_NUDGE_SHARE = 0.75;

export interface CrewNudge {
  /** The home project the crew would finish. */
  id: string;
  /** "log house". */
  name: string;
  /** Weeks the family would need for it at its own pace (null: nobody is free to build). */
  familyWeeks: number | null;
  crewWeeks: number;
  usd: number;
  title: string;
  why: string;
  /** Dome tents that would shelter the people with no roof yet (0: none needed). */
  tents: number;
  tentUsd: number;
}

export function crewNudge(s: GameState): CrewNudge | null {
  if (s.weekend?.mode === 'split') return null;   // the weekender has its own weekday-crew card (sim/weekendPlan.ts)
  const home = s.structures.find(st => isHome(st.kind) && !isFinished(st) && !st.unplaced && !st.pre && !(s.crews ?? []).some(c => c.target === st.id));
  if (!home) return null;
  const pace = paceOf(s), familyWeeks = weeksUntil(s, home.id, pace);
  if (familyWeeks !== null && familyWeeks <= CREW_NUDGE_WEEKS) return null;
  const q = crewQuote(home);
  if (crewProblem(s, home) || s.money < q.usd * CREW_NUDGE_SHARE + CREW_NUDGE_SLACK) return null;
  const partial = s.money < q.usd + CREW_NUDGE_SLACK;
  const name = (KIT[home.kind]?.name ?? home.kind.replace(/_/g, ' ')).toLowerCase();
  const sh = housingShortfall(s);
  const tents = sh.outside > 0 ? Math.ceil(sh.outside / TENT_SEATS) : 0;
  const weeksText = q.weeks === 1 ? 'about a week' : `about ${pluralize(q.weeks, 'week')}`;
  const usd = '$' + q.usd.toLocaleString('en-US');
  return {
    id: home.id, name, familyWeeks, crewWeeks: q.weeks, usd: q.usd, tents, tentUsd: tents * TENT_PRICE,
    title: `Hire a crew to finish the ${name} in ${weeksText} (~${usd})`,
    why: `Building it yourselves would take ${eta(familyWeeks)}. A crew of four works every weekday and you pay only for the hours they work; the family keeps farming and fixing up the place.${partial ? ' The account covers most of the bill now. If it runs low the crew goes home and the family finishes the rest.' : ''} They start as soon as the materials are in. ${tents > 0 ? 'Or keep building it yourselves and put up tents now so nobody sleeps outside in the meantime.' : 'Or keep building it yourselves: the beds you have will do for now.'}`,
  };
}
