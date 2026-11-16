/**
 * The felt checklist (docs/FELT_LAYER.md section 8), the part that can be decided from a kind's spec alone. FL6 adds the checks that need a
 * played state (marks at day 7 and 30, determinism, difficulty). Each item is true when the kind meets it.
 */
import { FX, columnsOf } from '../disasterFx';
import type { DisasterKind } from '../disaster';
import { FELT } from './registry';
import type { FeltKind } from './types';

export type FeltItem = 'teeth' | 'hit' | 'card' | 'marks' | 'radio' | 'cards' | 'goals';
export const FELT_ITEMS: FeltItem[] = ['teeth', 'hit', 'card', 'marks', 'radio', 'cards', 'goals'];

export function feltChecks(kind: FeltKind): Record<FeltItem, boolean> {
  const f = FELT[kind];
  const radio = f.radio ?? [];
  return {
    teeth: kind in FX && columnsOf(kind as DisasterKind).length >= 4,
    hit: !!f.hit && f.hit.beats.length >= 2 && f.hit.beats.length <= 4 && Math.max(...f.hit.beats.map(b => b.at)) <= 6 && f.hit.title.length > 0,
    card: !!f.card,
    marks: !!f.marks,
    radio: new Set(radio.map(l => l.id)).size >= 5 && radio.some(l => l.truth === 'true') && radio.some(l => l.truth === 'false') && new Set(radio.map(l => l.channel)).size >= 2,
    cards: (f.cards ?? []).length > 0 && (f.cards ?? []).every(c => c.options.length >= 2 && c.options.some(o => o.id === c.fallback)),
    goals: !!f.goals && f.goals.steps.length >= 3 && f.goals.steps.length <= 5,
  };
}

export const feltPassing = (kind: FeltKind): FeltItem[] => FELT_ITEMS.filter(i => feltChecks(kind)[i]);
