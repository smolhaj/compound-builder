/**
 * The join card's "where will they sleep" choice (sim/joinerHome.ts): one line per option with its cost, time and catch; the detail is the tooltip.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { defaultStay, stayOptions } from '../sim/joinerHome';
import type { Encounter } from '../sim/encounters';
import { Hint } from './hud/common';

const row = (on: boolean, off: boolean): CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '4px 8px', margin: '2px 0', borderRadius: 6, border: on ? '1px solid #d8c9a0' : '1px solid transparent', background: on ? 'rgba(216,201,160,0.14)' : 'rgba(255,255,255,0.05)', color: '#eee', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.5 : 1, fontSize: 12 });

export function StayPicker({ e }: { e: Encounter }) {
  const game = useGameStore(s => s.game);
  const setStay = useGameStore(s => s.setStay);
  if (!e.people?.length) return null;
  const opts = stayOptions(game, e).filter(o => !(o.kind === 'own_build' && o.off && !o.line));
  if (opts.length <= 1) return null;
  const chosen = defaultStay(game, e);
  const rig = e.extras?.rig;
  return <div data-testid="stay" style={{ margin: '8px 0' }}>
    <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.6, marginBottom: 2 }}>Where will they stay</div>
    {opts.map(o => <button key={o.kind} data-testid={`stay-${o.kind}`} aria-pressed={o.kind === chosen} disabled={!!o.off} title={o.off ?? o.tip} style={row(o.kind === chosen, !!o.off)} onClick={() => setStay(o.kind, o.kind === 'rig' && !!e.placeRig)}>
      <span style={{ fontWeight: 600 }}>{o.kind === chosen ? '● ' : '○ '}{o.label}</span>
      <span style={{ opacity: 0.75 }}>{' — '}{o.off ?? o.line}</span>
    </button>)}
    {rig && chosen === 'rig' && <label style={{ display: 'block', fontSize: 11.5, opacity: 0.8, marginTop: 2 }} title="Otherwise it is parked on a gravel pad near the house for you. Picking the pad puts the RV in Build → Home & work until you place it.">
      <input type="checkbox" checked={!!e.placeRig} onChange={ev => setStay('rig', ev.target.checked)} /> I{'’'}ll pick the pad
    </label>}
    {chosen !== 'bed' && <Hint more={opts.find(o => o.kind === chosen)?.tip ?? ''}>{opts.find(o => o.kind === chosen)?.label}: what it means.</Hint>}
  </div>;
}
