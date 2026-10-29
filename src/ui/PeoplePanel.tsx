/**
 * Family → how everyone is: strain, trauma and mood for each person, what
 * weighs on them and what lifts it, their skills (practice, rust), and the
 * household block: who is struggling, a rest day, a gathering, and who is
 * best at what (sim/mind.ts, sim/skills.ts).
 */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { hasGuns } from './peopleText';
import type { Person } from '../sim/family';
import { BREAK_NAME, breakOf, hardened, moodSummary, moodText, mindOf, reading, resting, takeRestDay } from '../sim/mind';
import { PRACTICED, SKILL_NAME, bestHand, levelFor, progressOf, rangeTime, rusting, topSkills, type Practiced } from '../sim/skills';
import { callGathering, gatheringProblem } from '../sim/gatherings';
import { casesOf, lastingOf, medReport, setPolicy, setQuarantine } from '../sim/medical';
import { dayIndex } from '../sim/state';
import { DIM, LINE, TONE, btn } from './hud/style';
import { Note, Row, Section } from './hud/common';

const strainColor = (v: number) => (v >= 65 ? TONE.bad : v >= 40 ? TONE.warn : '#9cc070');
const bar = (v: number, c: string, t: string) => <div title={t} style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${Math.max(0, Math.min(100, v))}%`, height: '100%', background: c, borderRadius: 2 }} /></div>;
const pts = (xs: Array<[string, number]>) => xs.slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ');

/** One person's mind and skills, under their health and morale bars. */
export function PersonInsight({ p }: { p: Person }) {
  const game = useGameStore(s => s.game), g = useGameStore();
  const [open, setOpen] = useState(false);
  const n = game.personState.find(x => x.id === p.id)?.needs;
  if (!n || n.died != null || n.taken || n.left) return null;
  const ps = game.mind?.psyche[p.id];
  const mood = moodText(game, p);
  const b = ps ? breakOf(game, p.id) : null;
  const skills = topSkills(game, p, 3);
  const rd = open && ps ? reading(game, p) : null;
  const shown = ps ? Math.round(ps.stress) : 0;
  return <div style={{ marginTop: 3, fontSize: 11 }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: DIM, width: 34 }}>strain</span>{bar(shown, strainColor(shown), `Strain ${shown}${ps && ps.trauma >= 20 ? `, trauma ${Math.round(ps.trauma)}` : ''}${ps && ps.low >= 40 ? `, low mood ${Math.round(ps.low)}` : ''}`)}
      <button style={{ ...btn(open), padding: '0 6px', fontSize: 10.5 }} title="What weighs on them, what lifts it, and what they are good at" onClick={() => setOpen(!open)}>{open ? 'less' : 'how they are'}</button>
    </div>
    {(mood || skills.length > 0) && <div style={{ color: b ? TONE.bad : mood ? TONE.warn : DIM, marginTop: 1 }}>
      {mood || ''}{mood && skills.length > 0 ? ' · ' : ''}<span style={{ color: DIM }}>{skills.map(x => `${SKILL_NAME[x.skill].split(' ')[0].toLowerCase()} ${Math.floor(x.level)}${x.rusty ? '↓' : ''}`).join(', ')}</span>
    </div>}
    {open && rd && <div style={{ marginTop: 3, paddingLeft: 6, borderLeft: `2px solid ${LINE}` }}>
      <div style={{ color: DIM }}>{rd.weighs.length ? <>Weighs on them: <span style={{ color: TONE.warn }}>{pts(rd.weighs)}</span></> : 'Nothing weighs on them much.'}</div>
      <div style={{ color: DIM }}>{rd.helps.length ? <>Lifts it: <span style={{ color: TONE.good }}>{pts(rd.helps)}</span></> : 'Little is lifting it: a real rest, a game, music or a gathering would.'}</div>
      {ps && (ps.trauma >= 20 || ps.kills > 0) && <div style={{ color: DIM }}>{ps.kills > 0 ? `Killed ${ps.kills === 1 ? 'a man' : `${ps.kills} men`} defending the place. ` : ''}{ps.trauma >= 20 ? `Trauma ${Math.round(ps.trauma)}: ${ps.trauma >= 50 ? 'jumpy, flashbacks' : ps.trauma >= 35 ? 'poor sleep' : 'bad dreams'}; it fades with safety and company.` : ''}</div>}
      {b && <div style={{ color: TONE.bad }}>{BREAK_NAME[b.kind]} for {Math.max(1, b.until - dayIndex(game.clock.t))} more day{b.until - dayIndex(game.clock.t) === 1 ? '' : 's'}.</div>}
      <div style={{ marginTop: 2 }}>
        {PRACTICED.map(k => ({ k, v: levelFor(game, p, k) })).filter(x => x.v >= 1 || x.k === 'shooting' && p.age >= 14).sort((a, b2) => b2.v - a.v).slice(0, 8).map(({ k, v }) =>
          <div key={k} style={{ display: 'flex', gap: 5, alignItems: 'center' }} title={rusting(game, p.id, k) ? 'Rusting: not used in a long while; it comes back quickly with use' : 'Rises with use'}>
            <span style={{ width: 118, color: rusting(game, p.id, k) ? TONE.warn : undefined }}>{SKILL_NAME[k]}</span>
            <span style={{ width: 16, textAlign: 'right' }}>{Math.floor(v)}</span>
            {bar(progressOf(game, p.id, k) * 100, rusting(game, p.id, k) ? TONE.warn : '#7aa0d0', `${Math.round(progressOf(game, p.id, k) * 100)} % of the way to ${Math.floor(v) + 1}`)}
          </div>)}
        {hasGuns(game) && p.age >= 12 && <button style={{ ...btn(), marginTop: 3, padding: '1px 7px', fontSize: 10.5 }} title="An hour at the range: costs ammunition (dry-fire drills with none)" onClick={() => g.daily(d => { const m = rangeTime(d, p.id, 1); d.log.push({ t: d.clock.t, text: m }); return null; })}>An hour at the range</button>}
      </div>
    </div>}
  </div>;
}

const KEY_SKILLS: Practiced[] = ['builder', 'gardener', 'cooking', 'husbandry', 'mechanic', 'electrical', 'medic', 'hunter', 'shooting', 'teacher', 'leadership', 'negotiator', 'radio'];

/** The household block: how everyone is, what to do about it, who is best at what. */
export function PeopleSection() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const sum = moodSummary(game);
  const M = game.mind ? mindOf(game) : null;
  const rest = resting(game);
  const camp = gatheringProblem(game, 'campfire');
  const struggling = sum.struggling.slice(0, 4);
  return <Section title="How everyone is">
    {struggling.length === 0 && <Note tone="good">Everyone is holding up.{game.stock.games >= 1 || game.stock.instrument >= 1 ? ' The evenings help.' : ''}</Note>}
    {struggling.map(x => <Row key={x.p.id} label={x.p.first} value={<span style={{ color: x.kind === 'break' ? TONE.bad : TONE.warn }}>{x.why}</span>} title={(game.mind?.psyche[x.p.id]?.weighs ?? []).slice(0, 3).map(w => `${w[0]} ${w[1]}`).join(', ')} />)}
    {M?.rift && <Note tone="warn">{game.people.find(p => p.id === M.rift!.a)?.first} and {game.people.find(p => p.id === M.rift!.b)?.first} are not speaking.</Note>}
    {hardened(game) && <Note tone="warn">The house has gone hard since what was done at the gate. The kids feel it.</Note>}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      <button style={btn(rest)} disabled={rest} title="Everyone off everything that can wait until midnight: the animals, the kitchen, the dogs, the watch and the sick are still tended. Lifts strain; the backlog grows." onClick={() => g.daily(d => takeRestDay(d))}>{rest ? 'Resting today' : 'Take a rest day'}</button>
      <button style={btn()} disabled={!!camp} title={camp ?? 'A fire and stories tonight: lifts spirits (and costs a little firewood)'} onClick={() => g.daily(d => callGathering(d, 'campfire'))}>Campfire tonight</button>
    </div>
    <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>Cards and games, a guitar and a shelf of paperbacks (Shop → Medical & household) lift the strain in the evenings; a rest day, a gathering, faith and someone close do too. Strain costs morale and work only once it is real.</div>
    <div style={{ marginTop: 5 }}>
      <button style={{ ...btn(skillsOpen), padding: '1px 8px', fontSize: 11 }} onClick={() => setSkillsOpen(!skillsOpen)}>{skillsOpen ? 'Hide skills' : 'Who is best at what'}</button>
      {skillsOpen && <div style={{ marginTop: 4 }}>
        {KEY_SKILLS.map(k => {
          const h = bestHand(game, k);
          if (!h) return null;
          const v = levelFor(game, h, k);
          return <Row key={k} label={SKILL_NAME[k]} value={v >= 1 ? `${h.first} ${Math.floor(v)}` : <span style={{ color: DIM }}>nobody yet</span>} title="Skills rise with use and slip slowly without it. Mentoring pairs a skilled elder or adult with a youth." />;
        })}
        <Note>An elder or skilled adult can show a youth the trade they know best (the Mentor duty, mid-afternoon on Auto).</Note>
      </div>}
    </div>
    {sum.breaking > 0 && !rest && <Note tone="bad">Someone is not coping. A rest day and company help more than pushing on.</Note>}
  </Section>;
}

/** The household's medical picture: the medic, the supplies, the antibiotics policy, what the sick lack, an epidemic's quarantine, lasting injuries, a pregnancy. */
export function MedicalSection() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const r = medReport(game);
  const sick = game.people.filter(p => casesOf(game, p.id).length > 0);
  const lasting = r.lasting.filter(([, l]) => l.length);
  const hasBits = sick.length > 0 || lasting.length > 0 || r.pregnant.length > 0 || r.epidemic || r.courses > 0 || r.splints > 0;
  return <Section title="Medical">
    <Row label="Who tends the sick" value={r.medic ? `${r.medic.first} (medicine ${Math.floor(r.skill)})${r.bay ? ' · bay' : ''}` : <span style={{ color: TONE.warn }}>nobody who knows how</span>} title="The best adult medic on the place, a medical book a level above. A medic's corner in the bunker heals faster and cuts infection." />
    <Row label="Antibiotics" value={<span style={{ color: r.courses < 2 ? TONE.warn : undefined }}>{r.courses} course{r.courses === 1 ? '' : 's'}</span>} title="Loose courses plus two short courses in each medical kit. Scarce once the pharmacy shuts." />
    <Row label="Splints · rehydration salts" value={`${Math.floor(r.splints)} sets · ${Math.floor(r.salts * 10)} packets`} />
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', margin: '3px 0', fontSize: 11.5 }}>
      <span style={{ color: DIM }}>Spend antibiotics on</span>
      <button style={btn(r.policy === 'serious')} onClick={() => g.daily(d => { setPolicy(d, 'serious'); return null; })} title="Serious infections, the very young and the old: saves them for when it counts">serious cases</button>
      <button style={btn(r.policy === 'all')} onClick={() => g.daily(d => { setPolicy(d, 'all'); return null; })} title="Every infection">everything</button>
    </div>
    {sick.map(p => casesOf(game, p.id).map((h, i) => <Row key={p.id + i} label={p.first} value={<span style={{ fontSize: 11 }}>{h.what}: {h.med!.care}</span>} tone={h.sev >= 60 ? 'bad' : 'warn'} />))}
    {r.needs.map(x => <Note key={x} tone="warn">{x}</Note>)}
    {r.epidemic && <div style={{ marginTop: 3 }}>
      <Note tone="warn">{r.epidemic.kind === 'flu' ? 'The flu is going round' : 'Dysentery is going round'} ({r.epidemic.cases} so far).{r.epidemic.quarantine ? ' The sick are being kept apart.' : ''}</Note>
      <div style={{ display: 'flex', gap: 4 }}>
        <button style={btn(r.epidemic.quarantine)} onClick={() => g.daily(d => setQuarantine(d, true))}>Keep the sick apart</button>
        <button style={btn(!r.epidemic.quarantine && r.epidemic.asked)} onClick={() => g.daily(d => setQuarantine(d, false))}>Carry on</button>
      </div>
    </div>}
    {lasting.map(([id]) => <Row key={id} label={game.people.find(p => p.id === id)?.first ?? ''} value={<span style={{ fontSize: 11 }}>{lastingOf(game, id).join(', ')}</span>} />)}
    {r.pregnant.map(([name, days]) => <Row key={name} label={name} value={`expecting: about ${Math.max(0, Math.round(days / 30))} month${Math.round(days / 30) === 1 ? '' : 's'} to go`} title="A medic and a birthing kit (or the hospital) make the delivery much safer." />)}
    {!hasBits && <Note>Nobody is sick or hurt. A splint set, rehydration salts and a course or two of antibiotics are worth having put by (Shop → Medical & household).</Note>}
  </Section>;
}
