import { create } from 'zustand';
import type { Battle } from '../sim/battleTypes';

/** The battle being watched (playback only; the sim builds the Battle). */
interface BattleStore {
  battle: Battle | null;
  /** Playback clock (s), written by the renderer for the overlay. */
  t: number;
  /** Latest 'say' lines (newest last). */
  lines: string[];
  /** Bumped to ask the renderer to skip to the end. */
  skipReq: number;
  playBattle: (b: Battle) => void;
  endBattle: () => void;
  skip: () => void;
  setProgress: (t: number, lines: string[]) => void;
}

export const useBattleStore = create<BattleStore>(set => ({
  battle: null, t: 0, lines: [], skipReq: 0,
  playBattle: b => set({ battle: b, t: 0, lines: [] }),
  endBattle: () => set({ battle: null, t: 0, lines: [] }),
  skip: () => set(s => ({ skipReq: s.skipReq + 1 })),
  setProgress: (t, lines) => set({ t, lines }),
}));
