/**
 * Trading for a tool at the crossroads market (sim/market.ts) once the stores are shut: a used tool is
 * worth its old shelf price, less for the wear, and dearer every month the stores stay closed. The
 * family pays in trade goods from its bag (salt, coffee, batteries, tobacco, liquor). Pure.
 */
import { BAG_BASE, BAG_GOODS, bagOf, type BagGood } from './tradeGoods';
import { marketOpen, ramp, BAG_SCARCITY } from './market';
import { addTool, SWAP_KINDS, TOOLS, usedValue, type ToolKind } from './tools';
import { log } from './economy';
import type { GameState } from './state';

export { SWAP_KINDS };

/** Dollars (2025) a used tool costs at the market: scarcer as time passes since the hit. */
export function swapPrice(s: GameState, kind: ToolKind): number {
  const k = ramp(Math.max(0, s.clock.t - s.disaster.hitAt));
  return Math.round(usedValue(kind, 0.7) * (1 + 1.5 * k));
}

/** How many of a trade good that takes (what a unit of it fetches now). */
export function swapQty(s: GameState, kind: ToolKind, good: BagGood): number {
  const k = ramp(Math.max(0, s.clock.t - s.disaster.hitAt));
  return Math.max(1, Math.ceil(swapPrice(s, kind) / (BAG_BASE[good].price * (1 + BAG_SCARCITY[good] * k))));
}

/** Trade goods for a used tool. Returns why not, or null. */
export function tradeForTool(s: GameState, kind: ToolKind, good: BagGood): string | null {
  if (TOOLS[kind].crude) return 'Nobody sells that.';
  if (!marketOpen(s)) return 'The crossroads market is not open.';
  const bag = bagOf(s), q = swapQty(s, kind, good);
  if ((bag[good] ?? 0) < q) return `Needs ${q} ${BAG_BASE[good].unit} (you have ${Math.floor(bag[good] ?? 0)}).`;
  bag[good] -= q;
  addTool(s, kind, 0.5, 0.5);
  log(s, `Traded ${q} ${BAG_BASE[good].unit} for a used ${TOOLS[kind].name.toLowerCase()}.`);
  return null;
}

export { BAG_GOODS };
