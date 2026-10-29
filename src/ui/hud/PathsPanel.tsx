/**
 * Footpaths: the walks the family wears between the buildings (they start as
 * a trampled line in the grass and go to bare earth where it is busy), and
 * what you lay on them. One click lays the busiest walks in the surface you
 * pick (cost and metres shown first, from the stock; what is short can be
 * ordered), or lay one walk, or take one up. Gravel, stepping stones and
 * duckboards go anywhere; poured concrete only joins the main buildings
 * (sim/paths.ts; the world plans the walks and publishes them here).
 */
import { useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { worthLaying, type PathSummaryEdge } from '../../game/paths/pathNet';
import { LAID_BLURB, LAID_KINDS, LAID_NAME, billPrice, laidBill, planLay, type LaidKind } from '../../sim/paths';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { billText, type MaterialId } from '../../sim/materials';
import { Note } from './common';
import { btn, DIM, LINE, usd } from './style';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WORN_TEXT = { none: 'not yet a track', desire: 'trampled', dirt: 'bare earth' } as const;

export function PathsPanel({ startOpen = false }: { startOpen?: boolean }) {
  const g = useGameStore();
  const net = useWorldStore(w => w.pathNet);
  const game = g.game;
  const [open, setOpen] = useState(startOpen);
  const [all, setAll] = useState(false);
  const [kind, setKind] = useState<LaidKind>('gravel');
  const [note, setNote] = useState<{ tone: 'good' | 'warn'; text: string } | null>(null);
  // (a track to the bunker hatch is never listed: it stays unmarked)
  const edges = useMemo(() => (net?.edges ?? []).filter(e => !e.hidden).sort((a, b) => b.trips - a.trips), [net]);
  const laidM = edges.filter(e => e.laid).reduce((a, e) => a + e.lenM, 0);
  const tracks = edges.filter(e => !e.laid && e.worn !== 'none').length;
  const todo = edges.filter(e => worthLaying(e, kind));
  const plan = useMemo(() => planLay(game, todo.map(e => ({ a: e.a, b: e.b, lenM: e.uniqueM })), kind), [game, todo, kind]);
  const lines = (Object.entries(plan.short) as Array<[MaterialId, number]>).map(([material, n]) => ({ material, qty: Math.ceil(n) }));
  const orderWhy = lines.length ? orderProblem(game, lines) : null;

  const lay = (list: PathSummaryEdge[], k: LaidKind) => {
    const why = g.layPaths(list.map(e => ({ a: e.a, b: e.b, lenM: e.uniqueM || e.lenM })), k);
    setNote(why ? { tone: 'warn', text: why } : { tone: 'good', text: `Laid ${LAID_NAME[k].toLowerCase()} on ${list.length} walk${list.length > 1 ? 's' : ''}.` });
  };

  if (!open) {
    return <button style={{ ...btn(true), width: '100%', margin: '2px 0 6px' }} title="The tracks the family has worn between the buildings, and what you can lay on them: gravel, stepping stones, duckboards, concrete" onClick={() => setOpen(true)}>
      Footpaths…{edges.length > 0 && <span style={{ opacity: 0.7 }}> · {tracks} worn{laidM > 0 ? `, ${laidM} m laid` : ''}</span>}
    </button>;
  }
  return <div style={{ border: '1px solid #d8c9a0', borderRadius: 8, padding: 8, margin: '2px 0 8px', background: 'rgba(216,201,160,0.07)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <b>Footpaths</b>
      <button style={{ ...btn(), padding: '1px 7px' }} onClick={() => setOpen(false)}>Close</button>
    </div>
    <Note>The family wears a track wherever it walks, door to door: the busier, the sooner. Lay something down where it matters. A laid walk is cleared of snow and does not go to mud, and walking on a path is a little quicker.</Note>
    {edges.length === 0 && <Note>Nothing to link yet: paths appear between buildings once there are two.</Note>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '4px 0' }}>
      {LAID_KINDS.map(k => <button key={k} style={{ ...btn(k === kind), padding: '2px 7px', fontSize: 11.5 }} title={LAID_BLURB[k]} onClick={() => { setKind(k); setNote(null); }}>
        {LAID_NAME[k].replace(' walk', '')} <span style={{ opacity: 0.7 }}>{usd(billPrice(laidBill(k, 100)))}/100 m</span>
      </button>)}
    </div>
    <div style={{ color: DIM, fontSize: 11.5 }}>{LAID_BLURB[kind]}</div>
    {edges.length > 0 && <div style={{ borderTop: `1px solid ${LINE}`, margin: '6px 0 4px', paddingTop: 6 }}>
      {todo.length === 0
        ? <Note tone="good">{kind === 'paved' ? 'Every busy walk between the main buildings has concrete on it, or there are none yet.' : 'Every busy walk already has this laid.'}</Note>
        : <>
          <div>Lay paths between my buildings: <b>{todo.length}</b> walk{todo.length > 1 ? 's' : ''}, <b>{Math.round(plan.lenM)} m</b> of new {LAID_NAME[kind].toLowerCase()}</div>
          <div style={{ color: DIM, fontSize: 11.5 }}>Needs {billText(plan.bill)} (about {usd(plan.cost)} at the yard); the family lays it in an afternoon.</div>
          {lines.length > 0 && <Note tone="warn">Short: {billText(plan.short)}. <button style={{ ...btn(), padding: '0 6px', fontSize: 11 }} disabled={!!orderWhy} title={orderWhy ? 'Cannot order that now (money, or nobody delivering)' : undefined} onClick={() => { g.order(lines); }}>Order it ({usd(orderCost(lines, prices(game)))})</button></Note>}
          <button style={{ ...btn(true), width: '100%', marginTop: 4 }} disabled={lines.length > 0} onClick={() => lay(todo, kind)}>Lay paths between my buildings: {usd(plan.cost)}</button>
        </>}
      {note && <Note tone={note.tone}>{note.text}</Note>}
    </div>}
    {edges.length > 0 && <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DIM, margin: '4px 0 2px' }}>
        <span>THE WALKS · by trips a day</span>
        <button style={{ ...btn(), padding: '0 6px', fontSize: 11 }} onClick={() => setAll(!all)}>{all ? 'Busiest only' : `All ${edges.length}`}</button>
      </div>
      {(all ? edges : edges.slice(0, 8)).map(e => {
        const one = planLay(game, [{ a: e.a, b: e.b, lenM: e.uniqueM || e.lenM }], kind);
        const can = e.can[kind], why = e.hidden ? 'a track to the hatch stays unmarked' : !can ? 'concrete only joins the main buildings' : null;
        return <div key={e.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '2px 0', borderBottom: `1px solid ${LINE}` }}>
          <span style={{ minWidth: 0 }} title={`${e.lenM} m, ${e.trips} trips a day`}>
            {cap(e.aName)} ↔ {e.bName}
            <span style={{ color: DIM, fontSize: 11 }}> · {e.lenM} m · {e.laid ? <span style={{ color: '#a8d080' }}>{LAID_NAME[e.laid].toLowerCase()}</span> : WORN_TEXT[e.worn]}</span>
          </span>
          {e.laid
            ? <button style={{ ...btn(), padding: '1px 6px', fontSize: 11 }} title="Take it up: back to a worn track" onClick={() => g.pickUpPath(e.a, e.b)}>Take up</button>
            : <button style={{ ...btn(), padding: '1px 6px', fontSize: 11 }} disabled={!!why || Object.keys(one.short).length > 0} title={why ?? (Object.keys(one.short).length ? `Short: ${billText(one.short)}` : `${LAID_NAME[kind]}: ${usd(one.cost)}`)} onClick={() => lay([e], kind)}>{usd(one.cost)}</button>}
        </div>;
      })}
    </div>}
  </div>;
}
