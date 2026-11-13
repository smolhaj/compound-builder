/**
 * How lived-in a home looks (pure). Decor grows with how long the family has lived there and what they own:
 * a new house is bare but for its lamp and stove; after a season it has a kettle, a pillow, a candle; after a year
 * herbs drying, a throw over the chair, the kids' drawings; after a couple of years the walls are full of photographs.
 * No save fields: it reads the clock, the stock and the household, and the world rebuilds a home when the key changes.
 */
export interface CozyInput {
  /** Days the family has lived in this home. */
  days: number;
  /** Children in the household. */
  kids: boolean;
  /** Days of food put by (sim/needs.daysOfFood). */
  foodDays: number;
  /** Owns paperbacks or picture books. */
  books: boolean;
  /** Owns beeswax or candles (a real candle on the table). */
  candles: boolean;
  /** A dog in the household. */
  dog: boolean;
  /** A garden or greenhouse is up (herbs hang to dry). */
  garden: boolean;
}

export interface Cozy {
  /** 0 new, 1 a season in, 2 a year in, 3 settled. */
  tier: 0 | 1 | 2 | 3;
  /** Throw pillows on the sofa and chairs. */
  pillows: number;
  /** A wool throw over a chair back. */
  throwBlanket: boolean;
  kettle: boolean;
  /** Bundles of herbs drying by the stove. */
  herbs: boolean;
  /** A braid of garlic by the kitchen. */
  garlic: boolean;
  /** The kids' drawings on the wall. */
  drawings: boolean;
  /** Framed family photographs. */
  photos: boolean;
  /** Candles on the table and mantel (0–3). */
  candles: number;
  /** A houseplant in the sun. */
  plant: boolean;
  /** Jars of preserves on the sill and mantel (0–3), by how much is put by. */
  preserves: number;
  /** A stack of books by the chair. */
  books: boolean;
  /** A second, smaller rug layered over the first. */
  rug2: boolean;
}

export const TIER_DAYS = [45, 180, 540] as const;

export function cozyFrom(i: CozyInput): Cozy {
  const tier = (i.days < TIER_DAYS[0] ? 0 : i.days < TIER_DAYS[1] ? 1 : i.days < TIER_DAYS[2] ? 2 : 3) as Cozy['tier'];
  return {
    tier,
    pillows: Math.min(3, tier + (tier > 0 && i.kids ? 1 : 0)) as number,
    throwBlanket: tier >= 2,
    kettle: tier >= 1,
    herbs: tier >= 2 && (i.garden || tier >= 3),
    garlic: tier >= 2 && i.foodDays > 20,
    drawings: i.kids && tier >= 1,
    photos: tier >= 2,
    candles: Math.min(3, (tier >= 1 ? 1 : 0) + (tier >= 3 ? 1 : 0) + (i.candles ? 1 : 0)),
    plant: tier >= 2,
    preserves: tier === 0 ? 0 : i.foodDays > 90 ? 3 : i.foodDays > 40 ? 2 : i.foodDays > 10 ? 1 : 0,
    books: i.books && tier >= 1,
    rug2: tier >= 3 || (tier >= 2 && i.dog),
  };
}

/** The plain furnishing: what a home looks like with no history (also what an old save shows before the world has read it). */
export const COZY_NONE: Cozy = cozyFrom({ days: 0, kids: false, foodDays: 0, books: false, candles: false, dog: false, garden: false });

/** A short key for a home's decor: the world rebuilds the house when it changes. */
export function cozyKey(c: Cozy): string {
  return [c.tier, c.pillows, +c.throwBlanket, +c.kettle, +c.herbs, +c.garlic, +c.drawings, +c.photos, c.candles, +c.plant, c.preserves, +c.books, +c.rug2].join('');
}
