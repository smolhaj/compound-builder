import { useWorldStore } from '../store/worldStore';
import { SEASON_MODES, type SeasonMode } from '../engine/world/season/seasonState';
import type { Quality } from '../engine/world/WorldScene';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

function dateLabel(doy: number): string {
  let m = 11;
  while (m > 0 && doy <= MONTH_START[m]) m--;
  return `${MONTHS[m]} ${doy - MONTH_START[m]}`;
}
const QUALITIES: Quality[] = ['high', 'medium', 'low'];

/** Minimal world controls: time of day, speed, season, quality. Hidden with ?clean (QA shots). */
export function Hud() {
  const s = useWorldStore();
  if (new URLSearchParams(location.search).has('clean')) return null;
  const hh = Math.floor(s.timeOfDay), mm = Math.floor((s.timeOfDay % 1) * 60);
  return (
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
      <select value={s.quality} onChange={e => s.setQuality(e.target.value as Quality)}>
        {QUALITIES.map(x => <option key={x}>{x}</option>)}
      </select>
    </div>
  );
}
