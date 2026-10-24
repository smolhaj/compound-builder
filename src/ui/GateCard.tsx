import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { defenseOf, postureOf, type Stance } from '../sim/encounters';
import { daysOfFood } from '../sim/needs';
import { AFTERMATH_TEXT } from '../sim/aftermath';
import { canPay, DOUBLE_CROSS } from '../sim/rescue';
import type { Caliber } from '../sim/armory';

const STANCE: Record<Stance, [string, string]> = {
  hide: ['Hide', 'Lights out, everyone underground or into the timber. They may never know you\'re here, or they may take what they find.'],
  parley: ['Parley', 'Talk at the gate. A good negotiator can send them off with little.'],
  warn: ['Warn off', 'Show the walls and the rifles. Opportunists turn around; some don\'t.'],
  defend: ['Defend', 'Hold the line. Walls, fighters, the armory and allies on the radio decide it.'],
  trade: ['Trade', 'Offer something for peace, or for what they carry.'],
  take_in: ['Take them in', 'They join the family: more hands, more mouths.'],
  trial: ['A month\'s trial', 'They stay and work for their keep. You\'ll see what they\'re made of.'],
  turn_away: ['Turn them away', 'The gate stays shut.'],
  call_911: ['Lock in and call 911', 'Everyone behind the safe-room or a locked bedroom door, on the phone with dispatch. They\'ll likely take something and be gone before the deputies come.'],
  shout: ['Lights on and shout', 'Every light on, and a shout down the stairs that the police are coming. Most burglars run.'],
  pay: ['Pay them', 'Hand it over at the gate and pray they keep their word.'],
  refuse: ['Refuse', 'Send them off with nothing.'],
  confront: ['Confront them', 'Gun in hand. They\'ll probably run, but a shooting means the sheriff\'s investigation, lawyers, and the guns held as evidence.'],
};

/** At the gate with a ransom: the same stances, in their words. */
const RANSOM: Partial<Record<Stance, [string, string]>> = {
  pay: ['Pay what they ask', 'Load it by the gate at first light. One of you, unarmed. They may keep their word, keep the goods, or come shooting.'],
  parley: ['Haggle', 'Talk them down. A good talker can cut it nearly in half; push too hard and they walk.'],
  refuse: ['Refuse', 'Pay once and they come back every month. They may not ask again.'],
};

const box: CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 460, maxWidth: 'calc(100vw - 32px)', background: 'rgba(24,22,18,0.97)', color: '#eee', borderRadius: 12, padding: '18px 20px', zIndex: 9, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', fontSize: 13.5 };
const button = (primary: boolean): CSSProperties => ({ padding: '7px 12px', borderRadius: 7, border: 0, cursor: 'pointer', background: primary ? '#d8c9a0' : '#3a3d34', color: primary ? '#1c1d18' : '#eee', fontSize: 13, textAlign: 'left' });

