import type { GameState } from '../sim/state';
import { cachedPlan, SEPARATE_DWELLINGS } from '../sim/housing';

/** Where a relative sleeps, in words ("the guest house", "the couch", "a tent"). */
export function whereText(game: GameState, id: string): string {
  const sl = cachedPlan(game).sleepers.find(x => x.id === id);
  if (!sl) return '';
  const st = sl.spot.where ? game.structures.find(x => x.id === sl.spot.where) : undefined;
  if (sl.own) return `in ${st?.kind === 'guest_house' ? 'the guest house' : st?.kind === 'moms_house' ? 'Mom’s house' : 'the cottage'}, a front door of their own`;
  if (sl.spot.kind === 'bed') return st && SEPARATE_DWELLINGS.has(st.kind) ? 'in a bed in the cottage' : 'in a bed in the main house';
  return { bunk: 'in a bunk', couch: 'on the couch', floor: 'on the floor in a bag', tent: 'in a tent', outbuilding: 'on the shop floor', nowhere: 'nowhere (the truck, the porch)', bed: 'in a bed' }[sl.spot.kind];
}
