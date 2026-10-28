/**
 * Utilities → Vehicles & garage: the fleet (sim/vehicles.ts), where it is
 * kept (sim/garage.ts), what it costs to run, and the one-way bug-out
 * (sim/bugout.ts).
 */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BUYABLE, buyVehicle, fleetOf, overdue, refuel, repairDays, serviceVehicle, SERVICE_MILES, SERVICE_USD, stripForParts, vehicleName, VEHICLES, runs, type Vehicle, type VehicleKind } from '../sim/vehicles';
import { garageConnected, parkedText, parkingPlan } from '../sim/garage';
import { bugOut, bugOutPlan } from '../sim/bugout';
import { litersText } from '../sim/format';
import { Note, Row, Section } from './hud/common';
import { btn, DIM, TONE, usd } from './hud/style';

function statusOf(v: Vehicle): { text: string; tone: keyof typeof TONE | null } {
  if (v.fried) return { text: 'killed by the EMP', tone: 'bad' };
  if (v.condition <= 0) return { text: 'dead', tone: 'bad' };
  if (v.down) return { text: `broken down: ${v.down.part}${v.down.left !== undefined ? `, ${v.down.left} days` : ''}`, tone: 'bad' };
  if (v.away) return { text: 'out on a run', tone: null };
  if (overdue(v)) return { text: 'overdue for a service', tone: 'warn' };
  return { text: 'runs', tone: 'good' };
}

export function FleetPanel() {
  const g = useGameStore();
  const game = g.game;
  const [confirm, setConfirm] = useState(false);
  const vs = fleetOf(game);
  const plan = parkingPlan(game);
  const parts = Math.floor(game.stock.vehicle_parts * 10) / 10;
  const cansL = game.stock.fuel * 20;
  const bo = bugOutPlan(game);
  const shopsOpen = game.disaster.tracks.stores >= 0.5 && game.disaster.tracks.fuel >= 0.5;
  const connected = garageConnected(game);
  return (
    <Section title="Vehicles & garage">
      <Row label="Parking" value={plan.slots ? `${plan.slots - plan.free} of ${plan.slots} bays` : 'no garage: all in the yard'} tone={plan.outside.length ? 'warn' : 'good'} title="A metal garage holds 3, the workshop 1, the barn 2. A motorhome takes two bays." />
      {connected && <Note tone="good">The garage is joined to the house by a covered way: the family reaches the vehicles without going outside.</Note>}
      {plan.outside.length > 0 && plan.slots === 0 && <Note>Weather wears what stands outside. A garage (Build → Home & work) keeps them dry.</Note>}
      {vs.map(v => {
        const st = statusOf(v), def = VEHICLES[v.kind];
        const fuelPct = def.tankL ? v.fuel / def.tankL : 1;
        return <div key={v.id} style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span>{vehicleName(game, v)}</span>
            <span style={{ color: st.tone ? TONE[st.tone] : DIM }}>{st.text}</span>
          </div>
          <div style={{ fontSize: 11, color: DIM }}>
            {Math.round(v.mileage).toLocaleString('en-US')} mi · {Math.round(v.condition * 100)} %{def.tankL > 0 ? ` · ${litersText(v.fuel)} of ${litersText(def.tankL)}` : ''} · {parkedText(game, v.id)}
          </div>
          {def.tankL > 0 && runs(v) && fuelPct < 0.5 && <Note tone={fuelPct < 0.15 ? 'bad' : 'warn'}>Tank low.</Note>}
          {v.down && v.down.left === undefined && <Note tone="warn">Needs a parts kit and someone who knows engines (about {repairDays(Math.max(0, ...game.people.map(p => p.skills.mechanic)))} days){shopsOpen ? ', or a tow to the shop' : ''}.</Note>}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
            {def.tankL > 0 && runs(v) && !v.away && <button style={btn()} title={shopsOpen ? 'Fill up at the pump' : 'Fill from the jerry cans'} onClick={() => g.money(d => { const x = fleetOf(d).find(y => y.id === v.id)!; return refuel(d, x) ? null : 'no fuel'; })}>Fill up</button>}
            {v.kind !== 'trailer' && !v.fried && v.condition > 0 && !v.away && <button style={btn()} title={`A service every ${SERVICE_MILES.toLocaleString('en-US')} miles: ${shopsOpen ? `${usd(SERVICE_USD)} at the shop` : 'a parts kit and a mechanic'}`} onClick={() => { const w = g.money(d => serviceVehicle(d, v.id)); if (w) alert(w); }}>Service</button>}
            {(v.fried || v.condition <= 0) && <button style={btn()} title="Two parts kits out of it" onClick={() => g.money(d => stripForParts(d, v.id))}>Strip for parts</button>}
          </div>
        </div>;
      })}
      <Row label="Parts kits" value={`${parts}`} tone={parts < 1 ? 'warn' : undefined} title="Filters, belts, hoses, plugs, a pump: one kit mends a breakdown or services a vehicle. Bought in the Shop (Fuel & hire), or stripped from a dead one." />
      <Row label="Fuel in the cans" value={litersText(cansL)} />
      {BUYABLE.filter(k => vs.filter(v => v.kind === k).length < VEHICLES[k].max && (k !== 'pickup' || vs.some(v => v.kind === 'pickup'))).map((k: VehicleKind) => (
        <button key={k} style={{ ...btn(), width: '100%', marginTop: 3, textAlign: 'left' }} title={VEHICLES[k].blurb} disabled={game.money < VEHICLES[k].price || game.disaster.tracks.stores < 0.5} onClick={() => { const w = g.money(d => buyVehicle(d, k)); if (w) alert(w); }}>
          Buy {VEHICLES[k].name.toLowerCase()} ({usd(VEHICLES[k].price)}) · seats {VEHICLES[k].seats}
        </button>
      ))}
      {game.disaster.kind && <div style={{ marginTop: 6 }}>
        {!confirm
          ? <button style={{ ...btn(), width: '100%', opacity: bo.ok ? 1 : 0.5 }} disabled={!bo.ok} title={bo.why ?? 'Load up and leave. This ends the run.'} onClick={() => setConfirm(true)}>Bug out…</button>
          : <div style={{ border: '1px solid #c9564a', borderRadius: 6, padding: 6 }}>
            <Note tone="bad">Bugging out ends this run. {bo.going.length} go ({bo.going.map(p => p.first).join(', ')}); {bo.left.length ? `${bo.left.map(p => p.first).join(', ')} stay behind. ` : ''}{bo.foodDays} days of food and water, fuel for about {bo.rangeKm} km, {bo.hours} h to load{bo.covered ? ', all of it under cover' : ', in plain view'}.</Note>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={btn(true)} onClick={() => { g.money(d => bugOut(d)); setConfirm(false); }}>Go now</button>
              <button style={btn()} onClick={() => setConfirm(false)}>Stay</button>
            </div>
          </div>}
        {!bo.ok && <Note>{`Bug out: ${bo.why}.`}</Note>}
      </div>}
    </Section>
  );
}
