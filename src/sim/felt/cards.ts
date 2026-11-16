/**
 * FL4: decision cards (docs/FELT_LAYER.md section 5.4). The daily step picks at most one card that is eligible from the real state, sets
 * `fx.felt.cards.pending` (the clock holds while it is up), and `answerCard` charges the cost and runs the chosen effect. A card left too
 * long takes its safe fallback. A kind's own `spec.cards` wins; otherwise the generic library (cardLibrary.ts) supplies them.
 */
import type { GameState } from '../state';
import { mulberry32 } from '../rng';
import { DIFFICULTY } from '../difficulty';
import type { FxCtx } from '../disasterFx';
import { charge, costProblem } from './cardFx';
import { feltSpec } from './registry';
import { genericCards } from './cardLibrary';
import { emptyFelt, ensureFelt, feltDay, feltOf, feltPhase } from './state';
import type { Cost, DecisionCard, DecisionOption, FeltKind, FeltPhase, FeltSpec } from './types';

/** Cards a phase may show, and the quiet days between two cards. */
export const PHASE_BUDGET = 3;
export const CARD_SPACING_DAYS = 2;
const DEFAULT_TIMEOUT: Record<FeltPhase, number> = { warning: 2, hit: 4, month: 7, season: 14, year: 21 };

/** The cards in play for a kind: its own, else the generic library. */
export const cardsFor = (kind: FeltKind, spec?: FeltSpec | null): DecisionCard[] => (spec?.cards?.length ? spec.cards : genericCards(kind));

/** Days a card waits before its fallback is taken: Cozy waits longer, Hardcore less. */
export const timeoutDays = (s: GameState, c: DecisionCard): number =>
  Math.max(2, Math.round((c.timeoutDays ?? DEFAULT_TIMEOUT[c.phase]) * DIFFICULTY[s.disaster.difficulty ?? 'standard'].warn));

/** Nothing else is asking for the player right now. */
const calm = (s: GameState): boolean => !s.gate.pending && !s.gate.card && !s.gate.aftermath && !(s.ending && !s.ending.continued);

/** The cards that could come up today, best first. */
export function eligibleCards(s: GameState, spec?: FeltSpec | null): DecisionCard[] {
  const kind = s.disaster.kind, phase = feltPhase(s);
  if (!kind || !phase) return [];
  const f = feltOf(s) ?? emptyFelt();
  if ((f.cards.perPhase[phase] ?? 0) >= PHASE_BUDGET) return [];
  return cardsFor(kind, spec).filter(c => c.phase === phase && !(c.id in f.cards.done) && c.when(s));
}

/** The card on screen, if one is pending. */
export function pendingCard(s: GameState): DecisionCard | null {
  const p = feltOf(s)?.cards.pending, kind = s.disaster.kind;
  return p && kind ? cardsFor(kind, feltSpec(kind)).find(c => c.id === p.id) ?? null : null;
}

const hash = (t: string): number => { let h = 7; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return h; };
const diceFor = (s: GameState, id: string, opt: string) => mulberry32(s.seed * 6101 + Math.floor(s.clock.t) * 13 + hash(id) + hash(opt));

/** Why an option cannot be taken right now (null: it can). */
export function optionProblem(s: GameState, o: DecisionOption): string | null {
  return o.off?.(s) ?? costProblem(s, o.cost(s));
}

function settle(s: GameState, c: DecisionCard, o: DecisionOption, prefix: string[]): string[] {
  const f = ensureFelt(s), r = diceFor(s, c.id, o.id);
  charge(s, o.cost(s), r);
  const lines = [...prefix, ...o.apply(s, r)];
  f.cards.done[c.id] = o.id;
  delete f.cards.pending;
  return lines;
}

/** The player's answer. Returns the log lines, or `{ why }` when it cannot be done (the card stays up). */
export function answerCard(s: GameState, cardId: string, optionId: string): { lines: string[] } | { why: string } {
  const p = feltOf(s)?.cards.pending, kind = s.disaster.kind;
  if (!p || p.id !== cardId || !kind) return { why: 'That decision is no longer waiting.' };
  const c = cardsFor(kind, feltSpec(kind)).find(x => x.id === cardId), o = c?.options.find(x => x.id === optionId);
  if (!c || !o) return { why: 'No such choice.' };
  const why = optionProblem(s, o);
  if (why) return { why };
  return { lines: settle(s, c, o, []) };
}

/** The option taken when nobody decides: the card's fallback, or the first one that can be done. */
export function fallbackOf(s: GameState, c: DecisionCard): DecisionOption {
  const o = c.options.find(x => x.id === c.fallback);
  return o && !optionProblem(s, o) ? o : c.options.find(x => !optionProblem(s, x)) ?? c.options[0];
}

/** The daily step (called by daily.ts): time out a stale card, or raise the next eligible one. */
export function feltCards(s: GameState, _ctx: FxCtx, spec: FeltSpec): string[] {
  const kind = s.disaster.kind;
  if (!kind || !calm(s)) return [];
  const day = feltDay(s), f = feltOf(s);
  const p = f?.cards.pending;
  if (p) {
    const c = cardsFor(kind, spec).find(x => x.id === p.id);
    if (!c) { delete ensureFelt(s).cards.pending; return []; }
    if (s.clock.t - p.since < timeoutDays(s, c)) return [];
    const o = fallbackOf(s, c);
    return settle(s, c, o, [`You did not decide, so: ${o.label.toLowerCase()}.`]);
  }
  const phase = feltPhase(s);
  if (!phase || (f && day - f.cards.last < CARD_SPACING_DAYS)) return [];
  const next = eligibleCards(s, spec)[0];
  if (!next) return [];
  const g = ensureFelt(s);
  g.cards.pending = { id: next.id, since: s.clock.t };
  g.cards.perPhase[phase] = (g.cards.perPhase[phase] ?? 0) + 1;
  g.cards.last = day;
  return [`Decision: ${next.title(s)}.`];
}

/** Cost chips for a card option, as plain words. */
export function costChips(c: Cost, name: (id: string) => string): string[] {
  const out: string[] = [];
  if (c.money) out.push(`$${Math.round(c.money).toLocaleString('en-US')}`);
  for (const [id, n] of Object.entries(c.stock ?? {})) out.push(`${n} ${name(id)}`);
  if (c.hours) out.push(`${c.hours} hours of work`);
  if (c.people) out.push(`${c.people} ${c.people === 1 ? 'person' : 'people'} away`);
  if (c.humanity) out.push(`${c.humanity} humanity`);
  if (c.standing) out.push(`${c.standing} standing with neighbors`);
  return out;
}

/** "about 7 in 10" (a copy of the gate card's wording, so GateCard.tsx stays untouched). */
export const inTen = (x: number): string => (x < 0.05 ? 'almost never' : x > 0.95 ? 'almost always' : `about ${Math.round(x * 10)} in 10`);
