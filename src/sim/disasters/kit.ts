/**
 * Small shared helpers for the WP10 kind modules (satellite_loss, oil_shock, reactor_meltdown, global_famine, water_war, cult_takeover,
 * mass_exodus). Pure; nothing here names a kind.
 */
import type { GameState } from '../state';
import type { FxCtx } from '../disasterFx';
import { tension } from '../disaster';

/** Days since the hit (negative before it). */
export const since = (s: GameState): number => s.clock.t - s.disaster.hitAt;
/** 0 to 1 through the warning signs. */
export const warnFrac = (s: GameState): number => tension(s.disaster, s.clock.t);
export const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** How hard a hit bites: Cozy gentler, Hardcore harsher (the one knob every kind reads, so Standard is the intended game). */
export const sev = (s: GameState): number => ({ cozy: 0.6, standard: 1, hardcore: 1.4 })[s.disaster.difficulty ?? 'standard'];
/** The share of a stock a service-less world has left: 1 stores and deliveries up, 0 both gone. */
export const shelf = (s: GameState): number => Math.min(s.disaster.tracks.stores, s.disaster.tracks.deliveries);
/** The living members of the household. */
export const living = (s: GameState) => s.people.map((p, i) => ({ p, ps: s.personState[i] })).filter(x => x.ps && x.ps.needs.died == null);

/** A bulletin line: [first day, last day, text, tone]. */
export type Line = [number, number, string, 0 | 1 | 2 | 3];
/** One of the lines whose days include today, picked with the dice (null when none). */
export function bulletin(lines: Line[], ctx: FxCtx): { text: string; tone: 0 | 1 | 2 | 3 } | null {
  const ok = lines.filter(l => ctx.day >= l[0] && ctx.day <= l[1]);
  if (!ok.length) return null;
  const l = ok[Math.floor(ctx.r() * ok.length)];
  return { text: l[2], tone: l[3] };
}

/** Take a share (0 to 1) of each good from the stock; returns what was taken in total units. */
export function takeShare(s: GameState, goods: Array<'staples' | 'canned' | 'fresh' | 'frozen' | 'fuel'>, share: number): number {
  let n = 0;
  for (const g of goods) { const have = s.stock[g] ?? 0, cut = have * share; s.stock[g] = have - cut; n += cut; }
  return n;
}

/** The neighbors still at home. */
export const homeNeighbors = (s: GameState) => s.neighbors.filter(n => n.status === 'home');
