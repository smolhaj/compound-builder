import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { ambushOdds, ambushParty, chosenParty } from '../sim/tunnelers';
import { fightOdds, hideFoundChance, postureOf, type Stance } from '../sim/encounters';
import { daysOfFood } from '../sim/needs';
import { AFTERMATH_TEXT } from '../sim/aftermath';
import { canPay, DOUBLE_CROSS } from '../sim/rescue';
import type { Caliber } from '../sim/armory';
import { STANCE } from './stanceText';


/** The end of a month's trial. */
const TRIAL_END: Partial<Record<Stance, [string, string]>> = {
  take_in: ['Take them in', 'They move inside the wall and join the family.'],
  turn_away: ['Send them on', 'Thank them for the month\'s work and point them down the road.'],
};

/** "about 7 in 10", from a share. */
const inTen = (x: number) => (x < 0.05 ? 'almost never' : x > 0.95 ? 'almost always' : `about ${Math.round(x * 10)} in 10`);

/** At the gate with a ransom: the same stances, in their words. */
const RANSOM: Partial<Record<Stance, [string, string]>> = {
  pay: ['Pay what they ask', 'Load it by the gate at first light. One of you, unarmed. They may keep their word, keep the goods, or come shooting.'],
  parley: ['Haggle', 'Talk them down. A good talker can cut it nearly in half; push too hard and they walk.'],
  refuse: ['Refuse', 'Pay once and they come back every month. They may not ask again.'],
};

const box: CSSProperties = { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 460, maxWidth: 'calc(100vw - 32px)', background: 'rgba(24,22,18,0.97)', color: '#eee', borderRadius: 12, padding: '18px 20px', zIndex: 9, boxShadow: '0 10px 40px rgba(0,0,0,0.5)', fontSize: 13.5 };
/** The raid prompt: to the right, so the view down the drive stays open between the bars. */
const raidBox: CSSProperties = { ...box, left: 'auto', right: 'clamp(12px, 3vw, 40px)', top: 'calc(clamp(54px, 12vh, 120px) + 12px)', transform: 'none', width: 'min(400px, calc(100vw - 24px))', maxHeight: 'calc(100vh - 2 * clamp(54px, 12vh, 120px) - 24px)', overflowY: 'auto', zIndex: 40, padding: '14px 16px' };
const button = (primary: boolean): CSSProperties => ({ padding: '7px 12px', borderRadius: 7, border: 0, cursor: 'pointer', background: primary ? '#d8c9a0' : '#3a3d34', color: primary ? '#1c1d18' : '#eee', fontSize: 13, textAlign: 'left' });

/** Someone at the gate: the dossier and the stances (the game is paused); then what happened. */
export function GateCard() {
  const g = useGameStore();
  const gate = g.game.gate;
  const e = gate.pending;
  const cut = g.cutscene;
  // a raid plays as a cutscene (ui/CutsceneOverlay): the card takes the stance, then Watch; nothing else shows till the report
  if (cut && cut.phase !== 'prompt') return null;
  if (e) {
    const p = postureOf(g.game);
    // honest odds: the battle sim itself, a couple of dozen times (cached per encounter)
    const odds = e.strength > 0 && e.kind !== 'break_in' && e.stances.includes('defend') ? fightOdds(g.game, e) : null;
    const label = (st: Stance) => (e.ransom && RANSOM[st]) || (e.kind === 'trial_end' && TRIAL_END[st]) || STANCE[st];
    const picked = cut ? cut.stance ?? e.stances[0] : null;
    return (
      <div style={cut ? raidBox : box}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, textTransform: 'uppercase' }}>{e.kind === 'break_in' ? 'In the night' : e.kind === 'ransom' ? 'Word about your child' : e.kind === 'trial_end' ? 'The camp outside the wall' : 'At the gate'}</div>
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
        {e.dig?.phase === 'warning' && e.stances.includes('ambush') && (() => {
          const gm = g.game, able = ambushParty(gm, true), going = chosenParty(gm);
          return <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.85 }}>Who goes to the dig site:{' '}
            {able.map(id => { const p = gm.people.find(x => x.id === id)!; return <label key={id} style={{ marginRight: 10 }}><input type="checkbox" checked={going.includes(id)} onChange={ev => g.setAmbushParty(ev.target.checked ? [...going, id] : going.filter(x => x !== id))} /> {p.first}</label>; })}
            <div style={{ opacity: 0.7 }}>The rest hold the house.</div></div>;
        })()}
        {e.dig?.phase === 'warning' && e.stances.includes('ambush') && (() => {
          const o = ambushOdds(g.game, { size: e.size, lead: e.dig!.lead, temper: e.temper });
          return <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>If you ambush them: you hold {inTen(o.win)} · someone of yours killed or taken {o.lost < 0.05 ? 'almost never' : `about ${Math.round(o.lost * 10) / 10} on average`}</div>;
        })()}
        {e.strength > 0 && e.kind !== 'break_in' && <div style={{ margin: '8px 0', fontSize: 12, opacity: 0.75 }}>
          <div>{e.size} {e.armed ? 'armed' : 'unarmed'} · walls {Math.round(p.barrier)} % · seen early {Math.round(p.detection)} %{p.bunker ? ' · bunker to hide in' : p.safeRoom ? ' · safe room' : ''}</div>
          {odds && <div>If you fight: you hold {inTen(odds.win)} · someone of yours killed or taken {inTen(odds.loseSomeone)}</div>}
          {e.stances.includes('hide') && <div>If you hide: they find the place lived in {inTen(hideFoundChance(g.game, e, p))}, and strip it</div>}
        </div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {e.stances.map((st, i) => (
            <button key={st} style={cut ? { ...button(st === picked), outline: st === picked ? '2px solid #d8c9a0' : undefined, background: st === picked ? '#4a4a3c' : '#2e302a', color: '#eee' } : button(i === 0)} title={label(st)[1]} onClick={() => (cut ? g.chooseStance(st) : g.answer(st))}>
              <div style={{ fontWeight: 600 }}>{label(st)[0]}</div>
              <div style={{ fontSize: 11.5, opacity: 0.75 }}>{label(st)[1]}</div>
            </button>
          ))}
        </div>
        {cut && <button style={{ ...button(true), marginTop: 12, width: '100%', textAlign: 'center', fontSize: 15, padding: '10px 12px', fontWeight: 700, letterSpacing: 0.5 }} onClick={g.watchRaid}>Watch</button>}
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
