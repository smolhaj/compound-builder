/**
 * Daily life UI (sim/daily.ts, sim/gatherings.ts): the roster window
 * (person × hour, painted with a duty; templates; Auto), what's falling
 * behind, who's on watch, and gatherings to call. `DailySection` is the
 * compact block in the Family tab.
 */
import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { nextBuildTarget } from '../sim/engine';
import { nextFellJob } from '../sim/forestry';
import { hourOf, type GameState } from '../sim/state';
import {
  applyTemplate, behind, canDo, chronotypes, CHRONO_NAME, setFocus, choreRates, CHORE_NAME, CHORE_WHY, CHORES, dailyOf, DUTIES, DUTY, setDuty, TEMPLATE_NAME, threatLevel, unlockPerson, watchNow, workHours,
  type Duty, type TemplateId,
} from '../sim/daily';
import { GATHERING, gatheringProblem, callGathering, type GatheringKind } from '../sim/gatherings';
import { whoShouldDo } from '../sim/roster';

const C = { bg: 'rgba(22,24,20,0.98)', line: 'rgba(255,255,255,0.09)', gold: '#d8c9a0', dim: 'rgba(238,238,238,0.62)', warn: '#e0b050', bad: '#f0a080', good: '#a8d080' };
const btn = (on = false, off = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: `1px solid ${on ? C.gold : C.line}`, background: on ? 'rgba(216,201,160,0.18)' : 'rgba(255,255,255,0.06)', color: '#eee', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, fontSize: 12 });
const THREAT = ['Calm: the law still works', 'Guarded: no law out here now', 'High: raided lately, or everyone knows you have stores'];

/** What the planner needs to know about the projects (build / fell). */
const planCtx = (s: GameState) => ({ build: nextBuildTarget(s) !== null || s.perimeter.some(r => r.finishedAt === null) || s.roadside.length > 0, fell: nextFellJob(s) !== null });

const CALLABLE = (Object.keys(GATHERING) as GatheringKind[]).filter(k => GATHERING[k].callable);

function ChoreBars({ game }: { game: GameState }) {
  const rates = choreRates(game), lv = dailyOf(game).chores.levels;
  const shown = CHORES.filter(c => rates[c] > 0 || lv[c] > 3);
  if (!shown.length) return <div style={{ color: C.dim, fontSize: 11.5 }}>Nothing that needs keeping up yet.</div>;
  return <>{shown.map(c => {
    const v = lv[c], col = v >= 70 ? C.bad : v >= 40 ? C.warn : C.good;
    return <div key={c} title={CHORE_WHY[c]} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '1px 0' }}>
      <span style={{ width: 150, color: v >= 40 ? col : undefined }}>{CHORE_NAME[c]}</span>
      <div style={{ flex: 1, height: 5, background: '#333', borderRadius: 3 }}><div style={{ width: `${Math.max(3, v)}%`, height: '100%', background: col, borderRadius: 3 }} /></div>
      <span style={{ width: 66, textAlign: 'right', color: C.dim }}>{v >= 70 ? 'behind' : v >= 40 ? 'slipping' : 'kept up'}</span>
    </div>;
  })}</>;
}

/** The Family tab's daily-life block. */
export function DailySection() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const so = dailyOf(game).social, plan = dailyOf(game).plan;
  const late = behind(game, 60);
  const watch = watchNow(game);
  return <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.line}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
      <span style={{ color: C.gold, fontWeight: 600 }}>Daily life</span>
      <button style={btn()} onClick={() => g.openSchedule(true)}>Schedule…</button>
    </div>
    <div style={{ fontSize: 11.5, color: C.dim }}>{plan.auto ? 'Auto roster' : 'Hand-set roster'} · {THREAT[plan.threat]}{watch.length ? ` · on watch: ${watch.map(w => game.people.find(p => p.id === w.id)?.first).join(', ')}` : ''}</div>
    {so.active && <div style={{ fontSize: 11.5, color: C.good }}>{GATHERING[so.active.kind].name} {game.clock.t < so.active.at ? 'this evening' : 'now'}</div>}
    {late.length > 0 && <div style={{ fontSize: 11.5, color: C.warn, marginTop: 2 }}>Falling behind: {late.map(([c]) => CHORE_NAME[c].toLowerCase()).join(', ')}</div>}
  </div>;
}

