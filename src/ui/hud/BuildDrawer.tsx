/**
 * Layout A Build drawer (docs/UX_AUDIT.md 11.3): a searchable catalog. A slim Get-operational strip, a search box, category chips and one
 * row per piece (icon, name, price, state). Hovering or focusing a row opens its bill beside the drawer; a click arms the same placing tool
 * the Classic Build tab arms (the drawer steps aside, as in S2). What the catalog does not list (tree marking, housing styles, footpaths, the
 * wall and ring helpers, the bunker plan, long-term goals) sits under "More tools" (BuildMenu toolsOnly). Pure parts: sim/buildCatalog.ts.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKey } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { useDrawerStore } from '../../store/drawerStore';
import { operational, type OpItem } from '../../sim/operational';
import { adviceCtx, billFor, catalogEntries, cardState, CATS, filterCatalog, moveIndex, priceText, recommendedKeys, type Bill, type CardState, type CatId, type CatalogEntry } from '../../sim/buildCatalog';
import { runOver } from '../../sim/wipe';
import { starterWanted } from '../../sim/starterCompound';
import { fosterNote } from '../../sim/orphans';
import { BuildMenu } from './BuildMenu';
import { StarterCompound } from './StarterCompound';
import { useRunAct } from './useRunAct';
import { CatIcon } from './catalogIcons';
import { T, tv } from './tokens';

const ALL = catalogEntries();
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const OP_CAT: Partial<Record<OpItem['id'], CatId>> = { shelter: 'shelter', water: 'water', power: 'power', food: 'food', defense: 'defense' };

const chip = (on: boolean, tone?: 'accent'): CSSProperties => ({
  font: 'inherit', fontSize: tv.font('sm'), lineHeight: 1.2, padding: '3px 7px', borderRadius: T.radius.chip, cursor: 'pointer', whiteSpace: 'nowrap',
  border: `1px solid ${on ? tv.color('accent') : T.color.line}`, background: on ? tv.color('accent') : 'transparent', color: on ? tv.color('onAccent') : tone === 'accent' ? tv.color('accent') : tv.color('text'), fontWeight: on ? T.weight.semi : T.weight.regular,
});

const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };

/** The slim Get-operational strip: five marks, each opens its category. */
function OpStrip({ ops, pick }: { ops: OpItem[]; pick: (c: CatId) => void }) {
  const done = ops.filter(o => o.done).length;
  return <div data-testid="build-ops" style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', marginBottom: T.space[2] }}>
    <span title="Get operational: shelter, water, power, food, defense. Click one to see what builds it." style={{ color: tv.color('dim'), fontSize: tv.font('fine'), marginRight: 2 }}>{done}/{ops.length}</span>
    {ops.map(o => <button key={o.id} type="button" title={`${o.label}: ${o.line}`} onClick={() => { const c = OP_CAT[o.id]; if (c) pick(c); }}
      style={{ font: 'inherit', fontSize: tv.font('fine'), padding: '1px 5px', borderRadius: T.radius.chip, cursor: 'pointer', border: `1px solid ${o.done ? 'transparent' : T.color.line}`, background: o.done ? 'rgba(168,208,128,0.14)' : 'transparent', color: o.done ? tv.color('good') : tv.color('text') }}>
      <span aria-hidden="true">{o.done ? '✓' : '○'}</span> {o.label}<span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{o.done ? ' done' : ' to do'}</span>
    </button>)}
  </div>;
}

