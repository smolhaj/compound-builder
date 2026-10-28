/**
 * Supplies → Tools: what the family has to work with (sim/tools.ts), its condition, what each kind of
 * work is using, and the ways to keep going with it worn out or gone (sharpen, mend, make a crude one,
 * scavenge, trade). Also the "needs a saw" line on a project.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameState, Structure } from '../sim/state';
import { blueprintOf, isFinished } from '../sim/construction';
import { marketOpen } from '../sim/market';
import { BAG_BASE, BAG_GOODS, bagOf, type BagGood } from '../sim/tradeGoods';
import { swapPrice, swapQty, SWAP_KINDS, tradeForTool } from '../sim/toolTrade';
import {
  condWord, coverage, gradeOf, CRUDE_FOR, ctxOf, improvise, IMPROVISE_HOURS, isDull, kitCounts, kitOf, MAKE_DO_DAYS, projectNeeds, readKit, repair, repairPlan, ROLE_INFO, sharpen, sharpenAll,
  TOOLS, toolShopOpen, bestTool, type Tool, type ToolKind, type ToolRole,
} from '../sim/tools';
import { ToolIcon } from './ToolIcon';

const DIM = 'rgba(238,238,238,0.6)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
const h3 = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 } as const;
const btn = (on = false): CSSProperties => ({ padding: '2px 7px', borderRadius: 5, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 11.5 });
const sel: CSSProperties = { background: '#2a2c26', color: '#eee', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 5, padding: '2px 4px', fontSize: 11.5, maxWidth: 120 };

const toneOf = (t: Tool) => (t.cond <= 0 ? TONE.bad : t.cond < 0.35 ? TONE.warn : TONE.good);

/** The condition bar of a tool. */
function Bar({ v, color }: { v: number; color: string }) {
  return <div style={{ width: 38, height: 4, background: '#333', borderRadius: 2, flex: 'none' }}><div style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, height: '100%', background: color, borderRadius: 2 }} /></div>;
}

/** All the tools of one kind (a family has several hammers): one row, with the actions aimed at the ones that need them. */
function KindRow({ kind, tools, msg }: { kind: ToolKind; tools: Tool[]; msg: (m: string | null) => void }) {
  const g = useGameStore(), game = g.game, d = TOOLS[kind];
  const working = tools.filter(t => t.cond > 0), broken = tools.length - working.length;
  const avg = working.length ? working.reduce((a, t) => a + t.cond, 0) / working.length : 0;
  const worst = [...tools].sort((a, b) => a.cond - b.cond)[0];
  const dull = working.filter(t => d.dull > 0 && t.sharp < 0.95), keen = working.filter(isDull).length;
  const mendable = [...tools].filter(t => t.cond < t.max - 0.14 || t.cond <= 0).sort((a, b) => a.cond - b.cond)[0];
  const plan = mendable ? repairPlan(game, mendable.id) : null;
  const pro = tools.filter(t => gradeOf(t) === 'pro').length;
  const color = broken > 0 && !working.length ? TONE.bad : toneOf(worst);
  const wornN = working.filter(x => x.cond < 0.35).length;
  const bits = [broken > 0 ? `${broken} broken` : '', wornN > 0 ? `${wornN} nearly worn out` : '', keen > 0 ? `${keen} dull` : '', !broken && !wornN && !keen ? condWord(worst) : ''].filter(Boolean).join(', ');
  return <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', fontSize: 11.5 }}>
    <ToolIcon kind={kind} size={22} />
    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }} title={d.blurb}>
      {d.name}{tools.length > 1 ? ` ×${tools.length}` : ''}{pro > 0 && <span style={{ color: '#d8c9a0' }}> · {pro === tools.length ? 'pro' : `${pro} pro`}</span>}
      <div style={{ color, fontSize: 11 }}>{bits}</div>
    </span>
    <Bar v={avg} color={color} />
    {dull.length > 0 && <button style={btn()} title="Sharpen them (a whetstone or file does best; a river rock will do)" onClick={() => msg(g.money(x => { let done = false; for (const k of dull) if (sharpen(x, k.id) === null) done = true; return done ? null : 'Already as sharp as it gets.'; }))}>Sharpen</button>}
    {mendable && <button style={btn(mendable.cond <= 0)} disabled={!plan?.ok} title={plan?.ok ? `Mend one with ${plan.uses}: a bit weaker each time` : plan?.why ?? ''} onClick={() => msg(g.money(x => repair(x, mendable.id)))}>{mendable.cond <= 0 ? 'Mend' : 'Fix'}</button>}
  </div>;
}

