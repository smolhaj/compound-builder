/**
 * Family tab additions (decided with the user: "all of these"): how each
 * person is (sim/mind.ts), lasting effects (sim/medical.ts), skills with a
 * progress bar and rust (sim/skills.ts), courses and range time; the medicine
 * cabinet and tetanus boosters; a memorial for the dead.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import type { GameState } from '../sim/state';
import type { Person } from '../sim/family';
import { canMourn, faithOf, holdMemorial, moodText } from '../sim/mind';
import { medicalOf, tetanusCovered, vaccinate } from '../sim/medical';
import { COURSES, courseProblem, coursesOpen, hasBooks, levelOf, PRACTICED, progressOf, rangeTime, rusting, SKILL_NAME, takeCourse } from '../sim/skills';

const DIM = 'rgba(238,238,238,0.6)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };
const btn: CSSProperties = { padding: '3px 8px', borderRadius: 6, border: 0, cursor: 'pointer', background: '#3a3d34', color: '#eee', fontSize: 11.5 };

/** Under a person's bars: their mood, lasting effects, and (folded) their skills. */
export function PersonExtra({ game, p }: { game: GameState; p: Person }): ReactNode {
  const g = useGameStore();
  const [open, setOpen] = useState(false);
  const [course, setCourse] = useState('');
  const mood = moodText(game, p);
  const lasting = game.medical?.lasting[p.id] ?? [];
  const run = (op: (d: GameState) => string | null) => { const why = g.money(op); if (why) alert(why); };
  const shooter = game.armory.guns.length > 0 && (!p.kid || p.age >= 10);
  return <div style={{ fontSize: 11, marginTop: 2 }}>
    {mood && <div style={{ color: '#b8c4d8' }} title="How they're doing (Family tab → Skills shows what helps)">{mood}</div>}
    {lasting.length > 0 && <div style={{ color: DIM }}>{lasting.join(', ')}</div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button style={{ ...btn, background: 'transparent', padding: '1px 0', color: DIM }} onClick={() => setOpen(!open)}>{open ? '▾' : '▸'} Skills</button>
      {!open && <span style={{ color: DIM }}>{topSkills(game, p)}</span>}
    </div>
    {open && <div style={{ padding: '2px 0 4px 10px' }}>
      {PRACTICED.filter(k => k !== 'shooting' || shooter || levelOf(game, p.id, k) >= 1).map(k => {
        const lv = levelOf(game, p.id, k), pr = progressOf(game, p.id, k), rust = rusting(game, p.id, k);
        return <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 0' }} title={`${SKILL_NAME[k]} ${Math.floor(lv)}: ${Math.round(pr * 100)} % of the way to ${Math.min(10, Math.floor(lv) + 1)}${rust ? ' · getting rusty from disuse' : ''}${hasBooks(game, k) ? ' · the books help' : ''}`}>
          <span style={{ width: 74, color: DIM }}>{SKILL_NAME[k]}</span>
          <span style={{ width: 14, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.floor(lv)}</span>
          <div style={{ flex: 1, height: 4, background: '#333', borderRadius: 2 }}><div style={{ width: `${pr * 100}%`, height: '100%', background: rust ? '#a08060' : '#c9b27a', borderRadius: 2 }} /></div>
          <span style={{ width: 30, color: rust ? TONE.warn : DIM }}>{rust ? 'rusty' : ''}</span>
        </div>;
      })}
      {faithOf(game, p) && <div style={{ color: DIM, marginTop: 2 }}>Keeps a faith: it helps in hard times.</div>}
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        {coursesOpen(game) && <>
          <select value={course} onChange={e => setCourse(e.target.value)} style={{ ...btn, maxWidth: 160 }}>
            <option value="">A course in town…</option>
            {COURSES.map(c => { const why = courseProblem(game, p.id, c.id); return <option key={c.id} value={c.id} disabled={!!why && why !== 'not enough money'}>{c.name} ${c.usd}{why ? ` (${why})` : ''}</option>; })}
          </select>
          {course && <button style={btn} title={COURSES.find(c => c.id === course)?.blurb} onClick={() => { run(d => takeCourse(d, p.id, course)); setCourse(''); }}>Sign up</button>}
        </>}
        {shooter && <button style={btn} title="Two hours at the range: 100 rounds (dry-fire drills if there's no ammunition)" onClick={() => run(d => { const line = rangeTime(d, p.id, 2); if (line && !/too young|no gun/.test(line)) { d.log.push({ t: d.clock.t, text: line }); return null; } return line; })}>Range time</button>}
      </div>
    </div>}
  </div>;
}
/** The two best skills, short (the folded line). */
function topSkills(game: GameState, p: Person): string {
  return PRACTICED.map(k => [k, levelOf(game, p.id, k)] as const).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${SKILL_NAME[k].toLowerCase()} ${Math.floor(v)}`).join(' · ');
}

/** The medicine cabinet, boosters, and memorials (Family tab). */
export function MedicineCabinet({ game }: { game: GameState }): ReactNode {
  const g = useGameStore();
  const run = (op: (d: GameState) => string | null) => { const why = g.money(op); if (why) alert(why); };
  const st = game.stock;
  const items: Array<[string, string]> = [
    ['Antibiotics', `${Math.floor((st.fish_antibiotics ?? 0) / 0.25) + Math.floor(st.meds / 0.5)} courses`],
    ['Medical kits', `${st.meds.toFixed(1)}`],
    ...(st.suture_kit ? [['Suture kit', `${Math.round(st.suture_kit / 0.05)} closures`] as [string, string]] : []),
    ...(st.dental_kit ? [['Dental kit', `${Math.round(st.dental_kit / 0.1)} teeth`] as [string, string]] : []),
    ...(st.surgical_kit ? [['Surgical kit', `${Math.round(st.surgical_kit / 0.25)} operations`] as [string, string]] : []),
    ...(st.midwifery_kit ? [['Midwifery kit', `${Math.round(st.midwifery_kit / 0.5)} births`] as [string, string]] : []),
  ];
  const due = game.people.filter((p, i) => game.personState[i]?.needs.died == null && !tetanusCovered(game, p));
  const clinic = game.disaster.tracks.medical >= 0.5 && game.disaster.tracks.banks >= 0.5;
  const mourn = canMourn(game);
  const open = medicalOf(game).cases.length;
  return <div style={{ marginBottom: 10 }}>
    <div style={h3}>Medicine cabinet</div>
    {items.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}><span style={{ color: DIM }}>{k}</span><span>{v}</span></div>)}
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}><span style={{ color: DIM }}>Books</span><span>{[(st.medical_books ?? 0) >= 1 ? 'medical' : '', (st.how_to_books ?? 0) >= 1 ? 'how-to' : ''].filter(Boolean).join(', ') || 'none'}</span></div>
    {open > 0 && <div style={{ fontSize: 11.5, color: TONE.warn }}>{open} under care.</div>}
    {due.length > 0 && (clinic
      ? <button style={{ ...btn, width: '100%', marginTop: 4 }} title="Tdap boosters at the county clinic: a rusty nail without one can mean tetanus" onClick={() => run(vaccinate)}>Tetanus boosters for {due.map(p => p.first).join(', ')}</button>
      : <div style={{ fontSize: 11.5, color: DIM }}>No tetanus booster in ten years: {due.map(p => p.first).join(', ')}.</div>)}
    {mourn.map(p => <button key={p.id} style={{ ...btn, width: '100%', marginTop: 4 }} title="Stories, a song, a marker: grief eases faster after" onClick={() => run(d => holdMemorial(d, p.id))}>Hold a memorial for {p.first}</button>)}
  </div>;
}
