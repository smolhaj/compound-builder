import type { KindFx } from '../disasterFx';
import { bulletin, since, clamp01, type Line } from './kit';

const LINES: Line[] = [
  [0, 2, 'a steady tone on every band; the tower at the county seat is dark.', 3],
  [1, 20, 'if you can hear this, you are not alone: three families on Miller Road report empty houses and set tables.', 2],
  [5, 90, 'nobody is coming from the city; the roads out are empty, not blocked.', 2],
  [20, 400, 'the lights came back for an hour last night, over the range, and went out again.', 1],
];

/** The unknown event (half the neighbors vanish once: effects.ts 'vanished'; WP10 adds the quiet radio, the muted markets and the contrast). */
export const fx: KindFx = {
  legacy: { npcs: 'effects.ts: half the neighbors are gone on the hit' },
  encounterWeights(_s, { scale }) { scale('arrival', 0.4); scale('looters', 0.3); scale('gang', 0.3); scale('trader', 0.1); },
  priceMods: s => (since(s) < 0 ? 1 : 1 + 0.15 * clamp01(1 - since(s) / 120)),
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
  oasisWeight: s => 0.2 * clamp01(1 - s.disaster.tracks.stores),
};
