/**
 * "Wall my property": pick a wall type once, see the whole closed property
 * line planned (length, creek bars, the road gate, cost, hours, how long),
 * confirm, and the family has the lot on their list (sim/propertyWall.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { PERIMETER, type PerimeterKind } from '../../sim/perimeter';
import { WALL_CHOICES, planPropertyWall } from '../../sim/propertyWall';
import { costPer100m, perimeterNote, perimeterTiers, plansNeedLines } from '../../sim/guidance';
import { eta, paceOf, slowHint, totalHoursLeft, weeksFor } from '../../sim/pace';
import { billText } from '../../sim/materials';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { Note } from './common';
import { btn, DIM, LINE, usd } from './style';

export function WallProperty() {
  const g = useGameStore();
  const w = useWorldStore();
  const game = g.game;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<PerimeterKind>('chain_link');
  const [laid, setLaid] = useState(false);
  // show the property line on the ground while planning; put it back as it was
  useEffect(() => {
    if (!open) return;
    const was = useWorldStore.getState().showBoundary;
    useWorldStore.getState().setShowBoundary(true);
    return () => useWorldStore.getState().setShowBoundary(was);
  }, [open]);
  const plan = useMemo(() => (open ? planPropertyWall(game, kind, w.siteGeo ?? {}) : null), [open, game, kind, w.siteGeo]);
  const tiers = useMemo(() => perimeterTiers().map(t => ({ ...t, kinds: t.kinds.filter(k => WALL_CHOICES.includes(k)) })).filter(t => t.kinds.length), []);

  if (!open) {
    return <button style={{ ...btn(true), width: '100%', margin: '2px 0 6px' }} title="Trace the whole property line in one wall type: creek bars where the creek crosses, a gate on the road, cost and time shown first" onClick={() => { setLaid(false); setOpen(true); }}>Wall my property…</button>;
  }
  const pace = paceOf(game);
  const own = plan ? billText(Object.fromEntries(plan.own.map(o => [o.material, o.qty]))) : '';
  const weeks = plan ? weeksFor(totalHoursLeft(game) + (laid ? 0 : plan.hours), pace) : null;
  const note = perimeterNote(game, kind);
  const need = plansNeedLines(game);
  return <div style={{ border: `1px solid #d8c9a0`, borderRadius: 8, padding: 8, margin: '2px 0 8px', background: 'rgba(216,201,160,0.07)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <b>Wall my property</b>
      <button style={{ ...btn(), padding: '1px 7px' }} onClick={() => setOpen(false)}>{laid ? 'Done' : 'Close'}</button>
    </div>
    {laid ? <>
      <Note tone="good">Laid out. The family builds it as the materials come in; the Defense tab's "Property line closed" check turns green when it is done.</Note>
      {need.length > 0 && <button style={{ ...btn(true), width: '100%' }} disabled={!!orderProblem(game, need)} onClick={() => g.order(need)}>Order what the plans need ({usd(orderCost(need, prices(game)))})</button>}
    </> : <>
      <Note>One wall type for the whole line. Pick it; the plan below updates.</Note>
      {plan && <div style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, margin: '6px 0', padding: '6px 0' }}>
        <div style={{ color: DIM, fontSize: 11.5, marginBottom: 2 }}>The plan for {PERIMETER[kind].name.toLowerCase()} (chips below show $ per 100 m):</div>
        {plan.runs.length === 0
          ? <Note tone="good">{plan.heldM > 0 ? 'The whole line is already held by what you have laid out.' : 'Nothing to lay out.'}</Note>
          : <>
            <div>Property line <b>{plan.lineM.toLocaleString('en-US')} m</b>{plan.heldM > 0 && <span style={{ color: DIM }}> · {plan.heldM.toLocaleString('en-US')} m already held</span>}</div>
            <div>New wall <b>{plan.wallM.toLocaleString('en-US')} m</b></div>
            {plan.creekCrossings > 0 && <div>Creek bars at <b>{plan.creekCrossings}</b> crossing{plan.creekCrossings > 1 ? 's' : ''} ({plan.barsM} m)</div>}
            <div>{plan.gates > 0 ? <>A vehicle gate on the road side</> : <span style={{ color: DIM }}>No gate planned{plan.gateNote ? `: ${plan.gateNote}` : ''}</span>}</div>
            <div style={{ marginTop: 3 }}>Cost <b>{usd(plan.cost)}</b>{own ? <span style={{ color: DIM }}> + {own}</span> : null} · <b>{plan.hours.toLocaleString('en-US')} h</b> of work</div>
            <div style={{ color: DIM, fontSize: 11.5 }}>With everything else on the list: {eta(weeks)}.</div>
            {note && <Note tone="warn">{note}</Note>}
            {slowHint(game, weeks, pace, 10) && <Note tone="warn">{slowHint(game, weeks, pace, 10)}</Note>}
            {game.money < plan.cost && <Note tone="warn">You have {usd(game.money)}: the materials are bought as you can pay (Supplies: Order what the plans need).</Note>}
            <button style={{ ...btn(true), width: '100%', marginTop: 4 }} onClick={() => { if (g.wallProperty(kind, w.siteGeo ?? {}) > 0) setLaid(true); }}>Lay it out: {usd(plan.cost)}, {plan.hours} h</button>
          </>}
      </div>}
      {tiers.map(t => <div key={t.id} style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, color: DIM }} title={t.hint}>{t.title} <span style={{ opacity: 0.7 }}>· {t.hint}</span></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
          {t.kinds.map(k => <button key={k} style={{ ...btn(k === kind), padding: '2px 6px', fontSize: 11.5 }} title={PERIMETER[k].blurb} onClick={() => setKind(k)}>{PERIMETER[k].name.replace(/ \(.*\)/, '')} <span style={{ opacity: 0.7 }}>{costPer100m(k) > 0 ? `$${(costPer100m(k) / 1000).toFixed(1)}k` : 'labor'}</span></button>)}
        </div>
      </div>)}
    </>}
  </div>;
}
