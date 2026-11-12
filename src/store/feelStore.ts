/**
 * UI-only state for the "feel" pass: the title screen, the "Where we left off" card, purchase toasts, row highlights, milestone
 * cards and which right-hand tabs are revealed. Nothing here is part of the game save (docs/DECISIONS.md, "Feel pass"); the few
 * things worth remembering (revealed tabs, "show all") live in localStorage under `cb.feel.*`.
 */
import { create } from 'zustand';
import type { Recap } from '../sim/resumeRecap';
import { queueCards, type Celebration, type ToastModel } from '../sim/feedbackDiff';
import type { RightTab } from '../sim/tabReveal';
import { EMPTY_MEMORY, type GoalMemory } from '../sim/firstHour';
import { holdFactor } from '../ui/feel/quiet';

const get = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } };

/** Which world this is (so revealed tabs are remembered per game, not for every game). */
export const worldId = (g: { seed: number; lineage: { family: string }; site: { id: string } }): string => `${g.seed}:${g.site.id}:${g.lineage.family}`;
export const loadRevealed = (world: string): RightTab[] => { try { return JSON.parse(get(`cb.feel.tabs.${world}`) ?? '[]') as RightTab[]; } catch { return []; } };
export const saveRevealed = (world: string, tabs: Iterable<RightTab>) => put(`cb.feel.tabs.${world}`, JSON.stringify([...tabs]));
export const loadShown = (world: string): string[] => { try { return JSON.parse(get(`cb.feel.shown.${world}`) ?? '[]') as string[]; } catch { return []; } };
export const saveShown = (world: string, ids: Iterable<string>) => put(`cb.feel.shown.${world}`, JSON.stringify([...ids]));

export type GoalsClosed = 'set' | 'dismissed' | null;
export const loadGoals = (world: string): { mem: GoalMemory; closed: GoalsClosed } | null => { try { const v = get(`cb.feel.goals.${world}`); return v ? JSON.parse(v) as { mem: GoalMemory; closed: GoalsClosed } : null; } catch { return null; } };
export const saveGoals = (world: string, mem: GoalMemory, closed: GoalsClosed) => put(`cb.feel.goals.${world}`, JSON.stringify({ mem, closed }));

export interface FeelStore {
  /** First-hour goals (sim/firstHour.ts): what was ever open or done, and whether the card is folded away ('set': finished and acknowledged; 'dismissed': hidden by the player). */
  goalMem: GoalMemory;
  goalsClosed: GoalsClosed;
  setGoals: (mem: GoalMemory, closed?: GoalsClosed) => void;
  /** Bumped by a goal's button to open the starter-compound proposal. */
  starterAsk: number;
  askStarter: () => void;
  /** The title screen is up (the world behind it is paused). */
  title: boolean;
  /** Whether a saved game exists (Continue is offered). */
  hasSave: boolean;
  setTitle: (open: boolean, hasSave?: boolean) => void;
  /** The "Where we left off" card, and the speed to resume at when it is answered. */
  recap: Recap | null;
  recapSpeed: 0 | 1 | 2 | 3 | 4;
  setRecap: (r: Recap | null, speed?: 0 | 1 | 2 | 3 | 4) => void;
  /** The purchase toast on screen. */
  toast: ToastModel | null;
  setToast: (t: ToastModel | null) => void;
  /** Keys lit right now (`kit:<kind>`, `struct:<id>`, `tab:<id>`), each with the token of the flash that lit it. */
  flash: Record<string, number>;
  lightUp: (keys: string[]) => void;
  /** The celebration card, and any waiting behind it. */
  cards: Celebration[];
  pushCards: (c: Celebration[]) => void;
  dismissCard: () => void;
  /** Right-hand tabs revealed so far, those with a "new" dot, and the "Show all tabs" switch. */
  revealed: RightTab[];
  fresh: RightTab[];
  showAll: boolean;
  setRevealed: (r: RightTab[], fresh: RightTab[]) => void;
  seeTab: (t: RightTab) => void;
  setShowAll: (on: boolean) => void;
  /** Tab hiding is a first-hour default; QA shots (`?seed=`) keep every tab unless `?firsthour` asks for it. */
  firstHourHud: boolean;
}

let flashToken = 0;
const q = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

export const useFeelStore = create<FeelStore>((set, getS) => ({
  goalMem: EMPTY_MEMORY,
  goalsClosed: null,
  setGoals: (goalMem, closed) => set(s => ({ goalMem, goalsClosed: closed === undefined ? s.goalsClosed : closed })),
  starterAsk: 0,
  askStarter: () => set(s => ({ starterAsk: s.starterAsk + 1 })),
  title: false,
  hasSave: false,
  setTitle: (title, hasSave) => set(s => ({ title, hasSave: hasSave ?? s.hasSave })),
  recap: null,
  recapSpeed: 1,
  setRecap: (recap, speed) => set(s => ({ recap, recapSpeed: speed ?? s.recapSpeed })),
  toast: null,
  setToast: (toast) => set({ toast }),
  flash: {},
  lightUp: (keys) => {
    if (!keys.length) return;
    const token = ++flashToken;
    set(s => ({ flash: { ...s.flash, ...Object.fromEntries(keys.map(k => [k, token])) } }));
    setTimeout(() => {
      const cur = getS().flash;
      const rest = Object.fromEntries(Object.entries(cur).filter(([, v]) => v !== token));
      if (Object.keys(rest).length !== Object.keys(cur).length) set({ flash: rest });
    }, 2400 * holdFactor());
  },
  cards: [],
  pushCards: (c) => set(s => ({ cards: queueCards(s.cards, c) })),
  dismissCard: () => set(s => ({ cards: s.cards.slice(1) })),
  revealed: ['family'],
  fresh: [],
  showAll: get('cb.feel.showAll') === '1',
  setRevealed: (revealed, fresh) => set({ revealed, fresh }),
  seeTab: (t) => set(s => (s.fresh.includes(t) ? { fresh: s.fresh.filter(x => x !== t) } : s)),
  setShowAll: (showAll) => { put('cb.feel.showAll', showAll ? '1' : '0'); set({ showAll }); },
  firstHourHud: !q.has('seed') || q.has('firsthour'),
}));
