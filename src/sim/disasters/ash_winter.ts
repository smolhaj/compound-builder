import { makeAshFx } from './ashShared';
import { ASH_WINTER_OPTS } from '../ashState';

/** Ash winter (the Yellowstone eruption): the ashfall phase with a daily roof-load clock, then the volcanic winter on the shared engine (sim/winter.ts). */
export { ASH_WINTER_OPTS };
export const fx = makeAshFx(ASH_WINTER_OPTS);
