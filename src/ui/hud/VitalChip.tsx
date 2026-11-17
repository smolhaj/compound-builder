/** One top-bar chip: icon, tone glyph (warn ▲, bad ✕, so color is never the only signal) and value; hover or focus opens its card. */
import { tv } from './tokens';
import { chipStyle, glyphOf } from './chipStyle';
import { ChipIcon } from './icons';
import { chipAria, type ChipModel } from '../../sim/vitals';
import type { BarMode } from '../../sim/topBarPlan';

export function VitalChip({ c, mode, onClick, measure }: { c: ChipModel; mode: BarMode; onClick?: () => void; measure?: boolean }) {
  const text = mode === 'full' ? c.full : c.compact, g = glyphOf(c.tone);
  return (
    <button type="button" data-chip={c.id} data-tone={c.tone} data-mode={mode} aria-label={chipAria(c)} tabIndex={measure ? -1 : 0} onClick={onClick} style={chipStyle(c, mode)}>
      <span style={{ color: c.tone === 'good' ? tv.color('dim') : 'inherit', display: 'inline-flex' }}><ChipIcon id={c.id} /></span>
      {g && <span aria-hidden style={{ fontSize: tv.font('fine'), lineHeight: 1 }}>{g}</span>}
      {text !== '' && <span>{text}</span>}
      {mode === 'full' && c.bar != null && <span aria-hidden style={{ width: 28, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)', overflow: 'hidden', flex: 'none' }}><span style={{ display: 'block', width: `${Math.round(c.bar * 100)}%`, height: '100%', background: 'currentColor' }} /></span>}
    </button>
  );
}
