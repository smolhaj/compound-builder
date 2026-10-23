import { useState, type CSSProperties, type ReactNode } from 'react';
import { useWorldStore, type BuildingView, type CameraMode } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import type { Quality } from '../engine/world/WorldScene';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import { calendarOf, hourOf, type Speed } from '../sim/state';
import { fullName } from '../sim/family';
import { MATERIALS, MATERIAL_IDS, emptyStock, type MaterialId } from '../sim/materials';
import { onOrder, orderCost, orderProblem } from '../sim/economy';
import { blockedReason, isFinished, progress } from '../sim/construction';
import { BLUEPRINTS, totalBill, totalHours } from '../sim/blueprints';
import { KIT, KIT_ORDER } from '../game/buildkit/kit';
import { PERIMETER, PERIMETER_ORDER, runBill, runHours, runFinished, runProgress, runBlocked, runGrowth } from '../sim/perimeter';

const QUALITIES: Quality[] = ['high', 'medium', 'low'];
const SIGHTS: Array<['off' | 'road' | 'ridge' | 'night' | 'viewshed', string, string]> = [
  ['off', 'Off', 'No sightline overlay'], ['road', 'Road', 'How exposed each spot is to people on the county road'], ['ridge', 'Ridge', 'Seen from the high ground to the west'],
  ['night', 'Night', 'Where your lit windows give you away after dark'], ['viewshed', 'View from…', 'Click a spot to see what can be seen from there (Shift-click: from a 10 m tower)']];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];
const VIEWS: Array<[BuildingView, string, string]> = [['full', 'Walls', 'Whole buildings'], ['cutaway', 'Cutaway', 'Walls cut at waist height, roof and loft off (V)'], ['xray', 'X-ray', 'See-through walls and roof (V)']];
const SPEEDS: Array<[Speed, string]> = [[0, '❚❚'], [1, '▶'], [2, '▶▶'], [3, '▶▶▶'], [4, '⏩']];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const TASK_TEXT: Record<string, string> = { build: 'Building', forestry: 'In the woods', chores: 'Chores', sleep: 'Asleep', school: 'School', leisure: 'Free time', idle: 'Idle' };

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
  const [qty, setQty] = useState<Record<MaterialId, number>>(emptyStock());
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
  const costOf = (kind: string) => orderCost(Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));
  const ownNeeds = (kind: string) => Object.entries(totalBill(BLUEPRINTS[kind])).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');

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
          {KIT_ORDER.map(kind => {
            const own = ownNeeds(kind);
            return <button key={kind} title={KIT[kind].blurb} style={{ ...btn(g.tool === kind), width: '100%', textAlign: 'left', marginBottom: 3, display: 'block' }} onClick={() => g.setTool(g.tool === kind ? null : kind)}>
              <div>{KIT[kind].name}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>~{usd(costOf(kind))}{own ? ` + ${own}` : ''} · {totalHours(BLUEPRINTS[kind])} h</div>
            </button>;
          })}
          <div style={{ ...h3, marginTop: 6 }}>Perimeter (per 100 m)</div>
          {PERIMETER_ORDER.map(kind => {
            const len = 100 / 6, bill = runBill(kind, len);
            const buy = Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }));
            const own = Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price === null).map(([m, q]) => `${q} ${MATERIALS[m as MaterialId].name.toLowerCase()}`).join(', ');
            const tool = `fence:${kind}`;
            return <button key={kind} title={PERIMETER[kind].blurb} style={{ ...btn(g.tool === tool), width: '100%', textAlign: 'left', marginBottom: 3, display: 'block' }} onClick={() => g.setTool(g.tool === tool ? null : tool)}>
              <div>{PERIMETER[kind].name}</div>
              <div style={{ fontSize: 11, opacity: 0.75 }}>{buy.length ? `~${usd(orderCost(buy))}` : 'no materials'}{own ? ` + ${own}` : ''} · {Math.round(runHours(kind, len))} h</div>
            </button>;
          })}
          <button style={{ ...btn(g.tool === 'fell'), width: '100%', textAlign: 'left', marginTop: 4 }} onClick={() => g.setTool(g.tool === 'fell' ? null : 'fell')}>
            Mark trees to fell
          </button>
          {g.tool && <div style={{ marginTop: 4, opacity: 0.85 }}>{g.toolProblem ?? (g.tool === 'fell' ? 'Point at a tree · click marks / unmarks · Esc stops' : 'Click to stake it out · R rotates · Esc cancels')}</div>}
          {g.tool?.startsWith('fence:') && <div style={{ marginTop: 2, opacity: 0.65, fontSize: 11 }}>Click corners · Shift-click the line for a gate · Enter / double-click lays it out · Backspace undoes · Esc cancels</div>}
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
        {game.perimeter.some(r => !runFinished(r) || runGrowth(r, game.clock.t) < 1) && (
          <Section title="Perimeter">
            {game.perimeter.filter(r => !runFinished(r) || runGrowth(r, game.clock.t) < 1).slice(0, 4).map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                <span>{PERIMETER[r.kind].name}</span>
                <span style={{ opacity: 0.75 }}>{runFinished(r) ? `growing ${Math.round(runGrowth(r, game.clock.t) * 100)} %` : runBlocked(game, r) ?? `${Math.round(runProgress(r) * 100)} %`}</span>
              </div>))}
          </Section>
        )}
        {game.forestry.jobs.length > 0 && (
          <Section title="Woods">
            {(['marked', 'felled', 'bucked'] as const).map(st => {
              const n = game.forestry.jobs.filter(j => j.stage === st).length;
              return n ? <div key={st}>{n} {st === 'marked' ? 'marked to fell' : st === 'felled' ? 'down, to limb and buck' : 'bucked, to skid to the yard'}</div> : null;
            })}
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
              onClick={() => { if (g.order(lines)) setQty(emptyStock()); }}>
              Order {usd(orderCost(lines))}{problem === 'cannot_afford' ? ' (too much)' : ''}
            </button>}
            {needLines.length > 0 && <button style={btn()} disabled={!!orderProblem(game, needLines)} onClick={() => g.order(needLines)}>
              Order what the plans need ({usd(orderCost(needLines))})
            </button>}
          </div>
        </Section>
      </div>

      {/* Bottom right: cameras, building view */}
      <div style={{ ...panel, position: 'fixed', right: 10, bottom: 10, padding: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
        {VIEWS.map(([v, label, tip]) => <button key={v} title={tip} style={btn(w.buildingView === v)} onClick={() => w.setBuildingView(v)}>{label}</button>)}
        <span style={{ width: 1, height: 18, background: '#555', margin: '0 3px' }} />
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
        <span style={{ opacity: 0.7 }}>Sightlines</span>
        {SIGHTS.map(([m, label, tip]) => <button key={m} title={tip} style={btn(w.sightMode === m)} onClick={() => w.setSightMode(m)}>{label}</button>)}
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
