import type { KindFx } from '../disasterFx';
import { strike } from '../nuclear';

/** Nuclear war: the reference kind. The strike (EMP, the dash home, the shelter) is sim/nuclear.ts, moved behind onHit unchanged. */
export const fx: KindFx = {
  legacy: {
    economy: 'finance.ts: the market crash (50%)', supplies: 'effects.ts winterFactor / wildfood / scavenge: fallout', npcs: 'nuclear.ts: the dash home from town',
    atmosphere: 'collapseLook.ts nuclearSky', infrastructure: 'nuclear.ts strike: EMP fries inverters, pump, generator, vehicles', medical: 'radiation.ts: dose, sickness, KI', media: 'report.ts, shelterView.ts',
  },
  onHit: s => strike(s),
};
