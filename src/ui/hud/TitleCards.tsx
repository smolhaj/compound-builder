/**
 * Hover cards for every `title` in the HUD (docs/UX_AUDIT.md 11.9): the panel bodies carry hundreds of `title` explanations on
 * numbers, rows, bars and buttons. In layout A one delegated listener turns each into a card in the HUD's own style (instead of the
 * browser's slow, unstyled, mouse-only tooltip): hover (after a short delay), keyboard focus, or a long press on a touch screen
 * (the tap that follows is swallowed so it does not click the control). While a card is up the element's `title` is parked in
 * `data-title`, so the native tooltip does not double it; it is put back on close.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorldStore } from '../../store/worldStore';
import { LONG_PRESS_MS, PRESS_SLOP, cardStyle, placeCard, titled } from './cardLayout';

const DELAY = 280;
export function TitleCards() {
  const scale = useWorldStore(w => w.uiScale);
  const [tip, setTip] = useState<{ el: HTMLElement; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout>>(undefined), cur = useRef<HTMLElement | null>(null);
  const touch = useRef<{ x: number; y: number; t?: ReturnType<typeof setTimeout>; swallow: boolean; touched: boolean }>({ x: 0, y: 0, swallow: false, touched: false });

  useEffect(() => {
    const park = (el: HTMLElement) => { const t = el.getAttribute('title'); if (t !== null) { el.setAttribute('data-title', t); el.removeAttribute('title'); } };
    const unpark = (el: HTMLElement | null) => { if (!el) return; const t = el.getAttribute('data-title'); if (t !== null) { if (!el.hasAttribute('title')) el.setAttribute('title', t); el.removeAttribute('data-title'); } };
    const open = (el: HTMLElement) => {
      if (cur.current === el) return;
      unpark(cur.current);
      const text = (el.getAttribute('title') ?? el.getAttribute('data-title') ?? '').trim(); if (!text) return;
      park(el); cur.current = el; setTip({ el, text });
    };
    const close = () => { clearTimeout(timer.current); unpark(cur.current); cur.current = null; touch.current.touched = false; setTip(null); };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = titled(e.target); clearTimeout(timer.current);
      if (!el) { if (cur.current && !cur.current.contains(e.target as Node)) close(); return; }
      if (el === cur.current) return;
      close(); timer.current = setTimeout(() => open(el), DELAY);
    };
    const out = (e: PointerEvent) => { if (e.pointerType === 'touch') return; const to = e.relatedTarget as Node | null; if (cur.current && (!to || !cur.current.contains(to))) close(); else clearTimeout(timer.current); };
    const focus = (e: FocusEvent) => { const el = titled(e.target); if (el && (e.target as HTMLElement).matches?.(':focus-visible')) open(el); };
    const blur = () => close();
    const down = (e: PointerEvent) => {
      const T = touch.current;
      if (e.pointerType !== 'touch') { if (cur.current && !(e.target as Element).closest?.('[data-title]')) close(); return; }
      if (cur.current && !(e.target as Element).closest?.('[data-tip]')) close();
      const el = titled(e.target); clearTimeout(T.t);
      if (!el) return;
      T.x = e.clientX; T.y = e.clientY;
      T.t = setTimeout(() => { T.touched = true; T.swallow = true; open(el); }, LONG_PRESS_MS);
    };
    const move = (e: PointerEvent) => { const T = touch.current; if (T.t && Math.hypot(e.clientX - T.x, e.clientY - T.y) > PRESS_SLOP) { clearTimeout(T.t); T.t = undefined; } };
    const up = () => { clearTimeout(touch.current.t); touch.current.t = undefined; };
    const click = (e: MouseEvent) => { if (touch.current.swallow) { touch.current.swallow = false; e.stopPropagation(); e.preventDefault(); } };
    const ctx = (e: Event) => { if (touch.current.t || touch.current.touched) e.preventDefault(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const scroll = () => { if (cur.current) close(); };
    document.addEventListener('pointerover', over); document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', blur);
    document.addEventListener('pointerdown', down, true); document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true); document.addEventListener('pointercancel', up, true);
    document.addEventListener('click', click, true); document.addEventListener('contextmenu', ctx);
    document.addEventListener('keydown', key, true); document.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerover', over); document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', blur);
      document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true); document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('click', click, true); document.removeEventListener('contextmenu', ctx);
      document.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true);
      clearTimeout(timer.current); unpark(cur.current); cur.current = null;
    };
  }, []);

  useLayoutEffect(() => { if (tip && box.current && tip.el.isConnected) placeCard(tip.el, box.current); }, [tip, scale]);

  if (!tip) return null;
  return createPortal(
    <div ref={box} role="tooltip" data-hover-card data-tip="title" style={{ ...cardStyle, width: 'max-content', maxWidth: 288, position: 'fixed', left: 0, top: 0, visibility: 'hidden', zIndex: 60, transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }}>{tip.text}</div>,
    document.body);
}
