import { useWorldStore, type Season } from '../store/worldStore';
import type { Quality } from '../engine/world/WorldScene';

const SEASONS: Season[] = ['spring', 'summer', 'fall', 'winter'];
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
      </select>
      <select value={s.season} onChange={e => s.setSeason(e.target.value as Season)}>
        {SEASONS.map(x => <option key={x}>{x}</option>)}
      </select>
      <select value={s.quality} onChange={e => s.setQuality(e.target.value as Quality)}>
        {QUALITIES.map(x => <option key={x}>{x}</option>)}
      </select>
    </div>
  );
}
