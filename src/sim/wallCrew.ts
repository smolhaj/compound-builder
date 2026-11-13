/**
 * The wall ring and what money does for it (docs/DECISIONS.md "Crews build walls"). By default the family builds structures first and a
 * perimeter run last, so a stone ring of 3,800 hours sat at zero for hundreds of days (strategy playtest). Two Next-steps cards come from
 * here: "Wall first" (put the ring ahead of the other work: `setFocus`) and "Hire crews for the wall" (one tap orders the stone and hires
 * as many crews as the run has room for, side by side, to finish it in about a month). Money buys speed with no cap but the run's length
 * (one crew per 80 ft) and the hiring market (sim/crews.ts crewMarket). Pure (tested).
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { CREW_WEEK, crewMarket, crewProblem, crewQuote, crewRate, crewsFor, crewsOn, runHoursLeft } from './crews';
import { orderCost, prices } from './economy';
import { PERIMETER, UTILITY_LINES, runBlocked, runFinished, type PerimeterRun } from './perimeter';
import { runNeedLines } from './structureNeed';
import { paceOf, weeksFor } from './pace';
import type { GameState, OrderLine } from './state';

/** A run is worth a card at this many person-hours left or more (a short fence is just done). */
export const WALL_MIN_HOURS = 300;
/** The crews are sized to finish in about this many weeks. */
export const WALL_TARGET_WEEKS = 4;
/** As the house crew card: cash on top of the bill, and the share of the wages the account must cover now. */
export const WALL_SLACK = 6000;
export const WALL_SHARE = 0.5;

/** The wall ring: the unfinished run that stops people best with the most work left (never a utility, a walkway or a hedge still growing). */
export function wallRing(s: GameState): PerimeterRun | null {
  let best: PerimeterRun | null = null;
  for (const r of s.perimeter) {
    const d = PERIMETER[r.kind];
    if (runFinished(r) || UTILITY_LINES.includes(r.kind) || d.wallTop || d.walkway || d.span || d.bore || d.bridge || d.egressOnly || d.twoWay || d.hidden) continue;
    if (d.blocks.people < 0.5 || runHoursLeft(r) < WALL_MIN_HOURS) continue;
    if (!best || runHoursLeft(r) > runHoursLeft(best)) best = r;
  }
  return best;
}

export interface WallPlan {
  run: PerimeterRun;
  name: string;
  hours: number;
  /** Weeks the family alone needs for this run if it comes first (null: no one is free). */
  familyWeeks: number | null;
  /** Crews on it once the new ones are hired, and how many are still to hire. */
  crews: number;
  add: number;
  crewWeeks: number;
  wagesUsd: number;
  lines: OrderLine[];
  totalUsd: number;
  blocked: string | null;
}

export function wallPlan(s: GameState): WallPlan | null {
  const run = wallRing(s);
  if (!run) return null;
  const hours = runHoursLeft(run), add = crewsFor(s, run, WALL_TARGET_WEEKS), crews = crewsOn(s, run.id) + add, lines = runNeedLines(s, run);
  const q = crewQuote(run, crews, crewRate(s));
  return { run, name: PERIMETER[run.kind].name.toLowerCase(), hours, add, familyWeeks: weeksFor(hours, paceOf(s)), crews, crewWeeks: q.weeks, wagesUsd: q.usd, lines, totalUsd: q.usd + orderCost(lines, prices(s)), blocked: runBlocked(s, run) };
}

/** "Wall first": a home is up (the family never starves its shelter for a wall) and the ring is not first yet. */
export function wallFirstCard(s: GameState): WallPlan | null {
  if (!s.structures.some(st => isHome(st.kind) && isFinished(st))) return null;
  const p = wallPlan(s);
  if (!p || s.focus === p.run.id) return null;
  // nothing else is competing for the family's hands: the ring already gets them
  if (!s.structures.some(st => !isFinished(st) && !st.unplaced && !st.pre)) return null;
  return p;
}

/** "Hire crews for the wall": the cash covers the stone and half the wages, and some crews can still be had. */
export function wallCrewCard(s: GameState): WallPlan | null {
  const p = wallPlan(s);
  if (!p || !s.structures.some(st => isHome(st.kind) && isFinished(st))) return null;
  if (p.add < 1) return null;
  if (p.familyWeeks !== null && p.familyWeeks <= 2) return null;
  if (!crewMarket(s).open || crewProblem(s, p.run)) return null;
  if (s.money < orderCost(p.lines, prices(s)) + p.wagesUsd * WALL_SHARE + WALL_SLACK) return null;
  return p;
}

export { CREW_WEEK };
