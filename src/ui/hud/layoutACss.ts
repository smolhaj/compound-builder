/**
 * Layout A global polish (docs/UX_AUDIT.md 11.8 and 11.9), as one stylesheet written while layout A is on (`<LayoutAStyle />`).
 * The drawer bodies are the Classic panels, whose inline styles carry ad-hoc text sizes (9.5 to 15 px); rather than fork hundreds of
 * lines, the stylesheet snaps each size to the 5-step scale (11 / 12.5 / 13.5 / 15 / 20) inside the drawers with an attribute match
 * on the inline `font-size`. Also: keyboard-only focus rings, thin scrollbars, short transitions and the drawer slide-in (all off under
 * prefers-reduced-motion), bigger touch targets on a coarse pointer. Classic never gets this sheet. Pure, so a test can check it.
 */
import { T } from './tokens';

/** Ad-hoc inline sizes (px) found in the panel bodies, and the scale step each snaps to. Sizes already on the scale are left alone. */
export const FONT_SNAP: ReadonlyArray<[number, keyof typeof T.font]> = [
  [9, 'fine'], [9.5, 'fine'], [10, 'fine'], [10.5, 'fine'],
  [11.5, 'sm'], [12, 'sm'],
  [13, 'body'],
  [14, 'title'],
];
/** The step a size lands on: the first step that is not smaller than it (give or take a quarter pixel), so text never shrinks. Pure. */
export function snapFont(px: number): number {
  const steps = [T.font.fine, T.font.sm, T.font.body, T.font.title, T.font.display];
  return steps.find(s => s >= px - 0.25) ?? steps[steps.length - 1];
}

const D = '.cb-a [data-drawer]';

export function layoutACss(): string {
  const snap = FONT_SNAP.map(([px, step]) => `${D} [style*="font-size: ${px}px"]{font-size:var(--cb-font-${step})!important}`).join('\n');
  return `
${snap}
/* section headings and dim text: the old 0.6 / 0.65 alpha greys were under 4.5:1 over snow; the token is 0.72 */
${D} [style*="text-transform: uppercase"]{opacity:.9!important}
${D} [style*="color: rgba(238, 238, 238, 0.6)"]{color:var(--cb-color-dim)!important}
${D} [style*="opacity: 0.65"]{opacity:.82!important}
/* focus: a ring for the keyboard only */
.cb-a :focus{outline:none}
.cb-a :focus-visible{outline:2px solid var(--cb-color-accent);outline-offset:2px;border-radius:var(--cb-radius-control)}
/* scrollbars */
.cb-a [data-drawer],.cb-a [data-drawer] *,.cb-a [data-todo-scroll]{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
.cb-a [data-drawer] ::-webkit-scrollbar{width:8px;height:8px}
.cb-a [data-drawer] ::-webkit-scrollbar-thumb{background:rgba(255,255,255,.28);border-radius:4px}
.cb-a [data-drawer] ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.42)}
.cb-a [data-drawer] ::-webkit-scrollbar-track{background:transparent}
/* motion: short, and off when the player asks for less */
.cb-a button,.cb-a input,.cb-a select{transition:background-color var(--cb-motion-fast) ease,border-color var(--cb-motion-fast) ease,color var(--cb-motion-fast) ease,opacity var(--cb-motion-fast) ease,filter var(--cb-motion-fast) ease}
.cb-a button:not(:disabled):hover{filter:brightness(1.12)}
.cb-a [data-drawer]{animation:cb-drawer-in var(--cb-motion-drawer) var(--cb-ease)}
.cb-a [data-drawer=left]{animation-name:cb-drawer-in-left}
.cb-a [data-hover-card]{animation:cb-fade-in var(--cb-motion-fast) ease}
@keyframes cb-drawer-in{from{opacity:0;translate:14px 0}to{opacity:1;translate:0 0}}
@keyframes cb-drawer-in-left{from{opacity:0;translate:-14px 0}to{opacity:1;translate:0 0}}
@keyframes cb-fade-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.cb-a *,.cb-a *::before,.cb-a *::after{animation:none!important;transition:none!important}}
/* a finger needs a bigger target; hover has no meaning, so a card opens on a long press */
@media (pointer:coarse){${D} button{min-height:32px}.cb-a [data-testid=page-chips] button{min-height:34px}}
`.trim();
}

