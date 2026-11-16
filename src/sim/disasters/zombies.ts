import type { KindFx } from '../disasterFx';

/** Zombies (WP4 adds infection, night wandering and the walker count at the wall). */
export const fx: KindFx = {
  legacy: { economy: 'market.ts: the market closes for good' },
  encounterWeights(_s, { w, p, scale }) {
    w.push(['horde', 60 * (0.5 + p.visibility / 100)]);
    scale('trader', 0.2); scale('refugees', 0.5); scale('requisition', 0);
  },
};
