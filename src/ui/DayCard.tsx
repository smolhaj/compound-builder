/** "The day it happened": the front page that stops the clock when the collapse hits (sim/dayCard.ts). Continue puts the clock back. */
import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { dayCard } from '../sim/dayCard';
import { hitCard } from '../sim/felt/hitCard';
import type { FirstStep } from '../sim/felt/types';
import type { SuggestionAct } from '../sim/guidance';

const serif = 'Georgia, "Times New Roman", serif';

export function DayCard() {
  const open = useGameStore(s => s.dayCard);
  const hidden = useWorldStore(w => w.hudHidden);
  const ack = useGameStore(s => s.ackDayCard);
  const c = useMemo(() => (open === null ? null : dayCard(useGameStore.getState().game)), [open]);
  const h = useMemo(() => (open === null ? null : hitCard(useGameStore.getState().game)), [open]);
  if (!c) return null;
  /** Close the card and run the step (the same one-click acts the build menu runs). */
  const runStep = (st: FirstStep) => {
    ack();
    const g = useGameStore.getState(), a = st.act;
    if (!a) return;
    if ('dash' in a) { g.focusHud({ right: a.dash as 'family' }); return; }
    const act = a as SuggestionAct;
    if (act.type === 'stake' || act.type === 'tool') g.setTool(act.type === 'stake' ? act.kind : act.tool);
    else if (act.type === 'open') g.focusHud({ right: act.right, ...(act.supplies ? { supplies: act.supplies } : {}) });
    else if (act.type === 'shop') g.openShop(true, act.tab);
    else if (act.type === 'select') { g.select(act.id); const st2 = g.game.structures.find(x => x.id === act.id); if (st2 && !st2.unplaced) useWorldStore.getState().frameCamera([st2]); }
  };
  const h3 = { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' as const, opacity: 0.7, margin: '10px 0 4px', fontFamily: 'system-ui, sans-serif' };
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
        {h && (
          <div style={{ borderTop: '1px solid #1d1b16', marginTop: 8, fontSize: 14, lineHeight: 1.4 }} data-testid="what-changed">
            <div style={h3}>What changed</div>
            {h.changed.lost.length > 0 && <ul style={{ margin: '0 0 4px', paddingLeft: 18 }}>{h.changed.lost.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            <ul style={{ margin: '0 0 4px', paddingLeft: 18 }}>{h.changed.market.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <div style={h3}>What still works for you</div>
            <ul style={{ margin: '0 0 4px', paddingLeft: 18 }}>{h.changed.stays.map((l, i) => <li key={i}>{l}</li>)}</ul>
            {h.first.length > 0 && <>
              <div style={h3}>Do first</div>
              <ol style={{ margin: 0, paddingLeft: 20 }} data-testid="do-first">
                {h.first.map((st, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <b>{st.label}</b>{st.why ? <span style={{ opacity: 0.8 }}>: {st.why}</span> : null}
                    {st.act && <button style={{ marginLeft: 8, padding: '1px 9px', borderRadius: 4, border: '1px solid #1d1b16', background: 'transparent', cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: 12 }} onClick={() => runStep(st)}>Do it</button>}
                  </li>
                ))}
              </ol>
            </>}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, fontFamily: 'system-ui, sans-serif' }}>
          <button autoFocus style={{ padding: '7px 18px', borderRadius: 6, border: 0, background: '#1d1b16', color: '#ece4d0', cursor: 'pointer', fontWeight: 600 }} onClick={ack}>Face it</button>
        </div>
      </div>
    </div>
  );
}
