/**
 * UI-only state for the felt layer (not part of the save). FL1 plays the hit moment and calls `hitDone`; FL4 owns the card actions
 * (they edit the game through gameStore, so none live here yet). The skip toggle for the hit cinematic is remembered in localStorage.
 */
import { create } from 'zustand';

const KEY = 'cb.felt.skipHit';
const read = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export interface FeltStore {
  /** Skip the hit cinematic (Settings; owner decision: it is skippable). */
  skipHit: boolean;
  setSkipHit: (on: boolean) => void;
  /** The `hitAt` of the hit whose moment has played (or been skipped); the day card for it is then free to show. */
  hitShown: number;
  hitDone: (hitAt: number) => void;
}

export const useFeltStore = create<FeltStore>((set) => ({
  skipHit: read(),
  setSkipHit: (skipHit) => { try { localStorage.setItem(KEY, skipHit ? '1' : '0'); } catch { /* storage blocked */ } set({ skipHit }); },
  hitShown: -1,
  hitDone: (hitShown) => set({ hitShown }),
}));
