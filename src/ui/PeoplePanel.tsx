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
import { kitRows } from '../sim/evenings';
import { COURSES, COURSE_IDS, COURSE_MODE_NAME, TEACH_LEVEL, newCourses, bestMode, certNote, certsOf, coursesOf, drillAmmo, drillCost, dropCourse, enroll, enrollmentOf, hasCert, modeProblem, readiness, setDrills, teachersFor, type CourseId, type CourseMode } from '../sim/courses';
import { faithOf } from '../sim/mind';
import { casesOf, lastingOf, medReport, setPolicy, setQuarantine } from '../sim/medical';
import { dayIndex } from '../sim/state';
import { DIM, LINE, TONE, btn, usd } from './hud/style';
import { MATERIALS } from '../sim/materials';
import { prices } from '../sim/economy';
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
    {(certsOf(game, p.id).length > 0 || enrollmentOf(game, p.id)) && <div style={{ color: DIM, marginTop: 1 }}>
      {certsOf(game, p.id).map(c => <div key={c.course} title="A certificate on the fridge" style={{ color: '#c9b27a' }}>✓ {certNote(game, c)}</div>)}
      {(() => { const e = enrollmentOf(game, p.id); return e ? <div>Taking: {COURSES[e.course].name.toLowerCase()}, {Math.round(100 * e.done / COURSES[e.course].hours)} %{e.stalled ? ` (${e.stalled})` : ''}</div> : null; })()}
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
  const camp = gatheringProblem(game, 'campfire'), service = gatheringProblem(game, 'service');
  const struggling = sum.struggling.slice(0, 4);
  return <Section title="How everyone is">
    {struggling.length === 0 && <Note tone="good">Everyone is holding up.{game.stock.games >= 1 || game.stock.instrument >= 1 ? ' The evenings help.' : ''}</Note>}
    {struggling.map(x => <Row key={x.p.id} label={x.p.first} value={<span style={{ color: x.kind === 'break' ? TONE.bad : TONE.warn }}>{x.why}</span>} title={(game.mind?.psyche[x.p.id]?.weighs ?? []).slice(0, 3).map(w => `${w[0]} ${w[1]}`).join(', ')} />)}
    {M?.rift && <Note tone="warn">{game.people.find(p => p.id === M.rift!.a)?.first} and {game.people.find(p => p.id === M.rift!.b)?.first} are not speaking.</Note>}
    {hardened(game) && <Note tone="warn">The house has gone hard since what was done at the gate. The kids feel it.</Note>}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      <button style={btn(rest)} disabled={rest} title="Everyone off everything that can wait until midnight: the animals, the kitchen, the dogs, the watch and the sick are still tended. Lifts strain; the backlog grows." onClick={() => g.daily(d => takeRestDay(d))}>{rest ? 'Resting today' : 'Take a rest day'}</button>
      <button style={btn()} disabled={!!camp} title={camp ?? 'A fire and stories tonight: lifts spirits (and costs a little firewood)'} onClick={() => g.daily(d => callGathering(d, 'campfire'))}>Campfire tonight</button>
      <button style={btn()} disabled={!!service} title={service ?? 'A reading, a hymn or two and a few words about the week, at six. Lifts people of faith a lot and the rest a little for a week; costs nothing.'} onClick={() => g.daily(d => callGathering(d, 'service'))}>Hold a service</button>
    </div>
    <Evenings />
    <div style={{ fontSize: 11, color: DIM, marginTop: 4 }}>A rest day, a gathering or a service, faith and someone close lift the strain too. Strain costs morale and work only once it is real.</div>
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

/** The evenings' goods: the cards, the guitar, the paperbacks, the kids' toys and how worn they are. */
function Evenings() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const rows = kitRows(game);
  const faith = game.people.filter((p, i) => game.personState[i]?.needs.died == null && faithOf(game, p)).length;
  return <div style={{ marginTop: 5 }}>
    <div style={{ fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>The evenings</div>
    {rows.length === 0 && <div style={{ fontSize: 11.5, color: DIM }}>Nothing to do with a free evening but sit. Cards, a guitar, paperbacks and toys for the kids take the edge off a hard stretch (Shop → Courses & evenings).</div>}
    {rows.map(r => <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11.5 }} title={`Wears with use; ${r.restockHave > 0 ? 'a restock is on the shelf and goes in by itself when it wears thin' : 'a cheap restock in the Shop makes it good again'}`}>
      <span style={{ width: 128 }}>{r.name}</span>
      {bar(Math.max(4, r.cond * 100), r.cond > 0.5 ? '#9cc070' : r.cond > 0.2 ? TONE.warn : TONE.bad, `${Math.round(r.cond * 100)} %`)}
      <span style={{ width: 82, textAlign: 'right', color: r.cond > 0.4 ? DIM : TONE.warn }}>{r.word}{r.restockHave > 0 ? ' · spare' : ''}</span>
    </div>)}
    {rows.length > 0 && <button style={{ ...btn(), marginTop: 3, padding: '1px 7px', fontSize: 10.5 }} onClick={() => g.openShop(true, 'learning')}>Shop: restock the evenings</button>}
    {faith > 0 && <div style={{ fontSize: 11, color: DIM }}>{faith} in the house keep{faith === 1 ? 's' : ''} a faith: a service helps them most.</div>}
  </div>;
}

