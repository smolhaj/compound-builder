/** The compound board: the clipboard in the safe room, read-only, with a jump from each line to its tab (sim/compoundBoard.ts does the reading). */
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { boardCache, type BoardAct, type BoardItem, type BoardLine } from '../sim/compoundBoard';
import { shortestRunway, type RunwayRow } from '../sim/runway';
import { Clamp, Group, Hint } from './hud/common';
import { WaveCard } from './WaveClock';
import { useSpendGuard } from './hud/useSpendGuard';
import { orderCost, prices } from '../sim/economy';
import { DIM, FS, LINE, TONE, btn, miniBtn } from './hud/style';

const PAPER = 'rgba(32,29,22,0.97)';

export function CompoundBoardPanel({ top, bottom, narrow, onClose, onSide }: { top: number; bottom: number; narrow: boolean; onClose: () => void; /** On a phone only one side panel shows: a jump says which. */ onSide: (s: 'left' | 'right') => void }) {
  const g = useGameStore();
  const drive = useWorldStore(w => w.siteGeo)?.drive;
  const [cache] = useState(boardCache);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const b = cache(g.game, drive);
  const tightest = shortestRunway(b.runway);
  const { guard, node: guardNode } = useSpendGuard();

  /** The four things a board button can do; then the clipboard goes down so the tab is in view. */
  const go = (a: BoardAct) => {
    if (a.type === 'open') { g.focusHud({ right: a.right, ...(a.supplies ? { supplies: a.supplies } : {}) }); onSide('right'); }
    else if (a.type === 'select') { g.select(a.id); onSide('left'); }
    else if (a.type === 'stake') { g.setTool(a.kind); onSide('left'); }
    else if (a.type === 'order') { const lines = a.lines; guard(orderCost(lines, prices(g.game)), () => { g.order(lines); onClose(); }); return; }
    else g.openShop(true, a.tab);
    onClose();
  };
  const dot = (tone: keyof typeof TONE) => <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: TONE[tone], flex: 'none' }} />;

  const vital = (v: BoardLine) => <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: `1px solid ${LINE}` }}>
    {dot(v.tone)}
    <button onClick={() => go(v.open)} title={`Open ${v.label}`} style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 8, background: 'transparent', border: 0, color: '#eee', cursor: 'pointer', padding: 0, textAlign: 'left', fontSize: FS.body }}>
      <b>{v.label}</b><span style={{ color: v.tone === 'good' ? DIM : TONE[v.tone], textAlign: 'right' }}>{v.value}</span>
    </button>
    {v.fix && <button style={{ ...btn(true), ...miniBtn }} onClick={() => go(v.fix!.act)}>{v.fix.label}</button>}
  </div>;

  const runwayRow = (r: RunwayRow) => <div key={r.id} data-runway={r.id} title={r.detail} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: `1px solid ${LINE}` }}>
    {dot(r.tone)}
    <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{r.label}</b><span style={{ color: r.tone === 'good' ? DIM : TONE[r.tone], textAlign: 'right' }}>{r.value}</span></span>
    <button style={{ ...btn(r.tone !== 'good'), ...miniBtn }} onClick={() => go(r.fix.act)}>{r.fix.label}</button>
  </div>;

  const item = (x: BoardItem) => <div key={x.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0' }}>
    <span style={{ paddingTop: 4 }}>{dot(x.tone)}</span>
    <div style={{ flex: 1, minWidth: 0 }}><Clamp text={x.text}>{x.text}</Clamp></div>
    {x.act && <button style={{ ...btn(), ...miniBtn }} onClick={() => go(x.act!.act)}>{x.act.label}</button>}
  </div>;

  return <div role="dialog" aria-label="Compound board" style={{ position: 'fixed', zIndex: 5, top, left: narrow ? 10 : '50%', transform: narrow ? 'none' : 'translateX(-50%)', width: narrow ? 'calc(100vw - 20px)' : 400, boxSizing: 'border-box', maxHeight: `calc(100vh - ${top + bottom}px)`, overflowY: 'auto', background: PAPER, border: '1px solid #d8c9a0', borderRadius: 8, padding: '8px 10px', color: '#eee', fontSize: FS.body, boxShadow: '0 6px 24px rgba(0,0,0,0.5)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
      <b style={{ fontSize: 14, letterSpacing: 0.3 }}>Compound board</b>
      <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span title="The Get operational checklist (Build tab)" style={{ color: b.operational.done === b.operational.total ? TONE.good : DIM, fontSize: FS.small }}>{b.operational.done === b.operational.total ? 'Operational' : `Operational ${b.operational.done} of ${b.operational.total}`}</span>
        <button aria-label="Put the clipboard down" title="Close (Esc)" style={{ ...btn(), ...miniBtn }} onClick={onClose}>Close</button>
      </span>
    </div>
    {guardNode}
    {b.vitals.map(vital)}
    <WaveCard />
    <Group id="board.runway" title="Days with no resupply" extra={tightest && tightest.tone !== 'good' ? `${tightest.label}: ${tightest.value}` : undefined}>
      {b.runway.map(runwayRow)}
      <div style={{ fontSize: FS.fine, color: DIM, paddingTop: 2 }}>Only what is on the place now: nothing grown, bought or delivered. Hover a row for what it counts.</div>
    </Group>
    {b.allClear && <Hint more="Power, water, food, defense and morale are all fine, nothing threatens the place and nothing waits on you. The board looks again each day.">Nothing needs you today.</Hint>}
    {b.threats.length > 0 && <Group id="board.threats" title="Threats" extra={String(b.threats.length)}>{b.threats.map(item)}</Group>}
    {b.decisions.length > 0 && <Group id="board.decisions" title="Waiting on you" extra={String(b.decisions.length)}>{b.decisions.map(item)}</Group>}
    {b.gaps.length > 0 && <Group id="board.gaps" title="Defense gaps" defaultOpen={false} extra={String(b.gaps.length)}>{b.gaps.map(item)}</Group>}
    <div style={{ fontSize: FS.fine, color: DIM, marginTop: 4 }}>Read-only. Every line jumps to the tab that changes it.</div>
  </div>;
}
