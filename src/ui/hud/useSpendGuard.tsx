/**
 * The reserve check as a hook (sim/spendGuard.ts): never blocks, "Do it anyway" always works.
 */
import { useState, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { committedCrewWages, spendCheckCommitted } from '../../sim/spendGuard';
import { btn, FS, TONE, usd } from './style';

/** `guard(cost, go)` runs `go` now, or asks first when `cost` would leave less than the living reserve. `node` is the question to render under the button. */
export function useSpendGuard(): { guard: (cost: number, go: () => void) => void; node: ReactNode; asking: boolean } {
  const money = useGameStore(s => s.game.money);
  const committed = useGameStore(s => committedCrewWages(s.game));
  const [ask, setAsk] = useState<{ cost: number; go: () => void } | null>(null);
  const guard = (cost: number, go: () => void) => { if (spendCheckCommitted(money, cost, committed).below) setAsk({ cost, go }); else go(); };
  const c = ask ? spendCheckCommitted(money, ask.cost, committed) : null;
  const node = ask && c ? <div style={{ border: `1px solid ${TONE.warn}`, borderRadius: 6, padding: '4px 6px', margin: '3px 0', fontSize: FS.small }}>
    <div>Leaves {usd(Math.max(0, c.after))}{c.committed ? ` once the ${usd(c.committed)} of crew wages still to pay is set aside` : ''}, under the {usd(c.reserve)} to live on.</div>
    <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
      <button style={btn(true)} onClick={() => { const go = ask.go; setAsk(null); go(); }}>Do it anyway</button>
      <button style={btn()} onClick={() => setAsk(null)}>Keep a reserve</button>
    </div>
  </div> : null;
  return { guard, node, asking: !!ask };
}
