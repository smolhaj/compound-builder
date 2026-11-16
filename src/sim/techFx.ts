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

// ── decision cards (shown by the felt layer: sim/techFelt.ts adapts them to sim/felt DecisionCards) ─────────

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
// ── signature goals ────────────────────────────────────────────────────────────────────────────────

/** One step of a kind's signature first-week goal chain (data for the felt layer; `done` reads the live state). */
export interface Goal { id: string; text: string; by: number; done: (s: GameState) => boolean }

export const outcome = (title: string, text: string, tone: CardOutcome['tone'] = 'mixed', lines: string[] = []): CardOutcome => ({ title, text, tone, lines: lines.length ? lines : [text] });
