/**
 * "Lay out a starter compound": one button on the Get operational card proposes a house, water, privy, power, food and a first fence for THIS
 * lot (sim/starterCompound.ts), shown as a ghost on the map with a one-line total. Place all, place one by one, or cancel; every piece is an
 * ordinary structure once staked. What the cash cannot cover waits as "later".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PlansOrderButton } from './SpendConfirm';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { planStarter, NO_ROOM } from '../../sim/starterCompound';
import { BLUEPRINTS, totalBill } from '../../sim/blueprints';
import { MATERIALS, type MaterialId } from '../../sim/materials';
import { plansNeedLines } from '../../sim/guidance';
import { PERIMETER } from '../../sim/perimeter';
import { Note } from './common';
import { btn, DIM, FS, LINE, miniBtn, usd } from './style';

const ownLogs = (kind: string) => !!BLUEPRINTS[kind] && Object.keys(totalBill(BLUEPRINTS[kind])).some(m => MATERIALS[m as MaterialId].price === null && m !== 'fieldstone');

export function StarterCompound({ first, wanted }: { first: boolean; wanted: boolean }) {
  const g = useGameStore();
  const query = useWorldStore(w => w.siteQuery), geo = useWorldStore(w => w.siteGeo), markTrees = useWorldStore(w => w.markNearestTrees);
  const setPreview = useWorldStore(w => w.setStarterPreview);
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState<string[]>([]);
  const [one, setOne] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const game = g.game;
  const sig = `${game.seed}|${game.structures.length}|${game.perimeter.length}|${Math.round(game.money / 2000)}|${game.people.length}`;
  const plan = useMemo(() => (open && query && geo ? planStarter(game, { query, geo, skip }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, query, geo, skip, sig]);
  useEffect(() => { setPreview(plan); }, [plan, setPreview]);
  // the ghosts are drawn on the ground: bring the camera over them the first time the proposal opens
  const framed = useRef(false);
  useEffect(() => {
    if (!open) { framed.current = false; return; }
    const pts = plan?.pieces.filter(p => !p.later);
    if (pts?.length && !framed.current) { framed.current = true; useWorldStore.getState().frameCamera(pts); }
  }, [open, plan]);
  useEffect(() => () => setPreview(null), [setPreview]);
  if (!query || !geo) return null;

  const close = () => { setOpen(false); setSkip([]); setOne(false); };
  const toggle = (k: string) => setSkip(s => (s.includes(k) ? s.filter(x => x !== k) : [...s, k]));
  const afterLay = (n: number, kinds: string[]) => {
    if (kinds.some(ownLogs) && markTrees) markTrees(10);
    setDone(`Staked ${n} ${n === 1 ? 'piece' : 'pieces'}. The family starts when the materials are in (Projects tab).`);
  };
  const placeAll = () => {
    if (!plan) return;
    const now = plan.pieces.filter(p => !p.later);
    const n = g.layStarter(now, plan.yard && !plan.yard.later ? plan.yard.plan : null, geo);
    close();
    if (n) { afterLay(n, now.map(p => p.kind)); useWorldStore.getState().frameCamera(now); }
  };
  const nextPiece = plan?.pieces.find(p => !p.later);
  const placeNext = () => {
    if (!plan) return;
    if (nextPiece) { const n = g.layStarter([nextPiece], null, geo); if (n) { afterLay(n, [nextPiece.kind]); useWorldStore.getState().frameCamera([nextPiece]); } }
    else if (plan.yard && !plan.yard.later) { const n = g.layStarter([], plan.yard.plan, geo); if (n) afterLay(n, []); }
  };
  const need = plansNeedLines(game);

  if (!open) {
    // nothing left to propose: only the note about what was just staked (and its order button) stays, until the plans are supplied
    if (!wanted && !(done && need.length > 0)) return null;
    return <div style={{ marginTop: 4 }}>
      {first && wanted && <Note>New here? One click proposes a house, water, power, food and a fence for this lot.</Note>}
      {wanted && <button style={{ ...btn(first), width: '100%' }} title="A suggested layout for this lot: a ghost preview with the total cost, hours and permit fees first. Nothing is placed until you say so, and every piece stays editable." onClick={() => { setDone(null); setOpen(true); }}>Lay out a starter compound</button>}
      {done && <Note tone="good">{done}</Note>}
      {done && need.length > 0 && <PlansOrderButton lines={need} style={{ marginTop: 3 }} />}
    </div>;
  }
  return <div style={{ borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><b>Starter compound</b><span style={{ color: DIM, fontSize: FS.small }}>ghosts on the map</span></div>
    {!plan ? <Note>Planning…</Note> : <>
      <div title={`Materials (less what you have in stock), permit fees and hours of work. About ${usd(plan.reserve)} of your ${usd(plan.cash)} is kept back for living costs.`} style={{ margin: '3px 0' }}>{plan.line}</div>
      {plan.pieces.map(p => <div key={p.key} title={p.laterWhy ?? p.why} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '1px 0', opacity: p.later ? 0.55 : 1, fontSize: FS.small }}>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}{p.later && <span style={{ color: '#e0b050' }}> · later</span>}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: DIM }}>{p.later && p.laterWhy === 'left out by you' ? '' : p.laterWhy === NO_ROOM ? 'no room' : `~${usd(p.usd + p.permit)}`}</span>
        <button style={{ ...btn(), ...miniBtn }} title={p.later && p.laterWhy === 'left out by you' ? 'Put it back in' : 'Leave it out (you can add it by hand later)'} onClick={() => toggle(p.key)}>{p.later && p.laterWhy === 'left out by you' ? '+' : '×'}</button>
      </div>)}
      {plan.yard && <div title={plan.yard.laterWhy ?? `${PERIMETER[plan.yard.kind].name} around the yard with a gate where the drive comes in: ${plan.yard.plan.wallM} m`} style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '1px 0', opacity: plan.yard.later ? 0.55 : 1, fontSize: FS.small }}>
        <span style={{ flex: 1 }}>{PERIMETER[plan.yard.kind].name.replace(/ \(.*\)/, '')} around the yard{plan.yard.later && <span style={{ color: '#e0b050' }}> · later</span>}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: DIM }}>~{usd(plan.yard.usd)}</span>
        <button style={{ ...btn(), ...miniBtn }} title="Leave the fence out" onClick={() => toggle('yard')}>×</button>
      </div>}
      {skip.includes('yard') && <div style={{ fontSize: FS.small, opacity: 0.55 }}>Fence left out <button style={{ ...btn(), ...miniBtn }} onClick={() => toggle('yard')}>+</button></div>}
      {plan.problem && <Note tone="warn">{plan.problem[0].toUpperCase() + plan.problem.slice(1)}.</Note>}
      <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
        {!one ? <>
          <button style={{ ...btn(true), flex: 1 }} disabled={!!plan.problem} onClick={placeAll}>Place all</button>
          <button style={{ ...btn(), flex: 1 }} disabled={!!plan.problem} title="Stake them in order, one click each; the rest of the ghosts stay" onClick={() => setOne(true)}>One by one</button>
        </> : <button style={{ ...btn(true), flex: 2 }} disabled={!nextPiece && !(plan.yard && !plan.yard.later)} onClick={placeNext}>{nextPiece ? `Place ${nextPiece.name.toLowerCase()}` : plan.yard && !plan.yard.later ? 'Place the fence' : 'All placed'}</button>}
        <button style={{ ...btn(), flex: 1 }} onClick={close}>{one ? 'Done' : 'Cancel'}</button>
      </div>
    </>}
  </div>;
}