/** The roster window. */
export function SchedulePanel() {
  const game = useGameStore(s => s.game), g = useGameStore();
  const [brush, setBrush] = useState<Duty>('garden');
  const [painting, setPainting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const d = dailyOf(game), plan = d.plan, so = d.social;
  const hourNow = Math.floor(hourOf(game.clock.t));
  const people = game.people.map((p, i) => ({ p, ps: game.personState[i] })).filter(x => x.ps && x.ps.needs.died == null);
  const paint = (id: string, h: number) => { const why = g.daily(s => setDuty(s, id, [h], brush)); setMsg(why); };
  const close = () => g.openSchedule(false);
  const threat = threatLevel(game);
  const chrono = chronotypes(game);
  const cell = 22;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11, padding: 16 }} onClick={close} onMouseUp={() => setPainting(false)}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, color: '#eee', borderRadius: 14, width: 1060, maxWidth: '100%', maxHeight: '100%', overflowY: 'auto', fontSize: 13, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', userSelect: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 10px', borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>The daily schedule</div>
            <div style={{ color: C.dim, fontSize: 12 }}>Paint the hours with a duty, or leave it on Auto: the planner fills it each morning from skills, the season and the threat. · Threat: {THREAT[threat]}</div>
          </div>
          <button style={btn()} onClick={close}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 6, padding: '8px 20px', alignItems: 'center', flexWrap: 'wrap', borderBottom: `1px solid ${C.line}` }}>
          <span style={{ color: C.dim, fontSize: 12 }}>Templates:</span>
          {(Object.keys(TEMPLATE_NAME) as TemplateId[]).map(t => <button key={t} style={btn(t === 'auto' && plan.auto)} onClick={() => g.daily(s => { applyTemplate(s, t, planCtx(s)); return null; })}>{TEMPLATE_NAME[t]}</button>)}
          {msg && <span style={{ color: C.warn, fontSize: 12, marginLeft: 8 }}>{msg}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '8px 20px', flexWrap: 'wrap' }}>
          {DUTIES.map(k => <button key={k} title={DUTY[k].hint} onClick={() => setBrush(k)}
            style={{ ...btn(brush === k), display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: DUTY[k].color, display: 'inline-block' }} />{DUTY[k].name}</button>)}
        </div>
        <div style={{ padding: '4px 20px 10px', overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr>
              <th style={{ textAlign: 'left', fontWeight: 500, color: C.dim, paddingRight: 8 }}>Person</th>
              {Array.from({ length: 24 }, (_, h) => <th key={h} style={{ width: cell, fontWeight: h === hourNow ? 700 : 400, color: h === hourNow ? C.gold : C.dim }}>{h}</th>)}
              <th style={{ color: C.dim, fontWeight: 400, paddingLeft: 8, textAlign: 'left' }}>Work · fatigue</th>
              <th style={{ color: C.dim, fontWeight: 400, paddingLeft: 8, textAlign: 'left' }} title="Always put this person on a duty first; the planner fills in the rest">Always on</th>
            </tr></thead>
            <tbody>{people.map(({ p, ps }) => {
              const row = plan.hours[p.id] ?? [];
              const locked = plan.locked.includes(p.id);
              const fat = Math.round(ps.fatigue ?? 0);
              return <tr key={p.id}>
                <td style={{ paddingRight: 8, whiteSpace: 'nowrap' }} title={plan.notes?.[p.id] ?? ''}>{p.first}{p.kid ? <span style={{ color: C.dim }}> ({p.age})</span> : ''}
                  <div style={{ fontSize: 10, color: chrono[p.id] === 'owl' ? C.warn : C.dim }}>{CHRONO_NAME[chrono[p.id]]}{plan.notes?.[p.id] ? ` · ${plan.notes[p.id]}` : ''}</div></td>
                {Array.from({ length: 24 }, (_, h) => {
                  const duty = row[h] ?? 'sleep';
                  return <td key={h} title={`${p.first} ${h}:00 · ${DUTY[duty].name}`}
                    onMouseDown={() => { setPainting(true); paint(p.id, h); }} onMouseEnter={() => { if (painting) paint(p.id, h); }}
                    style={{ width: cell, height: cell, background: DUTY[duty].color, textAlign: 'center', cursor: canDo(p, brush) ? 'crosshair' : 'not-allowed', border: `1px solid ${h === hourNow ? C.gold : 'rgba(0,0,0,0.35)'}`, color: 'rgba(255,255,255,0.85)', fontSize: 10 }}>{DUTY[duty].short}</td>;
                })}
                <td style={{ paddingLeft: 8, whiteSpace: 'nowrap' }}>
                  <span style={{ color: workHours(row) > 12 ? C.warn : C.dim }}>{workHours(row)} h</span>
                  <span style={{ display: 'inline-block', width: 40, height: 5, background: '#333', borderRadius: 3, margin: '0 6px', verticalAlign: 'middle' }}><span style={{ display: 'block', width: `${fat}%`, height: '100%', background: fat > 70 ? C.bad : fat > 45 ? C.warn : '#7aa0d0', borderRadius: 3 }} /></span>
                  {locked ? <button style={{ ...btn(), padding: '1px 6px' }} title="Give this row back to the planner" onClick={() => g.daily(s => { unlockPerson(s, p.id); return null; })}>hand-set ✕</button> : <span style={{ color: C.dim }}>{plan.auto ? 'auto' : ''}</span>}
                </td>
                <td style={{ paddingLeft: 8 }}>
                  <select value={plan.focus?.[p.id] ?? ''} style={{ fontSize: 11, background: '#222', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 4 }}
                    onChange={e => setMsg(g.daily(s => setFocus(s, p.id, (e.target.value || null) as Duty | null)))}>
                    <option value="">Planner decides</option>
                    {DUTIES.filter(k => DUTY[k].work && canDo(p, k)).map(k => <option key={k} value={k}>{DUTY[k].name}</option>)}
                  </select>
                </td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div style={{ padding: '2px 20px 8px' }}>
          <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>Who should do what <span style={{ color: C.dim, fontWeight: 400, fontSize: 11.5 }}>· by skill, health, age and state of mind; the planner already prefers them</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2px 18px', fontSize: 12 }}>
            {whoShouldDo(game).map(a => <div key={a.duty} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: DUTY[a.duty].color, display: 'inline-block' }} />
              <b style={{ minWidth: 70 }}>{DUTY[a.duty].name}</b>
              {a.best.map(b => <button key={b.p.id} style={{ ...btn(plan.focus?.[b.p.id] === a.duty), padding: '1px 6px', fontSize: 11 }} title={`${b.p.first}: ${b.why}. Click to always put ${b.p.first} on ${DUTY[a.duty].name.toLowerCase()} first.`} onClick={() => setMsg(g.daily(s => setFocus(s, b.p.id, plan.focus?.[b.p.id] === a.duty ? null : a.duty)))}>{b.p.first}{b.level !== null ? ` ${Math.floor(b.level)}` : ''}</button>)}
            </div>)}
            {whoShouldDo(game).length === 0 && <span style={{ color: C.dim }}>Nothing pressing needs hands right now.</span>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, padding: '6px 20px 18px' }}>
          <div>
            <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>Upkeep: what's falling behind</div>
            <ChoreBars game={game} />
          </div>
          <div>
            <div style={{ color: C.gold, fontWeight: 600, marginBottom: 4 }}>Gatherings</div>
            {so.active && <div style={{ color: C.good, fontSize: 12, marginBottom: 4 }}>{GATHERING[so.active.kind].name} {game.clock.t < so.active.at ? 'at six this evening' : 'going on now'}.</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CALLABLE.map(k => {
                const why = gatheringProblem(game, k);
                return <button key={k} style={btn(false, !!why)} title={why ?? `Morale lift, costs about ${GATHERING[k].kcal.toLocaleString('en-US')} kcal a head${GATHERING[k].noise >= 5 ? '; noise, light and smoke carry once others go hungry' : ''}`}
                  onClick={() => { if (!why) setMsg(g.daily(s => callGathering(s, k))); }}>{GATHERING[k].name}</button>;
              })}
            </div>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 8, color: C.dim }}>
              <input type="checkbox" checked={so.auto !== false} onChange={e => g.daily(s => { dailyOf(s).social.auto = e.target.checked; return null; })} />
              Holidays, birthdays, weddings and funerals happen on their own
            </label>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6 }}>Held so far: {so.held}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
