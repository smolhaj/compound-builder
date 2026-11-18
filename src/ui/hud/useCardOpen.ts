import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { LONG_PRESS_MS, PRESS_SLOP } from './cardLayout';

/** Open / close behavior shared by the hover cards: hover, keyboard focus, touch long press, tap-away, Esc. */
export function useCardOpen(delay: number, hostRef: React.RefObject<HTMLElement | null>, cardRef: React.RefObject<HTMLElement | null>) {
  const [open, setOpen] = useState(false);
  const on = useRef<ReturnType<typeof setTimeout>>(undefined), off = useRef<ReturnType<typeof setTimeout>>(undefined), press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const down = useRef<{ x: number; y: number } | null>(null), swallow = useRef(false), touched = useRef(false);
  const clear = () => { clearTimeout(on.current); clearTimeout(off.current); };
  const show = useCallback(() => { clearTimeout(off.current); clearTimeout(on.current); on.current = setTimeout(() => setOpen(true), delay); }, [delay]);
  const hide = useCallback((now = false) => { clearTimeout(on.current); clearTimeout(off.current); off.current = setTimeout(() => setOpen(false), now ? 0 : 160); }, []);
  useEffect(() => () => { clearTimeout(on.current); clearTimeout(off.current); clearTimeout(press.current); }, []);
  // a tap outside closes a card opened by touch
  useEffect(() => {
    if (!open || !touched.current) return;
    const f = (e: PointerEvent) => { const t = e.target as Node; if (hostRef.current?.contains(t) || cardRef.current?.contains(t)) return; touched.current = false; setOpen(false); };
    document.addEventListener('pointerdown', f, true);
    return () => document.removeEventListener('pointerdown', f, true);
  }, [open, hostRef, cardRef]);
  const handlers = {
    onPointerEnter: (e: RPointerEvent) => { if (e.pointerType !== 'touch') show(); },
    onPointerLeave: (e: RPointerEvent) => { if (e.pointerType !== 'touch') hide(); },
    onFocus: (e: React.FocusEvent) => { if (!touched.current && (e.target as HTMLElement).matches?.(':focus-visible')) show(); },
    onBlur: (e: React.FocusEvent) => { if (!hostRef.current?.contains(e.relatedTarget as Node)) hide(true); },
    onPointerDown: (e: RPointerEvent) => {
      if (e.pointerType !== 'touch') return;
      down.current = { x: e.clientX, y: e.clientY }; clearTimeout(press.current);
      press.current = setTimeout(() => { clear(); touched.current = true; swallow.current = true; setOpen(true); }, LONG_PRESS_MS);
    },
    onPointerMove: (e: RPointerEvent) => { if (down.current && Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > PRESS_SLOP) { clearTimeout(press.current); down.current = null; } },
    onPointerUp: () => { clearTimeout(press.current); down.current = null; },
    onPointerCancel: () => { clearTimeout(press.current); down.current = null; },
    onClickCapture: (e: React.MouseEvent) => { if (swallow.current) { swallow.current = false; e.stopPropagation(); e.preventDefault(); } },
    onContextMenu: (e: React.MouseEvent) => { if (touched.current || down.current) e.preventDefault(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape' && open) { e.stopPropagation(); touched.current = false; hide(true); } },
  };
  return { open, handlers, close: () => { touched.current = false; hide(true); } };
}

