import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { newGame } from '../sim/state';
import { generateFamily, fullName } from '../sim/family';
import { DISASTERS, type Difficulty, type DisasterKind, type Mode, type PeaceLength } from '../sim/disaster';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';

const MODES: Array<[Mode, string, string]> = [
  ['surprise', 'Surprise', 'Three to six years of peacetime, and you don\'t know what is coming. Watch the news, the prices, the neighbors. A good build hedges.'],
  ['scenario', 'Scenario', 'Pick the disaster and how long you have to get ready.'],
  ['sandbox', 'Free build', 'Nothing happens until you say so. Build at your own pace, then trigger any disaster from the right-hand panel.'],
];
const DIFFS: Array<[Difficulty, string, string]> = [['cozy', 'Cozy', 'Long warning, gentle raids, nobody dies for good'], ['standard', 'Standard', 'The intended game'], ['hardcore', 'Hardcore', 'Little warning, harsh raids, permadeath']];
const PEACE: Array<[Exclude<PeaceLength, 'random'>, string]> = [['short', '1 year'], ['medium', '3 years'], ['long', '5 years']];

const card = (on: boolean): CSSProperties => ({ flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: on ? '2px solid #d8c9a0' : '2px solid transparent', background: on ? 'rgba(216,201,160,0.16)' : 'rgba(255,255,255,0.05)', color: '#eee', cursor: 'pointer' });

/** New game: mode, the disaster (Scenario), how long peacetime lasts, day jobs. */
export function SetupScreen() {
  const g = useGameStore();
  const seed = useWorldStore(s => s.seed);
  const [mode, setMode] = useState<Mode>('surprise');
  const [kind, setKind] = useState<DisasterKind>('grid_down');
  const [peace, setPeace] = useState<Exclude<PeaceLength, 'random'>>('medium');
  const [jobs, setJobs] = useState(true);
  const [diff, setDiff] = useState<Difficulty>('standard');
  const family = generateFamily(seed);
  const start = () => {
    const game = newGame(seed, 105, 2027, { mode, peace: mode === 'scenario' ? peace : 'random', kind: mode === 'scenario' ? kind : null, dayJobs: jobs, difficulty: diff, grid: true });
    g.load(game);
    g.openSetup(false);
    void saveGame(AUTOSAVE, game);
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: 16 }}>
      <div style={{ background: 'rgba(24,26,21,0.97)', color: '#eee', borderRadius: 12, padding: '20px 24px', width: 640, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', fontSize: 13.5 }}>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: 0.3 }}>Compound Builder</div>
        <div style={{ opacity: 0.7, marginBottom: 14 }}>Build the place you'd want when everything falls apart. Then find out if you were right.</div>

        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.6, marginBottom: 6 }}>The family</div>
        <div style={{ marginBottom: 14 }}>
          {family.map(p => <div key={p.id}>{fullName(p)}, {p.age}{p.job ? <span style={{ opacity: 0.7 }}> · {p.job.title}, ${p.job.wage}/day</span> : <span style={{ opacity: 0.7 }}> · kid</span>}</div>)}
        </div>

        <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.6, marginBottom: 6 }}>How it plays</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {MODES.map(([m, name, blurb]) => (
            <button key={m} style={card(mode === m)} onClick={() => setMode(m)}>
              <div style={{ fontWeight: 600, marginBottom: 3 }}>{name}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{blurb}</div>
            </button>
          ))}
        </div>

        {mode === 'scenario' && <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ opacity: 0.7 }}>Disaster</span>
            <select value={kind} onChange={e => setKind(e.target.value as DisasterKind)}>
              {(Object.keys(DISASTERS) as DisasterKind[]).filter(k => k !== 'lawless').map(k => <option key={k} value={k}>{DISASTERS[k]!.name}</option>)}
            </select>
            <span style={{ opacity: 0.7 }}>Peacetime</span>
            {PEACE.map(([p, label]) => <button key={p} style={{ ...card(peace === p), flex: 'none', padding: '4px 10px' }} onClick={() => setPeace(p)}>{label}</button>)}
          </div>
        </>}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0 8px', flexWrap: 'wrap' }}>
          <span style={{ opacity: 0.7 }}>Difficulty</span>
          {DIFFS.map(([d, label, tip]) => <button key={d} title={tip} style={{ ...card(diff === d), flex: 'none', padding: '4px 10px' }} onClick={() => setDiff(d)}>{label}</button>)}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 16px' }}>
          <input type="checkbox" checked={jobs} onChange={e => setJobs(e.target.checked)} />
          <span>The adults keep their day jobs (a weekday wage; less time to build). They can quit any time.</span>
        </label>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {g.setupCanClose && <button style={{ ...card(false), flex: 'none', padding: '8px 14px', textAlign: 'center' }} onClick={() => g.openSetup(false)}>Back to my game</button>}
          <button style={{ ...card(true), flex: 'none', padding: '8px 18px', textAlign: 'center', fontWeight: 600 }} onClick={start}>Start</button>
        </div>
      </div>
    </div>
  );
}