/** Someone at the gate: the dossier and the stances (the game is paused); then what happened. */
export function GateCard() {
  const g = useGameStore();
  const gate = g.game.gate;
  const e = gate.pending;
  if (e) {
    const p = postureOf(g.game), def = defenseOf(p);
    return (
      <div style={box}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>{e.kind === 'break_in' ? 'In the night' : e.kind === 'ransom' ? 'Word about your child' : 'At the gate'}</div>
        <div style={{ fontSize: 19, fontWeight: 700, margin: '2px 0 8px' }}>{e.title}</div>
        {e.dossier.filter(Boolean).map((l, i) => <div key={i} style={{ marginBottom: 4, opacity: 0.9 }}>{l}</div>)}
        {e.kind === 'arrival' && !g.game.food.fromStores && (() => {
          const here = g.game.personState.filter(ps => ps.needs.died == null).length, days = daysOfFood(g.game);
          return <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>Put by: {Math.round(days)} days of food for {here}; with them, {Math.round(days * here / (here + e.size))} days.</div>;
        })()}
        {e.ransom && (() => {
          const t = e.ransom, gm = g.game;
          const have = [...(Object.keys(t.goods) as Array<keyof typeof gm.stock>).map(k => `${Math.floor(gm.stock[k])} ${k}`), ...(Object.keys(t.ammo) as Caliber[]).map(k => `${gm.armory.ammo[k] ?? 0} rounds of ${k}`)].join(', ');
          return <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>You have: {have}{canPay(gm, t) ? '' : ' (not enough for all of it)'} · a double-cross is {e.temper === 'savage' ? 'a real risk with this crew' : e.temper === 'hard' ? 'possible' : 'unlikely'} (about {Math.round(DOUBLE_CROSS[e.temper ?? 'savage'] * 100)} %)</div>;
        })()}
        {e.strength > 0 && e.kind !== 'break_in' && <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>
          {e.size} {e.armed ? 'armed' : 'unarmed'} · their strength {e.strength} vs your defense {Math.round(def)} · walls {Math.round(p.barrier)} % · seen early {Math.round(p.detection)} %{p.bunker ? ' · bunker to hide in' : ''}
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {e.stances.map((st, i) => (
            <button key={st} style={button(i === 0)} title={(e.ransom && RANSOM[st] || STANCE[st])[1]} onClick={() => g.answer(st)}>
              <div style={{ fontWeight: 600 }}>{(e.ransom && RANSOM[st] || STANCE[st])[0]}</div>
              <div style={{ fontSize: 11.5, opacity: 0.75 }}>{(e.ransom && RANSOM[st] || STANCE[st])[1]}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const c = gate.card;
  const a = gate.aftermath;
  if (!c && a) {
    const meds = Math.floor(g.game.stock.meds) + Math.floor(g.game.stock.ifak);
    return (
      <div style={box}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>After the shooting</div>
        <div style={{ fontSize: 19, fontWeight: 700, margin: '2px 0 8px' }}>{a.wounded ? `${a.wounded === 1 ? 'One of them is' : `${a.wounded} of them are`} still out there` : 'The bodies'}</div>
        {a.wounded > 0 && <div style={{ marginBottom: 4, opacity: 0.9 }}>{a.wounded === 1 ? 'He\'s down on the drive, hurt, calling for help.' : 'They\'re down on the drive, hurt. One of them is calling for his mother.'}</div>}
        {a.dead > 0 && <div style={{ marginBottom: 4, opacity: 0.9 }}>{a.dead === 1 ? 'One didn\'t get up.' : `${a.dead} didn't get up.`} They'll have to be buried.</div>}
        {a.wounded > 0 && <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>Dressings on hand: {meds} (meds and IFAKs) · humanity {Math.round(gate.humanity)}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {(a.wounded > 0 ? (['treat_release', 'hold', 'leave', 'finish'] as const) : (['leave'] as const)).map((ch, i) => (
            <button key={ch} style={button(i === 0)} onClick={() => g.decideAftermath(ch)}>
              <div style={{ fontWeight: 600 }}>{a.wounded > 0 ? AFTERMATH_TEXT[ch][0] : 'Bury them'}</div>
              {a.wounded > 0 && <div style={{ fontSize: 11.5, opacity: 0.75 }}>{AFTERMATH_TEXT[ch][1]}</div>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (!c) return null;
  const color = c.tone === 'good' ? '#a8d080' : c.tone === 'bad' ? '#f08070' : '#e8c880';
  return (
    <div style={box}>
      <div style={{ height: 4, background: color, borderRadius: 2, marginBottom: 12 }} />
      <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{c.title}</div>
      <div style={{ marginBottom: 8, opacity: 0.9 }}>{c.text}</div>
      {c.lines.map((l, i) => <div key={i} style={{ fontSize: 12.5, opacity: 0.85 }}>{l}</div>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button style={button(true)} onClick={() => g.dismissCard()}>Carry on</button>
      </div>
    </div>
  );
}
