/**
 * Hover cards (docs/UX_AUDIT.md 11.9). Two forms share one open/close behavior (`useCardOpen`):
 *   HoverHost  the card hangs off its host (top bar, action bar), shifted to stay inside the window;
 *   Tip        the card is portaled to the page next to its anchor (drawer rows: the drawer scrolls and clips its children).
 * Open: pointer hover (after a short delay) or keyboard focus; on a touch screen a long press (about half a second) opens it and the
 * tap that follows does not click the control under the finger; a tap anywhere else closes it. Esc and leaving close it.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CARD_W, cardShift, cardStyle, placeCard } from './cardLayout';
import { useCardOpen } from './useCardOpen';

export function HoverHost({ card, children, delay = 140, scale = 1, align = 'center', up = false, block = false }: { card: ReactNode; children: ReactNode; delay?: number; scale?: number; align?: 'center' | 'start' | 'end'; /** Open above the host (for the bottom bar). */ up?: boolean; /** Fill the line (a row), not just the content. */ block?: boolean }) {
  const host = useRef<HTMLSpanElement>(null), box = useRef<HTMLDivElement>(null);
  const { open, handlers } = useCardOpen(delay, host, box);
  const left = align === 'start' ? 0 : align === 'end' ? `calc(100% - ${CARD_W}px)` : `calc(50% - ${CARD_W / 2}px)`;
  return (
    <span ref={host} {...handlers} style={{ position: 'relative', display: block ? 'flex' : 'inline-flex', ...(block ? { width: '100%' } : {}) }}>
      {children}
      {open && <ShiftedCard boxRef={box} scale={scale} style={{ ...(up ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }), left }}>{card}</ShiftedCard>}
    </span>
  );
}


/** The card of a HoverHost: mounted fresh on each open, so its sideways shift starts at 0 and is measured once. */
function ShiftedCard({ boxRef, scale, style, children }: { boxRef: React.RefObject<HTMLDivElement | null>; scale: number; style: CSSProperties; children: ReactNode }) {
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    setShift(sh => sh + cardShift(r.left, r.width, window.innerWidth) / (scale || 1));
  }, [boxRef, scale]);
  return <div ref={boxRef} role="tooltip" data-hover-card style={{ ...cardStyle, position: 'absolute', ...style, transform: `translateX(${shift}px)`, zIndex: 5 }}>{children}</div>;
}

/**
 * A hover card for a number or a row inside a drawer (portaled, scaled with the UI size). `text` is the plain-text fallback:
 * without a card the browser's own tooltip would be the only way to read it, and a phone has no hover.
 */
export function Tip({ card, children, scale = 1, block = false, style, delay = 220 }: { card: ReactNode; children: ReactNode; scale?: number; block?: boolean; style?: CSSProperties; delay?: number }) {
  const host = useRef<HTMLSpanElement>(null), box = useRef<HTMLDivElement>(null);
  const { open, handlers } = useCardOpen(delay, host, box);
  useLayoutEffect(() => { if (open && host.current && box.current) placeCard(host.current, box.current); }, [open, scale]);
  return (
    <span ref={host} {...handlers} style={{ position: 'relative', display: block ? 'flex' : 'inline-flex', ...(block ? { width: '100%', minWidth: 0 } : {}), ...style }}>
      {children}
      {open && createPortal(
        <div ref={box} role="tooltip" data-hover-card data-tip style={{ ...cardStyle, position: 'fixed', left: 0, top: 0, visibility: 'hidden', zIndex: 60, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>{card}</div>,
        document.body)}
    </span>
  );
}
