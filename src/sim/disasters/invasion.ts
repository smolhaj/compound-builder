import type { KindFx } from '../disasterFx';

/** Invasion (WP3: checkpoints, curfew, requisition quotas, informants in occupation.ts). */
export const fx: KindFx = {
  encounterWeights(_s, { w, p, scale }) {
    w.push(['patrol', 40 * (0.5 + p.visibility / 100)]);
    scale('requisition', 0); scale('trader', 0.3);
  },
};
