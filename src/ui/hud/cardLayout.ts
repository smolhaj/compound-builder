import type { CSSProperties } from 'react';
import { T, tv } from './tokens';

export const CARD_W = 288;
export const cardStyle: CSSProperties = {
  width: CARD_W, boxSizing: 'border-box', padding: `${T.space[3]}px`, background: 'rgba(20,22,18,0.97)', color: tv.color('text'),
  border: `1px solid ${T.color.lineStrong}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2), fontSize: tv.font('sm'), lineHeight: T.lineHeight.body,
  display: 'flex', flexDirection: 'column', gap: T.space[2], whiteSpace: 'normal', textAlign: 'left', fontWeight: T.weight.regular,
};

/** Left shift (px, in the host's own units) that keeps a card of width `w` whose natural left is `left` inside [margin, vw - margin]. Pure. */
export function cardShift(left: number, w: number, vw: number, margin = 8): number {
  if (left < margin) return margin - left;
  if (left + w > vw - margin) return vw - margin - (left + w);
  return 0;
}


export const LONG_PRESS_MS = 450;
/** A finger that moves this far (px) is scrolling, not pressing. */
export const PRESS_SLOP = 10;

/** Where a portaled card of `w` by `h` (screen px) goes next to an anchor rect: below it, or above when there is no room; inside the window. Pure. */
export function tipPlace(a: { left: number; right: number; top: number; bottom: number }, w: number, h: number, vw: number, vh: number, gap = 6, margin = 8): { left: number; top: number } {
  let left = (a.left + a.right) / 2 - w / 2;
  left = Math.max(margin, Math.min(left, vw - margin - w));
  let top = a.bottom + gap;
  if (top + h > vh - margin) top = a.top - gap - h;
  top = Math.max(margin, Math.min(top, vh - margin - h));
  return { left, top };
}

/** Put a portaled card next to its anchor by writing its style directly (no state, so no extra render), then show it. */
export function placeCard(anchor: Element, box: HTMLElement): void {
  const a = anchor.getBoundingClientRect(), r = box.getBoundingClientRect();
  const p = tipPlace(a, r.width, r.height, window.innerWidth, window.innerHeight);
  box.style.left = `${p.left}px`; box.style.top = `${p.top}px`; box.style.visibility = 'visible';
}

/** The nearest titled element under a target that is not part of a hover card, or null. */
export const titled = (t: EventTarget | null): HTMLElement | null => {
  const el = (t as Element | null)?.closest?.('[title]') as HTMLElement | null;
  if (!el || el.closest('[data-hover-card],[data-testid="build-card"]') || el.tagName === 'CANVAS' || el.closest('canvas')) return null;
  return (el.getAttribute('title') ?? '').trim() ? el : null;
};
