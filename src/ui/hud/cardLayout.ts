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

