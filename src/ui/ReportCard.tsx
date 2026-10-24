import { useGameStore } from '../store/gameStore';
import { reportCard } from '../sim/report';

const serif = 'Georgia, "Times New Roman", serif';

/** The report card, as the front page of the valley paper (user: "Newspaper-style + specific lines"). */
export function ReportCard() {
  const g = useGameStore();
  const e = g.game.ending;
  if (!e || e.continued) return null;
  const r = reportCard(g.game);
  const gradeColor = r.grade === 'A' ? '#2f6b2a' : r.grade === 'B' ? '#4f6b2a' : r.grade === 'C' ? '#7a6a20' : '#8a2f22';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11, padding: 16 }}>
      <div style={{ background: '#f2ecdc', color: '#1d1b16', width: 620, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', borderRadius: 4, padding: '18px 26px 20px', boxShadow: '0 12px 50px rgba(0,0,0,0.6)', fontFamily: serif }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #1d1b16', paddingBottom: 6 }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>{r.masthead}</div>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>{r.date}</div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{r.headline}</div>
            <div style={{ fontSize: 15, fontStyle: 'italic', margin: '6px 0 10px', opacity: 0.85 }}>{r.sub}</div>
          </div>
          <div style={{ textAlign: 'center', border: `3px solid ${gradeColor}`, color: gradeColor, padding: '4px 12px', borderRadius: 4 }}>
            <div style={{ fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' }}>Grade</div>
            <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>{r.grade}</div>
          </div>
        </div>
        <div style={{ columnCount: 2, columnGap: 22, borderTop: '1px solid #1d1b16', paddingTop: 10, fontSize: 14, lineHeight: 1.45 }}>
          {r.lines.map((l, i) => <p key={i} style={{ margin: '0 0 7px', breakInside: 'avoid' }}>{l}</p>)}
        </div>
        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #1d1b16', marginTop: 8, paddingTop: 8, fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>
          {r.facts.map(([k, v]) => <div key={k} style={{ flex: 1 }}><div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 600 }}>{v}</div></div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, fontFamily: 'system-ui, sans-serif' }}>
          {e.kind !== 'wipe' && <button style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #1d1b16', background: 'transparent', cursor: 'pointer' }} onClick={() => g.playOn()}>Keep playing</button>}
          <button style={{ padding: '7px 16px', borderRadius: 6, border: 0, background: '#1d1b16', color: '#f2ecdc', cursor: 'pointer', fontWeight: 600 }} onClick={() => g.openSetup(true)}>New game</button>
        </div>
      </div>
    </div>
  );
}
