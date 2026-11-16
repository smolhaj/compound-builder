import type { KindFx } from '../disasterFx';

/** Wildfire (WP9 look only; the fire front is in effects.ts). (stub: no behavior of its own yet; see docs/DISASTER_TEETH.md and the PR for the package that owns this file). */
export const fx: KindFx = {
  legacy: { npcs: 'neighborLife: house fires near', atmosphere: 'collapseLook: smoke and ash; fire fuel map', buildings: 'effects.ts: the fire front burns buildings by fuel clearance' },
};
