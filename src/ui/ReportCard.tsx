import { useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { wipeSummary } from '../sim/wipe';
import { readSaveFile } from '../sim/save/saveFile';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';
import { reportCard } from '../sim/report';
import { roman } from '../sim/eras';
import { useWorldStore } from '../store/worldStore';

const serif = 'Georgia, "Times New Roman", serif';

/** The report card, as the front page of the valley paper (user: "Newspaper-style + specific lines"). */
export function ReportCard() {
  const g = useGameStore();
  const hidden = useWorldStore(w => w.hudHidden);   // "Hide panels" (H) clears the card too, to look at the map
  const e = g.game.ending;
  const file = useRef<HTMLInputElement>(null);
  const [loadMsg, setLoadMsg] = useState<string | null>(null);
  if (!e || e.continued) return null;
  const r = reportCard(g.game);
  const wipe = e.kind === 'wipe' ? wipeSummary(g.game) : null;
  /** Load a save file (the same reader as the Save menu's Import). */
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const res = readSaveFile(await f.text(), f.size);
    if (!res.ok) { setLoadMsg(res.message); return; }
    g.load(res.state); g.openSetup(false); void saveGame(AUTOSAVE, res.state);
  };
  // finishing a run unlocks the pulpy scenarios (GDS: zombies, invasion … as unlockables)
  try { localStorage.setItem('cb.unlocked', '1'); } catch { /* storage blocked: stays locked */ }
  const gradeColor = r.grade === 'A' ? '#2f6b2a' : r.grade === 'B' ? '#4f6b2a' : r.grade === 'C' ? '#7a6a20' : '#8a2f22';
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.7)', alignItems: 'center', justifyContent: 'center', zIndex: 12, padding: 16, display: hidden ? 'none' : 'flex' }}>
      <div style={{ background: '#f2ecdc', color: '#1d1b16', width: 620, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', borderRadius: 4, padding: '18px 26px 20px', boxShadow: '0 12px 50px rgba(0,0,0,0.6)', fontFamily: serif }}>
        <div style={{ textAlign: 'center', borderBottom: '3px double #1d1b16', paddingBottom: 6 }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>{r.masthead}</div>
          <div style={{ fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.7 }}>{g.game.lineage.era > 1 ? `Era ${roman(g.game.lineage.era)} · ` : ''}{r.date}</div>
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
        {wipe && <div data-testid="wipe-roll" style={{ borderTop: '1px solid #1d1b16', marginTop: 8, paddingTop: 8, fontSize: 14, lineHeight: 1.45 }}>
          <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase', opacity: 0.6 }}>Who we lost</div>
          {wipe.roll.length ? wipe.roll.map(x => <div key={x.id}>{x.text}</div>) : <div>Nobody is on record.</div>}
          <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{wipe.text}</p>
        </div>}
        <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #1d1b16', marginTop: 8, paddingTop: 8, fontFamily: 'system-ui, sans-serif', fontSize: 12 }}>
          {r.facts.map(([k, v]) => <div key={k} style={{ flex: 1 }}><div style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10.5 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 600 }}>{v}</div></div>)}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', marginTop: 14, fontFamily: 'system-ui, sans-serif' }}>
          <span style={{ flex: 1, fontSize: 12, opacity: 0.7 }}>{e.kind === 'bug_out' ? 'The place stands empty behind them, and the road ahead is theirs to find.' : e.kind === 'wipe'
            ? `The ${g.game.lineage.family} line ran ${Math.max(1, Math.floor(g.game.clock.t / 365))} ${Math.max(1, Math.floor(g.game.clock.t / 365)) === 1 ? 'year' : 'years'}. Dynasty score ${Math.round(g.game.lineage.points + r.score).toLocaleString('en-US')}.`
            : 'The family goes on. The world will turn again.'}</span>
          {e.kind !== 'wipe' && e.kind !== 'bug_out' && <button style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #1d1b16', background: 'transparent', cursor: 'pointer' }} onClick={() => g.playOn()}>Keep playing: the next era</button>}
          {e.kind === 'wipe' && <>
            <button style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #1d1b16', background: 'transparent', cursor: 'pointer' }} title="Open a save file" onClick={() => file.current?.click()}>Load a save</button>
            <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={ev => { void onFile(ev.target.files?.[0]); ev.target.value = ''; }} />
          </>}
          <button style={{ padding: '7px 16px', borderRadius: 6, border: 0, background: '#1d1b16', color: '#f2ecdc', cursor: 'pointer', fontWeight: 600 }} onClick={() => g.openSetup(true)}>New game</button>
        </div>
        {loadMsg && <div role="alert" style={{ marginTop: 6, textAlign: 'right', fontFamily: 'system-ui, sans-serif', fontSize: 12, color: '#8a2f22' }}>{loadMsg}</div>}
      </div>
    </div>
  );
}
