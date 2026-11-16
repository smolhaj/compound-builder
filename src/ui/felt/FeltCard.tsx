/**
 * FL4: the felt decision card, in the gate card's style. The overlay queue shows it only while `fx.felt.cards.pending` is set; the clock
 * is held until it is answered. Each option shows its cost chips, the odds in the gate card's words, and why it is unavailable if it is.
 * The box scrolls inside the viewport rather than clipping (1100 x 700 and smaller).
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useFeltStore } from '../../store/feltStore';
import { costChips, inTen, optionProblem, pendingCard } from '../../sim/felt/cards';
import { MATERIALS, type MaterialId } from '../../sim/materials';

const box: CSSProperties = {
  position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 520, maxWidth: 'calc(100vw - 32px)',
  maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box', background: 'rgba(24,22,18,0.97)', color: '#eee',
  borderRadius: 12, padding: '16px 18px', zIndex: 12, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', fontSize: 13.5,
};
const row = (on: boolean): CSSProperties => ({ padding: '8px 12px', borderRadius: 7, border: 0, cursor: on ? 'pointer' : 'not-allowed', background: on ? '#3a3d34' : '#2a2b26', color: on ? '#eee' : '#8a8a80', textAlign: 'left', fontSize: 13, display: 'block', width: '100%' });
const chip: CSSProperties = { display: 'inline-block', padding: '1px 7px', borderRadius: 9, background: '#5a3a30', color: '#f4c8b8', fontSize: 11.5, marginRight: 5, marginTop: 4 };

export function FeltCard() {
  const game = useGameStore(s => s.game);
  const answer = useFeltStore(s => s.answer);
  const card = pendingCard(game);
  if (!card) return null;
  const name = (id: string) => MATERIALS[id as MaterialId]?.name.toLowerCase() ?? id;
  return (
    <div style={box} role="dialog" aria-label={card.title(game)}>
      <div style={{ height: 4, background: '#e8c880', borderRadius: 2, marginBottom: 10 }} />
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{card.title(game)}</div>
      <div style={{ marginBottom: 10, opacity: 0.9 }}>{card.text(game)}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {card.options.map(o => {
          const why = optionProblem(game, o), chips = costChips(o.cost(game), name), od = o.odds?.(game);
          return (
            <button key={o.id} style={row(!why)} disabled={!!why} title={why ?? undefined} onClick={() => answer(card.id, o.id)}>
              <div style={{ fontWeight: 600 }}>{o.label}</div>
              <div style={{ fontSize: 11.5, opacity: 0.8 }}>{o.hint(game)}</div>
              {chips.length > 0 && <div>{chips.map(c => <span key={c} style={chip}>{c}</span>)}</div>}
              {od && <div style={{ fontSize: 11.5, marginTop: 3, color: why ? '#8a8a80' : '#cfd8a8' }}>{inTen(od.p)}: {od.good} Otherwise: {od.bad}</div>}
              {why && <div style={{ fontSize: 11.5, marginTop: 3, color: '#e0a090' }}>{why}</div>}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8 }}>The clock waits for you.</div>
    </div>
  );
}
