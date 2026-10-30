/**
 * Utilities → Vehicles & garage: the fleet (sim/vehicles.ts), where it is
 * kept (sim/garage.ts), what it costs to run, and the one-way bug-out
 * (sim/bugout.ts).
 */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { BUYABLE, buyVehicle, fleetOf, overdue, refuel, repairDays, serviceVehicle, SERVICE_MILES, SERVICE_USD, stripForParts, vehicleName, VEHICLES, runs, type Vehicle, type VehicleKind } from '../sim/vehicles';
import { garageConnected, parkedText, parkingPlan } from '../sim/parking';
import { bugOut, bugOutPlan, type BugDest, type BugMode } from '../sim/bugout';
import { litersText } from '../sim/format';
import { Note, Row, Section } from './hud/common';
import { btn, DIM, TONE, usd } from './hud/style';

function statusOf(v: Vehicle, atTown = false): { text: string; tone: keyof typeof TONE | null } {
  if (v.fried) return { text: 'killed by the EMP', tone: 'bad' };
  if (v.condition <= 0) return { text: 'dead', tone: 'bad' };
  if (v.down) return { text: `broken down: ${v.down.part}${v.down.left !== undefined ? `, ${v.down.left} days` : ''}`, tone: 'bad' };
  if (v.away) return { text: atTown ? 'at the town house' : 'out on a run', tone: null };
  if (overdue(v)) return { text: 'overdue for a service', tone: 'warn' };
  return { text: 'runs', tone: 'good' };
}

export function FleetPanel() {
  const g = useGameStore();
  const game = g.game;
  const [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState<BugMode>('vehicle');
  const [dest, setDest] = useState<BugDest | undefined>(undefined);
  const vs = fleetOf(game);
  const plan = parkingPlan(game);
  const parts = Math.floor(game.stock.vehicle_parts * 10) / 10;
  const cansL = game.stock.fuel * 20;
  const bo = bugOutPlan(game, { mode, dest });
  const shopsOpen = game.disaster.tracks.stores >= 0.5 && game.disaster.tracks.fuel >= 0.5;
  const connected = garageConnected(game);
  return (
    <Section title="Vehicles & garage">
      <Row label="Parking" value={plan.slots ? `${plan.slots - plan.free} of ${plan.slots} bays` : 'no garage: all in the yard'} tone={plan.outside.length ? 'warn' : 'good'} title="A metal garage holds 3, the workshop 1, the barn 2. A motorhome takes two bays." />
      {connected && <Note tone="good">The garage is joined to the house by a covered way: the family reaches the vehicles without going outside.</Note>}
      {plan.yardSlots > 0 && <Row label="Equipment yard" value={`${plan.yardSlots - plan.yardFree} of ${plan.yardSlots} bays`} title="Vehicles with no roof stand in the yard's marked bays: fenced and lit, but still in the weather" />}
      {plan.outside.length > 0 && plan.slots === 0 && <Note>Weather wears what stands outside. A garage (Build → Home & work) keeps them dry.</Note>}
      {vs.map(v => {
        const st = statusOf(v, !!game.weekend && game.weekend.cars.includes(v.id)), def = VEHICLES[v.kind];
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
          ? <button style={{ ...btn(), width: '100%', opacity: bo.ok ? 1 : 0.5 }} title={bo.why ?? 'Plan the way out: how, where to, what you can carry and how risky the road is.'} onClick={() => setConfirm(true)}>Bug out…</button>
          : <div style={{ border: '1px solid #c9564a', borderRadius: 6, padding: 6 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <button style={btn(mode === 'vehicle')} title="Load the running vehicles: more people and cargo, one road" onClick={() => setMode('vehicle')}>By vehicle</button>
              <button style={btn(mode === 'foot')} title="On foot with packs: everyone goes, quick to leave, slow and exposed on the way" onClick={() => setMode('foot')}>On foot</button>
            </div>
            <select value={bo.dest} onChange={e => setDest(e.target.value as BugDest)} style={{ width: '100%', marginBottom: 4 }} aria-label="Where to">
              {bo.options.map(o => <option key={o.dest} value={o.dest}>{o.name}{o.miles ? ` (${o.miles} miles)` : ''}</option>)}
            </select>
            <Row label="Carrying" value={`${bo.mode === 'foot' ? `${bo.carryKg} kg, ${bo.bags} bug-out bag${bo.bags === 1 ? '' : 's'}` : `${bo.carryKg} kg in ${bo.vehicles.length} vehicle${bo.vehicles.length === 1 ? '' : 's'}`}`} title="Weight the party can carry. A packed bug-out bag (Shop, Defense) is 18 kg of the right things; a snatched pack is 3-6 kg." />
            <Row label="Food and water" value={`${bo.foodDays} days${bo.cacheDays ? ` + ${bo.cacheDays} in the cache` : ''}`} />
            <Row label={bo.mode === 'foot' ? 'Walk' : 'Fuel'} value={`about ${bo.rangeKm} km`} />
            <Row label="Time to leave" value={`${bo.hours} h${bo.covered ? ', under cover' : bo.mode === 'foot' ? '' : ', in plain view'}`} />
            {bo.miles > 0 && <Row label="Time on the road" value={bo.route.travelHours >= 48 ? `${Math.round(bo.route.travelHours / 24)} days` : `${bo.route.travelHours} h`} />}
            <Row label="Route risk" value={`${Math.round(bo.route.risk * 100)} % · ${bo.route.level}`} tone={bo.route.level === 'high' ? 'bad' : bo.route.level === 'moderate' ? 'warn' : 'good'} title="Chance something goes wrong on the way: a late arrival, a robbery, or worse" />
            {bo.route.legs.filter(l => l.risk >= 0.03).map(l => <div key={l.id} style={{ fontSize: 11, color: DIM }} title={l.why}>{Math.round(l.risk * 100)} % {l.name}: {l.why}</div>)}
            {bo.mode === 'vehicle' && bo.route.vehicleBlocked && <Note tone="bad">No vehicle gets out: {bo.route.vehicleBlocked}. {game.stock.bugout_bag ? 'Go on foot.' : 'A bug-out bag each would let the family walk.'}</Note>}
            <Note tone="bad">Bugging out ends this run. {bo.going.length} go ({bo.going.map(p => p.first).join(', ')}); {bo.left.length ? `${bo.left.map(p => p.first).join(', ')} stay behind. ` : ''}{bo.dest === 'cache' ? 'Two weeks of food and water wait in the cache.' : bo.dest === 'town' ? 'The town house is kept for exactly this.' : 'With nowhere to go the road is the only plan.'}</Note>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ ...btn(true), opacity: bo.ok ? 1 : 0.5 }} disabled={!bo.ok} title={bo.why ?? undefined} onClick={() => { g.money(d => bugOut(d, { mode, dest })); setConfirm(false); }}>Go now</button>
              <button style={btn()} onClick={() => setConfirm(false)}>Stay</button>
            </div>
          </div>}
        {!bo.ok && <Note>{`Bug out: ${bo.why}.`}</Note>}
        {!confirm && !game.stock.bugout_bag && !game.stock.bugout_cache && <Note>A packed bug-out bag each and a buried cache at a second site (Shop, Defense) make leaving faster and the arrival safer.</Note>}
      </div>}
    </Section>
  );
}
