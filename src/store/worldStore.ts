import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Quality } from '../engine/world/WorldScene';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/** View / world-look state (no simulation yet). */
export interface WorldState {
  timeOfDay: number;
  /** Real seconds per in-game hour (0 = paused). */
  hourSeconds: number;
  season: Season;
  quality: Quality;
  setTimeOfDay: (t: number) => void;
  setHourSeconds: (s: number) => void;
  setSeason: (s: Season) => void;
  setQuality: (q: Quality) => void;
}

export const useWorldStore = create<WorldState>()(subscribeWithSelector((set) => ({
  timeOfDay: 10,
  hourSeconds: 0,
  season: 'summer',
  quality: 'high',
  setTimeOfDay: (t) => set({ timeOfDay: ((t % 24) + 24) % 24 }),
  setHourSeconds: (s) => set({ hourSeconds: s }),
  setSeason: (season) => set({ season }),
  setQuality: (quality) => set({ quality }),
})));