function Row({ e, st, idx, armed, onHover, onArm }: { e: CatalogEntry; st: CardState; idx: number; armed: boolean; onHover: (e: CatalogEntry | null, el: HTMLElement | null) => void; onArm: (e: CatalogEntry) => void }) {
  const off = st.kind === 'off', next = st.kind === 'next';
  return <button type="button" data-testid="build-card" data-key={e.key} data-state={st.kind} data-idx={idx} aria-disabled={off || undefined}
    onPointerEnter={ev => onHover(e, ev.currentTarget)} onPointerLeave={() => onHover(null, null)} onFocus={ev => onHover(e, ev.currentTarget)} onBlur={() => onHover(null, null)}
    onClick={() => { if (!off) onArm(e); }}
    style={{ display: 'flex', alignItems: 'center', gap: T.space[2], width: '100%', boxSizing: 'border-box', textAlign: 'left', font: 'inherit', color: armed ? tv.color('onAccent') : tv.color('text'), cursor: off ? 'not-allowed' : 'pointer',
      padding: '5px 8px 5px 6px', minHeight: 46, borderRadius: tv.radius('control'), border: `1px solid ${next && !armed ? tv.color('accent') : 'transparent'}`,
      background: armed ? tv.color('accent') : next ? 'rgba(216,201,160,0.10)' : 'rgba(255,255,255,0.04)' }}>
    <span style={{ opacity: off ? 0.45 : 1, display: 'flex', background: 'rgba(0,0,0,0.28)', borderRadius: 6, padding: 3 }}><CatIcon cat={e.cat} kind={e.key} /></span>
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: tv.font('body'), fontWeight: T.weight.semi, opacity: off ? 0.6 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
      <span title={st.line} style={{ fontSize: tv.font('sm'), color: off ? tv.color('warn') : armed ? tv.color('onAccent') : next ? tv.color('accent') : tv.color('dim'), overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: off || next ? 2 : 1, lineHeight: 1.25 }}>
        {off ? `${T.glyph.warn} ${st.line}` : st.line}
      </span>
    </span>
    <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <span style={{ fontSize: tv.font('body'), fontWeight: T.weight.semi, fontVariantNumeric: 'tabular-nums', opacity: off ? 0.55 : 1, padding: '1px 8px', borderRadius: T.radius.chip, background: armed ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)' }}>{priceText(st)}</span>
      {st.badge && !off && <span style={{ fontSize: tv.font('fine'), color: armed ? tv.color('onAccent') : next ? tv.color('accent') : tv.color('warn') }}>{st.badge}</span>}
    </span>
  </button>;
}

/** The bill beside the drawer (portaled to the page: the drawer is scaled and clips its children). */
function BillCard({ bill, anchor, scale }: { bill: Bill; anchor: HTMLElement; scale: number }) {
  const drawer = anchor.closest('[data-drawer]') as HTMLElement | null;
  const r = anchor.getBoundingClientRect(), d = drawer?.getBoundingClientRect();
  const W = 300, left = Math.max(8, (d?.left ?? r.left) - 8 - W * scale);
  const [h, setH] = useState(260);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) setH(ref.current.getBoundingClientRect().height / scale); }, [bill, scale]);
  const top = Math.max(8, Math.min(r.top - 8, window.innerHeight - h * scale - 64 * scale));
  const row = (l: string, v: string, strong = false) => <div key={`${l}|${v}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: strong ? T.weight.semi : T.weight.regular }}><span style={{ color: strong ? tv.color('text') : tv.color('dim') }}>{l}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span></div>;
  return createPortal(
    <div ref={ref} role="tooltip" data-testid="build-bill" style={{ position: 'fixed', left, top, width: W, zIndex: 5, boxSizing: 'border-box', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none',
      padding: T.space[3], background: 'rgba(20,22,18,0.97)', color: tv.color('text'), border: `1px solid ${T.color.lineStrong}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), fontFamily: tv.font('family'), fontSize: tv.font('sm'), lineHeight: T.lineHeight.body, display: 'flex', flexDirection: 'column', gap: T.space[2] }}>
      <div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>{bill.title}</div>
      <div style={{ color: tv.color('dim') }}>{bill.gives}</div>
      {bill.facts.length > 0 && <div style={{ color: tv.color('text') }}>{bill.facts.join(' · ')}</div>}
      <div style={{ borderTop: `1px solid ${T.color.line}`, paddingTop: T.space[2], display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: tv.font('fine'), color: tv.color('dim'), textTransform: 'uppercase', letterSpacing: 0.5 }}>The bill</div>
        {bill.materials.map(l => row(l.label, usd(l.usd)))}
        {bill.other.map(l => row(l.label, usd(l.usd)))}
        {bill.materials.length + bill.other.length === 0 && row('Materials', 'from your land')}
        <div style={{ borderTop: `1px solid ${T.color.line}`, margin: '3px 0 1px' }} />
        {row('Family builds it', usd(bill.ownerUsd), true)}
        {row(`Hire a crew (wages ${usd(bill.crewLaborUsd)})`, usd(bill.crewUsd))}
      </div>
      <div>{row('Work', `${Math.round(bill.hours)} h`)}{row('A hired crew', `about ${bill.crewWeeks} ${bill.crewWeeks === 1 ? 'week' : 'weeks'}`)}</div>
      {bill.needs.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 2, color: tv.color('warn') }}>{bill.needs.map(n => <div key={n}>{T.glyph.warn} {n}</div>)}</div>}
      <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>{bill.state === 'off' ? 'Not yet' : 'Click to place it. R rotates, Esc cancels.'}</div>
    </div>, document.body);
}

