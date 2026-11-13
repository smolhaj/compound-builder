/**
 * What a drawn beast looks like (pure, tested): which model, coat and size, whether it wears antlers (and how grown), and how its legs and head
 * are posed from its mood. The renderer feeds this to the instance attributes (docs/DECISIONS.md, "Realistic wildlife and dogs").
 */
import type { SpeciesId } from '../../sim/wildlife';
import type { Beast } from './wildlifeAI';

export interface DrawPlan {
  model: string; breed: number;
  /** Scale multiplier on the model (an animal is 94 to 106 % of the typical one). */
  size: number;
  /** Antler / beard growth 0..1 (0: none). */
  adorn: number;
  gait: number; graze: number; alert: number;
}

/** Winter coat: the cold part of the year (day 320 to 75). */
export const isWinter = (doy: number): boolean => doy > 320 || doy < 76;
const DRY_WEST = new Set(['mountain_west', 'desert', 'plains', 'hill_country']);

/** The model a species is drawn with (waterfowl are mostly ducks with some geese). */
export function modelOfSpecies(sp: SpeciesId, k: number): string {
  switch (sp) {
    case 'antelope': return 'pronghorn';
    case 'waterfowl': return k > 0.68 ? 'goose' : 'duck';
    default: return sp;
  }
}

/** Coat index into the model's breeds. */
export function coatOf(sp: SpeciesId, k: number, male: boolean, region: string, doy: number): number {
  const w = isWinter(doy) ? 1 : 0;
  switch (sp) {
    case 'deer': return ((DRY_WEST.has(region) ? k > 0.35 : k > 0.93) ? 2 : 0) + w;
    case 'elk': return w;
    case 'moose': return k > 0.5 ? 1 : 0;
    case 'antelope': return k > 0.5 ? 1 : 0;
    case 'javelina': return k > 0.55 ? 1 : 0;
    case 'turkey': return (male ? 0 : 1) + (k > 0.75 ? 2 : 0);
    case 'grouse': return k > 0.5 ? 1 : 0;
    case 'waterfowl': return k > 0.68 ? (k > 0.88 ? 1 : 0) : male ? 0 : 1;
    case 'rabbit': return (DRY_WEST.has(region) && k > 0.35 ? 2 : 0) + (k > 0.6 ? 1 : 0);
    case 'squirrel': return k > 0.7 ? 1 : 0;
    case 'bear': return k < 0.55 ? 0 : k < 0.72 ? 1 : k < 0.9 ? 2 : 3;
    case 'cougar': return k > 0.5 ? 1 : 0;
    case 'wolf': return region === 'north_woods' && w ? (k > 0.5 ? 3 : 0) : k < 0.4 ? 0 : k < 0.72 ? 1 : k < 0.92 ? 2 : 3;
    case 'coyote': return w ? 2 : k > 0.5 ? 1 : 0;
  }
}

/** Antlers: bucks, bulls and bull moose, grown by the season and by the animal's age (a young buck wears a smaller rack). */
export function adornOf(sp: SpeciesId, male: boolean, k: number, growth: number): number {
  if (!male) return 0;
  if (sp === 'deer' || sp === 'elk' || sp === 'moose') return Math.max(0.0001, growth * (0.62 + 0.38 * k));
  if (sp === 'turkey') return 1;
  return 0;
}

export function drawPlan(b: Beast, region: string, doy: number, growth: number, wet: number): DrawPlan {
  const looking = b.mood === 'alert' || b.mood === 'flee';
  const size = b.sp === 'moose' || b.sp === 'elk' ? 0.94 + b.k * 0.1 : 0.94 + b.k * 0.12;
  const graze = b.mood === 'graze' ? Math.max(0, 1 - b.head) : 0;
  // a duck on the water does not walk; one on land pecks at the ground
  const gait = wet ? 0 : b.gait ?? (b.v > 0.01 ? 1 : 0);
  return {
    model: modelOfSpecies(b.sp, b.k), breed: coatOf(b.sp, b.k, b.male, region, doy), size, adorn: adornOf(b.sp, b.male, b.k, growth),
    gait, graze, alert: looking ? Math.max(0.6, b.head) : b.mood === 'walk' ? b.head * 0.5 : 0,
  };
}
