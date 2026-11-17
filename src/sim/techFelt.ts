/**
 * Adapters from the teeth modules' decision cards and goal lists (sim/disasters/<kind>.ts) to the felt layer's contract (sim/felt/types.ts):
 * the felt layer decides when a card comes up, holds the clock, charges the cost and shows it (ui/felt/FeltCard.tsx).
 */
import type { DecisionCard, FeltPhase, GoalChain } from './felt/types';
import type { Goal, TechCard } from './techFx';
import { newGame } from './state';

/** Which phase each card belongs to: the drills before the hit, the first week, the first month. */
const PHASE: Record<string, FeltPhase> = { flare_drill: 'warning', emp_box: 'warning', cy_firmware: 'warning', fin_run: 'warning', fin_fee: 'month', gd_charging: 'month', gd_county: 'month' };

type S = Parameters<TechCard['text']>[0];
let probe: S | null = null;
/** The option ids and labels are static; a throwaway game gives `options()` something to read the first time they are listed. */
const labelsOf = (c: TechCard): Array<{ id: string; label: string }> => c.options((probe ??= newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }))).map(o => ({ id: o.id, label: o.label }));

export function toFeltCards(cards: readonly TechCard[]): DecisionCard[] {
  return cards.map(c => {
    const pick = (s: S, id: string) => c.options(s).find(x => x.id === id);
    let opts: DecisionCard['options'] | null = null;
    const card = {
      id: c.id, phase: PHASE[c.id] ?? 'hit', once: true, timeoutDays: c.ttl, fallback: c.fallback,
      when: c.due, title: () => c.title, text: c.text,
    } as unknown as DecisionCard;
    Object.defineProperty(card, 'options', {
      enumerable: true,
      get: () => (opts ??= labelsOf(c).map(o => ({
        id: o.id, label: o.label,
        hint: (s: S) => pick(s, o.id)?.hint ?? '',
        cost: (s: S) => { const x = pick(s, o.id); return x?.cost ? { money: x.cost } : {}; },
        off: (s: S) => pick(s, o.id)?.locked ?? null,
        apply: (s: S, r: () => number) => c.answer(s, o.id, r).lines,
      }))),
    });
    return card;
  });
}

export function toFeltGoals(id: string, title: string, startsAt: 'warning' | 'hit', goals: readonly Goal[]): GoalChain {
  return {
    id, title, startsAt,
    steps: goals.map(g => ({ id: g.id, short: g.text.split(' ').slice(0, 3).join(' '), title: g.text, line: () => (g.by <= 1 ? 'Do this first' : `Aim for day ${g.by}`), why: () => `Aim to have this done by day ${g.by}. Nothing is locked: it is the order that matters.`, done: g.done, reward: { title: 'Done', line: g.text } })),
  };
}
