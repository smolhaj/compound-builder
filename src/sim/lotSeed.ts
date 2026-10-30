/**
 * One seed for the ground a listed lot stands on. A listing shows the road in, the camp and the lay of the land planned from the lot's own
 * seed; the game used to build the same lot with the game's seed, so the county road's wobble, the habitual entrance, the woods and the
 * camp, and so the road drawn in 3D, differed from what the listing described. A lot that came from the land market (`site.listed`) is
 * pinned to the lot's seed everywhere (listing, quote, world, terrain analysis). QA lots (the `?lot=` URL, the showcase) and every place
 * with no lot keep the game's seed, so what they were tuned on does not move. Pure.
 */
import type { Site } from './site';

export const pinSeed = (site: Pick<Site, 'lot' | 'listed'>, gameSeed: number): number => (site.lot && site.listed ? site.lot.seed : gameSeed);
