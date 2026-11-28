/**
 * Layout A "What to do now" card (docs/UX_AUDIT.md 11.4): top-left under the top bar. One main row, at most two follow-ups, each with one
 * click. Collapsible to a single line (top item and a count). sim/whatToDo.ts decides; this draws and runs the click.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { useHudText } from '../../store/hudTextStore';
import { useFeelStore } from '../../store/feelStore';
import { useDrawerStore } from '../../store/drawerStore';
import { boardCache } from '../../sim/compoundBoard';
import { todoKey, whatToDo, type TodoRow, type WhatToDo } from '../../sim/whatToDo';
import { useRunAct } from './useRunAct';
import { T, tv } from './tokens';
import { TOP_BAR } from './drawerRegistry';
import { useOverlayPlan } from '../feel/useOverlayPlan';
import { topTier } from '../../sim/overlayQueue';
import { useWindowSize } from './drawerHooks';
import { feedOf } from '../../sim/felt/feed';

const FEED_GLYPH = ['', '', T.glyph.warn, T.glyph.bad] as const;

const KEY = 'cb.todo.collapsed';
const readCollapsed = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

const GLYPH = { bad: T.glyph.bad, warn: T.glyph.warn, info: '' } as const;
const rowTone = (r: TodoRow) => (r.kind === 'goal' ? tv.color('accent') : r.tone === 'bad' ? tv.color('bad') : r.tone === 'warn' ? tv.color('warn') : tv.color('line'));

const btnStyle = (primary: boolean, off: boolean): CSSProperties => ({
  font: 'inherit', fontSize: tv.font('sm'), fontWeight: T.weight.semi, cursor: off ? 'default' : 'pointer', borderRadius: tv.radius('control'), padding: primary ? '6px 10px' : '3px 8px',
  border: `1px solid ${primary ? tv.color('accent') : T.color.lineStrong}`, background: primary ? tv.color('accent') : tv.color('control'), color: primary ? tv.color('onAccent') : tv.color('text'), opacity: off ? 0.5 : 1,
  textAlign: 'left', lineHeight: 1.25,
});

export function WhatToDoCard() {
  const g = useGameStore(), scale = useWorldStore(w => w.uiScale), drive = useWorldStore(w => w.siteGeo)?.drive;
  const goalMem = useFeelStore(f => f.goalMem), closed = useFeelStore(f => f.goalsClosed);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { run, note, guardNode } = useRunAct(() => useDrawerStore.getState().show('projects'));
  const [cache] = useState(boardCache);
  const memo = useRef<{ k: string; v: WhatToDo } | null>(null);
  const game = g.game;
  const k = todoKey(game, `${closed}|${goalMem.seen.length}|${goalMem.done.length}`);
  const todo = useMemo(() => {
    if (memo.current?.k === k) return memo.current.v;
    const v = whatToDo(game, { drive, goalMem, goalsClosed: closed, board: cache(game, drive) });
    memo.current = { k, v };
    return v;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, drive]);
  // the newest line of "What's different" (the Board's Feed page has all of them), once the world has been hit
  const d = game.disaster, feed = d.kind && game.clock.t >= d.hitAt ? feedOf(game) : undefined;
  const feedLines = (feed?.lines ?? []).filter(l => l.id !== 'radio.digest'), top = feedLines[0];
  const feedText = top && top.id !== 'quiet' ? top.text : null;
  useEffect(() => { useHudText.getState().set([...todo.rows.map(r => r.title), ...(feedText ? [feedText] : [])]); return () => useHudText.getState().set([]); }, [todo, feedText]);
  // a decision card is centered and wide: on a narrow window it would sit on top of this card, so the card steps aside for it
  const { vw } = useWindowSize(), plan = useOverlayPlan();
  if (!todo.rows.length || (topTier(plan) === 'blocking' && vw / scale < 1240)) return null;
  const toggle = () => setCollapsed(c => { const n = !c; try { localStorage.setItem(KEY, n ? '1' : '0'); } catch { /* private mode */ } return n; });
  const [main, ...rest] = todo.rows;
  const total = todo.rows.length + todo.more;
  const box: CSSProperties = {
    position: 'fixed', left: T.edge, top: TOP_BAR.top + T.size.bar * scale + TOP_BAR.gap, zIndex: 3, width: T.size.card, boxSizing: 'border-box', transform: `scale(${scale})`, transformOrigin: 'top left',
    background: tv.color('panel'), border: `1px solid ${T.color.line}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), color: tv.color('text'), fontFamily: tv.font('family'), fontSize: tv.font('sm'),
    maxHeight: '58vh', overflowY: 'auto',
  };
  const head = (
    <button type="button" data-testid="todo-toggle" aria-expanded={!collapsed} onMouseDown={e => e.preventDefault()} onClick={toggle}
      style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', fontSize: tv.font('fine'), fontWeight: T.weight.semi, letterSpacing: 0.6, textTransform: 'uppercase', color: tv.color('dim') }}>
      <span style={{ flex: 'none' }}>{collapsed ? 'Now' : 'What to do now'}</span>
      {collapsed && <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'none', letterSpacing: 0, fontSize: tv.font('sm'), color: tv.color('text') }}>
        {GLYPH[main.tone] && <span style={{ color: rowTone(main) }}>{GLYPH[main.tone]} </span>}{main.title}
      </span>}
      {!collapsed && <span style={{ marginLeft: 'auto' }} />}
      {collapsed && total > 1 && <span aria-label={`${total} things`} style={{ flex: 'none', minWidth: 18, textAlign: 'center', borderRadius: 9, padding: '0 5px', background: tv.color('control'), border: `1px solid ${T.color.line}`, textTransform: 'none', letterSpacing: 0, color: tv.color('text') }}>+{total - 1}</span>}
      <span aria-hidden style={{ flex: 'none' }}>{collapsed ? '▾' : '▴'}</span>
    </button>
  );
  const press = (r: TodoRow) => { const a = r.act; if (!a || a.off) return; if (a.act.type === 'starter') { useFeelStore.getState().askStarter(); useDrawerStore.getState().show('build'); }   // (the proposal lives in the Build drawer)
    else run(a.act); };
  const act = (r: TodoRow, primary: boolean) => r.act && <><button type="button" data-testid={primary ? 'todo-primary' : 'todo-act'} disabled={!!r.act.off} title={r.act.off ?? r.act.label} onMouseDown={e => e.preventDefault()} onClick={() => press(r)} style={btnStyle(primary, !!r.act.off)}>{r.act.label}</button>
    {(r.act.note ?? r.act.off) && <div data-testid="todo-act-note" style={{ color: tv.color('dim'), fontSize: tv.font('fine'), marginTop: 3 }}>{r.act.note ?? r.act.off}</div>}</>;
  return (
    <div data-testid="todo-card" data-collapsed={collapsed ? '1' : '0'} style={box}>
      {head}
      {!collapsed && <div style={{ padding: '0 12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div data-testid="todo-main" data-kind={main.kind} style={{ borderLeft: `3px solid ${rowTone(main)}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi, lineHeight: T.lineHeight.tight }}>{GLYPH[main.tone] && <span style={{ color: rowTone(main) }}>{GLYPH[main.tone]} </span>}{main.title}</div>
          {main.sub && <div style={{ color: tv.color('dim'), display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={main.sub}>{main.sub}</div>}
          <div>{act(main, true)}</div>
        </div>
        {rest.map(r => <div key={r.id} data-testid="todo-follow" data-kind={r.kind} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, borderTop: `1px solid ${T.color.line}`, paddingTop: 8 }}>
          <span style={{ lineHeight: T.lineHeight.tight, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={r.sub ? `${r.title}. ${r.sub}` : r.title}><span style={{ color: rowTone(r) }}>{GLYPH[r.tone] && `${GLYPH[r.tone]} `}</span>{r.title}</span>
          {act(r, false)}
        </div>)}
        {todo.progress && <div data-testid="todo-progress" style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>{todo.progress.heading}: {todo.progress.done} of {todo.progress.total} done</div>}
        {todo.more > 0 && <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>+{todo.more} more in the Build and Board panels</div>}
        {note && <div style={{ color: tv.color('warn') }}>{note}</div>}
        {guardNode}
      </div>}
      {feedText && top && <button type="button" data-testid="feed-line" title={`What's different today: ${feedText}`} onMouseDown={e => e.preventDefault()} onClick={() => useDrawerStore.getState().showPage('board', 'feed')}
        style={{ all: 'unset', boxSizing: 'border-box', width: '100%', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderTop: `1px solid ${T.color.line}`, color: tv.color('dim'), fontSize: tv.font('sm') }}>
        <span aria-hidden style={{ flex: 'none', color: top.tone >= 3 ? tv.color('bad') : top.tone === 2 ? tv.color('warn') : tv.color('dim') }}>{FEED_GLYPH[top.tone] || T.glyph.info}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tv.color('text') }}>{feedText}</span>
        {feedLines.length > 1 && <span style={{ flex: 'none' }}>+{feedLines.length - 1}</span>}
      </button>}
    </div>
  );
}
