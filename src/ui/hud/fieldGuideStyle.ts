import type { CSSProperties } from 'react';
import { T, tv } from './tokens';

/** A section chip of the Field Guide (same look as the drawer's page chips). */
export const chipStyleFor = (on: boolean): CSSProperties => ({
  font: 'inherit', fontSize: tv.font('sm'), lineHeight: 1.2, cursor: 'pointer', padding: '4px 10px', minHeight: 26, boxSizing: 'border-box', borderRadius: T.radius.chip,
  border: `1px solid ${on ? tv.color('accent') : T.color.line}`, background: on ? tv.color('accent') : 'transparent', color: on ? tv.color('onAccent') : tv.color('text'), fontWeight: on ? T.weight.semi : T.weight.regular,
});
