/** A game was just loaded (a save, a new game): the change that brings it in is not a player action and gets no toast. No imports, so the store can call it. */
let muted = false;
export const muteFeedback = (): void => { muted = true; };
export const takeMute = (): boolean => { const m = muted; muted = false; return m; };

/** QA only: a software-GL screenshot takes seconds, so shots set `window.__feelHold` to stretch the toast, the glow and the card. 1 for a player. */
export const holdFactor = (): number => (typeof window !== 'undefined' && Number((window as unknown as { __feelHold?: number }).__feelHold)) || 1;
