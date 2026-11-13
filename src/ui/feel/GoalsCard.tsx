/**
 * The first-hour goals card (sim/firstHour.ts): one current goal with "2 of 6", one primary button, a "Why this matters" line,
 * an honest time, and a one-line strip for the rest. When every goal is done it turns into "You're set for now" and, once
 * acknowledged or hidden, folds to a single quiet row. It sits in the Build tab's "Get operational" card and never covers the map.
 */
import { useState, type ReactNode } from 'react';
import { useFeelStore } from '../../store/feelStore';
import { saveGoals, worldId } from '../../store/feelStore';
import { useGameStore } from '../../store/gameStore';
import { watchItems, type FirstHour, type FirstHourGoal, type GoalAct } from '../../sim/firstHour';
import { Note } from '../hud/common';
import { btn, DIM, FS, TONE } from '../hud/style';

const H: React.CSSProperties = { whiteSpace: 'nowrap', fontSize: FS.h, textTransform: 'uppercase', letterSpacing: 0.6, color: DIM, fontWeight: 600 };
const link: React.CSSProperties = { background: 'transparent', border: 0, color: DIM, cursor: 'pointer', fontSize: FS.fine, padding: 0, textDecoration: 'underline' };

function setClosed(closed: 'set' | 'dismissed' | null): void {
  const f = useFeelStore.getState();
  f.setGoals(f.goalMem, closed);
  saveGoals(worldId(useGameStore.getState().game), f.goalMem, closed);
}

/** The strip: every goal as a small mark, the current one bold. */
function Strip({ fh }: { fh: FirstHour }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: FS.small, margin: '2px 0 6px' }} data-testid="goal-strip">
    {fh.goals.map(g => {
      const cur = fh.current?.id === g.id;
      return <span key={g.id} data-goal={g.id} data-status={g.status} style={{ color: g.status === 'done' ? TONE.good : cur ? '#f0e6c8' : DIM, fontWeight: cur ? 700 : 400, whiteSpace: 'nowrap' }}>
        {g.status === 'done' ? '✓' : cur ? '▸' : g.status === 'underway' ? '◐' : '○'} {SHORT[g.id]}
      </span>;
    })}
  </div>;
}
const SHORT: Record<string, string> = { roof: 'Roof', water: 'Water', food: 'Food', power: 'Power', drive: 'Drive', fence: 'Fence' };

export function GoalsCard({ fh, run, ticks, children }: { fh: FirstHour; run: (a: Exclude<GoalAct, { type: 'starter' }>) => void; /** The plain five-line checklist, shown when the card is folded and "Details" is open. */ ticks: ReactNode; children?: ReactNode }) {
  const closed = useFeelStore(s => s.goalsClosed), askStarter = useFeelStore(s => s.askStarter);
  const [why, setWhy] = useState<string | null>(null), [details, setDetails] = useState(false);
  const game = useGameStore(s => s.game);
  const press = (g: FirstHourGoal) => { if (!g.act) return; if (g.act.act.type === 'starter') askStarter(); else run(g.act.act); };

  if (fh.complete && closed === null) {
    const items = watchItems(game);
    return <div data-testid="goals-set" style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={H}>You're set for now</span><span style={{ color: TONE.good, fontWeight: 600 }}>{fh.done} of {fh.total}</span></div>
      <Note>Every goal on the list is done. Here is what to watch from here on (the Board tab has the rest):</Note>
      {items.map(i => <div key={i.id} style={{ display: 'flex', gap: 6, padding: '2px 0', fontSize: FS.small }}><span style={{ color: i.tone === 'good' ? TONE.good : i.tone === 'bad' ? TONE.bad : '#e0b050' }}>●</span><span>{i.text}</span></div>)}
      <button style={{ ...btn(true), width: '100%', marginTop: 5 }} onClick={() => setClosed('set')}>Got it</button>
      {children}
    </div>;
  }
  const g = fh.current;
  if (closed !== null || !g) {
    // folded: one quiet line (the full list is one click away)
    return <div data-testid="goals-folded">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
        <span style={H}>Get operational</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: fh.complete ? TONE.good : DIM, fontWeight: 600 }}>{fh.complete ? 'Operational' : `${fh.done} of ${fh.total}`}</span>
          {closed === 'dismissed' && !fh.complete && <button style={link} onClick={() => setClosed(null)}>Show goals</button>}
          <button style={link} aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide list' : 'List'}</button>
        </span>
      </div>
      {details && ticks}
      {children}
    </div>;
  }
  const open = why === g.id;
  return <div data-testid="goals-card" data-goal={g.id}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }} title="Your first goals, one at a time. A suggestion list: nothing is locked.">
      <span style={H}>Get operational</span>
      <span style={{ color: DIM, fontWeight: 600 }} data-testid="goal-progress">{fh.done} of {fh.total}</span>
    </div>
    <Strip fh={fh} />
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
      <b style={{ fontSize: FS.body }}>{g.title}</b>
      <span style={{ color: DIM, fontSize: FS.small, textAlign: 'right' }}>{g.line}</span>
    </div>
    {g.act && <button data-testid="goal-primary" style={{ ...btn(true), width: '100%', marginTop: 5, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.25 }} disabled={!!g.act.off} title={g.act.off ?? g.act.label} onClick={() => press(g)}>{g.act.label}</button>}
    {!g.act && g.status === 'underway' && <Note>Nothing to press right now. Let the clock run (play, or the fast-forward button) and the family gets on with it.</Note>}
    {fh.alsoOpen.length > 0 && <div data-testid="goals-also" style={{ margin: '6px 0 2px' }}>
      <div style={{ ...H, marginBottom: 2 }}>Also open: start any of these now</div>
      {fh.alsoOpen.map(o => <button key={o.id} data-testid={`goal-also-${o.id}`} style={{ ...btn(false), width: '100%', marginTop: 3, whiteSpace: 'normal', textAlign: 'left', lineHeight: 1.25 }} title={`${o.title}: ${o.line}`} onClick={() => press(o)}>{SHORT[o.id]}: {o.act!.label}</button>)}
    </div>}
    {g.money && <Note tone="warn">{g.money}</Note>}
    {g.pace && <Note>{g.pace}</Note>}
    <button style={{ ...link, marginTop: 3, display: 'block' }} aria-expanded={open} onClick={() => setWhy(open ? null : g.id)}>{open ? 'Hide why this matters' : 'Why this matters'}</button>
    {open && <Note>{g.why}</Note>}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, gap: 6 }}>
      <span style={{ color: DIM, fontSize: FS.fine }}>Reward: {g.reward.title.toLowerCase()}</span>
      <button style={link} onClick={() => setClosed('dismissed')} title="Fold this away. It stays one click off in the Build tab.">Hide goals</button>
    </div>
    {children}
  </div>;
}
