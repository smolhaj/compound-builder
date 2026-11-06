import { useWorldStore } from '../store/worldStore';

/**
 * Shown when the game stepped the graphics down on its own (game/GameCanvas.tsx); dismissible, and it does not come back for the same step.
 * A small toast in the bottom-left corner, under every card, so it never covers the Welcome card or the charter header.
 */
export function PerfNotice() {
  const n = useWorldStore(s => s.perfNotice);
  const set = useWorldStore(s => s.setPerfNotice);
  if (!n) return null;
  return (
    <div role="alert" data-testid="perf-notice" style={{ position: 'fixed', bottom: 12, left: 12, zIndex: 20, width: 'min(330px, calc(100vw - 24px))', padding: '7px 10px', background: 'rgba(30,34,36,0.96)', color: '#e9e2cf', border: '1px solid #c9a35a', borderRadius: 6, font: '12px/1.35 system-ui, sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.45)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span style={{ flex: 1 }}>{n}</span>
      <button onClick={() => set(null)} aria-label="Dismiss" style={{ cursor: 'pointer' }}>OK</button>
    </div>
  );
}
