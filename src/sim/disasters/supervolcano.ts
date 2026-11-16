import { makeAshFx } from './ashShared';
import { SUPERVOLCANO_OPTS } from '../ashState';

/** Supervolcano (a caldera eruption): the same ash engine, a bigger fall and a harsher winter than the Yellowstone default. */
export { SUPERVOLCANO_OPTS };
export const fx = makeAshFx(SUPERVOLCANO_OPTS);
