import { useBattleStore, type BattleLine } from '../store/battleStore';
import { useGameStore } from '../store/gameStore';
import type { Battle } from '../sim/battleTypes';

/** The speaker of a line: a resident's first name, or a raider (the leader called out). */
function speaker(b: Battle, people: ReadonlyArray<{ id: string; first: string }>, l: BattleLine): { name: string; home: boolean } | null {
  if (!l.who) return null;
  const u = b.units.find(x => x.id === l.who);
  if (!u) return null;
  if (u.side === 'raider') return { name: u.id === 'r0' ? 'Raider boss' : 'Raider', home: false };
  return { name: people.find(p => p.id === u.personId)?.first ?? 'Resident', home: true };
}

/** Banner while a raid plays: headline, the latest radio lines, a timeline and Skip. */
export function BattleOverlay() {
  const battle = useBattleStore(s => s.battle);
  const t = useBattleStore(s => s.t);
  const lines = useBattleStore(s => s.lines);
  const skip = useBattleStore(s => s.skip);
  const people = useGameStore(s => s.game.people);
  if (!battle) return null;
  const raiders = battle.units.filter(u => u.side === 'raider').length;
  const end = battle.events.find(e => e.kind === 'end');
  const done = end && t >= end.t;
  const head = done && end.kind === 'end' ? `Raid ${end.result}` : `Raid! ${raiders} at the gate`;
  const f = Math.min(1, t / Math.max(1, battle.duration));
  return (
    <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', width: 'min(460px, calc(100vw - 32px))',
      background: 'rgba(20,10,10,0.82)', color: '#f4e9e4', borderRadius: 8, padding: '10px 14px', zIndex: 40,
      font: '13px/1.4 system-ui, sans-serif', boxShadow: '0 4px 18px rgba(0,0,0,0.45)', border: '1px solid rgba(220,60,50,0.6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: done ? '#6c6' : '#e33', animation: done ? undefined : 'cbPulse 0.8s infinite' }} />
        <strong style={{ fontSize: 15, flex: 1 }}>{head}</strong>
        <button onClick={skip} style={{ background: '#3a2422', color: '#f4e9e4', border: '1px solid #8a4a44', borderRadius: 4, padding: '2px 10px', cursor: 'pointer' }}>Skip</button>
      </div>
      <div style={{ marginTop: 6, minHeight: 36 }}>
        {lines.map((l, i) => { const who = speaker(battle, people, l); return <div key={i} style={{ opacity: 0.55 + 0.45 * (i + 1) / lines.length }}>{who && <b style={{ color: who.home ? '#8cc8ff' : '#ff7a6a' }}>{who.name}: </b>}<span style={{ fontStyle: who ? 'normal' : 'italic' }}>{who ? `“${l.text}”` : l.text}</span></div>; })}
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 6 }}>
        <div style={{ height: 4, width: `${f * 100}%`, background: '#e05a4a', borderRadius: 2 }} />
      </div>
      <style>{'@keyframes cbPulse{0%,100%{opacity:1}50%{opacity:.25}}'}</style>
    </div>
  );
}
