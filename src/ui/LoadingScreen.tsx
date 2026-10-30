import { useWorldStore } from '../store/worldStore';

/** Covers the canvas while the world builds in stages (game/bootStages.ts); gone once the first frame is up. */
export function LoadingScreen() {
  const boot = useWorldStore(s => s.boot);
  if (!boot) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#14181a', color: '#e9e2cf', font: '15px system-ui, sans-serif' }}>
      <div style={{ letterSpacing: 2, textTransform: 'uppercase', fontSize: 12, opacity: 0.7 }}>Compound Builder</div>
      <div>{boot.label}…</div>
      <div style={{ width: 260, height: 6, background: '#2b3235', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(boot.pct * 100)}%`, height: '100%', background: '#c9a35a', transition: 'width 0.25s' }} />
      </div>
    </div>
  );
}
