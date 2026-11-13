/**
 * Roofs and winter. Two guards against a family wiped out by a roof, both pure sim.
 *
 * Before: a house that came with the land and still has an unrepaired roof will not take a snowload (a blizzard can
 * bring it down, sim/weatherThreats.ts). `winterRoofRisk` finds it early (about four months before the cold-region
 * blizzard season opens) so the Next steps can offer one tap: order the roofing and hire a crew.
 *
 * After: a home whose roof is gone with nobody under a finished roof is the one job that cannot wait. A day after it
 * came off, if no one has ordered the re-roof, the family does it on its own (order what is missing, hire the crew),
 * the same two steps the card offers, because a household that did not act was the wipe in the strategy playtest
 * (seed 5: a blizzard roof collapse on day 238, all dead by day 286 with $140k in the bank).
 */
import { blueprintOf, isFinished } from './construction';
import { isHome } from './blueprints';
import { crewProblem, CREW_RATE, crewQuote, hireCrew } from './crews';
import { fixBill, pendingFixes, type Fix } from './improvements';
import { sheltered } from './cold';
import { onOrder, orderCost, orderProblem, placeOrder, prices } from './economy';
import { MATERIALS, type MaterialId } from './materials';
import { daysToSeason, weatherOf } from './weatherThreats';
import type { GameState, OrderLine, Structure } from './state';

/** The warning opens this many days before the blizzard season (Dec 1 here), so there is time to order, deliver and build it. */
export const WINTER_ROOF_LEAD_DAYS = 120;
/** From here the card is urgent: a crew needs about a week once the roofing is in. */
export const WINTER_ROOF_URGENT_DAYS = 60;
/** The family hires the re-roof crew itself this many days after the roof came off. */
export const ROOF_GRACE_DAYS = 1;

export interface RoofRisk { st: Structure; fix: Fix; /** Days until the blizzard season (0: it is on). */ days: number; lines: OrderLine[]; crewUsd: number; totalUsd: number }

/** What a list of per-material needs still lacks, as buyable order lines (stock and what is already on order counted). */
function missing(s: GameState, need: Partial<Record<MaterialId, number>>): OrderLine[] {
  const pending = onOrder(s);
  return (Object.entries(need) as Array<[MaterialId, number]>)
    .map(([material, n]) => ({ material, qty: Math.ceil(n - s.stock[material] - (pending[material] ?? 0) - 1e-6) }))
    .filter(l => l.qty > 0 && MATERIALS[l.material].price !== null);
}

/** The roof stage's materials a bare home still lacks. */
export function reroofLines(s: GameState, bare: Structure): OrderLine[] {
  const need = blueprintOf(bare).stages[bare.stage]?.materials ?? {};
  const pending = onOrder(s);
  return (Object.entries(need) as Array<[MaterialId, number]>)
    .map(([material, n]) => ({ material, qty: Math.ceil(n - (bare.supplied ? n : s.stock[material]) - (pending[material] ?? 0) - 1e-6) }))
    .filter(l => l.qty > 0 && MATERIALS[l.material].price !== null);
}

/** A finished home with an unrepaired roof, in a region that gets blizzards, before the one roof a run that snow brings down has fallen. */
export function winterRoofRisk(s: GameState): RoofRisk | null {
  const days = daysToSeason(s, 'blizzard');
  if (days === null || days > WINTER_ROOF_LEAD_DAYS || weatherOf(s).snowCollapsed) return null;
  for (const st of s.structures) {
    if (!isHome(st.kind) || !isFinished(st) || st.roofLost) continue;
    const fix = pendingFixes(st).find(f => f.part === 'roof');
    if (!fix) continue;
    const lines = fix.supplied ? [] : missing(s, fixBill(fix));
    const crewUsd = Math.round((fix.hours - fix.done) * CREW_RATE / 100) * 100;
    return { st, fix, days, lines, crewUsd, totalUsd: crewUsd + orderCost(lines, prices(s)) };
  }
  return null;
}

/** Once a day: the family re-roofs a home that lost its roof if nobody else has (returns the log lines). */
export function roofEmergencyDay(s: GameState): string[] {
  const bare = s.structures.find(h => isHome(h.kind) && h.roofLost && !isFinished(h));
  if (!bare || sheltered(s) || (s.crews ?? []).some(c => c.target === bare.id)) return [];
  const since = (bare.roofLostAt ??= s.clock.t);
  if (s.clock.t - since < ROOF_GRACE_DAYS || crewProblem(s, bare)) return [];
  const lines = reroofLines(s, bare);
  if (lines.length && (orderProblem(s, lines) || s.money < orderCost(lines, prices(s)) + crewQuote(bare).usd * 0.25 || placeOrder(s, lines) === null)) return [];
  if (hireCrew(s, bare.id)) return [];
  return [`With the ${bare.kind.replace(/_/g, ' ')} roofless and nobody under a roof, the family ${lines.length ? 'ordered the roofing and ' : ''}hired a crew to put it back on.`];
}
