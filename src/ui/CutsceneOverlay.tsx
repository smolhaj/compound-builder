import type { CSSProperties } from 'react';
import { useGameStore } from '../store/gameStore';
import { useBattleStore } from '../store/battleStore';
import { useCutsceneView } from '../store/cutsceneStore';
import { clockLabel, gapLabel } from '../sim/siege';
import type { Battle } from '../sim/battleTypes';
import { STANCE } from './stanceText';

const BAR = 'clamp(54px, 12vh, 120px)';
const FONT = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

const bar: CSSProperties = { position: 'fixed', left: 0, right: 0, background: '#050504', zIndex: 38, pointerEvents: 'none' };
const label: CSSProperties = { fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', opacity: 0.6, fontFamily: 'system-ui, sans-serif' };
const btn: CSSProperties = { background: 'rgba(30,26,22,0.9)', color: '#efe6d4', border: '1px solid rgba(239,230,212,0.35)', borderRadius: 4, padding: '5px 12px', cursor: 'pointer', font: '12.5px system-ui, sans-serif', pointerEvents: 'auto' };

/** The speaker of a line in the fight. */
function speaker(b: Battle | null, people: ReadonlyArray<{ id: string; first: string }>, who?: string): { name: string; home: boolean } | null {
  if (!who || !b) return null;
  const u = b.units.find(x => x.id === who);
  if (!u) return null;
  if (u.side === 'raider') return { name: u.id === 'r0' ? 'Their leader' : 'Raider', home: false };
  return { name: people.find(p => p.id === u.personId)?.first ?? 'Resident', home: true };
}

/** The raid cutscene's frame: letterbox bars, the clock, the narration, scene counter, skips, the gap card and the aftermath report. */
export function CutsceneOverlay() {
  const c = useGameStore(s => s.cutscene);
  const people = useGameStore(s => s.game.people);
  const view = useCutsceneView(s => s.view);
  const lines = useBattleStore(s => s.lines);
  const battle = useBattleStore(s => s.battle);
  const skipScene = useCutsceneView(s => s.requestSkipScene);
  const skipAll = useCutsceneView(s => s.requestSkipAll);
  if (!c) return null;
  const night = c.hour < 6 || c.hour >= 20;
  const playing = c.phase === 'playing' && view;
  const hour = playing ? view.hour : c.phase === 'aftermath' && c.plan ? (c.hour + c.plan.totalGame / 3600) % 24 : c.hour;
  const plan = c.plan;
  const multi = !!plan && plan.scenes.length > 1;
  return (
    <>
      <div style={{ ...bar, top: 0, height: BAR, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 clamp(16px, 4vw, 48px)', color: '#efe6d4', fontFamily: FONT }}>
        <div>
          <div style={label}>{c.phase === 'prompt' ? (night ? 'Night' : 'Day') + ' · someone is at the gate' : c.phase === 'aftermath' ? 'After' : (night ? 'Night' : 'Day')}</div>
          <div style={{ fontSize: 'clamp(22px, 4.2vh, 38px)', letterSpacing: 1, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{clockLabel(hour)}</div>
        </div>
        {playing && (
          <div style={{ textAlign: 'center' }}>
            <div style={label}>{multi ? `Scene ${view.scene + 1} of ${view.scenes}` : 'The raid'}</div>
            <div style={{ fontSize: 'clamp(14px, 2.4vh, 20px)' }}>{view.sceneLabel}</div>
            {multi && view.scene > 0 && view.seg === 'lead' && plan && <div style={{ ...label, marginTop: 2 }}>{gapLabel(plan.scenes[view.scene].gap)}</div>}
          </div>
        )}
        {playing && (
          <div style={{ display: 'flex', gap: 8 }}>
            {multi && c.offer == null && <button style={btn} onClick={skipScene}>Skip scene</button>}
            <button style={btn} onClick={skipAll}>{multi ? 'Skip all' : 'Skip'}</button>
          </div>
        )}
      </div>
      <div style={{ ...bar, bottom: 0, height: BAR, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(16px, 8vw, 120px)', color: '#efe6d4', fontFamily: FONT, textAlign: 'center' }}>
        {c.phase === 'prompt' && <div style={{ fontSize: 'clamp(14px, 2.5vh, 21px)', fontStyle: 'italic', lineHeight: 1.35 }}>{c.narration}</div>}
        {playing && view.seg !== 'fight' && view.seg !== 'gap' && view.caption && <div style={{ fontSize: 'clamp(14px, 2.5vh, 21px)', fontStyle: 'italic', lineHeight: 1.35 }}>{view.caption}</div>}
        {playing && view.seg === 'fight' && (
          <div style={{ fontSize: 'clamp(13px, 2.2vh, 19px)', lineHeight: 1.3 }}>
            {lines.slice(-2).map((l, i, a) => {
              const who = speaker(battle, people, l.who);
              return <div key={i} style={{ opacity: 0.55 + 0.45 * (i + 1) / a.length }}>{who && <b style={{ color: who.home ? '#9ccdf5' : '#ff8d7c', fontWeight: 600 }}>{who.name}: </b>}<span style={{ fontStyle: who ? 'normal' : 'italic' }}>{who ? `“${l.text}”` : l.text}</span></div>;
            })}
          </div>
        )}
      </div>
      {playing && view.seg === 'gap' && view.gap && c.offer == null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 37, background: 'rgba(3,3,2,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#efe6d4', fontFamily: FONT, pointerEvents: 'none' }}>
          <div style={label}>{view.sceneLabel}</div>
          <div style={{ fontSize: 'clamp(28px, 6vh, 56px)', margin: '8px 0', letterSpacing: 0.5 }}>{view.gap}</div>
          <div style={{ fontSize: 'clamp(18px, 3.4vh, 30px)', fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>{clockLabel(view.hour)}</div>
        </div>
      )}
      {c.phase === 'playing' && c.offer != null && <Offer />}
      {c.phase === 'aftermath' && c.report && <Report />}
    </>
  );
}

const card: CSSProperties = { position: 'fixed', right: 'clamp(12px, 3vw, 40px)', top: `calc(${BAR} + 14px)`, width: 'min(400px, calc(100vw - 24px))', maxHeight: `calc(100vh - 2 * ${BAR} - 28px)`, overflow: 'auto', background: 'rgba(16,14,11,0.94)', color: '#efe6d4', borderRadius: 4, padding: '16px 18px', zIndex: 40, fontFamily: FONT, boxShadow: '0 6px 28px rgba(0,0,0,0.6)', border: '1px solid rgba(239,230,212,0.2)' };

/** Between scenes of a siege: one chance to change what the family does. */
function Offer() {
  const c = useGameStore(s => s.cutscene)!;
  const pending = useGameStore(s => s.game.gate.pending);
  const mid = useGameStore(s => s.midStance);
  const view = useCutsceneView(s => s.view);
  const next = c.plan?.scenes[(c.offer ?? 0) + 1];
  const others = (pending?.stances ?? []).filter(st => st !== c.stance && st !== 'warn');
  return (
    <div style={card}>
      <div style={label}>Between scenes{view ? ` · ${clockLabel(view.hour)}` : ''}</div>
      <div style={{ fontSize: 20, fontWeight: 600, margin: '2px 0 6px' }}>They have pulled back</div>
      <div style={{ opacity: 0.85, fontSize: 14, lineHeight: 1.4, marginBottom: 10 }}>
        {next ? `${gapLabel(next.gap).replace(/ later$/, '')} of quiet, and then it will start again. ` : ''}You can change what the family does, once. Building and the shop stay locked.
      </div>
      <button style={{ ...btn, width: '100%', textAlign: 'left', background: '#d8c9a0', color: '#1c1d18', border: 0, padding: '9px 12px', marginBottom: 6 }} onClick={() => mid(null)}>
        <div style={{ fontWeight: 700 }}>Carry on as you are</div>
        <div style={{ fontSize: 11.5, opacity: 0.75 }}>{STANCE[c.stance ?? 'defend'][0]}: {STANCE[c.stance ?? 'defend'][1]}</div>
      </button>
      {others.map(st => (
        <button key={st} style={{ ...btn, width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6 }} onClick={() => mid(st)}>
          <div style={{ fontWeight: 600 }}>Change to: {STANCE[st][0]}</div>
          <div style={{ fontSize: 11.5, opacity: 0.75 }}>{STANCE[st][1]}</div>
        </button>
      ))}
    </div>
  );
}

/** The short report after the scenes: who was hurt, what was lost, who is left on the drive. */
function Report() {
  const c = useGameStore(s => s.cutscene)!;
  const end = useGameStore(s => s.endCutscene);
  const r = c.report!;
  const tone = r.tone === 'good' ? '#a8d080' : r.tone === 'bad' ? '#f08070' : '#e8c880';
  const row = (k: string, v: string, hot = false) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0', borderBottom: '1px solid rgba(239,230,212,0.1)', fontSize: 13.5 }}><span style={{ opacity: 0.7 }}>{k}</span><span style={{ textAlign: 'right', color: hot ? '#f08070' : undefined }}>{v}</span></div>;
  const none = 'no one';
  return (
    <div style={card}>
      <div style={{ height: 3, background: tone, marginBottom: 12 }} />
      <div style={label}>The morning after</div>
      <div style={{ fontSize: 22, fontWeight: 600, margin: '2px 0 6px' }}>{r.title}</div>
      <div style={{ opacity: 0.85, marginBottom: 10, fontSize: 14, lineHeight: 1.4 }}>{r.text}</div>
      {row('Killed', r.killed.length ? r.killed.join(', ') : none, r.killed.length > 0)}
      {row('Taken', r.taken.length ? r.taken.join(', ') : none, r.taken.length > 0)}
      {row('Hurt', r.wounded.length ? r.wounded.join(', ') : none)}
      {row('Lost from the stores', r.lost.length ? r.lost.map(([k, n]) => `${n} ${k}`).join(', ') : 'nothing')}
      {row('Rounds fired', String(r.rounds))}
      {row('Raiders on the drive', r.raidersWounded + r.raidersDead ? `${r.raidersWounded} wounded, ${r.raidersDead} dead` : 'none left')}
      {r.lines.filter(l => !/^Lost:|rounds fired\.$|more rounds went out/.test(l)).map((l, i) => <div key={i} style={{ fontSize: 12.5, opacity: 0.8, marginTop: 5 }}>{l}</div>)}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button style={{ ...btn, background: '#d8c9a0', color: '#1c1d18', border: 0, padding: '8px 16px', fontSize: 14 }} onClick={end}>{r.aftermath ? 'See to the drive' : 'Pick up the pieces'}</button>
      </div>
    </div>
  );
}
