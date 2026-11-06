/** "Where we left off": shown after Continue. The clock stays paused until the player answers. */
import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { DIM, LINE, TONE, btn, usd } from '../hud/style';

export function RecapCard() {
  const r = useFeelStore(s => s.recap), speed = useFeelStore(s => s.recapSpeed);
  const close = () => useFeelStore.getState().setRecap(null);
  useEffect(() => {
    if (!r) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') useFeelStore.getState().setRecap(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [r]);
  if (!r) return null;
  const go = () => { useGameStore.getState().setSpeed(speed > 0 ? speed : 1); close(); };
  const row = (label: string, body: React.ReactNode) => <div style={{ display: 'flex', gap: 10, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}><div style={{ width: 92, flex: 'none', color: DIM }}>{label}</div><div style={{ flex: 1 }}>{body}</div></div>;
  return <div role="dialog" aria-label="Where we left off" data-testid="recap-card" style={{ position: 'fixed', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,8,6,0.45)', padding: 16 }}>
    <div style={{ background: 'rgba(24,26,21,0.97)', border: '1px solid #b9a36a', borderRadius: 10, padding: '14px 18px 14px', width: 520, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', fontSize: 13.5, lineHeight: 1.4, color: '#eee', boxShadow: '0 10px 40px rgba(0,0,0,0.6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, color: '#d8c9a0' }}>Where we left off</div>
        <button style={{ ...btn(), padding: '1px 8px' }} title="Close this and keep the clock paused" aria-label="Close and stay paused" onClick={close}>×</button>
      </div>
      <div style={{ color: DIM, fontSize: 12, margin: '2px 0 6px' }}>The clock is paused until you decide.</div>
      {row('Date', <span>{r.date} <span style={{ color: DIM }}>(day {r.dayNumber})</span></span>)}
      {row('Cash', <b style={{ color: '#cfe0a8' }}>{usd(r.money)}</b>)}
      {row('Family', <span style={{ color: TONE[r.familyTone] }}>{r.family}</span>)}
      {row('In progress', r.inProgress.length ? <div>{r.inProgress.map(x => <div key={x}>{x}</div>)}</div> : <span style={{ color: DIM }}>Nothing under way</span>)}
      {row('Next steps', r.nextSteps.length ? <ol style={{ margin: 0, paddingLeft: 18 }}>{r.nextSteps.map(x => <li key={x.title}><b>{x.title}</b>{x.why ? <span style={{ color: DIM }}>: {x.why}</span> : null}</li>)}</ol> : <span style={{ color: DIM }}>Nothing pressing</span>)}
      {row('Coming up', r.threat ? <span style={{ color: TONE[r.threat.tone] }}>{r.threat.text}</span> : <span style={{ color: DIM }}>No threat on the clock</span>)}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button style={btn()} onClick={close}>Stay paused</button>
        <button autoFocus style={{ ...btn(true), fontWeight: 600, padding: '5px 16px' }} onClick={go}>Keep going</button>
      </div>
    </div>
  </div>;
}
