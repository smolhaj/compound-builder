/** The purchase toast (one line: what you got, what it cost, what is left) and the milestone card. */
import { useEffect } from 'react';
import { useFeelStore } from '../../store/feelStore';
import { toastText } from '../../sim/feedbackDiff';
import { TONE } from '../hud/style';
import { holdFactor } from './quiet';

export function PurchaseToast() {
  const t = useFeelStore(s => s.toast);
  if (!t) return null;
  return <div key={t.id} className="cb-rise" role="status" aria-live="polite" data-testid="purchase-toast" style={{ position: 'fixed', left: '50%', bottom: 64, transform: 'translateX(-50%)', zIndex: 24, background: 'rgba(24,28,20,0.94)', border: `1px solid ${TONE.good}`, borderRadius: 8, padding: '7px 14px', fontSize: 13, color: '#eee', maxWidth: 'min(640px, calc(100vw - 40px))', textAlign: 'center', pointerEvents: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}>{toastText(t)}</div>;
}

/** A small card for a real milestone. Not a modal: the game keeps running, and it goes by itself after a while. */
export function MilestoneCard() {
  const c = useFeelStore(s => s.cards[0]), more = useFeelStore(s => s.cards.length - 1), dismiss = useFeelStore(s => s.dismissCard);
  useEffect(() => {
    if (!c) return;
    const id = setTimeout(dismiss, 12000 * holdFactor());
    return () => clearTimeout(id);
  }, [c, dismiss]);
  if (!c) return null;
  return <div key={c.id} className="cb-rise" role="status" aria-live="polite" data-testid="milestone-card" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 124, zIndex: 26, width: 320, background: '#ece4d0', color: '#1d1b16', borderRadius: 4, padding: '10px 14px 10px', boxShadow: '0 8px 30px rgba(0,0,0,0.55)', border: '1px solid #8a7a52', fontFamily: 'Georgia, "Times New Roman", serif' }}>
    <div style={{ fontSize: 10.5, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.65, fontFamily: 'system-ui, sans-serif' }}>A milestone</div>
    <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.15, margin: '3px 0 4px' }}>{c.title}</div>
    <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>{c.line}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>
      <span style={{ color: '#5a4f30' }}>{c.points > 0 ? `+${c.points} family points` : 'Written in the Years tab'}</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{more > 0 && <span style={{ color: '#5a4f30' }}>{more} more</span>}<button autoFocus={false} style={{ padding: '3px 12px', border: 0, borderRadius: 5, background: '#1d1b16', color: '#ece4d0', cursor: 'pointer' }} onClick={dismiss}>OK</button></span>
    </div>
  </div>;
}
