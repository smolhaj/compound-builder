/**
 * What one building still lacks from the shop: the buyable materials for its unbuilt stages, less the stockpile and what is already on order.
 * The "order + hire" one-tap cards (sim/crewNudge.ts, sim/idleCash.ts) use it so a crew never starts by standing idle on a delivery. Pure.
 */
import { blueprintOf } from './construction';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from './materials';
import { onOrder } from './economy';
import { runBill, runFinished, wallLength, type PerimeterRun } from './perimeter';
import type { GameState, OrderLine, Structure } from './state';

export function structureNeed(s: GameState, st: Structure): Partial<Record<MaterialId, number>> {
  const need: Partial<Record<MaterialId, number>> = {};
  blueprintOf(st).stages.forEach((sg, i) => {
    if (i < st.stage || (i === st.stage && st.supplied)) return;
    for (const [k, n] of Object.entries(sg.materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
  });
  const pending = onOrder(s), out: Partial<Record<MaterialId, number>> = {};
  for (const k of MATERIAL_IDS) {
    const n = Math.ceil((need[k] ?? 0) - s.stock[k] - (pending[k] ?? 0) - 1e-9);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** The buyable part of `structureNeed` as order lines (own logs and spoil are not for sale). */
export function structureNeedLines(s: GameState, st: Structure): OrderLine[] {
  const need = structureNeed(s, st);
  return MATERIAL_IDS.filter(k => (need[k] ?? 0) > 0 && MATERIALS[k].price !== null).map(k => ({ material: k, qty: need[k]! }));
}

/** The buyable materials a perimeter run still lacks (none once the run's materials were taken from the stockpile), as order lines. */
export function runNeedLines(s: GameState, r: PerimeterRun): OrderLine[] {
  if (r.supplied || runFinished(r)) return [];
  const bill = runBill(r.kind, wallLength(r)), pending = onOrder(s);
  const out: OrderLine[] = [];
  for (const k of MATERIAL_IDS) {
    const n = Math.ceil((bill[k] ?? 0) - s.stock[k] - (pending[k] ?? 0) - 1e-9);
    if (n > 0 && MATERIALS[k].price !== null) out.push({ material: k, qty: n });
  }
  return out;
}
