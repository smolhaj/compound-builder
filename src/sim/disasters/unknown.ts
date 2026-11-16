import type { KindFx } from '../disasterFx';

/** The unknown event (half the neighbors vanish once: effects.ts 'vanished'). */
export const fx: KindFx = {
  legacy: { npcs: 'effects.ts: half the neighbors are gone on the hit' },
  encounterWeights(_s, { scale }) { scale('arrival', 0.4); scale('looters', 0.3); scale('gang', 0.3); scale('trader', 0.1); },
};
