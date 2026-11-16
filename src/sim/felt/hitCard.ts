/**
 * The day card's two new sections (docs/FELT_LAYER.md 5.1), built from the live state: "What changed" (services under half by day 3, prices, supply,
 * what still works for you) and "Do first" (at most three steps, each with a real handler). Pure. A kind's `FeltSpec.card` adds its own lines and steps.
 */
import { TRACKS, TRACK_NAME, canOrder, priceFactor, tracksAt } from '../disaster';
import { moneyWorks } from '../barter';
import { suggestions, type SuggestionAct } from '../guidance';
import { daysOfFood } from '../needs';
import { radioSet } from '../radio';
import type { GameState } from '../state';
import { spanText } from '../words';
import { feltSpec } from './registry';
import type { FirstStep } from './types';

export interface WhatChanged {
  /** One clause per service under half by day 3, with the earliest hope. */
  lost: string[];
  /** Prices and supply, one line each. */
  market: string[];
  /** What still works for you. */
  stays: string[];
}

/** The acts the day card can run (DayCard.tsx `runStep`): the one-click kinds that need no spend confirmation. */
export const DAY_ACTS = ['stake', 'tool', 'select', 'open', 'shop'] as const;
export const isDayAct = (a: FirstStep['act']): boolean => !a || 'dash' in a || (DAY_ACTS as readonly string[]).includes((a as SuggestionAct).type);

const hope = (back: number | undefined): string => (back === undefined ? 'no word on when' : `earliest hope about ${spanText(back)} out`);

export function whatChanged(s: GameState): WhatChanged {
  const d = s.disaster, t3 = d.hitAt + 3, tr = tracksAt(d, t3);
  const lost = TRACKS.filter(k => tr[k] < 0.5).map(k => `${TRACK_NAME[k]} ${tr[k] < 0.1 ? 'is gone' : 'is failing'} (${hope(d.back[k])}).`);
  const f = priceFactor(d, t3), up = Math.round((f - 1) * 100);
  const food = daysOfFood(s);
  const market = [
    up >= 10 ? `Prices climb about ${up}% above list within three days.` : 'Prices hold for now.',
    canOrder(d, t3) ? 'Orders to the yard still go through.' : 'Orders will stop: nothing is delivered and nobody takes a card.',
    Number.isFinite(food) ? `Your shelves hold about ${spanText(Math.max(1, Math.floor(food)))} of food.` : 'There is nobody to feed.',
  ];
  const stays: string[] = [];
  stays.push(s.utilities.lit.length > 0 || s.utilities.report.solarKwh > 0 ? 'Your own power runs.' : 'You have no power of your own.');
  stays.push(s.utilities.report.storedL > 0 || s.utilities.report.waterL > 0 ? 'Your own water runs.' : 'You have no water of your own.');
  stays.push(moneyWorks(s) ? 'Money still buys things.' : 'Money is worth little: barter and cash only.');
  const set = radioSet(s);
  stays.push(set === 'none' ? 'You have no radio, so the news will be late.' : set === 'ham' ? 'The ham rig is on the air.' : 'The shortwave set still brings news.');
  const spec = feltSpec(d.kind)?.card?.stays?.(s) ?? [];
  return { lost, market, stays: [...stays, ...spec] };
}

/** At most three things to do first: the kind's own steps, then what the place needs most (guidance.suggestions), then the pantry and the radio. */
export function doFirst(s: GameState): FirstStep[] {
  const own = feltSpec(s.disaster.kind)?.card?.first(s) ?? [];
  const out: FirstStep[] = own.filter(x => isDayAct(x.act));
  const food = daysOfFood(s);
  if (Number.isFinite(food) && food < 14) out.push({ label: 'Check the pantry', why: `${spanText(Math.max(1, Math.floor(food)))} of food is not a long time.`, act: { type: 'open', right: 'supplies', supplies: 'stores' } });
  for (const sg of suggestions(s, 3)) {
    const act = sg.acts?.map(a => a.act).find(a => isDayAct(a)) ?? (sg.kind ? { type: 'stake' as const, kind: sg.kind } : undefined);
    out.push({ label: sg.title ?? (sg.kind ? `Stake the ${sg.kind.replace(/_/g, ' ')}` : 'Look at the place'), why: sg.why, ...(act ? { act } : {}) });
  }
  if (radioSet(s) === 'none') out.push({ label: 'Get a radio', why: 'The news is the only warning you will get.', act: { type: 'shop', tab: 'tools' } as SuggestionAct });
  const seen = new Set<string>();
  return out.filter(x => (seen.has(x.label) ? false : (seen.add(x.label), true))).slice(0, 3);
}

export const hitCard = (s: GameState): { changed: WhatChanged; first: FirstStep[] } => ({ changed: whatChanged(s), first: doFirst(s) });
