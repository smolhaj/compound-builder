/** Small line icons for the layout A action bar (16 px grid, stroke = currentColor, procedural like the chip icons). */
import type { ReactNode } from 'react';
import type { DrawerId } from './drawerRegistry';

export type BarIconId = DrawerId | 'walls' | 'cutaway' | 'xray' | 'underground' | 'diorama' | 'walk' | 'fly' | 'tour' | 'view' | 'hide' | 'show' | 'look' | 'camera';

const P: Record<BarIconId, ReactNode> = {
  build: <><path d="M9.2 3.2 12.8 6.8 6.4 13.2 2.8 9.6z" /><path d="M8 4.4l1.6-1.6a2.2 2.2 0 0 1 3.1 0l.5.5-1.5 1.5" /></>,
  family: <><circle cx="5.6" cy="5.2" r="2" /><path d="M2 13.2c0-2.3 1.6-3.8 3.6-3.8s3.6 1.5 3.6 3.8" /><circle cx="11.4" cy="6" r="1.5" /><path d="M10.6 9.6c1.9-.2 3.4.9 3.4 3" /></>,
  supplies: <><path d="M2.2 6h11.6l-1 7.2H3.2z" /><path d="M5 6 6.4 2.8M11 6 9.6 2.8M6 9v2.4M10 9v2.4M8 9v2.4" /></>,
  utilities: <><path d="M5.2 2.2C3.7 4.4 3 5.6 3 7a2.2 2.2 0 0 0 4.4 0c0-1.4-.7-2.6-2.2-4.8z" /><path d="M11 6 8.6 10h2.6l-1 4.2L13.6 9.6H11z" /></>,
  land: <><path d="M1.8 12.4 5.6 3.6l4.6 2 4 -1.6v8.4l-4-1.2-4.6 2z" /><path d="M5.6 3.6v8.4M10.2 5.6v7.2" /></>,
  defense: <><path d="M8 1.7 13 3.6v4c0 3-2 5.2-5 6.7-3-1.5-5-3.7-5-6.7v-4z" /></>,
  outside: <><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 1.8 3 3.8 3 6s-1 4.2-3 6c-2-1.8-3-3.8-3-6s1-4.2 3-6z" /></>,
  projects: <><rect x="3" y="3" width="10" height="11" rx="1.4" /><path d="M6 3V2h4v1M5.6 7.4h4.8M5.6 10.2h3" /></>,
  chronicle: <><rect x="2.4" y="3.2" width="11.2" height="10.4" rx="1.4" /><path d="M2.4 6.6h11.2M5.4 1.8v2.8M10.6 1.8v2.8" /><circle cx="8" cy="10" r=".8" fill="currentColor" /></>,
  board: <><rect x="3" y="3" width="10" height="11" rx="1.4" /><path d="M6 3V2h4v1M5.4 7.2l1 1 1.8-2M5.4 11h5" /></>,
  log: <><path d="M3 4h10M3 8h10M3 12h6" /></>,
  walls: <><path d="M2 7.8 8 2.4l6 5.4z" fill="currentColor" /><path d="M3.8 7.8v5.8h8.4V7.8" /><path d="M7 13.6v-3h2v3" /></>,
  cutaway: <><path d="M2.6 4.4 8 1.8l5.4 2.6" /><path d="M3.8 8.6v5h8.4v-5" /><path d="M3.8 8.6h2.6M9.6 8.6h2.6" /><path d="M5.6 11.8h4.8" /></>,
  xray: <><path d="M3 4.8 8 2.2l5 2.6v6.4l-5 2.6-5-2.6z" strokeDasharray="2 1.4" /><path d="M3 4.8l5 2.6 5-2.6M8 7.4v6.4" /><circle cx="8" cy="7.4" r="1.1" fill="currentColor" /></>,
  underground: <><path d="M1.6 5.4h12.8" /><path d="M3.6 3.8 4.6 2.2M8 3.8V2.2M12.4 3.8l-1-1.6" /><path d="M8 5.4v2.8" /><rect x="3.8" y="8.2" width="8.4" height="5" rx=".8" /><path d="M6 10.7h4" /></>,
  diorama: <><path d="M8 2.2 14 5.4 8 8.6 2 5.4z" /><path d="M2 5.4v5.2l6 3.2 6-3.2V5.4M8 8.6v5.2" /></>,
  walk: <><circle cx="8.4" cy="3.2" r="1.4" /><path d="M8.2 5.2 7 9l-2 4.6M8.2 5.2l1.6 4 2 3.8M6.6 6.6 4.4 8.4M9.6 6.8l1.8 1.2" /></>,
  fly: <><path d="M1.8 8.4 14 2.6 10.2 14l-2.4-4.6z" /><path d="M7.8 9.4 14 2.6" /></>,
  tour: <><rect x="2" y="4.6" width="8.6" height="7" rx="1.4" /><path d="M10.6 7.2 14 5.4v5.2l-3.4-1.8" /></>,
  view: <><path d="M2.4 4.4h11.2M2.4 8h11.2M2.4 11.6h11.2" /><circle cx="5.4" cy="4.4" r="1.3" fill="currentColor" /><circle cx="10.6" cy="8" r="1.3" fill="currentColor" /><circle cx="6.6" cy="11.6" r="1.3" fill="currentColor" /></>,
  hide: <><path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8s-2.4 4.4-6.4 4.4S1.6 8 1.6 8z" /><circle cx="8" cy="8" r="1.8" /><path d="M2.6 13.4 13.4 2.6" /></>,
  show: <><path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8s-2.4 4.4-6.4 4.4S1.6 8 1.6 8z" /><circle cx="8" cy="8" r="1.8" /></>,
  look: <><path d="M2.4 7.4 8 2.6l5.6 4.8" /><path d="M3.8 6.6V13.6h8.4V6.6" /></>,
  camera: <><path d="M2 5.2h2.6l1-1.6h4.8l1 1.6H14v7.4H2z" /><circle cx="8" cy="8.8" r="2.2" /></>,
};
export function BarIcon({ id, size = 16 }: { id: BarIconId; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ flex: 'none' }}>{P[id]}</svg>;
}
