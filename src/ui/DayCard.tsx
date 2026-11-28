/** "The day it happened": the front page that stops the clock when the collapse hits (sim/dayCard.ts). Continue puts the clock back. */
import { useMemo } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { dayCard } from '../sim/dayCard';
import { hitCard } from '../sim/felt/hitCard';
import type { DoStep } from '../sim/felt/hitCard';
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
  const runStep = (st: DoStep) => {
    ack();
    const g = useGameStore.getState(), a = st.act;
    if (!a) return;
    if ('dash' in a) { g.focusHud({ right: a.dash as 'family' }); return; }
    const act = a as SuggestionAct;
    if (act.type === 'stake' || act.type === 'tool') g.setTool(act.type === 'stake' ? act.kind : act.tool);
    else if (act.type === 'open') g.focusHud({ right: act.right, ...(act.supplies ? { supplies: act.supplies } : {}) });
    else if (act.type === 'shop') g.openShop(true, act.tab);
    else if (act.type === 'fx') { g.fxChoice(act.choice); }
    else if (act.type === 'select') { g.select(act.id); const st2 = g.game.structures.find(x => x.id === act.id); if (st2 && !st2.unplaced) useWorldStore.getState().frameCamera([st2]); }
  };
  const short = typeof window !== 'undefined' && window.innerHeight < 760;
  const fs = short ? 13 : 14;
  const h3 = { fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' as const, opacity: 0.7, margin: short ? '6px 0 2px' : '8px 0 3px', fontFamily: 'system-ui, sans-serif' };
  const stepBtn = { marginLeft: 6, padding: '1px 9px', borderRadius: 4, border: '1px solid #1d1b16', background: 'transparent', cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: 12 } as const;
  return (
    <div role="dialog" aria-label="The day it happened" style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,6,0.62)', alignItems: 'center', justifyContent: 'center', zIndex: 14, padding: short ? 8 : 16, display: hidden ? 'none' : 'flex' }}>
      <div data-testid="day-card" style={{ background: '#ece4d0', color: '#1d1b16', width: 600, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3, boxShadow: '0 12px 50px rgba(0,0,0,0.65)', fontFamily: serif, overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #1d1b16', padding: short ? '8px 22px 4px' : '12px 26px 6px', flex: '0 0 auto' }}>
          <div style={{ fontSize: short ? 20 : 24, fontWeight: 700, letterSpacing: 1, lineHeight: 1.1 }}>{c.masthead}</div>
          <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>{c.date} · The day it happened</div>
        </div>
        <div data-testid="day-card-body" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: short ? '2px 22px 6px' : '4px 26px 8px' }}>
          <div style={{ fontSize: short ? 22 : 25, fontWeight: 700, lineHeight: 1.15, margin: '8px 0 3px' }}>{c.headline}</div>
          <div style={{ fontSize: short ? 14 : 15, fontStyle: 'italic', opacity: 0.8, marginBottom: 6 }}>{c.sub}</div>
          <div style={{ borderTop: '1px solid #1d1b16', paddingTop: 6, fontSize: fs, lineHeight: 1.38 }}>
            {c.lines.map((l, i) => <p key={i} style={{ margin: '0 0 4px' }}>{l}</p>)}
            {c.stand.map((l, i) => <p key={'s' + i} style={{ margin: '0 0 4px', fontWeight: 600 }}>{l}</p>)}
            <p style={{ margin: '3px 0 0', fontStyle: 'italic' }}>{c.look}</p>
          </div>
          {h && (
            <div style={{ borderTop: '1px solid #1d1b16', marginTop: 6, fontSize: fs, lineHeight: 1.35 }} data-testid="what-changed">
              <div style={h3}>What changed</div>
              {h.changed.lost.length > 0 && <ul style={{ margin: '0 0 2px', paddingLeft: 18 }}>{h.changed.lost.map((l, i) => <li key={i}>{l}</li>)}</ul>}
              <ul style={{ margin: '0 0 2px', paddingLeft: 18 }}>{h.changed.market.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <div style={h3}>What still works for you</div>
              <ul style={{ margin: '0 0 2px', paddingLeft: 18 }}>{h.changed.stays.map((l, i) => <li key={i}>{l}</li>)}</ul>
              {h.first.length > 0 && <>
                <div style={h3}>Do first</div>
                <ol style={{ margin: 0, paddingLeft: 20 }} data-testid="do-first">
                  {h.first.map((st, i) => (
                    <li key={i} style={{ marginBottom: 3 }}>
                      <b>{st.label}</b>{st.why ? <span style={{ opacity: 0.8 }}>: {st.why}</span> : null}
                      {st.choices && st.choices.length > 0
                        ? st.choices.map((ch, j) => <button key={j} style={stepBtn} onClick={() => runStep({ ...st, act: ch.act })}>{ch.label}</button>)
                        : st.act && <button style={stepBtn} onClick={() => runStep(st)}>Do it</button>}
                    </li>
                  ))}
                </ol>
              </>}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: short ? '6px 22px 8px' : '8px 26px 12px', borderTop: '1px solid rgba(29,27,22,0.35)', background: '#ece4d0', flex: '0 0 auto', fontFamily: 'system-ui, sans-serif' }}>
          <button autoFocus style={{ padding: '7px 18px', borderRadius: 6, border: 0, background: '#1d1b16', color: '#ece4d0', cursor: 'pointer', fontWeight: 600 }} onClick={ack}>Face it</button>
        </div>
      </div>
    </div>
  );
}
