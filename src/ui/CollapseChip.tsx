/** The collapse clock on the HUD: a chip in the top bar, next to the siege-wave chip (sim/collapseChip.ts). */
import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { collapseChip } from '../sim/collapseChip';
import { dayIndex } from '../sim/state';
import { DIM, TONE } from './hud/style';

export function CollapseChip() {
  const game = useGameStore(s => s.game);
  const day = dayIndex(game.clock.t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useMemo(() => collapseChip(game), [day, game.disaster.phase, game.disaster.hitAt]);
  if (!c) return null;
  const col = c.tone === 'dim' ? DIM : TONE[c.tone];
  return <span title={c.title} aria-label={`Collapse clock: ${c.chip}`}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.25)', border: `1px solid ${col}`, borderRadius: 6, padding: '2px 8px', color: col, fontSize: 13 }}>
    <b style={{ fontWeight: 600 }}>{c.chip}</b>
    {c.tone !== 'dim' && <span aria-hidden style={{ width: 34, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.round(c.w * 100)}%`, height: '100%', background: col }} /></span>}
  </span>;
}
