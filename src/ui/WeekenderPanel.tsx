/**
 * Family → Two homes: the weekender's week (sim/weekender.ts). Where the family is and when it next
 * changes, the drive, the caretaker, the lights while away, the town house (its price, what it costs,
 * move in / sell), and what the empty place has cost.
 */
import { useGameStore } from '../store/gameStore';
import { dayIndex } from '../sim/state';
import { fleetOf } from '../sim/vehicles';
import {
  BELT_MORALE, CARETAKER, CARETAKER_KINDS, caretakerProblem, dismissCaretaker, emptyNow, hireCaretaker, isRented, marketFactor, mortgagePayment, nextChange, residents, openMoveIn,
  saleBlock, saleQuote, sellTown, setAwayLights, setBelt, siteDaysPerWeek, townCostPerDay, townTaxHalf, townUpkeepNow,
} from '../sim/weekender';
import { weekendBudget } from '../sim/weekendPlan';
import { Note, Row, Section } from './hud/common';
import { btn, DIM, TONE, usd } from './hud/style';

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const clockText = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

export function WeekenderPanel() {
  const g = useGameStore();
  const game = g.game, w = game.weekend;
  if (!w) return null;
  const split = w.mode === 'split';
  const next = nextChange(game);
  const days = next ? next.t - game.clock.t : null;
  const when = next ? `${WEEKDAY[((dayIndex(next.t) % 7) + 7) % 7]} ${clockText(((next.t + 0.25) % 1) * 24)}` : null;
  const q = saleQuote(game), block = saleBlock(game);
  const cars = w.cars.map(id => fleetOf(game).find(v => v.id === id)).filter(Boolean);
  const hours = Math.round(w.driveMiles / 55 * 10) / 10;
  const cost = townCostPerDay(w) * 30;
  const rented = isRented(w.town);
  const budget = weekendBudget(game);

  if (!split) {
    // moved in: only the town house remains
    if (w.town.status === 'owned' || w.town.soldDay === -1) return null;
    return <Section title="The town house">
      {w.town.status === 'sold'
        ? <Row label="Sold" value={usd(w.town.soldFor ?? 0)} title={`The sale cleared ${usd(w.town.net ?? 0)} after the agent and the mortgage`} />
        : <>
          <Row label="Kept as a fallback" value={`${w.driveMiles} miles away`} title="Somewhere to go if the place falls; the bug-out destination" />
          <Row label="It costs" value={`${usd(cost)} a month`} tone="warn" title={`Mortgage ${usd(mortgagePayment(w.town))} + upkeep ${usd(townUpkeepNow(w))}, while the banks work`} />
          {q && <Row label="Would sell for" value={block ? 'no buyers' : `${usd(q.net)} after the mortgage`} tone={block ? 'bad' : undefined} title={block ?? `${Math.round(q.factor * 100)} % of its worth, less the agent and ${usd(q.mortgage)} owed`} />}
          <button style={{ ...btn(), width: '100%', marginTop: 3 }} disabled={!!block} title={block ?? 'Sell it now: the mortgage first, the rest to the account'} onClick={() => g.money(d => sellTown(d))}>Sell the town house</button>
        </>}
    </Section>;
  }

  return <Section title="Two homes">
    <Row label="Right now" value={w.stranded ? <span style={{ color: TONE.bad }}>caught in town</span> : w.here ? 'on the place' : 'in town'} />
    {when && days !== null && <Row label={next!.arriving ? 'Next up the road' : 'Next back to town'} value={`${when}${days >= 1 ? ` (${Math.round(days * 10) / 10} d)` : ` (${Math.max(1, Math.round(days * 24))} h)`}`} />}
    <Row label="On the place" value={`about ${Math.round(siteDaysPerWeek(game.clock.startDoy) * 10) / 10} days a week`} title="Friday night to Sunday afternoon, the holidays, and three vacation weeks a year" />
    <Row label="The drive" value={`${w.driveMiles} miles · ${hours} h each way`} title={`${cars.length ? cars.length + ' of the fleet' : 'the town car'} makes the trip; fuel, miles and wear are counted`} />
    <Row label="Trips so far" value={`${w.tally.trips} · ${w.tally.miles.toLocaleString('en-US')} mi · ${usd(w.tally.spent)} spent`} title="Fuel, the town car, the caretaker, the mortgage and the town house's bills, since the start" />

    <div style={{ marginTop: 6, fontSize: 12, color: DIM }}>While you are away</div>
    {w.caretaker
      ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <span title={CARETAKER[w.caretaker.kind].blurb}>{CARETAKER[w.caretaker.kind].name} <span style={{ color: DIM }}>· {usd(CARETAKER[w.caretaker.kind].perMonth)}/mo{w.caretaker.missed ? ` · missed ${w.caretaker.missed}` : ''}</span></span>
        <button style={btn()} onClick={() => g.daily(d => { dismissCaretaker(d); return null; })}>Let go</button>
      </div>
      : residents(game).length > 0
        ? <Note>{residents(game).map(p => p.first).join(' and ')} live on the place and are here on weekdays, so it is not empty. A caretaker would still take the heavy work off them.</Note>
        : <Note tone="warn">Nobody is looking after the place Monday to Friday. The animals go unfed, the garden unwatered, and an empty place is far likelier to be broken into.</Note>}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '3px 0' }}>
      {CARETAKER_KINDS.filter(k => w.caretaker?.kind !== k).map(k => {
        const why = caretakerProblem(game, k);
        return <button key={k} style={btn()} disabled={!!why} title={why ?? CARETAKER[k].blurb} onClick={() => g.money(d => hireCaretaker(d, k))}>{CARETAKER[k].name.replace(/^An? /, '')} · {usd(CARETAKER[k].perMonth)}</button>;
      })}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 3 }}>
      <span style={{ color: DIM }}>Lights while away</span>
      <span style={{ display: 'flex', gap: 4 }}>
        <button style={btn(w.lights === 'timers')} title="Lamps on timers in the evening: the place looks lived in" onClick={() => g.daily(d => setAwayLights(d, 'timers'))}>On timers</button>
        <button style={btn(w.lights === 'dark')} title="Everything off: nothing to see from the road. In peacetime an obviously dark house invites trouble; after the warning it is what you want" onClick={() => g.daily(d => setAwayLights(d, 'dark'))}>Dark</button>
      </span>
    </div>
    <Note>The pump, the freezers and the solar and batteries (if built) keep running on their own. The stove is kept at frost protection.{emptyNow(game) ? ' The place is empty right now.' : ''}</Note>

    <div style={{ marginTop: 6, fontSize: 12, color: DIM }}>{rented ? 'The rented place in town' : 'The town house'}</div>
    {rented && <>
      <Row label="Rent" value={`${usd(w.town.rent!)} a month`} title="No mortgage, no property tax, nothing to sell: moving in is giving notice, and the deposit comes back" />
      <Row label="Moving in" value="give notice" title="There is no house to sell and none to fall back on" />
    </>}
    {!rented && q && <>
      <Row label="Worth" value={`${usd(q.value)}`} title={`${Math.round(marketFactor(game) * 100)} % of what it would fetch in a normal market (${usd(w.town.value)}); it falls as the signs grow`} tone={marketFactor(game) < 0.9 ? 'warn' : undefined} />
      <Row label="Owed" value={usd(q.mortgage)} />
      <Row label="Costs" value={`${usd(cost)} a month`} title={`Mortgage ${usd(mortgagePayment(w.town))} + upkeep ${usd(townUpkeepNow(w))}${w.belt ? ' (belt tight)' : ''} + property tax ${usd(townTaxHalf(w.town))} twice a year`} />
      <Row label="Sells for" value={block ? 'no buyers' : q.net >= 0 ? `${usd(q.net)} clear` : `${usd(-q.net)} short`} tone={block ? 'bad' : q.net < 0 ? 'warn' : undefined} title={block ?? 'After the agent and closing (6 %) and the mortgage'} />
    </>}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ color: DIM }} title="Cheaper upkeep and groceries on the weekdays; the cost is a little lower mood in town">Belt in town</span>
      <span style={{ display: 'flex', gap: 4 }}>
        <button style={btn(!w.belt)} title="The family's ordinary weekdays" onClick={() => g.daily(d => setBelt(d, false))}>Normal</button>
        <button style={btn(!!w.belt)} title={`Thermostat down, no streaming or yard service, fewer weekday extras${budget ? `: saves about ${usd(budget.beltSaves || 0)} a month` : ''}. Costs about ${BELT_MORALE} points of mood on the weekdays.`} onClick={() => g.daily(d => setBelt(d, true))}>Tight</button>
      </span>
    </div>
    {budget && <Row label="A month in numbers" value={<span style={{ color: budget.net < 0 ? TONE.bad : budget.net < 2000 ? TONE.warn : undefined }}>{budget.net >= 0 ? '+' : '\u2212'}{usd(Math.abs(budget.net))}</span>} title={`The jobs pay ${usd(budget.wages)} (paid holidays and vacations included); groceries and bills ${usd(budget.living)}; the town ${rented ? 'rent' : 'house'} ${usd(budget.town)}${budget.caretaker ? `; the caretaker ${usd(budget.caretaker)}` : ''}. Before building, orders and fuel.`} />}
    <button style={{ ...btn(true), width: '100%', marginTop: 4 }} title="Open the decision: sell and move in, move in and keep the town house, or hold on" onClick={() => g.money(d => openMoveIn(d))}>Move in now…</button>
    {(w.tally.breakIns + w.tally.vandalism + w.tally.squatters + w.tally.pipes + w.tally.theft) > 0 && <Note tone="warn">The empty place so far: {[w.tally.breakIns && `${w.tally.breakIns} break-in${w.tally.breakIns > 1 ? 's' : ''}`, w.tally.vandalism && `${w.tally.vandalism} vandalism`, w.tally.squatters && `${w.tally.squatters} squatters`, w.tally.pipes && `${w.tally.pipes} burst pipe${w.tally.pipes > 1 ? 's' : ''}`, w.tally.theft && `${w.tally.theft} stolen deliver${w.tally.theft > 1 ? 'ies' : 'y'}`].filter(Boolean).join(', ')}.</Note>}
  </Section>;
}
