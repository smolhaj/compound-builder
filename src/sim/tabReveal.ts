/**
 * First-hour HUD: which right-hand tabs are on show (docs/DECISIONS.md, "Feel pass"). A view default only: nothing is locked, no
 * state is saved with the game, and "Show all tabs" brings every tab back. A tab is revealed when the game gives a reason to look at
 * it, and once revealed it stays (the set only grows). Pure.
 */
import { buyProblem, priceOf } from './land';
import { dayIndex, type GameState } from './state';
import { isFinished } from './construction';
import { UTILITY_LINES } from './perimeter';

export type RightTab = 'family' | 'supplies' | 'utilities' | 'land' | 'defense' | 'outside' | 'chronicle';
export const RIGHT_TABS: readonly RightTab[] = ['family', 'supplies', 'utilities', 'land', 'defense', 'outside', 'chronicle'];
/** Always on show. */
export const BASE_TABS: readonly RightTab[] = ['family'];

/** Days in a season: the Years tab appears once the first one has gone by. */
export const SEASON_DAYS = 91;
/** The "first hour": how long (game days) the Long-term goals section starts open. A new game's first hour of play is about this long at normal speed. */
export const FIRST_HOUR_DAYS = 60;
/** Water and power kit pieces: building one means Utilities has something to show. */
const UTILITY_KINDS = /well|pump|solar|wind|hydro|battery|generator|cistern|tank|inverter|septic|water|power|pole/;

/** Within the first hour of a game (Long-term goals start open). */
export const inFirstHour = (s: GameState): boolean => dayIndex(s.clock.t) < FIRST_HOUR_DAYS;

/** Why each tab is relevant right now (a reason string for tests and the "new" dot tooltip), or null. */
export function tabReason(s: GameState, tab: RightTab): string | null {
  const day = dayIndex(s.clock.t);
  const d = s.disaster;
  const warned = !!d.kind && s.clock.t >= d.warnAt;
  const hit = !!d.kind && s.clock.t >= d.hitAt;
  switch (tab) {
    case 'family': return 'always';
    case 'supplies':
      if (s.orders.length > 0) return 'You placed an order';
      if (s.structures.some(x => !x.pre && isFinished(x) && /garden|field|pantry|cellar|barn|shed|coop/.test(x.kind))) return 'You have stores to keep';
      if (warned) return 'Trouble is coming: check the food';
      return day >= 3 ? 'The family is eating from the pantry' : null;
    case 'utilities':
      if (s.utilities.report.shortL > 0 || s.utilities.report.shortKwh > 0.5 || s.utilities.hauling) return 'Water or power is short';
      if (s.structures.some(x => !x.pre && UTILITY_KINDS.test(x.kind))) return 'You staked water or power';
      return null;
    case 'land':
      // affordable with room to spare: a parcel that would take more than half the checking account is not "affordable" yet
      return s.land.parcels.some(p => buyProblem(s, p) === null && s.money >= priceOf(s, p) * 2) ? 'You can afford land' : null;
    case 'defense':
      if (warned) return 'Warning signs have started';
      if (s.gate.pending || (s.gate.waves?.n ?? 0) > 0) return 'Visitors at the gate';
      if (s.perimeter.some(r => !UTILITY_LINES.includes(r.kind))) return 'You laid out a wall or fence';   // (pipes and cables come with the buildings)
      if ((s.guards?.staff.length ?? 0) > 0) return 'You hired a guard';
      if (s.structures.some(x => !x.pre && /tower|gate|pod|bunker|bastion|pillbox/.test(x.kind))) return 'You staked a defense';
      return null;
    case 'outside':
      if (hit) return 'The collapse has started';
      if (warned) return 'Warning signs have started';
      return day >= 14 ? 'Time to look beyond the fence' : null;
    case 'chronicle':
      if (s.lineage.chronicle.some(c => c.kind === 'birth' || c.kind === 'death')) return 'The first chapter is written';
      return day >= SEASON_DAYS ? 'A season has passed' : null;
  }
}

/** Every tab the game currently gives a reason to show. */
export function relevantTabs(s: GameState): Set<RightTab> {
  return new Set(RIGHT_TABS.filter(t => tabReason(s, t) !== null));
}

/** The revealed set after this state: what was revealed stays, what is relevant now joins, `extra` (a link that asked for a tab) joins too. */
export function revealTabs(prev: ReadonlySet<RightTab>, s: GameState, extra: readonly RightTab[] = []): Set<RightTab> {
  return new Set<RightTab>([...BASE_TABS, ...prev, ...relevantTabs(s), ...extra]);
}

/** The tabs to draw, in the usual order. */
export function visibleTabs(revealed: ReadonlySet<RightTab>, showAll: boolean): RightTab[] {
  return RIGHT_TABS.filter(t => showAll || revealed.has(t));
}
