import { useEffect, useState } from 'react';
import { useWorldStore } from '../store/worldStore';
import { PERF_NOTICE_MS, perfNoticePlace } from './hudLayout';

/**
 * Shown when the game stepped the graphics down on its own (game/GameCanvas.tsx); dismissible, gone after 8 seconds,
 * and it does not come back for the same step. A small toast above the bottom toolbars and right of the left panel,
 * so it never covers a panel, a button or the Welcome card's header.
 */
export function PerfNotice() {
  const n = useWorldStore(s => s.perfNotice);
  const set = useWorldStore(s => s.setPerfNotice);
  const [vw, setVw] = useState(typeof window === 'undefined' ? 1280 : window.innerWidth);
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => set(null), PERF_NOTICE_MS);
    return () => clearTimeout(t);
  }, [n, set]);
  if (!n) return null;
  const at = perfNoticePlace(vw);
  return (
    <div role="alert" data-testid="perf-notice" style={{ position: 'fixed', bottom: at.bottom, left: at.left, zIndex: 20, width: at.width, boxSizing: 'border-box', padding: '7px 10px', background: 'rgba(30,34,36,0.96)', color: '#e9e2cf', border: '1px solid #c9a35a', borderRadius: 6, font: '12px/1.35 system-ui, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 1 }}>{n}</span>
      <button onClick={() => set(null)} aria-label="Dismiss" style={{ cursor: 'pointer' }}>OK</button>
    </div>
  );
}
