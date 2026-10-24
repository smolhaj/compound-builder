import { useGameStore } from '../store/gameStore';
import { tension } from '../sim/disaster';

const TONE = ['#d8d4c4', '#e8d290', '#f0a860', '#ff7a66'];

/**
 * The news ticker (GDS §4: warning signs): the latest headlines along the
 * bottom edge, the strip darkening toward red as tension rises.
 */
export function Ticker() {
  const d = useGameStore(s => s.game.disaster);
  const t = useGameStore(s => s.game.clock.t);
  if (!d.news.length) return null;
  const w = d.phase === 'impact' || d.phase === 'survival' ? 1 : tension(d, t);
  const bg = `rgba(${Math.round(20 + 70 * w)},${Math.round(22 - 8 * w)},${Math.round(18 - 6 * w)},0.86)`;
  const items = d.news.slice(-6).reverse();
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 26, background: bg, color: '#eee', fontSize: 12.5, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', zIndex: 2 }}>
      <span style={{ padding: '0 10px', fontWeight: 700, letterSpacing: 0.8, fontSize: 11, opacity: 0.8 }}>{d.phase === 'impact' || d.phase === 'survival' ? 'EMERGENCY' : 'NEWS'}</span>
      <div style={{ display: 'flex', gap: 28 }}>
        {items.map((n, i) => <span key={`${n.t}-${i}`} style={{ color: TONE[n.tone], fontWeight: i === 0 ? 600 : 400, opacity: 1 - i * 0.15 }}>{n.text}</span>)}
      </div>
    </div>
  );
}
