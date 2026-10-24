import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { defenseOf, postureOf, type Stance } from '../sim/encounters';

const STANCE: Record<Stance, [string, string]> = {
  hide: ['Hide', 'Lights out, everyone underground or into the timber. They may never know you\'re here, or they may take what they find.'],
  parley: ['Parley', 'Talk at the gate. A good negotiator can send them off with little.'],
  warn: ['Warn off', 'Show the walls and the rifles. Opportunists turn around; some don\'t.'],
  defend: ['Defend', 'Hold the line. Walls, fighters, the armory and allies on the radio decide it.'],
  trade: ['Trade', 'Offer something for peace, or for what they carry.'],
  take_in: ['Take them in', 'They join the family: more hands, more mouths.'],
  trial: ['A month\'s trial', 'They stay and work for their keep. You\'ll see what they\'re made of.'],
  turn_away: ['Turn them away', 'The gate stays shut.'],
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
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>At the gate</div>
        <div style={{ fontSize: 19, fontWeight: 700, margin: '2px 0 8px' }}>{e.title}</div>
        {e.dossier.filter(Boolean).map((l, i) => <div key={i} style={{ marginBottom: 4, opacity: 0.9 }}>{l}</div>)}
        {e.strength > 0 && <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>
          {e.size} {e.armed ? 'armed' : 'unarmed'} · their strength {e.strength} vs your defense {Math.round(def)} · walls {Math.round(p.barrier)} % · seen early {Math.round(p.detection)} %{p.bunker ? ' · bunker to hide in' : ''}
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {e.stances.map((st, i) => (
            <button key={st} style={button(i === 0)} title={STANCE[st][1]} onClick={() => g.answer(st)}>
              <div style={{ fontWeight: 600 }}>{STANCE[st][0]}</div>
              <div style={{ fontSize: 11.5, opacity: 0.75 }}>{STANCE[st][1]}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }
  const c = gate.card;
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
