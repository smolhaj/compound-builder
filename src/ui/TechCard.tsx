/** A decision card for the tech-and-money disasters (sim/techCards.ts) and the signature first-week goals. Quiet: it never pauses the game. */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { answerTechCard, lastOutcome, openTechCard, signatureGoals } from '../sim/techCards';

const panel = { position: 'fixed', left: 12, bottom: 64, width: 330, maxWidth: 'calc(100vw - 24px)', zIndex: 9, background: 'rgba(24,22,18,0.94)', color: '#ece4d0', border: '1px solid #6b6048', borderRadius: 6, padding: '10px 12px', fontFamily: 'system-ui, sans-serif', fontSize: 12.5, lineHeight: 1.4, boxShadow: '0 6px 24px rgba(0,0,0,0.5)' } as const;
const opt = (off: boolean) => ({ display: 'block', width: '100%', textAlign: 'left', margin: '5px 0 0', padding: '6px 8px', borderRadius: 4, border: '1px solid #8a7c5c', background: off ? '#2a2720' : '#3a3426', color: off ? '#8a8472' : '#f3ecd8', cursor: off ? 'not-allowed' : 'pointer' }) as const;

export function TechCard() {
  const g = useGameStore();
  const [showGoals, setShowGoals] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const game = g.game;
  if (!game.disaster.kind || game.disaster.phase === 'peace') return null;
  const card = openTechCard(game), last = lastOutcome(game), goals = game.disaster.mode === 'surprise' && game.clock.t < game.disaster.hitAt ? [] : signatureGoals(game);
  const day = Math.floor(game.clock.t - game.disaster.hitAt);
  const showLast = !card && !!last && dismissed !== last.card;
  if (!card && !goals.length && !showLast) return null;
  const answer = (id: string) => { const w = g.money(d => { const o = answerTechCard(d, id); return typeof o === 'string' ? o : null; }); if (w) alert(w); };
  return (
    <div role="region" aria-label="Decision" style={panel}>
      {card && <>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{card.title}</div>
        <div style={{ opacity: 0.9 }}>{card.text}</div>
        {card.options.map(o => (
          <button key={o.id} style={opt(!!o.locked)} disabled={!!o.locked} title={o.locked ?? o.hint} onClick={() => answer(o.id)}>
            <div style={{ fontWeight: 600 }}>{o.label}{o.cost ? ` ($${o.cost.toLocaleString('en-US')})` : ''}</div>
            <div style={{ fontSize: 11.5, opacity: 0.8 }}>{o.locked ?? o.hint}</div>
          </button>
        ))}
      </>}
      {showLast && last && <div style={{ marginBottom: 4, cursor: 'pointer' }} title="Click to dismiss" onClick={() => setDismissed(last.card)}><b>{last.title}.</b> {last.text}</div>}
      {goals.length > 0 && <>
        <button style={{ background: 'none', border: 0, color: '#c8b98a', cursor: 'pointer', padding: '4px 0 0', fontSize: 11.5 }} onClick={() => setShowGoals(v => !v)}>
          {showGoals ? 'Hide' : 'First-week goals'} ({goals.filter(x => x.met).length}/{goals.length})
        </button>
        {showGoals && <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
          {goals.map(x => <li key={x.id} style={{ opacity: x.met ? 0.55 : 1, textDecoration: x.met ? 'line-through' : 'none' }}>{x.text}{!x.met && x.by < day ? ' (overdue)' : ''}</li>)}
        </ul>}
      </>}
    </div>
  );
}
