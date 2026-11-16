/**
 * The heavy half of the signature goal chain (docs/FELT_LAYER.md 5.5): the selector the Build tab reads. Kept apart from goals.ts so the daily
 * dispatcher (reached from effects.ts, early in the module graph) never imports guidance.ts and the step library: loading this file registers
 * the chains with goals.ts (the engine and the Build tab import it). Pure engine: which chain is up, which steps are done, and the card the Build tab shows in
 * place of the first-hour goals. A step is done when the live state says so (never a click), and done stays done: `feltGoals` (the daily
 * dispatcher's goal step) latches each finished step into `fx.felt.goals.done` and logs its reward. The chain content is in goalChains.ts
 * (generic per kind) and goalSteps.ts (the checkable pieces); a kind's own `FeltSpec.goals` replaces the generic chain.
 */
import type { GameState } from '../state';
import type { FirstHour, FirstHourGoal } from '../firstHour';
import { chainFor } from './goalChains';
import { CHAIN_DAYS, FX_CHAIN_DAYS, chainWindowOpen } from './goalWindow';
import { feltOf } from './state';
import { registerChains } from './goals';
import { feltSpec } from './registry';
import type { FeltKind, GoalChain, GoalStep } from './types';

export { CHAIN_DAYS, FX_CHAIN_DAYS };


const isDone = (s: GameState, st: GoalStep): boolean => !!feltOf(s)?.goals.done.includes(st.id) || st.done(s);

/** The chain on the card now for this game, or null (no disaster yet, before the warning, past its window, or the kind has none). */
export function activeChain(s: GameState): GoalChain | null {
  if (!chainWindowOpen(s)) return null;
  const kind = s.disaster.kind as FeltKind;
  return chainFor(kind, feltSpec(kind)?.goals);
}

/** The step to show: the first not done. */
export const currentStep = (s: GameState, c: GoalChain): GoalStep | null => c.steps.find(st => !isDone(s, st)) ?? null;

/** The card for the Build tab (a `FirstHour` the existing GoalsCard draws), or null when no chain is up. */
export function feltChain(s: GameState): FirstHour | null {
  const c = activeChain(s);
  if (!c) return null;
  const doneFlags = c.steps.map(st => isDone(s, st));
  const cur = currentStep(s, c);
  const goals: FirstHourGoal[] = c.steps.map((st, i) => {
    const act = doneFlags[i] ? null : st.act?.(s) ?? null;
    return {
      id: st.id, short: st.short, title: st.title,
      status: doneFlags[i] ? 'done' : 'todo', line: doneFlags[i] ? st.reward.title : st.line(s),
      ...(act ? { act } : {}), why: st.why(s), reward: st.reward, pace: st.pace?.(s) ?? null, money: null,
    };
  });
  const last = [...goals].reverse().find(g => g.status === 'done');
  return {
    goals, current: cur ? goals[c.steps.indexOf(cur)] : null, alsoOpen: [], done: doneFlags.filter(Boolean).length, total: c.steps.length,
    complete: !cur, memory: { seen: [], done: [] }, heading: c.title, ...(last ? { rewardLine: `${last.reward.title}. ${last.reward.line}` } : {}),
  };
}


registerChains(chainFor);
