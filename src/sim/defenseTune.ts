/**
 * The numbers that make each defense layer pay (docs/DECISIONS.md, "Defense payoff"): pure and tested (sim/defenseTune.test.ts), read by the battle.
 * Walls and towers have their own tables (perimeter.ts, towers.ts); this holds the layers that used to do almost nothing in a fight: dogs at the wall,
 * powered cameras and their night sight, and the guards' marksmanship (battle.ts GUARD_SKILL).
 */
import type { Dog } from './pets';

/** Guard dogs that fight at the wall: the trained, healthy "on guard" dogs, two at most (the same rule as sim/laneWalk.ts guardDogs). */
export interface WallDogs { n: number; /** Chance a second, per raider on the ladder, that a dog gets a bite in. */ bitePerS: number; minHurt: number; spanHurt: number }
export const WALL_DOG = { MAX: 2, BITE_PER_S: 0.05, MIN_HURT: 10, SPAN_HURT: 14 } as const;
export function wallDogEffect(dogs: readonly Dog[]): WallDogs {
  const on = dogs.filter(d => d.died == null && d.guard && d.health >= 40 && d.training >= 25).slice(0, WALL_DOG.MAX);
  if (!on.length) return { n: 0, bitePerS: 0, minHurt: 0, spanHurt: 0 };
  return { n: on.length, bitePerS: WALL_DOG.BITE_PER_S * on.length, minHurt: WALL_DOG.MIN_HURT, spanHurt: WALL_DOG.SPAN_HURT };
}

/** Powered cameras (a thermal one counts double): the defenders' aim multiplier by day, rising to `CAM.MAX_AIM` with two good cameras. */
export const CAM = { MAX_AIM: 1.08, NIGHT_SEE: 0.75, FULL_AT: 2 } as const;
export const cameraAim = (cams: number): number => 1 + (CAM.MAX_AIM - 1) * Math.min(1, cams / CAM.FULL_AT);
/** Night: what share of hits still land for the defenders (0.5 with no help); cameras lift it toward `CAM.NIGHT_SEE`. */
export const cameraNightSee = (cams: number): number => 0.5 + (CAM.NIGHT_SEE - 0.5) * Math.min(1, cams / CAM.FULL_AT);

/** A contract guard's unit in a fight (battle.ts): `h_` plus the guard's person id (`pg` and his number). Guards are not family: they never count in the family's losses. */
export const isGuardUnit = (unit: string): boolean => /^h_pg\d+$/.test(unit);