/** Needs attention: broken, nearly worn out or dull. */
const needsCare = (tools: Tool[]) => tools.some(t => t.cond < 0.35 || isDull(t));

export function ToolsPanel({ game }: { game: GameState }): ReactNode {
  const g = useGameStore();
  const [m, setM] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [swapKind, setSwapKind] = useState<ToolKind>('hand_saw');
  const [swapGood, setSwapGood] = useState<BagGood>('salt');
  const kit = readKit(game), counts = kitCounts(kit), cov = coverage(game), ctx = ctxOf(game);
  const day = Math.floor(game.clock.t);
  const bare = cov.filter(c => !c.tool);
  const hard = ['cut', 'nail', 'dig', 'fell', 'wrench', 'wire'] as ToolRole[];
  const kinds = [...new Set(kit.items.map(t => t.kind))].sort((a, b) => Number(TOOLS[a].crude ?? false) - Number(TOOLS[b].crude ?? false) || TOOLS[a].name.localeCompare(TOOLS[b].name));
  const market = marketOpen(game), shop = toolShopOpen(game);
  return <div style={{ marginBottom: 10 }}>
    <div style={h3}>Tools</div>
    <div style={{ fontSize: 11.5, color: DIM, lineHeight: 1.35, marginBottom: 4 }}>
      {counts.total} tool{counts.total === 1 ? '' : 's'}
      {counts.broken > 0 && <span style={{ color: TONE.bad }}> · {counts.broken} broken</span>}
      {counts.worn > 0 && <span style={{ color: TONE.warn }}> · {counts.worn} nearly worn out</span>}
      {counts.dull > 0 && <span style={{ color: TONE.warn }}> · {counts.dull} dull</span>}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', columnGap: 8, rowGap: 1, fontSize: 11.5 }}>
      {cov.map(c => {
        const missing = !c.tool && hard.includes(c.role);
        const since = kit.missing[c.role];
        return [
          <span key={c.role + 'a'} style={{ color: DIM }}>{ROLE_INFO[c.role].name}</span>,
          <span key={c.role + 'b'} style={{ color: !c.tool ? (missing ? TONE.bad : TONE.warn) : TONE.good, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.tool ? TOOLS[c.tool.kind].name : c.waiting ? `waiting on ${ctx.power ? 'gas' : 'power'}` : missing ? `none${since !== undefined ? ` (making do in ${Math.max(0, since + MAKE_DO_DAYS - day)} d)` : ''}` : 'by hand'}
          </span>,
          <span key={c.role + 'c'} style={{ color: DIM, textAlign: 'right' }}>{c.tool ? `×${c.rate.toFixed(1)}` : c.role === 'till' || !missing ? '×0.5' : 'blocked'}</span>,
        ];
      })}
    </div>
    <div style={{ marginTop: 6 }}>{(() => {
      const groups = kinds.map(k => ({ k, tools: kit.items.filter(t => t.kind === k) }));
      const care = groups.filter(x => needsCare(x.tools)), rest = groups.filter(x => !needsCare(x.tools));
      return <>
        {care.map(x => <KindRow key={x.k} kind={x.k} tools={x.tools} msg={setM} />)}
        {care.length === 0 && <div style={{ fontSize: 11.5, color: TONE.good }}>Everything is in working order.</div>}
        <button style={{ ...btn(), margin: '3px 0' }} onClick={() => setAll(a => !a)}>{all ? 'Hide the rest' : `Show all ${counts.total} tools`}</button>
        {all && rest.map(x => <KindRow key={x.k} kind={x.k} tools={x.tools} msg={setM} />)}
      </>;
    })()}</div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
      <button style={btn()} disabled={counts.dull === 0} title="Put an edge on every dull blade" onClick={() => { setM(null); g.money(x => (sharpenAll(x, 0.75), null)); }}>Sharpen all</button>
      <label style={{ fontSize: 11.5, color: DIM, display: 'flex', alignItems: 'center', gap: 4 }}>
        <input type="checkbox" checked={kit.care} onChange={e => g.money(x => { kitOf(x).care = e.target.checked; return null; })} />
        the family sharpens as it goes
      </label>
    </div>
    {bare.filter(c => hard.includes(c.role) || c.role === 'till').length > 0 && <div style={{ marginTop: 6, fontSize: 11.5 }}>
      <div style={{ color: TONE.warn, marginBottom: 3 }}>{bare.some(c => hard.includes(c.role)) ? 'Work is held up for want of a tool. ' : ''}Make a crude one from stone and scrap (about {IMPROVISE_HOURS} hours; better with a little hardware):</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {bare.filter(c => hard.includes(c.role) || c.role === 'till').map(c => <button key={c.role} style={btn()} onClick={() => { setM(null); g.money(x => { improvise(x, c.role); return null; }); }}>{TOOLS[CRUDE_FOR[c.role]].name}</button>)}
      </div>
    </div>}
    {!shop && <div style={{ marginTop: 6, fontSize: 11.5, color: DIM, lineHeight: 1.35 }}>
      The stores are shut. Used tools turn up in the hardware store and the empty farms (scavenging); a stone axe, a scrap saw or a rock hammer can be made at home; blades take an edge from a river rock; a broken tool gives parts to mend another.
    </div>}
    {market && <div style={{ marginTop: 6, fontSize: 11.5 }}>
      <div style={{ color: DIM, marginBottom: 3 }}>Trade for a used tool at the crossroads market:</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={sel} value={swapKind} onChange={e => setSwapKind(e.target.value as ToolKind)}>{SWAP_KINDS.map(k => <option key={k} value={k}>{TOOLS[k].name}</option>)}</select>
        <span style={{ color: DIM }}>for</span>
        <select style={sel} value={swapGood} onChange={e => setSwapGood(e.target.value as BagGood)}>{BAG_GOODS.map(b => <option key={b} value={b}>{swapQty(game, swapKind, b)} {BAG_BASE[b].unit} (have {Math.floor(bagOf(game)[b])})</option>)}</select>
        <button style={btn(true)} title={`worth about $${swapPrice(game, swapKind)}`} onClick={() => setM(g.money(x => tradeForTool(x, swapKind, swapGood)))}>Trade</button>
      </div>
    </div>}
    {m && <div style={{ marginTop: 4, fontSize: 11.5, color: TONE.bad }}>{m}</div>}
  </div>;
}

/** On a project: the tools its coming work will lean on, with any it is short of. */
export function ToolNeedsNote({ game, st }: { game: GameState; st: Structure }): ReactNode {
  if (isFinished(st)) return null;
  const stages = blueprintOf(st).stages.slice(st.stage).map(s => s.id);
  if (!stages.length) return null;
  const kit = readKit(game), ctx = ctxOf(game);
  const roles = projectNeeds(stages).filter(n => n.share >= 0.15 || n.req);
  return <div style={{ fontSize: 11.5, lineHeight: 1.4, margin: '2px 0' }}>
    <span style={{ color: DIM }}>Tools: </span>
    {roles.map((n, i) => {
      const b = bestTool(kit, n.role, ctx), word = ROLE_INFO[n.role].need.replace(/^an? /, '');
      const color = b ? TONE.good : n.req ? TONE.bad : TONE.warn;
      return <span key={n.role} style={{ color }} title={b ? `using the ${TOOLS[b.tool.kind].name.toLowerCase()}` : n.req ? 'cannot be done without one' : 'goes slowly by hand'}>{i > 0 ? ', ' : ''}{word}{n.req ? ' (needed)' : ''}{b ? '' : ' (missing)'}</span>;
    })}
  </div>;
}
