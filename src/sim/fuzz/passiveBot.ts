/**
 * A "reasonable passive player" for the stall fuzz (src/sim/stallFuzz.test.ts): it only presses what the on-screen cards offer.
 * Place all (Starter compound), "Order what the plans need", the stuck-card order button, the "Hire a crew" card. Pure sim, no browser.
 */
import { planProblem, planStructure } from '../construction';
import { applyForPermit } from '../paperwork';
import { permitAffordable } from '../spendGuard';
import { stampHighGround } from '../towers';
import { layPropertyWall } from '../propertyWall';
import { planStarter, starterWanted } from '../starterCompound';
import { plansNeedLines, suggestions } from '../guidance';
import { placeOrder, orderProblem } from '../economy';
import { stuckProject } from '../stalls';
import { crewNudge } from '../crewNudge';
import { hireCrew } from '../crews';
import { hookupProblem, orderHookup } from '../improvements';
import { siteLot } from '../lotListing';
import type { SiteQuery } from '../../game/buildkit/kit';
import type { GameState } from '../state';

const queryOf = (g: GameState): SiteQuery => {
  const h = g.site.home, lot = siteLot(g.site);
  return { height: lot ? lot.field.h : () => 0, owned: (x, z) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1, water: () => false };
};
const geoOf = (g: GameState) => { const h = g.site.home; return { center: [(h.x0 + h.x1) / 2, (h.z0 + h.z1) / 2] as [number, number], drive: [[h.x1, (h.z0 + h.z1) / 2], [(h.x0 + h.x1) / 2 + 3, (h.z0 + h.z1) / 2]] as Array<[number, number]> }; };

export interface BotLog { placed: number; orders: number; crews: number }

/** "Place all": the same loop as the store's `layStarter`. */
export function placeAll(g: GameState): number {
  const plan = planStarter(g, { query: queryOf(g), geo: geoOf(g) });
  if (plan.problem) return 0;
  let n = 0;
  for (const p of plan.pieces.filter(x => !x.later)) {
    if (planProblem(g, p.kind) || !permitAffordable(g, p.kind).ok) continue;
    const st = planStructure(g, p.kind, p.x, p.z, p.rot);
    stampHighGround(st);
    applyForPermit(g, st);
    n++;
  }
  if (plan.yard && !plan.yard.later && layPropertyWall(g, plan.yard.plan, geoOf(g)) > 0) n++;
  return n;
}

/** One visit to the screen: press every card button that is on offer. Mutates `g`. */
export function botTurn(g: GameState, log: BotLog): void {
  if (starterWanted(g) && log.placed === 0) log.placed += placeAll(g);
  const need = plansNeedLines(g);
  if (need.length && !orderProblem(g, need) && placeOrder(g, need) !== null) log.orders++;
  const stuck = stuckProject(g);
  if (stuck && placeOrder(g, stuck.lines) !== null) log.orders++;
  const nudge = crewNudge(g);
  if (nudge && !hireCrew(g, nudge.id)) log.crews++;
  // the Next-steps cards (the first button of a card says what it does): the weekender's order and crew cards included
  for (const sg of suggestions(g, 6)) {
    const act = sg.acts?.[0]?.act;
    if (!act) continue;
    if (act.type === 'order' && !orderProblem(g, act.lines) && placeOrder(g, act.lines) !== null) log.orders++;
    else if (act.type === 'crew' && !hireCrew(g, act.id)) log.crews++;
    else if (act.type === 'hookup' && hookupProblem(g, act.what) === null && orderHookup(g, act.what) === null) log.orders++;
  }
}
