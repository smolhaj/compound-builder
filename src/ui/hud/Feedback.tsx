/**
 * Small first-time-player feedback (docs/DECISIONS.md, "Onboarding fixes"): the reason a spot is refused, next to the pointer; a one-line
 * toast for a refused click (never a modal); and the new-game welcome card (the clock starts paused).
 */
import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { KIT } from '../../game/buildkit/kit';
import { panel } from './style';

/** The refusal reason beside the pointer while a build tool is armed and the spot under it is not allowed. */
export function CursorHint() {
  const tool = useGameStore(g => g.tool), why = useGameStore(g => g.toolProblem);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const armed = !!tool && !!KIT[tool];
  useEffect(() => {
    if (!armed) return;
    const move = (e: PointerEvent) => setAt(e.target instanceof HTMLCanvasElement ? { x: e.clientX, y: e.clientY } : null);
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [armed]);
  if (!armed || !why || !at) return null;   // (a stale position is ignored once the tool is put away)
  const right = at.x > window.innerWidth - 340;
  return <div data-testid="cursor-hint" style={{ position: 'fixed', left: right ? undefined : at.x + 16, right: right ? window.innerWidth - at.x + 16 : undefined, top: at.y + 18, maxWidth: 300, pointerEvents: 'none', zIndex: 20, background: 'rgba(120,30,24,0.92)', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 12.5, boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>{why}</div>;
}

/** What to do while a line tool (wall, fence, pipe, tunnel) is armed: one clear bar, big enough to read, with the live length and cost under it. */
export const LINE_TOOL_HELP = 'Click points along the line. Double-click to finish. Esc to cancel';
export function LineToolBar() {
  const tool = useGameStore(g => g.tool), live = useGameStore(g => g.toolProblem), welcome = useGameStore(g => g.welcome);
  if (!tool || !tool.startsWith('fence:')) return null;
  return <div data-testid="line-tool-bar" role="status" style={{ ...panel, position: 'fixed', top: welcome ? 168 : 100, left: '50%', transform: 'translateX(-50%)', zIndex: 16, pointerEvents: 'none', border: '2px solid #ffd27a', padding: '10px 18px', maxWidth: 'min(640px, calc(100vw - 40px))', textAlign: 'center', boxShadow: '0 4px 18px rgba(0,0,0,0.5)' }}>
    <div style={{ fontSize: 17, fontWeight: 700, color: '#ffe3a3' }}>{LINE_TOOL_HELP}</div>
    {live && <div style={{ fontSize: 13, marginTop: 4, color: '#e8dcc0' }}>{live}</div>}
  </div>;
}

/** A one-line notice under the top bar that fades by itself. */
export function ToastLine() {
  const t = useGameStore(g => g.toast), welcome = useGameStore(g => g.welcome);
  if (!t) return null;
  return <div key={t.id} role="status" data-testid="toast" style={{ ...panel, position: 'fixed', top: welcome ? 118 : 62, left: '50%', transform: 'translateX(-50%)', zIndex: 25, pointerEvents: 'none', border: '1px solid #c8603f', maxWidth: 'min(520px, calc(100vw - 40px))', textAlign: 'center' }}>{t.text}</div>;
}

/** The new game starts paused: one line says what to do first. */
export function WelcomeCard() {
  const on = useGameStore(g => g.welcome), setWelcome = useGameStore(g => g.setWelcome), setSpeed = useGameStore(g => g.setSpeed);
  if (!on) return null;
  return <div data-testid="welcome" style={{ ...panel, position: 'fixed', left: '50%', top: 62, transform: 'translateX(-50%)', zIndex: 15, display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #b9a36a', maxWidth: 'min(560px, calc(100vw - 40px))' }}>
    <span>Welcome. The clock is paused: look around, then work down the <b>Get operational</b> list on the left. Press play when you are ready.</span>
    <button style={{ cursor: 'pointer' }} onClick={() => setSpeed(1)}>Start</button>
    <button style={{ cursor: 'pointer' }} title="Close this and keep the clock paused" onClick={() => setWelcome(false)}>×</button>
  </div>;
}
