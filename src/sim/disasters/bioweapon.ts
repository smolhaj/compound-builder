import type { KindFx } from '../disasterFx';

/** Engineered bioweapon (WP4 adds gate quarantine cards and contaminated-contact scavenging). */
export const fx: KindFx = {
  legacy: { supplies: 'scavenge.ts: scavenging sickness', npcs: 'neighborLife: neighbor plague 4x, refugees 2x' },
  encounterWeights(_s, { scale }) { scale('arrival', 1.4); scale('refugees', 1.5); scale('trader', 0.5); },
  medical: () => ({ contact: 0.55, spread: 0.12 }),
};
