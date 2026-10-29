/**
 * Family → Newcomers and carrying capacity (sim/newcomers.ts): how many mouths
 * the stores and fields carry, who joined from outside (neighbors, strangers,
 * guests sheltering) with their loyalty and what you have noticed about them,
 * and the choices: give them a place of their own, send them home or on.
 */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { dayIndex } from '../sim/state';
import { housingSummary } from '../sim/housing';
import { carryLines, carryOf, givePlace, loyaltyWord, originLabel, placeOptions, sendAway, trustWord } from '../sim/newcomers';
import { Note, Row, Section } from './hud/common';
import { DIM } from './hud/style';
import { whereText } from './kinText';

const btn = (primary = false) => ({ padding: '2px 7px', borderRadius: 6, border: 0, cursor: 'pointer', background: primary ? '#d8c9a0' : '#3a3d34', color: primary ? '#1c1d18' : '#eee', fontSize: 11.5 } as const);

export function NewcomersPanel() {
  const g = useGameStore();
  const game = g.game;
  const [pick, setPick] = useState<string | null>(null);
  const N = game.newcomers;
  const c = carryOf(game);
  const day = dayIndex(game.clock.t);
  const bonds = Object.values(N?.bonds ?? {}).filter(b => {
    const i = game.people.findIndex(p => p.id === b.id);
    return i >= 0 && game.personState[i].needs.died == null;
  });
  const gone = N?.departed.slice(-3).reverse() ?? [];
  if (!bonds.length && !gone.length && game.people.length < 5) return null;
  const tone = c.level === 'over' ? 'bad' : c.level === 'tight' ? 'warn' : 'good';
  const lines = carryLines(c);
  return (
    <Section title="Newcomers and carrying capacity">
      <div data-testid="carry-panel">
        <Row label="Mouths" value={`${c.people} · ${c.days === Infinity ? 'the fields cover it' : `${Math.round(c.days)} days of food`}`} tone={tone} title="Days of food put by at this headcount, after what the fields and animals grow" />
        <Row label="Carries for six months" value={`${c.people + c.headroom} people${c.headroom > 0 ? ` (${c.headroom} more)` : ''}`} tone={c.headroom > 0 ? 'good' : 'warn'} />
        <Row label="Beds" value={housingSummary(game).replace('beds ', '')} />
        {c.level === 'over' && !c.fromStores && <Note tone="bad">{lines[lines.length - 1]} The whole table feels it: morale falls, loyalty falls, and people start to leave.</Note>}
        {c.fromStores && c.level !== 'ok' && <Note tone="warn">The grocery stores are open, but what you hold for the day they close would carry this table only {Math.round(c.days)} days.</Note>}
      </div>
      {bonds.map(b => {
        const i = game.people.findIndex(p => p.id === b.id);
        const p = game.people[i];
        const mates = bonds.filter(x => x.kind === b.kind && x.neighbor === b.neighbor && x.since === b.since).map(x => x.id);
        const partyOpts = placeOptions(game, mates.length, mates);
        // a party too big for any one home: the person alone (and the rest in turn)
        const solo = partyOpts.length === 0 && mates.length > 1;
        const opts = solo ? placeOptions(game, 1, [b.id]) : partyOpts;
        const bar = Math.max(0, Math.min(100, b.loyalty));
        return <div key={b.id} style={{ padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span>{p.first} {p.last}, {p.age}</span>
            <span style={{ color: DIM, fontSize: 11 }}>{originLabel(game, p)}{b.guestUntil != null ? ` · ${Math.max(0, b.guestUntil - day)} more days` : ''}</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, marginTop: 2 }}>
            <span style={{ color: DIM, width: 34 }}>loyalty</span>
            <div title={`Loyalty ${Math.round(bar)}: ${loyaltyWord(b.loyalty)}`} style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${bar}%`, height: '100%', background: bar >= 60 ? '#9cc070' : bar >= 30 ? '#e0b050' : '#e06a50', borderRadius: 2 }} /></div>
            <span style={{ width: 84, textAlign: 'right', color: DIM }}>{loyaltyWord(b.loyalty)}</span>
          </div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 2 }}>{whereText(game, p.id)} · {trustWord(b, day)}</div>
          {b.tells.slice(-2).map((t, k) => <Note key={k} tone={b.revealed && (b.secret === 'thief' || b.secret === 'scout' || b.secret === 'lazy') ? 'warn' : undefined}>{t}</Note>)}
          <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
            {b.kind !== 'guest' && <button style={btn()} disabled={!opts.length} title={opts.length ? 'A building of their own: a door to close, and a better night' : 'No home with enough beds left (build a cottage or a guest house)'} onClick={() => setPick(pick === b.id ? null : b.id)}>Give {solo ? `${p.first} ` : mates.length > 1 ? 'them ' : ''}a place{opts.length ? '' : ' (none free)'}</button>}
            {b.neighbor && <button style={btn()} title="They go back to their own place, on good terms" onClick={() => g.money(d => sendAway(d, b.id, true))}>{b.kind === 'guest' ? 'Send them home' : 'Let them go home'}</button>}
            <button style={btn()} title="Thank them and point them down the road. It will be remembered." onClick={() => g.money(d => sendAway(d, b.id, false))}>Send away</button>
          </div>
          {pick === b.id && <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
            {opts.map(o => <button key={o.id} style={btn(true)} onClick={() => { const w = g.money(d => givePlace(d, b.id, o.id, solo)); if (!w) setPick(null); }}>{o.label} ({o.left} beds)</button>)}
          </div>}
        </div>;
      })}
      {gone.map((d, k) => <Note key={k}>{d.name} {d.why} (day {d.day}).</Note>)}
      {!bonds.length && <Note>Nobody from outside has joined yet. Neighbors in need and strangers at the gate can be taken in.</Note>}
      {bonds.some(b => !b.revealed && b.kind === 'stranger') && <Note>Strangers taken in without a trial: you will know them better in a few weeks.</Note>}
    </Section>
  );
}
