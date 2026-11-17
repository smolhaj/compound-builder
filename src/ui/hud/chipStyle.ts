import type { CSSProperties } from 'react';
import { T, tv } from './tokens';
import type { ChipModel, ChipTone } from '../../sim/vitals';
import type { BarMode } from '../../sim/topBarPlan';

const toneCss = (t: ChipTone): string => (t === 'good' ? tv.color('text') : tv.color(t));
export const glyphOf = (t: ChipTone): string => T.glyph[t];

export function chipStyle(c: ChipModel, mode: BarMode): CSSProperties {
  const text = mode === 'full' || c.compact !== '' || c.tone !== 'good';
  const hot = c.tone !== 'good';
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: T.size.chip, boxSizing: 'border-box', flex: 'none',
    padding: text ? '0 10px 0 8px' : '0 8px', borderRadius: tv.radius('chip'), cursor: 'pointer', whiteSpace: 'nowrap',
    font: 'inherit', fontSize: tv.font('sm'), fontWeight: T.weight.semi, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
    background: hot ? 'rgba(0,0,0,0.30)' : tv.color('raised'), color: c.quiet ? tv.color('dim') : toneCss(c.tone),
    border: `1px solid ${hot ? tv.color(c.tone) : tv.color('line')}`, boxShadow: tv.shadow(1),
  };
}

