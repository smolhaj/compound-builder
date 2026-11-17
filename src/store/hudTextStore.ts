/** Layout A: the one-line texts already on screen (the What-to-do-now rows), so the breaking banner and the toasts never say them twice. UI only, not saved. */
import { create } from 'zustand';

interface HudText { onScreen: readonly string[]; set: (t: readonly string[]) => void }
export const useHudText = create<HudText>(set => ({ onScreen: [], set: onScreen => set(s => (s.onScreen.length === onScreen.length && s.onScreen.every((x, i) => x === onScreen[i]) ? s : { onScreen }) ) }));
