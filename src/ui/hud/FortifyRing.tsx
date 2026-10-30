/**
 * "Fortify my ring": the signature compound in one plan (sim/fortress.ts):
 * the whole property line in container wall with a patrol walkway on top, a
 * gatehouse garage at the road gate, up to five towers on the corners and
 * mid-spans, and an underground passage from the garage to the house. Shows
 * the cost, the hours and when it would be done before anything is laid out.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { MAX_TOWERS, RING_TOWER_KINDS, RING_WALLS, DEFAULT_FORTRESS, planFortress, type FortressOptions } from '../../sim/fortress';
import { CONTAINER_LOOKS, PERIMETER, isContainerKind } from '../../sim/perimeter';
import { TOWERS } from '../../sim/towers';
import { RING_SHAPES } from '../../sim/ringShape';
import { plansNeedLines } from '../../sim/guidance';
import { eta, paceOf, slowHint, totalHoursLeft, weeksFor } from '../../sim/pace';
import { billText } from '../../sim/materials';
import { orderCost, orderProblem, prices } from '../../sim/economy';
import { Note } from './common';
import { btn, DIM, LINE, usd } from './style';

export function FortifyRing() {
  const g = useGameStore();
  const w = useWorldStore();
  const game = g.game;
  const [open, setOpen] = useState(false);
  const [laid, setLaid] = useState(false);
  const [opts, setOpts] = useState<FortressOptions>(DEFAULT_FORTRESS);
  // show the property line while planning; put it back as it was
  useEffect(() => {
    if (!open) return;
    const was = useWorldStore.getState().showBoundary;
    useWorldStore.getState().setShowBoundary(true);
    return () => useWorldStore.getState().setShowBoundary(was);
  }, [open]);
  const plan = useMemo(() => (open ? planFortress(game, w.siteGeo ?? {}, opts) : null), [open, game, opts, w.siteGeo]);
  // both scopes are priced so the player sees what expanding to the whole property line would cost
  const other = useMemo(() => (open ? planFortress(game, w.siteGeo ?? {}, { ...opts, scope: opts.scope === 'core' ? 'full' : 'core' }) : null), [open, game, opts, w.siteGeo]);
  const priced = plan && other ? (opts.scope === 'core' ? { core: plan, full: other } : { core: other, full: plan }) : null;

  if (!open) {
    return <button style={{ ...btn(false), width: '100%', margin: '2px 0 6px' }} title="The signature compound: a container-wall ring with a patrol walkway on top, a vehicle garage built into the gate, up to five towers and a tunnel to the house. Cost, hours and the finish date are shown first."
      onClick={() => { setLaid(false); setOpen(true); }}>Fortify my ring…</button>;
  }
  const pace = paceOf(game);
  const own = plan ? billText(Object.fromEntries(plan.own.map(o => [o.material, o.qty]))) : '';
  const weeks = plan ? weeksFor(totalHoursLeft(game) + (laid ? 0 : plan.hours), pace) : null;
  const need = plansNeedLines(game);
  const nothing = !!plan && plan.wall.runs.length === 0 && !plan.garage && plan.towers.length === 0 && !plan.passage && plan.walkwayLen <= 0;
  return <div style={{ border: '1px solid #d8c9a0', borderRadius: 8, padding: 8, margin: '2px 0 8px', background: 'rgba(216,201,160,0.07)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <b>Fortify my ring</b>
      <button style={{ ...btn(), padding: '1px 7px' }} onClick={() => setOpen(false)}>{laid ? 'Done' : 'Close'}</button>
    </div>
    {laid ? <>
      <Note tone="good">Laid out. The family builds the wall first, then the deck on top, the garage and the towers, as the materials come in. The Defense tab shows each piece as it goes up.</Note>
      {need.length > 0 && <button style={{ ...btn(true), width: '100%' }} disabled={!!orderProblem(game, need)} onClick={() => g.order(need)}>Order what the plans need ({usd(orderCost(need, prices(game)))})</button>}
    </> : <>
      <Note>A container-wall ring with a walkway along the top, a gatehouse garage at the gate and towers on the corners. It starts as a compound round the family's buildings (about 5 acres); expand it to the whole property line when you can pay for it. Walls you already have are kept; a container, steel or concrete wall gets a deck.</Note>
      {priced && (priced.core.coreIsFull
        ? <Note>Your lot is small: the core compound is the whole lot.</Note>
        : <div style={{ display: 'flex', gap: 4, alignItems: 'stretch', flexWrap: 'wrap', padding: '3px 0' }}>
          {([['core', 'Core compound', 'about 5 acres round the family', priced.core], ['full', 'Expand to the full property line', `${priced.full.wall.lineM.toLocaleString('en-US')} m of line`, priced.full]] as const).map(([k, label, sub, p]) =>
            <button key={k} style={{ ...btn(opts.scope === k), flex: 1, textAlign: 'left', padding: '4px 7px' }} title={sub} onClick={() => setOpts({ ...opts, scope: k })}>
              <div>{label}</div><div style={{ fontSize: 11, opacity: 0.75 }}>{usd(p.cost)} · {p.hours.toLocaleString('en-US')} h</div>
            </button>)}
        </div>)}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0', opacity: opts.scope === 'full' && !(priced?.core.coreIsFull) ? 0.5 : 1 }} title="The outline of the ring round the core compound. The whole-property wall follows the land's own line.">
        <span style={{ flex: 1, color: DIM }}>Shape</span>
        {RING_SHAPES.map(sh => <button key={sh.id} style={{ ...btn(opts.shape === sh.id), padding: '2px 7px' }} title={sh.blurb} disabled={opts.scope === 'full' && !(priced?.core.coreIsFull)} onClick={() => setOpts({ ...opts, shape: sh.id })}>{sh.name}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Wall</span>
        {RING_WALLS.map(k => <button key={k} style={{ ...btn(opts.wall === k), padding: '2px 7px' }} title={PERIMETER[k].blurb} onClick={() => setOpts({ ...opts, wall: k })}>{PERIMETER[k].name.replace('Poured-concrete wall', 'Concrete').replace('Stone-and-timber wall', 'Stone and timber').replace('Container wall', 'Containers').replace('Stacked containers', 'Stacked')}</button>)}
      </div>
      {isContainerKind(opts.wall) && <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Paint</span>
        {CONTAINER_LOOKS.map(l => <button key={l.id} style={{ ...btn(opts.look === l.id), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, look: l.id })}>{l.name}</button>)}
      </div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }} title="Defense in depth: rings inside the outer wall, each with its own wall, gate and towers. On a slope they follow the contour up the hill. Each manned ring makes a crew take another wall under fire; each needs two armed adults.">
        <span style={{ flex: 1, color: DIM }}>Rings</span>
        {[1, 2, 3, 4].map(n => <button key={n} style={{ ...btn(opts.rings === n), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, rings: n })}>{n}</button>)}
      </div>
      {opts.rings > 1 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Inner walls</span>
        {RING_WALLS.map(k => <button key={k} style={{ ...btn(opts.ringWall === k), padding: '2px 7px', fontSize: 11.5 }} title={PERIMETER[k].blurb} onClick={() => setOpts({ ...opts, ringWall: k })}>{PERIMETER[k].name.replace('Poured-concrete wall', 'Concrete').replace('Stone-and-timber wall', 'Stone').replace('Container wall', 'Containers').replace('Stacked containers', 'Stacked')}</button>)}
        <button style={{ ...btn(opts.ringGates === 'alternate'), padding: '2px 7px', fontSize: 11.5 }} title="Gates on opposite sides, ring by ring: a crew has to walk round each" onClick={() => setOpts({ ...opts, ringGates: opts.ringGates === 'alternate' ? 'aligned' : 'alternate' })}>{opts.ringGates === 'alternate' ? 'Gates alternate' : 'Gates aligned'}</button>
      </div>}
      {opts.rings > 1 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }} title="A small man-door in each inner wall, opposite its main gate. A crew finds it and funnels to it (the manned rings hold a few seconds less), and the defenders can sortie from it and catch the crew at the wall from the flank. Costs lumber and hardware per ring.">
        <span style={{ flex: 1, color: DIM }}>Sally ports</span>
        <button style={{ ...btn(opts.ringSally), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, ringSally: !opts.ringSally })}>{opts.ringSally ? 'Yes' : 'No'}</button>
      </div>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Towers</span>
        {Array.from({ length: MAX_TOWERS + 1 }, (_, n) => <button key={n} style={{ ...btn(opts.towers === n), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, towers: n })}>{n}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Start them as</span>
        {RING_TOWER_KINDS.map(k => <button key={k} style={{ ...btn(opts.towerKind === k), padding: '2px 7px', fontSize: 11.5 }} title={TOWERS[k].blurb} onClick={() => setOpts({ ...opts, towerKind: k })}>{TOWERS[k].name}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }} title="A road gate in the wall on the road side, with the gatehouse garage across it. Off: a closed wall with no gate, for a compound whose way in is somewhere else (a rock tunnel's door, a bridge).">
        <span style={{ flex: 1, color: DIM }}>A gate and gate garage on the road side</span>
        <button style={{ ...btn(opts.gate), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, gate: !opts.gate, ...(opts.gate ? { motorCourt: false } : {}) })}>{opts.gate ? 'Yes' : 'No'}</button>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }} title="A gravel forecourt in front of the gate garage, 18 x 12 m, fenced in black steel bars with a drive gate and six bays: the fleet parks here before the open yard, and a vehicle behind the bars is far harder for a crew to drive off. Needs your land outside the gate.">
        <span style={{ flex: 1, color: DIM }}>Motor court in front of the gate</span>
        <button style={{ ...btn(opts.motorCourt), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, motorCourt: !opts.motorCourt })}>{opts.motorCourt ? 'Yes' : 'No'}</button>
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Underground passage garage to house</span>
        <button style={{ ...btn(opts.passage), padding: '2px 7px' }} onClick={() => setOpts({ ...opts, passage: !opts.passage })}>{opts.passage ? 'Yes' : 'No'}</button>
      </div>
      {plan && <div style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, margin: '6px 0', padding: '6px 0' }}>
        {nothing ? <Note tone="good">Nothing to add: the line is already held and has what this plan would give it.</Note> : <>
          <div>{PERIMETER[opts.wall].name} <b>{plan.wall.wallM.toLocaleString('en-US')} m</b>{opts.scope === 'core' && !plan.coreIsFull && <span style={{ color: DIM }}> round the compound</span>}{plan.wall.heldM > 0 && <span style={{ color: DIM }}> · {plan.wall.heldM.toLocaleString('en-US')} m already held</span>}</div>
          {plan.wall.creekCrossings > 0 && <div>Creek bars at <b>{plan.wall.creekCrossings}</b> crossing{plan.wall.creekCrossings > 1 ? 's' : ''}</div>}
          <div>Patrol walkway on top <b>{Math.round(plan.walkwayLen * 6).toLocaleString('en-US')} m</b>{plan.walkwayRuns > 0 && <span style={{ color: DIM }}> · stairs at the gate and every ~80 m</span>}</div>
          <div>{plan.garage ? <>Gate at the road: a gatehouse garage where the driveway crosses the wall <span style={{ color: DIM }}>· 4 bays, a steel drive-through gate</span></> : <span style={{ color: DIM }}>{plan.wall.gateSpot ? 'Gate at the road: an ordinary gate where the driveway crosses (no gate garage)' : 'No gate garage'}</span>}</div>
          {plan.ringPlan && plan.ringPlan.rings.length > 0 && <div>Inner rings <b>{plan.ringPlan.rings.length}</b> <span style={{ color: DIM }}>· {plan.ringPlan.contour ? 'along the contour of the hill' : 'stepped in from the outer wall'} · {plan.ringPlan.rings.reduce((a, r) => a + r.towers.length, 0)} towers · two armed adults man each</span></div>}
          <div>Towers <b>{plan.towers.length}</b> <span style={{ color: DIM }}>· {TOWERS[opts.towerKind].name.toLowerCase()}, upgradeable in place</span></div>
          {opts.passage && <div>{plan.passage ? <>Underground passage to the house</> : <span style={{ color: DIM }}>No passage yet</span>}</div>}
          <div style={{ marginTop: 3 }}>Cost <b>{usd(plan.cost)}</b>{plan.permits > 0 && <span style={{ color: DIM }}> (permits {usd(plan.permits)})</span>}{own ? <span style={{ color: DIM }}> + {own}</span> : null} · <b>{plan.hours.toLocaleString('en-US')} h</b> of work</div>
          <div style={{ color: DIM, fontSize: 11.5 }}>With everything else on the list: {eta(weeks)}.</div>
          {plan.notes.map(n => <Note key={n} tone="warn">{n}</Note>)}
          {slowHint(game, weeks, pace, 10) && <Note tone="warn">{slowHint(game, weeks, pace, 10)}</Note>}
          {game.money < plan.cost && <Note tone="warn">You have {usd(game.money)}: the materials are bought as you can pay (Supplies: Order what the plans need).</Note>}
          <button style={{ ...btn(true), width: '100%', marginTop: 4 }} onClick={() => { const n = g.fortifyRing(w.siteGeo ?? {}, opts); if (n.runs + n.structures > 0) setLaid(true); }}>Lay it out: {usd(plan.cost)}, {plan.hours} h</button>
        </>}
      </div>}
    </>}
  </div>;
}
