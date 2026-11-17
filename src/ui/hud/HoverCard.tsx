/**
 * Basic hover card (S1): opens after a short delay on hover or on keyboard focus, stays while the pointer is on the
 * card (so its fix button can be clicked), closes on Esc or leave, and shifts sideways to stay inside the window.
 * The full version (touch tap, all surfaces) comes in S5.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CARD_W, cardShift, cardStyle } from './cardLayout';

export function HoverHost({ card, children, delay = 140, scale = 1, align = 'center', up = false }: { card: ReactNode; children: ReactNode; delay?: number; scale?: number; align?: 'center' | 'start' | 'end'; /** Open above the host (for the bottom bar). */ up?: boolean }) {
  const [open, setOpen] = useState(false), [shift, setShift] = useState(0);
  const on = useRef<ReturnType<typeof setTimeout>>(undefined), off = useRef<ReturnType<typeof setTimeout>>(undefined);
  const host = useRef<HTMLSpanElement>(null), box = useRef<HTMLDivElement>(null);
  const show = useCallback(() => { clearTimeout(off.current); clearTimeout(on.current); on.current = setTimeout(() => setOpen(true), delay); }, [delay]);
  const hide = useCallback((now = false) => { clearTimeout(on.current); clearTimeout(off.current); off.current = setTimeout(() => { setOpen(false); setShift(0); }, now ? 0 : 160); }, []);
  useEffect(() => () => { clearTimeout(on.current); clearTimeout(off.current); }, []);
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const r = box.current.getBoundingClientRect(), s = scale || 1;
    setShift(sh => sh + cardShift(r.left, r.width, window.innerWidth) / s);
  }, [open, scale]);
  const left = align === 'start' ? 0 : align === 'end' ? `calc(100% - ${CARD_W}px)` : `calc(50% - ${CARD_W / 2}px)`;
  return (
    <span ref={host} style={{ position: 'relative', display: 'inline-flex' }} onPointerEnter={show} onPointerLeave={() => hide()} onFocus={show} onBlur={e => { if (!host.current?.contains(e.relatedTarget as Node)) hide(true); }}
      onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); hide(true); } }}>
      {children}
      {open && <div ref={box} role="tooltip" data-hover-card style={{ ...cardStyle, position: 'absolute', ...(up ? { bottom: 'calc(100% + 8px)' } : { top: 'calc(100% + 8px)' }), left, transform: `translateX(${shift}px)`, zIndex: 5 }}>{card}</div>}
    </span>
  );
}
