/**
 * The family's orders in a raid, and the three places they can make a stand (user decision 6). Pure; sim/battle.ts reads it.
 *
 *   hold      stay at the posts (the sim's old behavior: the line is held, and the family falls back through any manned inner rings by itself).
 *   fallback  give up the outer line and stand at the next place: the wall, then the cover in the yard, then the main house (doors barricaded).
 *             Every step is a few seconds with nobody shooting, hands the crew the ground behind it (stores and stock there are exposed) and
 *             gives the family better cover on a shorter line.
 *   counter   go at them: the family shoots faster and rushes, harder to hit when it works, easier to hit when it does not, and a crew
 *             in the yard loses heart sooner. Only worth it with enough rifles.
 *
 * An order is `{ t, order }`; the one with the largest t at or before now is in force. The battle sim is seeded, so an order given at second t
 * replays the same fight up to t and a new one after it (`planBattle(..., { orders })`).
 */
import type { RaidOrderKind, RaidStage } from './battleTypes';
import { ANIMAL_KINDS, STORE_KINDS } from './ringFallback';
import { isFinished } from './construction';
import type { GameState } from './state';

export interface RaidOrder { t: number; order: RaidOrderKind }
export const STAGES: readonly RaidStage[] = ['wall', 'yard', 'house'];
export const ORDERS: readonly RaidOrderKind[] = ['hold', 'fallback', 'counter'];
export const ORDER_NAME: Record<RaidOrderKind, string> = { hold: 'Hold the line', fallback: 'Fall back to the house', counter: 'Counterattack' };
export const ORDER_HINT: Record<RaidOrderKind, string> = {
  hold: 'Stay at the posts. The crew has to take the wall.',
  fallback: 'Give up the wall, then the yard, and stand in the house with the doors barricaded. Less is lost in blood, more is lost outside.',
  counter: 'Go at them with every rifle. Hits harder while it works; a failed rush costs people.',
};

export interface OrderFx {
  /** Defenders' accuracy and rate. */
  acc: number;
  /** How many of the rounds at a defender land (cover; >1 is worse). */
  hit: number;
  /** A crew in the yard gives up at this share of its usual losses (<1: sooner). */
  morale: number;
  /** Seconds nobody shoots while the family moves. */
  move: number;
}
export const ORDER_FX: Record<RaidOrderKind, OrderFx> = {
  hold: { acc: 1, hit: 1, morale: 1, move: 0 },
  fallback: { acc: 0.97, hit: 0.88, morale: 1, move: 3 },
  counter: { acc: 1.3, hit: 1.12, morale: 0.65, move: 0 },
};
/** The share of a stage's fire that lands on defenders, by where they stand (the house is the best cover; the open yard the worst). */
export const STAGE_COVER: Record<RaidStage, number> = { wall: 1, yard: 0.94, house: 0.8 };
/** How long the crew has to work at a stage's line before it breaks it (seconds): the yard cover is thin, the barricaded house holds. */
export const STAGE_HOLD: Record<RaidStage, number> = { wall: 0, yard: 8, house: 16 };

/** The order in force at `t` (default hold). */
export function orderAt(orders: readonly RaidOrder[] | undefined, t: number): RaidOrderKind {
  let best: RaidOrder | null = null;
  for (const o of orders ?? []) if (o.t <= t && (!best || o.t >= best.t)) best = o;
  return best?.order ?? 'hold';
}

/** Where the line is for each stage, from the house outward (world units): the yard stage is half way to the wall, the house a few steps. */
export function stageRadius(stage: RaidStage, wallR: number): number {
  return stage === 'wall' ? wallR : stage === 'yard' ? Math.max(3.2, wallR * 0.5) : 2.2;
}

/** The next stage in, or the same one at the house. */
export const nextStage = (st: RaidStage): RaidStage => (st === 'wall' ? 'yard' : 'house');

/** What stands beyond a stage's line (animals in the barns, stores in the cellars and sheds): the share the crew can reach. */
export function exposedBeyond(s: GameState, home: { x: number; z: number }, stage: RaidStage, wallR: number): { animals: number; stores: number } {
  if (stage === 'wall') return { animals: 0, stores: 0 };
  const rad = stageRadius(stage, wallR), fin = s.structures.filter(isFinished);
  const share = (kinds: readonly string[]) => {
    const list = fin.filter(st => kinds.includes(st.kind));
    return list.length ? list.filter(st => Math.hypot(st.x - home.x, st.z - home.z) > rad).length / list.length : 0;
  };
  return { animals: share(ANIMAL_KINDS), stores: share(STORE_KINDS) };
}
