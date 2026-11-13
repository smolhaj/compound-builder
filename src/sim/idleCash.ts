/**
 * Spare cash with a job to do (docs/DECISIONS.md "Idle cash"). Playtests showed families holding 90 to 96 percent of their cash a year after the
 * hit while only a few structures stood: money is never what limits the first months (permits, deliveries and labor hours are), so unspent cash
 * simply strands. This is the advice side of three ways to turn it into safety before the lights go out: a second (or third) crew on another
 * project, a few months of contract guards once the warning signs are up, and a small metals hedge for the barter that follows (GDS §10.10).
 * It decides nothing: the Next-steps card lists what each would cost and the player presses (or ignores) it. Pure (tested); the bots in the
 * balance harness press the same options.
 */
import { blueprintOf, isFinished } from './construction';
import { isHome } from './blueprints';
import { crewProblem, crewQuote, hoursLeft } from './crews';
import { orderCost, prices } from './economy';
import { GUARD_MONTH, guardCount, guardProblem, MAX_GUARDS } from './guards';
import { metalsValue } from './finance';
import { structureNeedLines } from './structureNeed';
import { committedCrewWages, livingReserve } from './spendGuard';
import type { GameState, OrderLine } from './state';

/** Cash beyond the living reserve, the wages already committed and the materials the open plans lack must pass this before anything is offered. */
export const IDLE_MIN = 60_000;
/** Cash always left untouched on top of the living reserve (the walls, ammunition and repairs after the hit are paid from it: a fortress run with less than this lost fights it had won). */
export const IDLE_FLOOR = 200_000;
/** A crew is offered only if its bill (wages and materials) is at most this share of the spare cash. */
export const IDLE_CREW_SHARE = 0.4;
/** Hours below which a project is not worth a crew of its own. */
export const IDLE_CREW_MIN_HOURS = 150;
/** Two crews at once, and one more for every this much spare cash (money buys build speed: no fixed cap on how many a rich family can run). */
export const IDLE_MORE_CREWS_PER = 150_000;
/** The metals hedge: this share of the spare cash, in $1,000s, at most the cap, once the warning signs are up. */
export const IDLE_METALS_SHARE = 0.2;
export const IDLE_METALS_MIN = 80_000;
export const IDLE_METALS_CAP = 100_000;
/** Guards are offered once the warning is up and the spare cash covers this many months of the first one. */
export const IDLE_GUARD_MONTHS = 6;
export const IDLE_TWO_GUARDS = 300_000;

export interface IdleCrew { id: string; name: string; weeks: number; usd: number; totalUsd: number; lines: OrderLine[] }
export interface IdleCash {
  /** Cash beyond what the reserve, the crews already hired and the open plans' materials claim. */
  spare: number;
  crew: IdleCrew | null;
  /** A metals hedge, dollars (0: not offered). */
  metals: number;
  /** Contract guards to post, and the first quarter's pay for them. */
  guards: { n: number; usd: number } | null;
}

const rank = (kind: string): number => (isHome(kind) ? 0 : /^(well|cistern|garden|field|greenhouse|root_cellar|solar|battery)/.test(kind) ? 1 : 2);

export function idleCash(s: GameState): IdleCash | null {
  const phase = s.disaster.phase;
  if (phase !== 'peace' && phase !== 'warning') return null;
  if (s.weekend?.mode === 'split') return null;   // the weekender has its own weekday-crew card (sim/weekendPlan.ts)
  let claimed = 0;
  for (const st of s.structures) if (!st.unplaced && !st.pre && !isFinished(st)) claimed += orderCost(structureNeedLines(s, st), prices(s));
  const spare = Math.round(s.money - Math.max(livingReserve(s.money), IDLE_FLOOR) - committedCrewWages(s) - claimed);
  if (spare < IDLE_MIN) return null;

  let crew: IdleCrew | null = null;
  if ((s.crews ?? []).length < 2 + Math.floor(spare / IDLE_MORE_CREWS_PER)) {
    const open = s.structures
      .filter(st => !st.unplaced && !st.pre && !isFinished(st) && !(s.crews ?? []).some(c => c.target === st.id) && hoursLeft(st) >= IDLE_CREW_MIN_HOURS && !crewProblem(s, st))
      // a crew cannot fell trees: with the logs for the walls still standing it would only wait on the payroll
      .filter(st => blueprintOf(st).stages.slice(st.supplied ? st.stage + 1 : st.stage).reduce((a, g) => a + (g.materials.logs ?? 0), 0) <= s.stock.logs)
      .sort((a, b) => rank(a.kind) - rank(b.kind) || hoursLeft(b) - hoursLeft(a));
    for (const st of open) {
      const q = crewQuote(st), lines = structureNeedLines(s, st), total = q.usd + orderCost(lines, prices(s));
      if (total > spare * IDLE_CREW_SHARE) continue;
      crew = { id: st.id, name: st.kind.replace(/_/g, ' '), weeks: q.weeks, usd: q.usd, totalUsd: total, lines };
      break;
    }
  }

  let metals = 0, guards: IdleCash['guards'] = null;
  if (phase === 'warning') {
    if (spare >= IDLE_METALS_MIN) {
      const want = Math.min(IDLE_METALS_CAP, Math.round(spare * IDLE_METALS_SHARE / 1000) * 1000);
      if (metalsValue(s) < want) metals = want - Math.round(metalsValue(s) / 1000) * 1000;
    }
    const room = MAX_GUARDS - guardCount(s);
    if (room > 0 && !guardProblem(s) && spare >= GUARD_MONTH * IDLE_GUARD_MONTHS) {
      const n = Math.min(room, spare >= IDLE_TWO_GUARDS ? 2 : 1);
      guards = { n, usd: n * GUARD_MONTH * 3 };
    }
  }
  if (!crew && metals <= 0 && !guards) return null;
  return { spare, crew, metals: Math.max(0, metals), guards };
}
