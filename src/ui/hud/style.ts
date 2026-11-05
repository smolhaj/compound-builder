/** HUD styling constants shared by the panels. */
import type { CSSProperties } from 'react';

export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const panel: CSSProperties = { background: 'rgba(20,22,18,0.78)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: '#eee' };
export const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
export const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };
export const DIM = 'rgba(238,238,238,0.6)', LINE = 'rgba(255,255,255,0.08)';
export const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
export type Tone = keyof typeof TONE;

/** The HUD type scale: section heading, body, secondary, fine print. Use these, not ad-hoc sizes. */
export const FS = { h: 12, body: 12.5, small: 11.5, fine: 11 } as const;
/** A bordered card (checklists, suggestions); `gold` marks the one that wants attention. */
export const card = (gold = false): CSSProperties => ({ border: `1px solid ${gold ? '#d8c9a0' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 8px', marginBottom: 8, background: gold ? 'rgba(216,201,160,0.08)' : 'transparent' });
/** A small action button that sits at the end of a line. */
export const miniBtn: CSSProperties = { padding: '1px 7px', fontSize: FS.fine, flex: 'none', whiteSpace: 'nowrap' };
