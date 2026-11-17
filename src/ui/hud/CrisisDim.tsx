/**
 * Layout A crisis dim (docs/UX_AUDIT.md 11.5): while a decision card, a hit moment or another modal card is up, the world behind it
 * dims about 35 percent with a slight blur, so the card is what the eye finds. It sits under the HUD (the bars and the open drawer stay
 * readable and usable: a decision is often made by looking at the supplies) and does not touch the clock. Reduced motion: no fade.
 */
import { useEffect, useState } from 'react';

export const DIM_ALPHA = 0.35;
export const DIM_BLUR_PX = 2;
export const DIM_MS = 220;

export function CrisisDim({ on }: { on: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(on)); return () => cancelAnimationFrame(id); }, [on]);
  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!on && !shown) return null;
  return <div data-testid="crisis-dim" data-on={on ? '1' : '0'} aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: `rgba(10,12,10,${DIM_ALPHA})`, backdropFilter: `blur(${DIM_BLUR_PX}px)`, WebkitBackdropFilter: `blur(${DIM_BLUR_PX}px)`,
    opacity: on && shown ? 1 : 0, transition: reduce ? 'none' : `opacity ${DIM_MS}ms ease` }} />;
}
