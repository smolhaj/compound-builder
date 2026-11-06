/**
 * A gentle "this spends your reserve" check for one-click purchases
 * (sim/spendGuard.ts). It never blocks: "Do it anyway" always works.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { useSpendGuard } from './useSpendGuard';
import { runOver } from '../../sim/wipe';
import { usdShort } from '../../sim/spendGuard';
import type { OrderLine } from '../../sim/state';
import { btn, usd } from './style';

/** "Order what the plans need (~$141k, leaves you $186k)", with the reserve question when it would dip under. */
export function PlansOrderButton({ lines, style, label = 'Order what the plans need' }: { lines: OrderLine[]; style?: CSSProperties; label?: string }) {
  const g = useGameStore();
  const { guard, node } = useSpendGuard();
  const game = g.game, cost = orderCost(lines, prices(game)), why = orderProblem(game, lines);
  if (runOver(game)) return null;   // nothing to order once the family is gone
  return <>
    <button style={{ ...btn(true), width: '100%', ...style }} disabled={!!why} title={why ? 'Cannot order that now' : `Everything the plans still lack, in one order. Cash now ${usd(game.money)}.`} onClick={() => guard(cost, () => g.order(lines))}>
      {label} (~{usdShort(cost)}, leaves {usdShort(game.money - cost)})
    </button>
    {node}
  </>;
}
