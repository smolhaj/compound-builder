/** A buy on the Dome page that is refused says why in a line right where the player clicked, not in a blocking browser alert (nothing here covers the view). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameState } from '../../sim/state';
import { useGameStore } from '../../store/gameStore';
import { TONE } from './style';

/** How long a refusal stays up (ms): long enough to read, then it goes by itself. */
export const REFUSAL_MS = 9000;

/** `act` runs an operation through the store (money / lock rules); a refusal becomes `note`, a success clears it. */
export function useDomeAct(): { act: (f: (x: GameState) => string | null) => void; note: ReactNode } {
  const money = useGameStore(s => s.money);
  const [why, setWhy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const act = (f: (x: GameState) => string | null): void => {
    const w = money(f);
    if (timer.current) clearTimeout(timer.current);
    setWhy(w);
    if (w) timer.current = setTimeout(() => setWhy(null), REFUSAL_MS);
  };
  const note = why ? <div role="status" data-testid="dome-act-note" style={{ margin: '4px 0', padding: '4px 8px', borderLeft: `3px solid ${TONE.warn}`, background: 'rgba(240,192,112,0.08)', fontSize: 12, color: TONE.warn, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
    <span>{why}</span>
    <button type="button" aria-label="Dismiss" onClick={() => setWhy(null)} style={{ all: 'unset', cursor: 'pointer', opacity: 0.7 }}>×</button>
  </div> : null;
  return { act, note };
}
