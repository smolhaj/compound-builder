import type { KindFx } from '../disasterFx';
import { bulletin, since, warnFrac, clamp01, type Line } from './kit';

const LINES: Line[] = [
  [0, 2, 'the fire jumped the highway overnight; evacuation level GO for the whole valley.', 3],
  [1, 14, 'the shelter at the school is full; the Red Cross says bring your own bedding.', 2],
  [3, 30, 'smoke is thick enough that the clinic is handing out masks; check on the old folks.', 1],
  [10, 60, 'the burn scar is closed; the county says rains will bring mud and rocks down the draws.', 1],
];

/** Wildfire (the fire front is in effects.ts; WP10 adds the evacuee flow, a price bump and the radio). */
export const fx: KindFx = {
  legacy: { npcs: 'neighborLife: house fires near', atmosphere: 'collapseLook: smoke and ash; fire fuel map', buildings: 'effects.ts: the fire front burns buildings by fuel clearance' },
  priceMods: s => (since(s) < 0 ? 1 + 0.1 * warnFrac(s) : 1 + 0.2 * clamp01(1 - since(s) / 30)),
  encounterWeights(s, { scale }) { if (since(s) >= 0 && since(s) < 30) { scale('refugees', 2); scale('stranded', 1.5); } },
  radioBulletins: (_s, ctx) => bulletin(LINES, ctx),
};
