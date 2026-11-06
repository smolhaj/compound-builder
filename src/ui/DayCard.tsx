/** "The day it happened": the front page that stops the clock when the collapse hits (sim/dayCard.ts). Continue puts the clock back. */
import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { dayCard } from '../sim/dayCard';

const serif = 'Georgia, "Times New Roman", serif';

export function DayCard() {
  const open = useGameStore(s => s.dayCard);
  const hidden = useWorldStore(w => w.hudHidden);
  const ack = useGameStore(s => s.ackDayCard);
  const c = useMemo(() => (open === null ? null : dayCard(useGameStore.getState().game)), [open]);
  if (!c) return null;
  return (
    <div role="dialog" aria-label="The day it happened" style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,6,0.62)', alignItems: 'center', justifyContent: 'center', zIndex: 14, padding: 16, display: hidden ? 'none' : 'flex' }}>
      <div style={{ background: '#ece4d0', color: '#1d1b16', width: 560, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', borderRadius: 3, padding: '16px 26px 18px', boxShadow: '0 12px 50px rgba(0,0,0,0.65)', fontFamily: serif }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #1d1b16', paddingBottom: 6 }}>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>{c.masthead}</div>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>{c.date} · The day it happened</div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.15, margin: '12px 0 4px' }}>{c.headline}</div>
        <div style={{ fontSize: 15, fontStyle: 'italic', opacity: 0.8, marginBottom: 10 }}>{c.sub}</div>
        <div style={{ borderTop: '1px solid #1d1b16', paddingTop: 8, fontSize: 14, lineHeight: 1.45 }}>
          {c.lines.map((l, i) => <p key={i} style={{ margin: '0 0 6px' }}>{l}</p>)}
          {c.stand.map((l, i) => <p key={'s' + i} style={{ margin: '0 0 6px', fontWeight: 600 }}>{l}</p>)}
          <p style={{ margin: '4px 0 0', fontStyle: 'italic' }}>{c.look}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, fontFamily: 'system-ui, sans-serif' }}>
          <button autoFocus style={{ padding: '7px 18px', borderRadius: 6, border: 0, background: '#1d1b16', color: '#ece4d0', cursor: 'pointer', fontWeight: 600 }} onClick={ack}>Face it</button>
        </div>
      </div>
    </div>
  );
}
