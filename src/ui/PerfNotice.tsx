import { useWorldStore } from '../store/worldStore';

/** Shown when the game stepped the graphics down on its own (game/GameCanvas.tsx); dismissible, and it does not come back for the same step. */
export function PerfNotice() {
  const n = useWorldStore(s => s.perfNotice);
  const set = useWorldStore(s => s.setPerfNotice);
  if (!n) return null;
  return (
    <div role="alert" data-testid="perf-notice" style={{ position: 'fixed', top: 54, left: '50%', transform: 'translateX(-50%)', zIndex: 40, maxWidth: 520, padding: '10px 14px', background: 'rgba(30,34,36,0.96)', color: '#e9e2cf', border: '1px solid #c9a35a', borderRadius: 6, font: '13px system-ui, sans-serif', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 1 }}>{n}</span>
      <button onClick={() => set(null)} aria-label="Dismiss" style={{ cursor: 'pointer' }}>OK</button>
    </div>
  );
}
