import type { KindFx } from '../disasterFx';

/** Drought (the water table, wells, haying and fish live in effects.ts, wildfood.ts and utilities). */
export const fx: KindFx = {
  legacy: { supplies: 'effects.ts climate / wellYield; wildfood', npcs: 'neighborLife: refugee settlers 2x', infrastructure: 'effects.ts wellYield; renewables derated' },
  encounterWeights(_s, { scale }) { scale('refugees', 1.6); scale('looters', 1.3); },
};