export function BuildDrawer() {
  const g = useGameStore(), game = g.game, scale = useWorldStore(w => w.uiScale), drive = useWorldStore(w => w.siteGeo)?.drive;
  const { arm, note, guardNode } = useRunAct(() => useDrawerStore.getState().show('projects'));
  const [query, setQuery] = useState(''), [cat, setCat] = useState<CatId | null>(null), [rec, setRec] = useState(false), [tools, setTools] = useState(false);
  const [hover, setHover] = useState<{ e: CatalogEntry; el: HTMLElement } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLDivElement>(null);

  const over = runOver(game), foster = fosterNote(game);
  const ctx = useMemo(() => adviceCtx(game),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.structures.length, game.perimeter.length, game.people.length, game.disaster.phase, Math.floor(game.money / 100), Math.floor(game.clock.t * 4), game.stock.logs]);
  const states = useMemo(() => new Map(ALL.map(e => [e.key, cardState(game, e, ctx)] as const)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]);
  const recKeys = useMemo(() => recommendedKeys(game, ALL, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]);
  const ops = operational(game, drive);

  const searching = query.trim().length > 0 || cat !== null || rec;
  const shown = useMemo(() => {
    const list = filterCatalog(ALL, { query, cat, only: rec ? recKeys : null });
    // available before dim, keeping the match order inside each
    return [...list.filter(e => states.get(e.key)!.kind !== 'off'), ...list.filter(e => states.get(e.key)!.kind === 'off')];
  }, [query, cat, rec, recKeys, states]);
  /** Browsing (no search, no chip): the suggested pieces first, then every category with its heading. */
  const sections = useMemo(() => {
    if (searching) return [];
    const out: Array<{ id: string; title: string; list: CatalogEntry[] }> = [];
    const sug = ALL.filter(e => recKeys.has(e.key));
    if (sug.length) out.push({ id: 'sug', title: 'Suggested now', list: sug });
    for (const c of CATS) {
      const list = ALL.filter(e => e.cat === c.id && !recKeys.has(e.key));
      if (list.length) out.push({ id: c.id, title: c.label, list: [...list.filter(e => states.get(e.key)!.kind !== 'off'), ...list.filter(e => states.get(e.key)!.kind === 'off')] });
    }
    return out;
  }, [searching, recKeys, states]);
  const flat = searching ? shown : sections.flatMap(s => s.list);
  const idxOf = new Map(flat.map((e, i) => [e.key, i] as const));

  const pick = (c: CatId | null) => { setCat(cur => (cur === c ? null : c)); setRec(false); setTools(false); };
  const onArm = (e: CatalogEntry) => { setHover(null); arm(e.tool); };

  // / focuses the search while this drawer is the one open
  useEffect(() => {
    const f = (ev: KeyboardEvent) => {
      if (ev.code !== 'Slash' || ev.ctrlKey || ev.metaKey || ev.altKey || typing(ev.target)) return;
      if (useDrawerStore.getState().open !== 'build' || useGameStore.getState().tool) return;
      ev.preventDefault(); searchRef.current?.focus(); searchRef.current?.select();
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  }, []);

  const focusIdx = (i: number) => { const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${i}"]`); if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); } };
  const onListKey = (ev: ReactKey) => {
    const k = ev.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    const cur = Number((document.activeElement as HTMLElement | null)?.dataset.idx ?? -1);
    ev.preventDefault();
    if (k === 'ArrowUp' && cur <= 0) { searchRef.current?.focus(); return; }
    focusIdx(moveIndex(cur, k, flat.length, 1));
  };
  const onSearchKey = (ev: ReactKey<HTMLInputElement>) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); focusIdx(0); }
    else if (ev.key === 'Enter' && flat.length === 1 && states.get(flat[0].key)!.kind !== 'off') { ev.preventDefault(); onArm(flat[0]); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); if (query) setQuery(''); else searchRef.current?.blur(); }
  };

  const bill = hover ? billFor(game, hover.e, ctx) : null;
  const toolBox = <div data-testid="build-tools">
    <BuildMenu toolsOnly showProjects={() => useDrawerStore.getState().show('projects')} />
  </div>;

  if (over || foster) return <BuildMenu toolsOnly />;
  const rowOf = (e: CatalogEntry) => <Row key={e.key} e={e} st={states.get(e.key)!} idx={idxOf.get(e.key) ?? 0} armed={g.tool === e.tool} onHover={(x, el) => setHover(x && el ? { e: x, el } : null)} onArm={onArm} />;
  return <div data-testid="build-drawer" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <OpStrip ops={ops} pick={c => pick(c)} />
    <StarterCompound wanted={starterWanted(game)} first={!game.structures.some(s => !s.unplaced)} />
    {note && <div style={{ color: tv.color('dim'), margin: '4px 0' }}>{note}</div>}
    {guardNode}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: `${T.space[2]}px 0` }}>
    <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${T.color.lineStrong}`, borderRadius: tv.radius('control'), padding: '0 8px', height: T.size.control.md, background: 'rgba(0,0,0,0.25)' }}>
      <span aria-hidden="true" style={{ color: tv.color('dim') }}>⌕</span>
      <input ref={searchRef} data-testid="build-search" value={query} onChange={e => { setQuery(e.target.value); setTools(false); }} onKeyDown={onSearchKey} placeholder={`Search ${ALL.length} pieces... ( / )`} aria-label="Search the build catalog" spellCheck={false}
        style={{ flex: 1, minWidth: 0, font: 'inherit', fontSize: tv.font('body'), color: tv.color('text'), background: 'transparent', border: 0, outline: 'none' }} />
      {query && <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }} style={{ font: 'inherit', background: 'transparent', border: 0, color: tv.color('dim'), cursor: 'pointer', padding: 0 }}>✕</button>}
    </label>
      <button type="button" title="Tree marking, housing styles, footpaths, the bunker plan, walls around the property, long-term goals" style={{ ...chip(tools), height: T.size.control.md, borderRadius: tv.radius('control') }} aria-pressed={tools} onClick={() => { setTools(t => !t); setCat(null); setRec(false); }}>Tools</button>
    </div>
    <div data-testid="build-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: T.space[2] }}>
      <button type="button" style={chip(rec, 'accent')} aria-pressed={rec} onClick={() => { setRec(r => !r); setCat(null); setTools(false); }}>Suggested {recKeys.size}</button>
      {CATS.map(c => <button key={c.id} type="button" style={chip(cat === c.id)} aria-pressed={cat === c.id} onClick={() => pick(c.id)}>{c.label}</button>)}
    </div>
    <div ref={listRef} onKeyDown={onListKey} style={{ display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0 }}>
      {tools ? toolBox
        : searching ? (shown.length ? shown.map(rowOf) : <div data-testid="build-empty" style={{ color: tv.color('dim'), padding: `${T.space[3]}px 2px` }}>Nothing matches "{query}". Tree marking, housing styles, footpaths and walls around the property are under <button type="button" onClick={() => { setTools(true); setCat(null); setRec(false); }} style={{ font: 'inherit', background: 'transparent', border: 0, color: tv.color('accent'), cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>Tools</button>.</div>)
        : sections.map(s => <div key={s.id} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: tv.font('fine'), color: tv.color('dim'), textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: T.weight.semi, margin: `${T.space[2]}px 2px 1px` }}>{s.title}</div>
          {s.list.map(rowOf)}
        </div>)}
    </div>
    {bill && hover && <BillCard bill={bill} anchor={hover.el} scale={scale} />}
  </div>;
}
