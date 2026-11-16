/**
 * UI-only state for the felt layer (not part of the save). FL1 plays the hit moment and calls `hitDone`; FL4 owns the card actions
 * (they edit the game through gameStore, so none live here yet). The skip toggle for the hit cinematic is remembered in localStorage.
 */
import { create } from 'zustand';
import { useGameStore } from './gameStore';
import { answerCard, fallbackOf, pendingCard } from '../sim/felt/cards';
import { log } from '../sim/economy';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';

const KEY = 'cb.felt.skipHit';
const read = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

export interface FeltStore {
  /** Skip the hit cinematic (Settings; owner decision: it is skippable). */
  skipHit: boolean;
  setSkipHit: (on: boolean) => void;
  /** The `hitAt` of the hit whose moment has played (or been skipped); the day card for it is then free to show. */
  hitShown: number;
  hitDone: (hitAt: number) => void;
  /** Answer the pending decision card: charges the cost, runs the effect, logs it and shows what happened on a result card. Returns why not, or null. */
  answer: (cardId: string, optionId: string) => string | null;
  /** Take the card's safe fallback (the player walked away). */
  timeout: () => void;
}

export const useFeltStore = create<FeltStore>((set, get) => ({
  skipHit: read(),
  setSkipHit: (skipHit) => { try { localStorage.setItem(KEY, skipHit ? '1' : '0'); } catch { /* storage blocked */ } set({ skipHit }); },
  hitShown: -1,
  hitDone: (hitShown) => set({ hitShown }),
  answer: (cardId, optionId) => {
    const gs = useGameStore.getState();
    if (gs.cutscene) return 'Not now.';
    const g = structuredClone(gs.game);
    const c = pendingCard(g);
    const res = answerCard(g, cardId, optionId);
    if ('why' in res) return res.why;
    for (const l of res.lines) log(g, l);
    g.gate.card = { title: c!.title(g), text: res.lines[0] ?? '', tone: 'mixed', lines: res.lines.slice(1) };
    useGameStore.setState({ game: g });
    void saveGame(AUTOSAVE, g);
    return null;
  },
  timeout: () => {
    const gs = useGameStore.getState(), g = structuredClone(gs.game), c = pendingCard(g);
    if (!c) return;
    const o = fallbackOf(g, c);
    get().answer(c.id, o.id);
  },
}));
