import type { GameState } from '../sim/state';

/** Whether the household has a gun to practice with (the range button). */
export const hasGuns = (g: GameState): boolean => g.armory.guns.length > 0;