/** Classes and drills: who is taking what, certificates, starting a course, and the defense drill schedule. */
export function ClassesSection() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const C = game.courses ?? newCourses();
  const students = game.people.filter((p, i) => game.personState[i]?.needs.died == null && !game.personState[i]?.needs.taken && !game.personState[i]?.needs.left && p.age >= 10);
  const [pid, setPid] = useState<string>('');
  const [course, setCourse] = useState<CourseId>('firstaid');
  const [mode, setMode] = useState<CourseMode | ''>('');
  const [note, setNote] = useState<string | null>(null);
  const who = pid || students.find(p => !p.kid)?.id || students[0]?.id || '';
  const def = COURSES[course];
  const best = who ? bestMode(game, course, who) : null;
  const use: CourseMode | null = (mode || best?.mode) ?? null;
  const teacher = use === 'teacher' ? teachersFor(game, course, who)[0] : undefined;
  const problem = who ? (use ? modeProblem(game, course, who, use, teacher?.id) : modeProblem(game, course, who, 'book')) : 'nobody to take it';
  const modes: CourseMode[] = ['teacher', 'online', 'book'];
  const D = C.drills, ammo = drillAmmo(game), cost = drillCost(game), ready = Math.round(100 * readiness(game));
  const hasAny = C.enrolled.length > 0 || C.certs.length > 0;
  return <Section title="Classes and drills">
    {C.enrolled.map(e => {
      const p = game.people.find(x => x.id === e.pid), t = e.teacher ? game.people.find(x => x.id === e.teacher) : null, d = COURSES[e.course];
      return <div key={e.id} style={{ fontSize: 11.5, margin: '2px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
          <span><b>{p?.first}</b>: {d.name.toLowerCase()}</span>
          <button style={{ ...btn(), padding: '0 6px', fontSize: 10.5 }} title="Give the course up (nothing is refunded)" onClick={() => g.daily(x => { dropCourse(x, e.id); return null; })}>drop</button>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{bar(100 * e.done / d.hours, '#8a7ab8', `${e.done.toFixed(1)} of ${d.hours} hours`)}<span style={{ color: e.stalled ? TONE.warn : DIM, minWidth: 140, textAlign: 'right' }}>{e.stalled ? `stalled: ${e.stalled}` : `${COURSE_MODE_NAME[e.mode]}${t ? ` (${t.first})` : ''}`}</span></div>
      </div>;
    })}
    {C.enrolled.length === 0 && <div style={{ fontSize: 11.5, color: DIM }}>No one is taking a course. Evenings are free for one: two hours a night, on the Class duty.</div>}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
      <select value={who} onChange={e => { setPid(e.target.value); setMode(''); setNote(null); }} style={sel}>{students.map(p => <option key={p.id} value={p.id}>{p.first}</option>)}</select>
      <select value={course} onChange={e => { setCourse(e.target.value as CourseId); setMode(''); setNote(null); }} style={sel}>
        {COURSE_IDS.map(id => <option key={id} value={id} disabled={!!who && hasCert(game, who, id)}>{COURSES[id].name}{who && hasCert(game, who, id) ? ' ✓' : ''}</option>)}
      </select>
    </div>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
      {modes.map(m => { const why = who ? modeProblem(game, course, who, m, m === 'teacher' ? teachersFor(game, course, who)[0]?.id : undefined) : 'nobody'; return <button key={m} style={{ ...btn(use === m), padding: '2px 7px', fontSize: 11 }} title={why ?? (m === 'teacher' ? 'A household adult with the skill at 3+ teaches on the same hours: the best way' : m === 'online' ? `Tuition $${def.online}; needs power and the phone lines` : 'The book set alone: slow')} onClick={() => { setMode(m); setNote(null); }}>{m === 'teacher' ? 'With a teacher' : m === 'online' ? `Online ($${def.online})` : 'Book set'}</button>; })}
    </div>
    <div style={{ fontSize: 11, color: DIM, margin: '3px 0' }}>{def.blurb} {def.hours} hours; teachers need the skill at {TEACH_LEVEL}+. {game.stock[def.book] >= 1 ? 'The book set is on the shelf.' : <>The book set ({usd((MATERIALS[def.book].price ?? 0) * prices(game))}) is in the Shop. <button style={{ ...btn(), padding: '0 6px', fontSize: 10.5 }} onClick={() => g.openShop(true, 'learning')}>Shop</button></>}</div>
    <button style={btn(!problem)} disabled={!!problem || !use} title={problem ?? 'Start the course'} onClick={() => { const why = use ? g.money(d => enroll(d, course, who, use, teacher?.id)) : 'pick a way'; setNote(why); }}>Start the course</button>
    {(problem && who) && <span style={{ fontSize: 11, color: TONE.warn, marginLeft: 6 }}>{problem}</span>}
    {note && <Note tone="warn">{note}</Note>}
    {hasAny && C.certs.length > 0 && <div style={{ marginTop: 5, fontSize: 11.5 }}>
      {C.certs.slice(-8).map(c => <div key={c.pid + c.course} style={{ color: '#c9b27a' }}>✓ {game.people.find(p => p.id === c.pid)?.first}: {certNote(game, c)}</div>)}
    </div>}
    <div style={{ marginTop: 6, fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 0.5 }}>Defense drills</div>
    {game.armory.guns.length === 0 ? <div style={{ fontSize: 11.5, color: DIM }}>Needs a gun first (Shop → Guns & ammo).</div> : <>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        {([[0, 'Off'], [1, 'Weekly'], [2, 'Twice a week'], [3, 'Three a week']] as const).map(([n, label]) => <button key={n} style={{ ...btn(D.perWeek === n), padding: '2px 7px', fontSize: 11 }} onClick={() => g.daily(d => { setDrills(d, n); return null; })}>{label}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
        <button style={{ ...btn(D.live), padding: '2px 7px', fontSize: 11 }} title="About 15 rounds an hour each" onClick={() => g.daily(d => { setDrills(d, coursesOf(d).drills.perWeek, true); return null; })}>Live fire</button>
        <button style={{ ...btn(!D.live), padding: '2px 7px', fontSize: 11 }} title="Free, and a third as good" onClick={() => g.daily(d => { setDrills(d, coursesOf(d).drills.perWeek, false); return null; })}>Dry-fire</button>
      </div>
      <Row label="Ready at the alarm" value={`${ready} %`} title="How practiced the household is: fewer seconds frozen when the alarm sounds. Fades about 1 % a day without drills." />
      {D.perWeek > 0 && D.live && ammo && <Note tone={ammo.have < cost ? 'warn' : undefined}>A session is about {cost} rounds ({ammo.have} on hand{ammo.have < cost ? '; short, so the last of it is dry-fire' : ''}).</Note>}
    </>}
  </Section>;
}
const sel = { background: '#2a2d26', color: '#eee', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, fontSize: 11.5, padding: '2px 4px' } as const;
