/**
 * The county road (sim/roadWarn.ts, sim/roadPassers.ts): a small card bottom-left when something is on the road that wants an answer
 * (a visitor you have seen coming, a party stopped at the line, a passer you can wave down), and a Road section in the Family tab with
 * what shows from the road, what people say, and the roadblock.
 */
import { useGameStore } from '../store/gameStore';
import { dayIndex } from '../sim/state';
import { sightParts, sightUnits, warnMinutes, greeterCandidate, describeParty } from '../sim/roadWarn';
import { blockProblem, hailable, describePass, lotsText, roadSummary, PASS } from '../sim/roadPassers';
import { have } from '../sim/barter';
import { Note, Row, Section } from './hud/common';
import { DIM, btn } from './hud/style';
import { useState } from 'react';
import { toFeet } from '../sim/units';

const card = { position: 'fixed', left: 12, bottom: 64, width: 'min(330px, calc(100vw - 24px))', zIndex: 20, background: 'rgba(20,22,18,0.92)', color: '#eee', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, boxShadow: '0 4px 18px rgba(0,0,0,0.45)', pointerEvents: 'auto' } as const;
const ft = (units: number): number => Math.round(toFeet(units * 6) / 10) * 10;
const b = (primary = false, off = false) => ({ ...btn(primary), padding: '3px 8px', fontSize: 12, opacity: off ? 0.4 : 1, marginRight: 4, marginTop: 4 });

export function RoadAlert() {
  const g = useGameStore();
  const game = g.game, road = game.road, inc = game.gate.incoming;
  const [msg, setMsg] = useState('');
  const run = (f: () => string | null) => setMsg(f() ?? '');
  if (game.gate.pending) return null;
  // a visitor you have seen coming
  if (inc && inc.from !== undefined && inc.seen !== undefined) {
    const mins = Math.max(0, Math.round((inc.at - game.clock.t) * 1440));
    const prep = road?.prep;
    const greeter = greeterCandidate(game);
    return <div data-testid="road-alert" style={card}>
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>On the county road</div>
      <div style={{ margin: '2px 0 4px' }}>{describeParty(game, inc.e)}, about {mins >= 60 ? `${Math.round(mins / 6) / 10} hours` : `${mins} minutes`} out.</div>
      {prep ? <Note>{prep.kind === 'greeter' ? 'A greeter is at the drive.' : 'The gate is shut and manned.'}</Note> : <>
        <button style={b(false, !greeter)} disabled={!greeter} title="An adult walks down to the drive and reads them before the card (better detection)" onClick={() => run(() => g.prepareForVisitors('greeter'))}>Send a greeter{greeter ? ` (${greeter.first})` : ''}</button>
        <button style={b(false, false)} title="Shut and man the gate: a stronger line if they turn out to be trouble" onClick={() => run(() => g.prepareForVisitors('gate'))}>Ready the gate</button>
      </>}
      {msg && <Note tone="warn">{msg}</Note>}
    </div>;
  }
  if (!road) return null;
  const h = road.hail;
  if (h) {
    const short = h.want.some(l => have(game, l.good) < l.qty);
    return <div data-testid="road-hail" style={card}>
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>At the line</div>
      <div style={{ margin: '2px 0 4px' }}>{h.text}</div>
      {short && <Note tone="warn">You are short of {lotsText(h.want)}.</Note>}
      <button style={b(true, short)} disabled={short} onClick={() => run(() => g.answerRoadHail('accept'))}>Swap</button>
      <button style={b(false, !!h.haggled)} disabled={!!h.haggled} title="A good talker may get a little more" onClick={() => run(() => g.answerRoadHail('haggle'))}>Haggle</button>
      {h.begging && <button style={b()} title="Pass three cans over the fence" onClick={() => run(() => g.answerRoadHail('gift'))}>Give a few cans</button>}
      <button style={b()} onClick={() => run(() => g.answerRoadHail('decline'))}>No thanks</button>
      {msg && <Note tone="warn">{msg}</Note>}
    </div>;
  }
  const hs = hailable(game);
  if (hs.length) {
    const p = hs[0];
    return <div data-testid="road-wave" style={card}>
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>On the county road</div>
      <div style={{ margin: '2px 0 4px' }}>{describePass(p.party)} just went by.</div>
      <button style={b()} title="Wave them down to swap across the fence; the gate stays shut" onClick={() => run(() => g.hailPasser(p.id))}>Wave them down</button>
      {msg && <Note tone="warn">{msg}</Note>}
    </div>;
  }
  return null;
}

export function RoadSection() {
  const g = useGameStore();
  const game = g.game;
  const [msg, setMsg] = useState('');
  const run = (f: () => string | null) => setMsg(f() ?? '');
  if (!game.disaster.kind || game.clock.t < game.disaster.hitAt) return null;
  const road = game.road, sum = roadSummary(game), units = Math.round(sightUnits(game)), parts = sightParts(game);
  const blk = road?.block, day = dayIndex(game.clock.t);
  void day;
  return <Section title="The county road">
    <Row label="What shows from the road" value={sum.give} title="Lights after dark, smoke, noise and parties are what a passer notices (sim/opsec.ts)" />
    <Row label="Word on the road" value={sum.word} title="Turning people back costs it; fair dealing and handouts raise it" />
    <Row label="You can see" value={`${ft(units)} ft of road${units * 6 < 100 ? ' (put a watch up)' : ''}`} title={parts.map(p => `${p.label}: ${ft(p.units)} ft`).join('\n')} />
    <Row label="Warning of a visitor" value={warnMinutes(game) ? `${warnMinutes(game)} min` : 'none'} />
    {sum.lines.map((l, i) => <Note key={i}>{l}</Note>)}
    {!blk && <div>
      <button style={b(false, !!blockProblem(game, 'barrier'))} title={blockProblem(game, 'barrier') ?? `Sawhorses and a chain across the road at the drive (${PASS.BARRIER_LUMBER} lumber). Turns strangers back; costs word on the road.`} onClick={() => run(() => g.buildRoadBlock('barrier'))}>Roadblock</button>
      <button style={b(false, !!blockProblem(game, 'checkpoint'))} title={blockProblem(game, 'checkpoint') ?? `A manned checkpoint (${PASS.CHECKPOINT_LUMBER} lumber, ${PASS.CHECKPOINT_HARDWARE} hardware, two adults): filters traffic, sends travelers to a trading stop. Risk from armed crews.`} onClick={() => run(() => g.buildRoadBlock('checkpoint'))}>Checkpoint</button>
    </div>}
    {blk && <div>
      <Note>{blk.kind === 'checkpoint' ? 'Checkpoint' : 'Roadblock'} up: {blk.turned} turned back, {blk.passed} let through.</Note>
      {blk.kind === 'checkpoint' && <button style={b(blk.policy === 'inspect')} onClick={() => run(() => g.setRoadBlockPolicy('inspect'))}>Inspect and let through</button>}
      <button style={b(blk.policy === 'turn_back')} onClick={() => run(() => g.setRoadBlockPolicy('turn_back'))}>Turn everyone back</button>
      <button style={b()} onClick={() => run(() => g.removeRoadBlock())}>Take it down</button>
    </div>}
    {msg && <Note tone="warn">{msg}</Note>}
    <div style={{ fontSize: 11, color: DIM, marginTop: 3 }}>Armed crews you turn back may shoot or come back angry; turned-back families count against your good-neighbor record.</div>
  </Section>;
}
