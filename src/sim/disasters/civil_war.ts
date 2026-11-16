import type { KindFx } from '../disasterFx';

/** Civil war (WP3: territory, checkpoints, conscription, neighbors taking sides). */
export const fx: KindFx = {
  encounterWeights(_s, { w, p }) { w.push(['militia', 35 * (0.4 + p.fortress / 100 + p.visibility / 150)]); },
};
