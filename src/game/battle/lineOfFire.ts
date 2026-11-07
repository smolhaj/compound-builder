/**
 * The line-of-fire geometry lives in the sim (sim/lineOfFire.ts): the battle sim decides who can hit whom with it, and the cutscene's tracers
 * ask the same question of the same boxes, so the picture agrees with the fight. This file only re-exports it for the renderer.
 */
export * from '../../sim/lineOfFire';
