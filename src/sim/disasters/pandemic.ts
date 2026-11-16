import type { KindFx } from '../disasterFx';

/** Pandemic (WP7 adds closures and supply-chain texture). */
export const fx: KindFx = {
  legacy: { npcs: 'neighborLife: neighbor plague mortality 4x, refugees 2x' },
  encounterWeights(_s, { scale }) { scale('arrival', 1.4); scale('refugees', 1.5); scale('trader', 0.5); },
  medical: () => ({ contact: 0.25, spread: 0.06 }),
};
