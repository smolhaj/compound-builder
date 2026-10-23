import { useState, type CSSProperties, type ReactNode } from 'react';
import { useWorldStore, type CameraMode } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import type { Quality } from '../engine/world/WorldScene';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import { calendarOf, hourOf, type Speed } from '../sim/state';
import { fullName } from '../sim/family';
import { MATERIALS, MATERIAL_IDS, type MaterialId } from '../sim/materials';
import { onOrder, orderCost, orderProblem } from '../sim/economy';
import { blockedReason, isFinished, progress } from '../sim/construction';
import { BLUEPRINTS, totalBill, totalHours } from '../sim/blueprints';
import { KIT } from '../game/buildkit/kit';

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
const SPEEDS: Array<[Speed, string]> = [[0, '❚❚'], [1, '▶'], [2, '▶▶'], [3, '▶▶▶'], [4, '⏩']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const TASK_TEXT: Record<string, string> = { build: 'Building', chores: 'Chores', sleep: 'Asleep', school: 'School', leisure: 'Free time', idle: 'Idle' };

function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
const clock = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

const panel: CSSProperties = { background: 'rgba(20,22,18,0.78)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: '#eee' };
const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginBottom: 8 }}><div style={h3}>{title}</div>{children}</div>;
}

/** Game HUD. Hidden with ?clean (QA shots). */
export function Hud() {
  const w = useWorldStore();
  const g = useGameStore();
  const [qty, setQty] = useState<Record<MaterialId, number>>({ lumber: 0, logs: 0, fieldstone: 0, roofing: 0, hardware: 0 });
  if (new URLSearchParams(location.search).has('clean')) return null;
  const game = g.game;
  const cal = calendarOf(game.clock);
  const pending = onOrder(game);
  const lines = MATERIAL_IDS.filter(m => qty[m] > 0).map(m => ({ material: m, qty: qty[m] }));
  const problem = lines.length ? orderProblem(game, lines) : null;
  // what the plans still need beyond stock + orders
  const need: Partial<Record<MaterialId, number>> = {};
  for (const st of game.structures) {
    if (isFinished(st)) continue;
    const bp = BLUEPRINTS[st.kind];
    bp.stages.forEach((sg, i) => {
      if (i < st.stage || (i === st.stage && st.supplied)) return;
      for (const [k, n] of Object.entries(sg.materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
    });
  }
  for (const k of MATERIAL_IDS) need[k] = Math.max(0, (need[k] ?? 0) - game.stock[k] - (pending[k] ?? 0));
  const needLines = MATERIAL_IDS.filter(k => (need[k] ?? 0) > 0 && MATERIALS[k].price !== null).map(k => ({ material: k, qty: need[k]! }));
  const sel = game.structures.find(s => s.id === g.selected) ?? game.structures.find(s => !isFinished(s)) ?? null;
  const cabin = BLUEPRINTS.timber_cabin;
  const cabinCost = orderCost(Object.entries(totalBill(cabin)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));

  return (
    <>
      {/* Top bar: date, time, money, speed */}
      <div style={{ ...panel, position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 12, alignItems: 'center', fontSize: 13.5 }}>
        <span>{dateLabel(cal.doy)}, {cal.year}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(hourOf(game.clock.t))}</span>
        <span style={{ fontWeight: 600, color: '#cfe0a8' }}>{usd(game.money)}</span>
        <span style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map(([s, label]) => <button key={s} style={btn(game.clock.speed === s)} onClick={() => g.setSpeed(s)}>{label}</button>)}
        </span>
      </div>

      {/* Left: build menu + construction */}
      <div style={{ ...panel, position: 'fixed', left: 10, top: 10, width: 230 }}>
        <Section title="Build">
          <button style={{ ...btn(g.tool === 'timber_cabin'), width: '100%', textAlign: 'left' }} onClick={() => g.setTool(g.tool ? null : 'timber_cabin')}>
            {KIT.timber_cabin.name} · ~{usd(cabinCost)} · {totalHours(cabin)} h
          </button>
          {g.tool && <div style={{ marginTop: 4, opacity: 0.85 }}>{g.toolProblem ?? 'Click to stake it out · R rotates · Esc cancels'}</div>}
        </Section>
        {sel && (
          <Section title="Construction">
            <div>{KIT[sel.kind].name} — {isFinished(sel) ? 'finished' : BLUEPRINTS[sel.kind].stages[sel.stage].name}</div>
            <div style={{ height: 6, background: '#333', borderRadius: 3, margin: '4px 0' }}>
              <div style={{ width: `${progress(sel) * 100}%`, height: '100%', background: '#c9b27a', borderRadius: 3 }} />
            </div>
            {!isFinished(sel) && <div style={{ opacity: 0.8 }}>{blockedReason(game, sel) ?? `${Math.round(progress(sel) * 100)} % done`}</div>}
          </Section>
        )}
        <Section title="Log">
          {game.log.slice(-5).map((e, i) => <div key={i} style={{ opacity: 0.6 + 0.08 * i }}>{e.text}</div>)}
        </Section>
      </div>

      {/* Right: family, stockpile, orders */}
      <div style={{ ...panel, position: 'fixed', right: 10, top: 10, width: 250 }}>
        <Section title="Family">
          {game.people.map(p => {
            const st = game.personState.find(x => x.id === p.id);
            return <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 4, background: '#' + p.shirt.toString(16).padStart(6, '0'), marginRight: 5 }} />{fullName(p)}, {p.age}</span>
              <span style={{ opacity: 0.7 }}>{TASK_TEXT[st?.task ?? 'idle']}</span>
            </div>;
          })}
        </Section>
        <Section title="Stockpile">
          {MATERIAL_IDS.map(m => (
            <div key={m} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
              <span>{MATERIALS[m].name}</span>
              <span style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{game.stock[m]}{pending[m] ? <span style={{ opacity: 0.6 }}> +{pending[m]}</span> : null}</span>
              {MATERIALS[m].price !== null && <>
                <button style={btn()} onClick={() => setQty({ ...qty, [m]: Math.max(0, qty[m] - 1) })}>−</button>
                <span style={{ width: 18, textAlign: 'center' }}>{qty[m]}</span>
                <button style={btn()} onClick={() => setQty({ ...qty, [m]: qty[m] + 1 })}>+</button>
              </>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {lines.length > 0 && <button style={btn(true)} disabled={!!problem}
              onClick={() => { if (g.order(lines)) setQty({ lumber: 0, logs: 0, fieldstone: 0, roofing: 0, hardware: 0 }); }}>
              Order {usd(orderCost(lines))}{problem === 'cannot_afford' ? ' (too much)' : ''}
            </button>}
            {needLines.length > 0 && <button style={btn()} disabled={!!orderProblem(game, needLines)} onClick={() => g.order(needLines)}>
              Order what the plans need ({usd(orderCost(needLines))})
            </button>}
          </div>
        </Section>
      </div>

      {/* Bottom right: cameras */}
      <div style={{ ...panel, position: 'fixed', right: 10, bottom: 10, padding: 4, display: 'flex', gap: 4 }}>
        {CAMERAS.map(([m, label]) => <button key={m} style={btn(w.cameraMode === m)} onClick={() => w.setCameraMode(m)}>{label}</button>)}
      </div>
      {w.cameraMode !== 'diorama' && (
        <div style={{ ...panel, position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', fontSize: 12 }}>
          {w.cameraMode === 'walk' ? 'WASD to walk · drag or click to look · Shift to run · Esc to leave'
            : w.cameraMode === 'fly' ? 'WASD + Space / C to fly · wheel sets speed · Esc to leave'
            : 'Cinematic tour · Esc to leave'}
        </div>
      )}
      {w.tourCaption && (
        <div style={{ ...panel, position: 'fixed', left: '50%', bottom: 60, transform: 'translateX(-50%)', padding: '10px 16px' }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{w.tourCaption.title}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{w.tourCaption.subtitle}</div>
        </div>
      )}

      {/* Bottom left: view (season / weather / quality / photo mode) */}
      <div style={{ ...panel, position: 'fixed', left: 10, bottom: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 560 }}>
        <select value={w.seasonMode} onChange={e => w.setSeasonMode(e.target.value as SeasonMode)} title="Season look">
          {SEASON_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.weatherMode} onChange={e => w.setWeatherMode(e.target.value as WeatherMode)} title="Weather">
          {WEATHER_MODES.map(x => <option key={x}>{x}</option>)}
        </select>
        <select value={w.quality} onChange={e => w.setQuality(e.target.value as Quality)} title="Graphics quality">
          {QUALITIES.map(x => <option key={x}>{x}</option>)}
        </select>
        <button style={btn(w.photo)} onClick={() => w.setPhoto(!w.photo)}>Photo</button>
        {w.photo && <>
          <span>{clock(w.timeOfDay)}</span>
          <input type="range" min={0} max={24} step={0.05} value={w.timeOfDay} onChange={e => w.setTimeOfDay(+e.target.value)} />
          <span>{dateLabel(w.dayOfYear)}</span>
          <input type="range" min={1} max={365} step={1} value={w.dayOfYear} onChange={e => w.setDayOfYear(+e.target.value)} />
        </>}
      </div>
    </>
  );
}
