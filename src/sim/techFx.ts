/**
 * Shared plumbing for the tech-and-money disasters (WP1 solar_flare + emp, WP2 cyberattack + grid_down, WP5 financial): per-kind state in
 * `disaster.fx[<kind>]`, a family-wealth reading, decision cards (a few per phase, gate-card style odds and costs) and signature goals.
 * Pure of rendering; JSON-safe state; no save bump (fx is optional, save v98).
 */
import type { DisasterKind } from './disaster';
import type { GameState } from './state';

/** The per-kind state bag, made on first use. */
export function kfx<T extends object>(s: GameState, kind: string, init: () => T): T {
  const bag = (s.disaster.fx ??= {});
  return (bag[kind] ??= init()) as T;
}

/** Days since the hit (0 before it). */
export const daysSince = (s: GameState): number => Math.max(0, Math.floor(s.clock.t - s.disaster.hitAt));

/** 0..1: how much money the family can put on the table ($10k = 0, $1M = 1; log scale). Money buys speed and spares. */
export function wealthOf(s: GameState): number {
  const w = s.money + (s.fin?.savings ?? 0) + (s.fin?.brokerage ?? 0) + (s.fin?.cash ?? 0);
  return Math.max(0, Math.min(1, (Math.log10(Math.max(1, w)) - 4) / 2));
}

export const FRY_SCALE = { cozy: 0.75, standard: 1, hardcore: 1.15 } as const;
export const diffFry = (s: GameState): number => FRY_SCALE[s.disaster.difficulty ?? 'standard'];

// ── decision cards ─────────────────────────────────────────────────────────────────────────────────

export interface CardOption { id: string; label: string; hint: string; /** Cash it costs (checking, or the safe if checking is short). */ cost?: number; /** Shown greyed with this reason. */ locked?: string }
export interface CardOutcome { title: string; text: string; tone: 'good' | 'mixed' | 'bad'; lines: string[] }
export interface TechCard {
  id: string;
  kind: DisasterKind;
  title: string;
  text: (s: GameState) => string;
  options: (s: GameState) => CardOption[];
  /** True when the card should come up now (once; `done` remembers it). */
  due: (s: GameState) => boolean;
  /** Days it waits before the default option is taken for the family. */
  ttl: number;
  /** The option taken when the card times out. */
  fallback: string;
  answer: (s: GameState, option: string, r: () => number) => CardOutcome;
}
export interface CardState { open: string | null; openedAt: number; done: string[]; last?: CardOutcome & { card: string } }
export const cardState = (s: GameState): CardState => kfx<CardState>(s, 'cards', () => ({ open: null, openedAt: 0, done: [] }));

/** Pay a card cost: checking first, then the cash in the safe. False if the family can't. */
export function payCost(s: GameState, usd: number): boolean {
  if (usd <= 0) return true;
  if (s.money >= usd) { s.money -= usd; return true; }
  if ((s.fin?.cash ?? 0) >= usd) { s.fin.cash -= usd; return true; }
  return false;
}

/** Bring up the first card of `defs` that is due and not yet seen (one at a time). Returns log lines. */
export function offerCards(s: GameState, defs: readonly TechCard[]): string[] {
  const cs = cardState(s);
  if (cs.open) return [];
  for (const c of defs) {
    if (cs.done.includes(c.id) || !c.due(s)) continue;
    cs.open = c.id; cs.openedAt = s.clock.t;
    return [`A decision waits: ${c.title}.`];
  }
  return [];
}

/** Answer the open card of `defs`; the outcome is also stored for the screen. */
export function answerFrom(s: GameState, defs: readonly TechCard[], option: string, r: () => number): CardOutcome | string {
  const cs = cardState(s);
  const c = defs.find(x => x.id === cs.open);
  if (!c) return 'no decision is waiting';
  const o = c.options(s).find(x => x.id === option);
  if (!o) return 'not an option';
  if (o.locked) return o.locked;
  if (o.cost && !payCost(s, o.cost)) return `needs $${o.cost.toLocaleString('en-US')}`;
  const out = c.answer(s, option, r);
  cs.open = null; cs.done.push(c.id); cs.last = { ...out, card: c.id };
  return out;
}

/** A card nobody answered in `ttl` days is settled by its fallback. */
export function expireCards(s: GameState, defs: readonly TechCard[], r: () => number): string[] {
  const cs = cardState(s);
  const c = defs.find(x => x.id === cs.open);
  if (!c || s.clock.t - cs.openedAt < c.ttl) return [];
  const out = answerFrom(s, defs, c.fallback, r);
  return typeof out === 'string' ? (cs.open = null, cs.done.push(c.id), []) : [`Nobody decided, so ${c.title.toLowerCase()} settled itself: ${out.title.toLowerCase()}.`, ...out.lines];
}

// ── signature goals ────────────────────────────────────────────────────────────────────────────────

/** One step of a kind's signature first-week goal chain (data for the felt layer; `done` reads the live state). */
export interface Goal { id: string; text: string; by: number; done: (s: GameState) => boolean }

export const outcome = (title: string, text: string, tone: CardOutcome['tone'] = 'mixed', lines: string[] = []): CardOutcome => ({ title, text, tone, lines: lines.length ? lines : [text] });
