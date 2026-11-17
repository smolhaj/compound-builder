/**
 * Layout A top bar (docs/UX_AUDIT.md 11.1): clock, speed, the nine vital chips, the overflow menu and the main menu.
 * One row, 44 px, never wraps, never wider than the window: `topBarPlan` (sim/topBarPlan.ts) decides from the measured
 * chip widths which chips show, whether they are full or compact, and which fall into the overflow popover.
 * The numbers come from sim/vitals.ts (compound board, runway, collapse and wave clocks); nothing is worked out here.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { boardCache, type BoardItem } from '../../sim/compoundBoard';
import { topChips, type ChipAct, type ChipModel, type ChipTone } from '../../sim/vitals';
import { BAR, DESIGN_WIDTHS, CHIP_ORDER, topBarPlan, worstTone, type ChipId, type ChipWidth } from '../../sim/topBarPlan';
import { calendarOf, dayIndex, hourOf, type Speed } from '../../sim/state';
import { orderCost, prices } from '../../sim/economy';
import { roman } from '../../sim/eras';
import { planningHold } from '../../sim/clockResume';
import { UI_SCALE, T, tv } from './tokens';
import { VitalChip } from './VitalChip';
import { glyphOf } from './chipStyle';
import { ChipIcon, MenuIcon } from './icons';
import { HoverHost } from './HoverCard';
import { useSpendGuard } from './useSpendGuard';
import { SaveMenu } from '../SaveMenu';
import { clock, dateLabel, seasonOfDoy } from './dateText';

const SPEEDS: Array<[Speed, string, string]> = [[0, '❚❚', 'Pause'], [1, '1×', 'Normal speed'], [2, '2×', 'Twice as fast'], [3, '3×', 'Three times as fast'], [4, '4×', 'Four times as fast']];

const btnBase: CSSProperties = { font: 'inherit', fontSize: tv.font('sm'), fontWeight: T.weight.semi, cursor: 'pointer', border: 0, borderRadius: tv.radius('control'), height: T.size.control.sm, boxSizing: 'border-box', lineHeight: 1 };
const popover: CSSProperties = { position: 'absolute', top: 'calc(100% + 8px)', background: 'rgba(20,22,18,0.97)', border: `1px solid ${T.color.lineStrong}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), padding: T.space[3], color: tv.color('text'), fontSize: tv.font('sm'), display: 'flex', flexDirection: 'column', gap: T.space[2], zIndex: 6, whiteSpace: 'normal', fontWeight: T.weight.regular };

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1512 : window.innerWidth));
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return w;
}

/** The card for a chip: title with the tone glyph, detail lines, the items it lists, and the one-click fix. */
function ChipCard({ c, run }: { c: ChipModel; run: (a: ChipAct) => void }) {
  const g = glyphOf(c.tone);
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: tv.font('title'), fontWeight: T.weight.semi }}>
      <ChipIcon id={c.id} size={16} /><span>{c.label}</span>
      <span style={{ marginLeft: 'auto', color: c.tone === 'good' ? tv.color('dim') : tv.color(c.tone), fontSize: tv.font('sm') }}>{g && <span aria-hidden>{g} </span>}{c.full}</span>
    </div>
    {c.lines.map((l, i) => <div key={i} style={{ color: i === 0 ? tv.color('text') : tv.color('dim') }}>{l}</div>)}
    {c.id !== 'defense' && c.items && c.items.length > 0 && <ItemList items={c.items.slice(0, 5)} run={run} />}
    {c.fix && <button type="button" onClick={() => run(c.fix!.act)} style={{ ...btnBase, height: T.size.control.md, background: tv.color('accent'), color: tv.color('onAccent'), alignSelf: 'flex-start', padding: '0 12px' }}>{c.fix.label}</button>}
  </>;
}
function ItemList({ items, run }: { items: BoardItem[]; run: (a: ChipAct) => void }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    {items.map(x => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span aria-hidden style={{ color: x.tone === 'good' ? tv.color('dim') : tv.color(x.tone), width: 12, flex: 'none', textAlign: 'center' }}>{glyphOf(x.tone) || '·'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{x.text}</span>
      {x.act && <button type="button" onClick={() => run(x.act!.act)} style={{ ...btnBase, height: T.size.control.sm, padding: '0 8px', background: tv.color('control'), color: tv.color('text'), border: `1px solid ${T.color.lineStrong}`, flex: 'none' }}>{x.act.label}</button>}
    </div>)}
  </div>;
}

export function TopBar({ barRef, onBoard, onSide }: { barRef: RefObject<HTMLDivElement | null>; onBoard: () => void; onSide: (s: 'left' | 'right') => void }) {
  const g = useGameStore();
  const w = useWorldStore();
  const game = g.game;
  const scale = w.uiScale, vw = useViewportWidth();
  const drive = w.siteGeo?.drive;
  const [cache] = useState(boardCache);
  const board = cache(game, drive);
  const day = dayIndex(game.clock.t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chips = useMemo(() => topChips(game, board), [board, day, game.money, game.disaster.phase, game.gate.waves?.n, game.gate.pending, game.gate.incoming, game.fin.debt?.owed, game.utilities.report, game.ending?.kind]);
  const { guard, node: guardNode } = useSpendGuard();

  const run = (a: ChipAct) => {
    setOverflowOpen(false); setMenuOpen(false);
    switch (a.type) {
      case 'board': onBoard(); break;
      case 'open': g.focusHud({ right: a.right, ...(a.supplies ? { supplies: a.supplies } : {}) }); onSide('right'); break;
      case 'select': g.select(a.id); onSide('left'); break;
      case 'stake': g.setTool(a.kind); onSide('left'); break;
      case 'order': { const lines = a.lines; guard(orderCost(lines, prices(game)), () => g.order(lines)); break; }
      case 'shop': g.openShop(true, a.tab); break;
    }
  };

  // measured chip widths (both modes), re-read after every render that changes them
  const [widths, setWidths] = useState<readonly ChipWidth[]>(DESIGN_WIDTHS);
  const meas = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const root = meas.current; if (!root) return;
    const next: ChipWidth[] = [];
    for (const id of CHIP_ORDER) {
      const f = root.querySelector<HTMLElement>(`[data-chip="${id}"][data-mode="full"]`), c = root.querySelector<HTMLElement>(`[data-chip="${id}"][data-mode="compact"]`);
      if (f && c) next.push({ id, full: Math.ceil(f.getBoundingClientRect().width / scale), compact: Math.ceil(c.getBoundingClientRect().width / scale) });
    }
    setWidths(old => (old.length === next.length && old.every((o, i) => o.id === next[i].id && o.full === next[i].full && o.compact === next[i].compact) ? old : next));
  });

  const present = chips.map(c => c.id);
  const plan = topBarPlan(vw / scale, { present, widths });
  const shown = plan.shown.map(id => chips.find(c => c.id === id)!), hidden = plan.overflow.map(id => chips.find(c => c.id === id)!);
  const hiddenTone = worstTone<ChipTone>(hidden.map(h => h.tone));

  const [menuOpen, setMenuOpen] = useState(false), [overflowOpen, setOverflowOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen && !overflowOpen) return;
    const down = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) { setMenuOpen(false); setOverflowOpen(false); } };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); setOverflowOpen(false); } };
    window.addEventListener('pointerdown', down); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', down); window.removeEventListener('keydown', key); };
  }, [menuOpen, overflowOpen]);

  const cal = calendarOf(game.clock), hour = hourOf(game.clock.t);
  const speedButtons = SPEEDS.slice(0, plan.speedButtons);
  const lostSpeeds = SPEEDS.slice(plan.speedButtons);
  const over = !!game.ending && !game.ending.continued;
  const barStyle: CSSProperties = {
    position: 'fixed', top: 10, left: '50%', transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center', zIndex: 3,
    height: T.size.bar, boxSizing: 'border-box', display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: BAR.gap, padding: `0 ${BAR.pad / 2}px`,
    background: tv.color('panel'), border: `1px solid ${T.color.line}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2),
    color: tv.color('text'), fontFamily: tv.font('family'), fontSize: tv.font('body'), width: 'max-content',
  };
  const speedBtn = ([s, label, tip]: [Speed, string, string]) => {
    const on = game.clock.speed === s;
    return <button key={s} type="button" title={tip} aria-label={tip} aria-pressed={on} onClick={() => g.setSpeed(s)}
      style={{ ...btnBase, width: BAR.speedBtn, height: T.size.control.md, background: on ? tv.color('accent') : tv.color('control'), color: on ? tv.color('onAccent') : tv.color('text'), border: `1px solid ${on ? tv.color('accent') : T.color.line}` }}>{label}</button>;
  };

  return (
    <div ref={el => { rootRef.current = el; (barRef as { current: HTMLDivElement | null }).current = el; }} data-testid="top-bar-a" role="toolbar" aria-label="Status bar" style={barStyle}>
      {guardNode}
      {/* clock */}
      <HoverHost scale={scale} align="start" card={<>
        <div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{dateLabel(cal.doy)}, {cal.year}</div>
        <div style={{ color: tv.color('dim') }}>Day {day + 1} · {seasonOfDoy(cal.doy)}{game.lineage.era > 1 ? ` · Era ${roman(game.lineage.era)}, the ${game.lineage.family} family` : ''}</div>
        {game.clock.speed > 0 && planningHold(g.tool, g.planOpen) && <div style={{ color: tv.color('warn') }}>▲ The clock holds while you place or draw something.</div>}
      </>}>
        <span tabIndex={0} data-testid="top-clock" style={{ width: BAR.date, display: 'inline-flex', flexDirection: 'column', justifyContent: 'center', lineHeight: 1.15, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', paddingLeft: 4 }}>
          <span style={{ fontSize: tv.font('body'), fontWeight: T.weight.semi }}>{dateLabel(cal.doy)}</span>
          <span style={{ fontSize: tv.font('sm'), color: tv.color('dim') }}>{clock(hour)}</span>
        </span>
      </HoverHost>
      {/* speed */}
      <span style={{ display: 'inline-flex', gap: BAR.speedGap }} role="group" aria-label="Game speed">{speedButtons.map(speedBtn)}</span>
      <span aria-hidden style={{ width: 1, height: 22, background: T.color.line, margin: `0 ${(BAR.divider - 1) / 2}px`, flex: 'none' }} />
      {/* chips */}
      {shown.map(c => <HoverHost key={c.id} scale={scale} align={c.id === 'threat' || c.id === 'cash' ? 'start' : 'center'} card={<ChipCard c={c} run={run} />}><VitalChip c={c} mode={plan.mode} onClick={() => run(c.open)} /></HoverHost>)}
      {hidden.length > 0 && <span style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" data-testid="top-overflow" data-tone={hiddenTone} aria-expanded={overflowOpen} aria-label={`${hidden.length} more status ${hidden.length === 1 ? 'chip' : 'chips'}: ${hidden.map(h => h.label).join(', ')}${hiddenTone === 'good' ? '' : ', one needs attention'}`} title={`More: ${hidden.map(h => h.label).join(', ')}`}
          onClick={() => { setOverflowOpen(o => !o); setMenuOpen(false); }}
          style={{ ...btnBase, height: T.size.chip, width: BAR.overflow, borderRadius: tv.radius('chip'), padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, background: hiddenTone === 'good' ? tv.color('raised') : 'rgba(0,0,0,0.30)', color: hiddenTone === 'good' ? tv.color('text') : tv.color(hiddenTone), border: `1px solid ${hiddenTone === 'good' ? T.color.line : tv.color(hiddenTone)}` }}>
          {glyphOf(hiddenTone) && <span aria-hidden style={{ fontSize: tv.font('fine') }}>{glyphOf(hiddenTone)}</span>}<span>⋯ +{hidden.length}</span>
        </button>
        {overflowOpen && <div role="menu" data-testid="top-overflow-menu" style={{ ...popover, right: 0, width: 300 }}>
          {hidden.map(h => <div key={h.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: T.space[2], borderBottom: `1px solid ${T.color.line}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><VitalChip c={h} mode="full" onClick={() => run(h.open)} /><span style={{ color: tv.color('dim') }}>{h.label}</span></div>
            {h.lines[0] && <div style={{ color: tv.color('dim') }}>{h.lines[0]}</div>}
            {h.fix && <button type="button" onClick={() => run(h.fix!.act)} style={{ ...btnBase, background: tv.color('accent'), color: tv.color('onAccent'), alignSelf: 'flex-start', padding: '0 12px' }}>{h.fix.label}</button>}
          </div>)}
        </div>}
      </span>}
      {/* main menu */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" data-testid="top-menu" aria-label="Menu" aria-expanded={menuOpen} title="Menu: new game, save, settings" onClick={() => { setMenuOpen(o => !o); setOverflowOpen(false); }}
          style={{ ...btnBase, width: BAR.menu, height: T.size.control.md, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: menuOpen ? tv.color('accent') : tv.color('control'), color: menuOpen ? tv.color('onAccent') : tv.color('text'), border: `1px solid ${T.color.line}` }}><MenuIcon /></button>
        {menuOpen && <div role="menu" data-testid="top-menu-panel" style={{ ...popover, right: 0, width: 264 }}>
          <MenuButton label="Compound board" hint="Power, water, food, defense, threats" onClick={() => { setMenuOpen(false); onBoard(); }} />
          <MenuButton label="Shop & money" hint="Town, the catalog, accounts, gold and silver" onClick={() => { setMenuOpen(false); g.openShop(true); }} />
          <MenuButton label="New game" disabled={over} hint={over ? 'Use the report card to start a new game' : undefined} onClick={() => { setMenuOpen(false); g.openSetup(true, true); }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1 }}>Save, export, import</span><SaveMenu /></div>
          {lostSpeeds.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1 }}>Faster</span>{lostSpeeds.map(speedBtn)}</div>}
          <div style={{ height: 1, background: T.color.line }} />
          <div style={{ color: tv.color('dim'), fontSize: tv.font('fine'), textTransform: 'uppercase', letterSpacing: 0.6 }}>Settings</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1 }}>Layout</span>
            <select data-testid="layout-select" value={w.layout} onChange={e => w.setLayout(e.target.value as 'a' | 'classic')} aria-label="HUD layout" style={{ height: T.size.control.sm }}>
              <option value="a">New (layout A)</option><option value="classic">Classic</option>
            </select></label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ flex: 1 }}>UI size</span>
            <input data-testid="ui-scale" type="range" aria-label="UI size" min={UI_SCALE.min * 100} max={UI_SCALE.max * 100} step={UI_SCALE.step * 100} value={Math.round(scale * 100)} onChange={e => w.setUiScale(Number(e.target.value) / 100)} style={{ width: 96 }} />
            <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(scale * 100)}%</span></label>
          <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>Alt+L switches layout. UI size scales this bar; the panels follow in a later step.</div>
        </div>}
      </span>
      {/* measurer: every chip in both modes, invisible, so widths come from the real DOM */}
      <div ref={meas} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: 4 }}>
        {chips.map(c => <span key={c.id} style={{ display: 'inline-flex' }}><VitalChip c={c} mode="full" measure /><VitalChip c={c} mode="compact" measure /></span>)}
      </div>
    </div>
  );
}

function MenuButton({ label, hint, onClick, disabled }: { label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" role="menuitem" disabled={disabled} title={hint} onClick={onClick} style={{ ...btnBase, height: T.size.control.md, textAlign: 'left', padding: '0 10px', background: tv.color('control'), color: tv.color('text'), border: `1px solid ${T.color.line}`, opacity: disabled ? 0.45 : 1 }}>{label}</button>;
}
export type { ChipId };
