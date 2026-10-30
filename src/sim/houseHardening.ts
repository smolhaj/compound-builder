/**
 * Hardening the house (GDS §10: steel doors and frames, window bars and shutters, a safe room, ballistic panels): three layers, each a chain of
 * tiers the family can climb. Like the rest of the armory (sim/gear.ts) it is goods: what is in the stockpile is fitted. Pure.
 *
 *   doors    steel entry door (+5 each) -> security door (+9 each); the two best doors count.
 *   windows  bars (+8) -> steel roll-down shutters (+14, and wildfire embers stay out) -> ballistic panels (+22, rounds lose their punch through the glass).
 *   safe     safe room -> hardened safe room (ballistic lining, a vault door, filtered air, water and a bunk).
 *
 * `houseBarrier` feeds the place's wall strength (sim/gear.ts -> encounters -> the gate card and the battle); `emberK` feeds the wildfire front
 * (sim/effects.ts); `houseCoverK` is the cover of the house as a firing position (a one-line read for the battle sim).
 * An upgrade swaps one unit of the old tier for the next: doors and the safe room trade in at half price, the window layers go over what is there.
 */
import type { GameState } from './state';
import { MATERIALS, type MaterialId } from './materials';

export type HardenLayer = 'doors' | 'windows' | 'safe';

export interface HardenTier {
  good: MaterialId;
  /** Barrier points: per door for the doors, flat for the windows, 0 for the safe room. */
  barrier: number;
  /** Share of wildfire embers that still get in (1 = no help). */
  ember: number;
  /** The house as a firing position: hits that land (1 = bare walls). */
  cover: number;
  /** One line: what it does. */
  does: string;
  /** Goes over the tier below (it stays) instead of replacing one unit of it. */
  over: boolean;
}

export const LAYERS: Record<HardenLayer, { name: string; max: number; tiers: HardenTier[] }> = {
  doors: { name: 'Doors', max: 2, tiers: [
    { good: 'steel_door', barrier: 5, ember: 1, cover: 1, does: 'a steel door in a steel frame: +5 wall strength each (the two best doors count)', over: false },
    { good: 'security_door', barrier: 9, ember: 1, cover: 1, does: 'deadbolts into the frame, welded strike plate, pinned hinges: +9 wall strength each', over: false },
  ] },
  windows: { name: 'Windows', max: 1, tiers: [
    { good: 'window_bars', barrier: 8, ember: 1, cover: 0.8, does: 'bars on every window: +8 wall strength, the house is a better firing position', over: false },
    { good: 'window_shutters', barrier: 14, ember: 0.55, cover: 0.74, does: 'roll-down steel shutters over the bars: +14 wall strength, and wildfire embers stay out of the house', over: true },
    { good: 'ballistic_panels', barrier: 22, ember: 0.5, cover: 0.6, does: 'level III panels behind the glass: +22 wall strength, rifle rounds lose most of their punch through a window', over: true },
  ] },
  safe: { name: 'Safe room', max: 1, tiers: [
    { good: 'safe_room', barrier: 0, ember: 1, cover: 1, does: 'a reinforced interior room: the family hides in it like a bunker', over: false },
    { good: 'safe_room_hardened', barrier: 0, ember: 1, cover: 1, does: 'poured walls, ballistic lining, a vault door, filtered air, water and a bunk: it holds through a long siege and a fire', over: false },
  ] },
};

export const HARDEN_LAYERS: readonly HardenLayer[] = ['doors', 'windows', 'safe'];

const n = (s: GameState, m: MaterialId): number => Math.floor(s.stock[m] ?? 0);

/** The highest tier fitted in a layer, 0 for none, 1.. for the tier (1-based). */
export function layerTier(s: GameState, layer: HardenLayer): number {
  const t = LAYERS[layer].tiers;
  for (let i = t.length - 1; i >= 0; i--) if (n(s, t[i].good) > 0) return i + 1;
  return 0;
}

/** Wall strength the doors and windows add (the sandbags are counted in sim/gear.ts). */
export function houseBarrier(s: GameState): number {
  const d = LAYERS.doors;
  const doors: number[] = [];
  for (const t of d.tiers) for (let i = 0; i < n(s, t.good); i++) doors.push(t.barrier);
  doors.sort((a, b) => b - a);
  const door = doors.slice(0, d.max).reduce((a, b) => a + b, 0);
  const w = layerTier(s, 'windows');
  return door + (w ? LAYERS.windows.tiers[w - 1].barrier : 0);
}

/** Share of wildfire embers that still reach a house (shutters and panels keep them out). */
export const emberK = (s: GameState): number => { const w = layerTier(s, 'windows'); return w ? LAYERS.windows.tiers[w - 1].ember : 1; };

/** The house as a firing position: 1 bare walls, lower is better cover. */
export const houseCoverK = (s: GameState): number => { const w = layerTier(s, 'windows'); return w ? LAYERS.windows.tiers[w - 1].cover : 1; };

export const hasSafeRoom = (s: GameState): boolean => layerTier(s, 'safe') > 0;
export const hardenedSafeRoom = (s: GameState): boolean => layerTier(s, 'safe') >= 2;

export interface UpgradeQuote { layer: HardenLayer; from: HardenTier | null; to: HardenTier; cost: number; credit: number; problem: string | null }

/** The next tier of a layer, what it costs now, and why it cannot be fitted yet (null: it can). */
export function upgradeQuote(s: GameState, layer: HardenLayer): UpgradeQuote | null {
  const L = LAYERS[layer], have = layerTier(s, layer);
  if (have >= L.tiers.length) return null;
  const to = L.tiers[have], from = have ? L.tiers[have - 1] : null;
  const credit = from && !to.over ? Math.round((MATERIALS[from.good].price ?? 0) * 0.5) : 0;
  const cost = Math.max(0, (MATERIALS[to.good].price ?? 0) - credit);
  let problem: string | null = null;
  if (s.disaster.tracks.stores < 0.5) problem = 'no installer and no stock: the stores are closed';
  else if (s.money < cost) problem = 'not enough money';
  return { layer, from, to, cost, credit, problem };
}

/** Fit the next tier: pay the difference, swap one unit of the old one for the new (the window layers add over what is there). */
export function upgradeLayer(s: GameState, layer: HardenLayer): string | null {
  const q = upgradeQuote(s, layer);
  if (!q) return 'already at the top tier';
  if (q.problem) return q.problem;
  s.money -= q.cost;
  if (q.from && !q.to.over) s.stock[q.from.good] = Math.max(0, n(s, q.from.good) - 1);
  s.stock[q.to.good] = n(s, q.to.good) + 1;
  return null;
}

/** One line for the Defense tab. */
export function layerLine(s: GameState, layer: HardenLayer): string {
  const t = layerTier(s, layer);
  return t ? `${MATERIALS[LAYERS[layer].tiers[t - 1].good].name} (tier ${t} of ${LAYERS[layer].tiers.length})` : 'none';
}
