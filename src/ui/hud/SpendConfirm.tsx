/**
 * A gentle "this spends your reserve" check for one-click purchases
 * (sim/spendGuard.ts). It never blocks: "Do it anyway" always works.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { spendCheck, usdShort } from '../../sim/spendGuard';
import type { OrderLine } from '../../sim/state';
import { btn, FS, TONE, usd } from './style';

/** `guard(cost, go)` runs `go` now, or asks first when `cost` would leave less than the living reserve. `node` is the question to render under the button. */
export function useSpendGuard(): { guard: (cost: number, go: () => void) => void; node: ReactNode; asking: boolean } {
  const money = useGameStore(s => s.game.money);
  const [ask, setAsk] = useState<{ cost: number; go: () => void } | null>(null);
  const guard = (cost: number, go: () => void) => { if (spendCheck(money, cost).below) setAsk({ cost, go }); else go(); };
  const c = ask ? spendCheck(money, ask.cost) : null;
  const node = ask && c ? <div style={{ border: `1px solid ${TONE.warn}`, borderRadius: 6, padding: '4px 6px', margin: '3px 0', fontSize: FS.small }}>
    <div>Leaves {usd(Math.max(0, c.after))}, under the {usd(c.reserve)} to live on.</div>
    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
      <button style={btn(true)} onClick={() => { const go = ask.go; setAsk(null); go(); }}>Do it anyway</button>
      <button style={btn()} onClick={() => setAsk(null)}>Keep a reserve</button>
    </div>
  </div> : null;
  return { guard, node, asking: !!ask };
}

/** "Order what the plans need (~$141k, leaves you $186k)", with the reserve question when it would dip under. */
export function PlansOrderButton({ lines, style, label = 'Order what the plans need' }: { lines: OrderLine[]; style?: CSSProperties; label?: string }) {
  const g = useGameStore();
  const { guard, node } = useSpendGuard();
  const game = g.game, cost = orderCost(lines, prices(game)), why = orderProblem(game, lines);
  return <>
    <button style={{ ...btn(true), width: '100%', ...style }} disabled={!!why} title={why ? 'Cannot order that now' : `Everything the plans still lack, in one order. Cash now ${usd(game.money)}.`} onClick={() => guard(cost, () => g.order(lines))}>
      {label} (~{usdShort(cost)}, leaves {usdShort(game.money - cost)})
    </button>
    {node}
  </>;
}
