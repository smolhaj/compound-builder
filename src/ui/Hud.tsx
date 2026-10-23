import { useWorldStore, type CameraMode } from '../store/worldStore';
import { useGameStore } from '../store/gameStore';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import { WEATHER_MODES, type WeatherMode } from '../engine/world/weather/weatherState';
import type { Quality } from '../engine/world/WorldScene';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
const QUALITIES: Quality[] = ['high', 'medium', 'low'];
const CAMERAS: Array<[CameraMode, string]> = [['diorama', 'Diorama'], ['walk', 'Walk'], ['fly', 'Fly'], ['cinematic', 'Tour']];

/** Minimal world controls: time of day, speed, season, quality. Hidden with ?clean (QA shots). */
export function Hud() {
  const s = useWorldStore();
  const g = useGameStore();
  if (new URLSearchParams(location.search).has('clean')) return null;
  const hh = Math.floor(s.timeOfDay), mm = Math.floor((s.timeOfDay % 1) * 60);
  return (
    <>
    <div style={{ position: 'fixed', right: 12, bottom: 12, padding: 4, background: 'rgba(20,22,18,0.72)', borderRadius: 8, display: 'flex', gap: 4 }}>
      {CAMERAS.map(([m, label]) => (
        <button key={m} onClick={() => s.setCameraMode(m)}
          style={{ padding: '4px 10px', borderRadius: 6, border: 0, cursor: 'pointer', background: s.cameraMode === m ? '#d8c9a0' : '#3a3d34', color: s.cameraMode === m ? '#1c1d18' : '#eee' }}>
          {label}
        </button>
      ))}
    </div>
    {s.cameraMode !== 'diorama' && (
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', background: 'rgba(20,22,18,0.6)', borderRadius: 8, fontSize: 12 }}>
        {s.cameraMode === 'walk' ? 'WASD to walk · drag or click to look · Shift to run · Esc to leave'
          : s.cameraMode === 'fly' ? 'WASD + Space / C to fly · wheel sets speed · Esc to leave'
          : 'Cinematic tour · Esc to leave'}
      </div>
    )}
    <div style={{ position: 'fixed', left: 12, top: 12, padding: 6, background: 'rgba(20,22,18,0.72)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
      <button onClick={() => g.setTool(g.tool ? null : 'timber_cabin')}
        style={{ padding: '6px 12px', borderRadius: 6, border: 0, cursor: 'pointer', background: g.tool ? '#d8c9a0' : '#3a3d34', color: g.tool ? '#1c1d18' : '#eee' }}>
        Timber cabin
      </button>
      {g.tool && <span style={{ opacity: 0.85 }}>{g.toolProblem ?? 'Click to build · R rotates · Esc cancels'}</span>}
      <span style={{ opacity: 0.6 }}>{g.structures.length} built</span>
    </div>
    {s.tourCaption && (
      <div style={{ position: 'fixed', left: 24, top: 60, padding: '10px 16px', background: 'rgba(20,22,18,0.7)', borderRadius: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{s.tourCaption.title}</div>
        <div style={{ fontSize: 13, opacity: 0.8 }}>{s.tourCaption.subtitle}</div>
      </div>
    )}
    <div style={{ position: 'fixed', left: 12, bottom: 12, padding: '8px 12px', background: 'rgba(20,22,18,0.72)', borderRadius: 8, fontSize: 13, display: 'flex', gap: 12, alignItems: 'center' }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}</span>
      <input type="range" min={0} max={24} step={0.05} value={s.timeOfDay} onChange={e => s.setTimeOfDay(+e.target.value)} />
      <select value={s.hourSeconds} onChange={e => s.setHourSeconds(+e.target.value)}>
        <option value={0}>Paused</option>
        <option value={10}>1 h / 10 s</option>
        <option value={2}>1 h / 2 s</option>
        <option value={0.05}>1 day / 1.2 s</option>
      </select>
      <span style={{ minWidth: 48 }}>{dateLabel(s.dayOfYear)}</span>
      <input type="range" min={1} max={365} step={1} value={s.dayOfYear} onChange={e => s.setDayOfYear(+e.target.value)} />
      <select value={s.seasonMode} onChange={e => s.setSeasonMode(e.target.value as SeasonMode)}>
        {SEASON_MODES.map(x => <option key={x}>{x}</option>)}
      </select>
      <select value={s.weatherMode} onChange={e => s.setWeatherMode(e.target.value as WeatherMode)}>
        {WEATHER_MODES.map(x => <option key={x}>{x}</option>)}
      </select>
      <select value={s.quality} onChange={e => s.setQuality(e.target.value as Quality)}>
        {QUALITIES.map(x => <option key={x}>{x}</option>)}
      </select>
    </div>
    </>
  );
}
