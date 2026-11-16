import type { KindFx } from '../disasterFx';
import { blightBulletin, blightCards, blightChoose, blightDaily, blightGoal, gardenGrow, intensity } from '../blight';
import { setSeedFirst } from '../crops';

/** Crop blight and pest plague (WP7): per-family cuts reach the fields through crops.troubleFactor; the garden through supplyMods (sim/blight.ts). */
export const fx: KindFx = {
  daily: (s, ctx) => blightDaily(s, ctx),
  supplyMods: s => ({ grow: gardenGrow(s) }),
  priceMods: s => 1 + 0.5 * Math.min(1, intensity(s) + (s.clock.t < s.disaster.hitAt ? 0.3 : 0)),
  encounterWeights(_s, { scale }) { scale('refugees', 1.6); scale('arrival', 1.3); scale('trader', 0.7); scale('looters', 1.15); },
  npcMods: s => 1 + 0.8 * intensity(s),
  radioBulletins: (s, ctx) => blightBulletin(s, ctx),
  oasisWeight: s => 0.2 * Math.min(1, intensity(s)),
  cards: s => blightCards(s),
  choose(s, c) {
    const note = blightChoose(s, c);
    if (c === 'bl:saved') setSeedFirst(s, 'saved'); else if (c === 'bl:heirloom') setSeedFirst(s, 'heirloom');
    return note;
  },
  goal: s => blightGoal(s),
};
