/**
 * FL6: a played run of one kind for the felt checklist (docs/FELT_LAYER.md section 8, the items that need a played state) and for the live
 * QA harness (`scripts/feltShots.mjs` imports this through Vite). Pure over the real sim: new game, a ham set, the kind with no warning, then
 * the daily step to day 30, noting what the player would have been shown. No DOM, no randomness beyond the seed.
 */
import { triggerDisaster, type DisasterKind } from '../disaster';
import { columnsOf } from '../disasterFx';
import { step } from '../engine';
import { newGame, type GameState } from '../state';
import { feltChain } from './goalLib';
import { hitFor, duration } from './hitMoment';
import { feltMarks } from './marks';
import { feltSpec } from './registry';
import type { FeltKind } from './types';

export interface PlayedLog {
  kind: FeltKind;
  triggerable: boolean;
  /** Distinct world mark kinds at day 7 and day 30 (high tier). */
  marks7: string[]; marks30: string[];
  /** Ids of decision cards raised (answered or pending) in 30 days. */
  cards: string[];
  /** Goal chain length and the first step's title, at day 1. */
  goalSteps: number; goalHead: string;
  /** Distinct radio lines heard in 30 days (by text). */
  radio: string[];
  /** Teeth columns. */
  columns: number;
  /** Hit sequence: beats, seconds, title. */
  hit: { beats: number; seconds: number; title: string } | null;
  /** The last game day actually reached. */
  reached: number;
}

export function playKind(kind: FeltKind, days = 30, seed = 7): PlayedLog {
  const log: PlayedLog = { kind, triggerable: false, marks7: [], marks30: [], cards: [], goalSteps: 0, goalHead: '', radio: [], columns: 0, hit: null, reached: 0 };
  const h = hitFor(kind);
  if (h) log.hit = { beats: h.beats.length, seconds: duration(h), title: h.title };
  try { log.columns = columnsOf(kind as DisasterKind).length; } catch { log.columns = 0; }
  let g: GameState = newGame(seed);
  try { g.disaster.mode = 'god'; triggerDisaster(g.disaster, g.clock.t, kind as DisasterKind, g.seed, 0); } catch { return log; }
  if (g.disaster.kind !== kind) return log;
  log.triggerable = true;
  g.stock.sw_radio = 1;
  for (const st of g.structures) { st.stage = 99; st.finishedAt = g.clock.t; }
  const spec = feltSpec(kind), seen = new Set<string>(), heard = new Set<string>();
  const kindsAt = (day: number): string[] => [...new Set(feltMarks(g, day, spec, 'high').map(m => m.kind))].sort();
  let n = 0, goalDone = false;
  while (g.clock.t - g.disaster.hitAt < days && n++ < days * 8) {
    g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
    g = step(g, 0.25);
    if (g.ending && !g.ending.continued) break;
    const f = g.disaster.fx?.felt as { cards?: { done: Record<string, string>; pending?: { id: string } } } | undefined;
    for (const id of Object.keys(f?.cards?.done ?? {})) seen.add(id);
    if (f?.cards?.pending) seen.add(f.cards.pending.id);
    for (const x of g.radio?.heard ?? []) heard.add(x.text);
    const day = g.clock.t - g.disaster.hitAt;
    if (!goalDone && day >= 1) { goalDone = true; const c = feltChain(g); log.goalSteps = c?.goals.length ?? 0; log.goalHead = c?.goals[0]?.title ?? ''; }
    if (!log.marks7.length && day >= 7) log.marks7 = kindsAt(day);
  }
  log.reached = Math.floor(g.clock.t - g.disaster.hitAt);
  log.marks30 = kindsAt(Math.max(30, g.clock.t - g.disaster.hitAt));
  if (!log.marks7.length) log.marks7 = kindsAt(7);
  log.cards = [...seen];
  log.radio = [...heard];
  return log;
}
