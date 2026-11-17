/** Small procedural line icons for the layout-A chips (16 px, stroke = currentColor). */
import type { ReactNode } from 'react';
import type { ChipId } from '../../sim/topBarPlan';

const P: Record<ChipId, ReactNode> = {
  threat: <><path d="M8 1.8 14.2 13H1.8z" /><path d="M8 6v3.4" /><circle cx="8" cy="11.2" r=".6" fill="currentColor" /></>,
  cash: <><circle cx="8" cy="8" r="6" /><path d="M8 4.2v7.6M10 5.8c-.5-.6-1.2-.9-2-.9-1.1 0-2 .6-2 1.5 0 2 4 1 4 3.1 0 .9-.9 1.5-2 1.5-.9 0-1.6-.4-2.1-1" /></>,
  debt: <><rect x="1.8" y="3.5" width="12.4" height="9" rx="1.6" /><path d="M1.8 6.6h12.4M4 10h2.6" /></>,
  food: <><path d="M8 14V4.5M8 6.5C6 6.5 5 5.2 5 3.8 7 3.8 8 5 8 6.5zM8 6.5c2 0 3-1.3 3-2.7-2 0-3 1.2-3 2.7zM8 10c-2 0-3-1.3-3-2.7 2 0 3 1.2 3 2.7zM8 10c2 0 3-1.3 3-2.7-2 0-3 1.2-3 2.7z" /></>,
  water: <><path d="M8 1.8C5.4 5 3.8 7.2 3.8 9.5a4.2 4.2 0 0 0 8.4 0C12.2 7.2 10.6 5 8 1.8z" /></>,
  power: <><path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z" /></>,
  needs: <><path d="M3.8 11.5c.9-.8 1.2-1.9 1.2-3.4V7a3 3 0 0 1 6 0v1.1c0 1.5.3 2.6 1.2 3.4zM6.7 13.3a1.4 1.4 0 0 0 2.6 0" /></>,
  defense: <><path d="M8 1.7 13 3.6v4c0 3-2 5.2-5 6.7-3-1.5-5-3.7-5-6.7v-4z" /></>,
  morale: <><circle cx="8" cy="8" r="6" /><path d="M5.5 9.7c.6 1 1.5 1.5 2.5 1.5s1.9-.5 2.5-1.5" /><circle cx="5.9" cy="6.5" r=".6" fill="currentColor" /><circle cx="10.1" cy="6.5" r=".6" fill="currentColor" /></>,
  fuel: <><path d="M4.5 14V3.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1V14zM3.5 14h8M10 6h1.5a1 1 0 0 1 1 1v4a1 1 0 0 0 1.5 0.7" /><path d="M5.8 5.5h2.9" /></>,
};
export function ChipIcon({ id, size = 15 }: { id: ChipId; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" style={{ flex: 'none', display: 'block' }}>{P[id]}</svg>;
}
export const MenuIcon = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden focusable="false"><path d="M2.5 4h11M2.5 8h11M2.5 12h11" /></svg>;
