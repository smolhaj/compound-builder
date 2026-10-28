/**
 * Housing: who sleeps where tonight, the beds, couches, floor room and tents,
 * and what to do about a shortage (sim/housing.ts). Also the gate card's
 * "where would they sleep" lines.
 */
import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { BLUEPRINTS, totalBill } from '../sim/blueprints';
import { MATERIALS, type MaterialId } from '../sim/materials';
import { orderCost, orderProblem } from '../sim/economy';
import { arrivalOutlook, BAG_PRICE, cachedPlan, housingFixes, SPOT_ORDER, TENT_PRICE, type SpotKind } from '../sim/housing';
import type { Person } from '../sim/family';

const DIM = 'rgba(238,238,238,0.6)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };
const small: CSSProperties = { fontSize: 11.5, lineHeight: 1.35, margin: '3px 0' };
const btn: CSSProperties = { padding: '3px 8px', borderRadius: 6, border: 0, cursor: 'pointer', background: '#3a3d34', color: '#eee', fontSize: 12 };

const WHERE: Record<SpotKind, string> = { bed: 'In beds', bunk: 'In bunks', couch: 'On the couch', floor: 'On the floor (bags)', tent: 'In tents', outbuilding: 'On the shop floor', nowhere: 'Nowhere (truck, porch)' };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const tone = (q: number) => (q >= 0.65 ? TONE.good : q >= 0.4 ? TONE.warn : TONE.bad);

/** The cost of a kit piece's own purchases (what the Build list shows). */
const homeCost = (kind: string) => orderCost(Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));

export function HousingPanel() {
  const g = useGameStore();
  const game = g.game;
  const plan = cachedPlan(game);
  if (plan.sleepers.length === 0) return null;
  const cap = plan.cap;
  const fixes = housingFixes(game, homeCost);
  const names = (k: SpotKind) => plan.sleepers.filter(x => x.spot.kind === k).map(x => ({ x, p: game.people.find(p => p.id === x.id) }));
  const f = Math.round(plan.night.lowF);
  const buy = (item: 'tent' | 'sleeping_bag', qty: number) => {
    const lines = [{ material: item, qty }];
    const why = orderProblem(game, lines);
    return <button key={item} style={{ ...btn, opacity: why ? 0.5 : 1, cursor: why ? 'not-allowed' : 'pointer' }} disabled={!!why} title={why ?? `Order ${qty} to the road`} onClick={() => g.order(lines)}>Buy {qty} {item === 'tent' ? (qty === 1 ? 'tent' : 'tents') : (qty === 1 ? 'bag' : 'bags')} {usd(qty * (item === 'tent' ? TENT_PRICE : BAG_PRICE))}</button>;
  };
  return (
    <div style={{ marginBottom: 10 }} data-testid="housing">
      <div style={h3}>Housing</div>
      <div style={{ ...small, color: DIM }}>
        Beds {cap.beds + cap.bunks} · couches {cap.couches} · floor room for {cap.floorBags} bags · tents {cap.tents} + the wall tent ({cap.tentSeats} seats) · {cap.bags} {cap.bags === 1 ? 'bag' : 'bags'}
      </div>
      <div style={{ ...small, color: DIM }}>Tonight: low about {f}°F{plan.night.stormy ? ', storm' : plan.night.rainy ? ', rain' : plan.night.snowy ? ', snow' : ''}{plan.stove ? '' : ', no firewood for the stove'}.</div>
      {SPOT_ORDER.filter(k => plan.counts[k] > 0).map(k => (
        <div key={k} style={{ ...small, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: DIM }}>{WHERE[k]}</span>
          <span style={{ textAlign: 'right' }}>{names(k).map(({ x, p }, i) => <span key={x.id} title={`${x.note}${x.morale < -0.5 ? `; morale ${Math.round(x.morale)}` : ''}${x.harm > 0.05 ? '; it costs health' : ''}`} style={{ color: tone(x.quality) }}>{i ? ', ' : ''}{p?.first ?? x.id}{p && p.age <= 12 ? ` (${p.age})` : ''}</span>)}</span>
        </div>
      ))}
      {plan.noBed === 0
        ? <div style={{ ...small, color: TONE.good }}>Everybody has a bed{plan.bedsFree > 0 ? `; ${plan.bedsFree} more could be taken in` : ''}.</div>
        : <>
          <div style={{ ...small, color: plan.outside > 0 ? TONE.bad : TONE.warn }}>
            {plan.noBed} {plan.noBed === 1 ? 'person has' : 'people have'} no bed{plan.outside > 0 ? `, ${plan.outside} out in the weather` : ''}. Poor sleep wears on morale{plan.sleepers.some(x => x.harm > 0.05) ? ' and health' : ''}.
          </div>
          {fixes.length > 0 && <div style={{ ...small, color: DIM }}>Fix: {fixes.map(x => x.text).join(', or ')}.</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            {fixes.filter(x => x.action === 'buy').map(x => buy(x.item as 'tent' | 'sleeping_bag', x.qty))}
          </div>
        </>}
    </div>
  );
}

/** At the gate: where these people would sleep if you took them in. */
export function ArrivalHousing({ people }: { people: readonly Person[] }) {
  const game = useGameStore(s => s.game);
  if (!people.length) return null;
  const o = arrivalOutlook(game, people);
  const bad = o.guests.nowhere > 0 || o.worst < -8;
  return (
    <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.85, color: bad ? TONE.bad : undefined }} data-testid="arrival-housing">
      {o.lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
