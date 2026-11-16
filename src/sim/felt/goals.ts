/**
 * The signature goal chain's daily step (docs/FELT_LAYER.md 5.5), called by the dispatcher (daily.ts). Light on purpose: this file is reached from
 * effects.ts early in the module graph, so it imports no game rules. The chains arrive by `registerChains`, called when goalLib.ts loads (the
 * engine and the Build tab import it); a headless run that never loaded it simply has no chain and logs nothing.
 *
 * A step is done when the live state says so (never a click), and done stays done: each finished step is latched into `fx.felt.goals.done` and
 * its reward is logged once.
 */
import type { GameState } from '../state';
import type { FxCtx } from '../disasterFx';
import { CHAIN_DAYS, FX_CHAIN_DAYS, isFxChain } from './goalWindow';
import { ensureFelt, feltOf } from './state';
import type { FeltKind, FeltSpec, GoalChain } from './types';

type ChainFor = (kind: FeltKind, own?: GoalChain) => GoalChain | null;
let chainOf: ChainFor | null = null;
export const registerChains = (f: ChainFor): void => { chainOf = f; };
export const completeId = (c: GoalChain): string => `${c.id}:complete`;

/** The daily step: latch finished steps (done stays done), log each reward once, and log the completion once. Returns log lines. */
export function feltGoals(s: GameState, _ctx: FxCtx, spec: FeltSpec): string[] {
  if (!chainOf) return [];
  const c = chainOf(s.disaster.kind as FeltKind, spec.goals);
  if (!c || s.clock.t >= s.disaster.hitAt + (isFxChain(c.id) ? FX_CHAIN_DAYS : CHAIN_DAYS)) return [];
  const g = (feltOf(s) ?? ensureFelt(s)).goals;
  g.chain = c.id;
  const out: string[] = [];
  for (const st of c.steps) {
    if (g.done.includes(st.id) || !st.done(s)) continue;
    g.done.push(st.id);
    out.push(`Goal done: ${st.reward.title}. ${st.reward.line}`);
  }
  if (c.steps.every(st => g.done.includes(st.id)) && !g.done.includes(completeId(c))) {
    g.done.push(completeId(c));
    out.push(`${c.title}: every step is done. You are set for now.`);
  }
  return out;
}
