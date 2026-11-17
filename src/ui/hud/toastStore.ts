/** The layout A toast list as a small store (ui/hud/toastQueue.ts has the rules): fed from the stores that raise one-line notices, outside React. */
import { create } from 'zustand';
import { useGameStore } from '../../store/gameStore';
import { useFeelStore } from '../../store/feelStore';
import { useWorldStore } from '../../store/worldStore';
import { useHudText } from '../../store/hudTextStore';
import { toastText } from '../../sim/feedbackDiff';
import { TOAST_TTL, isRepeat, liveToasts, pushToast, type Toast, type ToastTone } from './toastQueue';

interface ToastState { list: Toast[]; add: (id: string, text: string, tone: ToastTone, ttl: number) => void; remove: (id: string) => void; refresh: () => void; sweep: () => void }
export const useToasts = create<ToastState>((set, get) => ({
  list: [],
  add: (id, text, tone, ttl) => { if (isRepeat(text, useHudText.getState().onScreen)) return; set({ list: pushToast(get().list, { id, text, tone, ttl, at: performance.now() }) }); },
  remove: id => set({ list: get().list.filter(t => t.id !== id) }),
  /** Every toast starts its time again (after a decision or a card held them). */
  refresh: () => set({ list: get().list.map(t => ({ ...t, at: performance.now() })) }),
  sweep: () => { const l = liveToasts(get().list, performance.now()); if (l.length !== get().list.length) set({ list: l }); },
}));

/** Start listening to the four sources of one-line notices; returns the stop function. */
export function startToastFeed(): () => void {
  const add = useToasts.getState().add;
  const stops = [
    useGameStore.subscribe((s, p) => { if (s.toast && s.toast !== p.toast) add(`g${s.toast.id}`, s.toast.text, 'warn', TOAST_TTL.fine); }),
    useFeelStore.subscribe((s, p) => { if (s.toast && s.toast !== p.toast) add(`f${s.toast.id}`, toastText(s.toast), 'good', TOAST_TTL.fine); }),
    useWorldStore.subscribe((s, p) => {
      if (s.homeLine && s.homeLine !== p.homeLine) add(`h${s.homeLine.at}`, `${s.homeLine.who}: “${s.homeLine.text}”`, 'info', TOAST_TTL.fine);
      if (s.perfNotice && s.perfNotice !== p.perfNotice) add(`p${s.perfNotice}`, s.perfNotice, 'warn', TOAST_TTL.long);
    }),
  ];
  return () => stops.forEach(f => f());
}
