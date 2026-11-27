/**
 * When a sealed dome's crew brings its heavy weapons (presentation only: no sim rule, no state, nothing saved). The Arcology is armored: whatever the crew
 * hits it with, it is unmarked, the household stays inside calm and unarmed, and the raiders stay outside. This module only decides WHEN each weapon is used,
 * from where, at what point of the shell, and WHAT the crew says after it, in the order their disbelief grows (raidLinesDome.ts HEAVY_ESCALATION).
 * Pure and seeded; sim/dome/domeBeats.ts turns the plan into `heavy` and `say` events and game/battle/HeavyFx.ts draws them.
 */
import { mulberry32 } from '../rng';
import { HEAVY_BEAT, HEAVY_ESCALATION, type HeavyCtx, type HeavyWeapon } from '../raidLinesDome';

/** QA override (like breachOptions.force): the weapons a crew brings, in order. Unset in play. */
export const heavyOptions: { force?: HeavyWeapon[] } = {};

/** The order a crew escalates in: the light weapons first, the truck bomb last. */
export const HEAVY_ORDER: readonly HeavyWeapon[] = ['hmg', 'amr', 'rpg', 'mortar', 'charge', 'tank', 'thermite', 'vbied'];

/** Where each weapon stands from the shell (world units, 1 = 20 ft), how high on the shell it lands, how long a prop (tank, truck) stays, and whether it is aimed at the gate. */
export const HEAVY_SPOT: Record<HeavyWeapon, { dist: number; h: number; gate: boolean; hold: number }> = {
  hmg: { dist: 7, h: 1.3, gate: false, hold: 0 },
  amr: { dist: 8, h: 0.5, gate: false, hold: 0 },
  rpg: { dist: 7, h: 1.5, gate: false, hold: 0 },
  mortar: { dist: 9, h: 0.3, gate: false, hold: 0 },
  charge: { dist: 5, h: 0.35, gate: true, hold: 0 },
  tank: { dist: 10, h: 1.7, gate: false, hold: 9 },
  thermite: { dist: 2.0, h: 0.5, gate: false, hold: 0 },
  vbied: { dist: 3, h: 0.5, gate: true, hold: 1.6 },
};

/** The fewest seconds between two heavy lines on the screen, so each can be read. */
export const MIN_LINE_GAP = 1.7;

export interface HeavyInput {
  seed: number;
  /** Crew size (raiders), and the temper's name: a desperate crew has less to bring. */
  crew: number;
  desperate: boolean;
  /** The window the crew has at the shell (seconds into the fight). */
  from: number;
  to: number;
  /** The fight's total length: no line is placed past it. */
  duration: number;
}
export interface HeavyStep {
  t: number;
  weapon: HeavyWeapon;
  /** Offset (radians) from the crew's side of the shell; 0 for a weapon aimed at the gate. */
  offset: number;
  /** The index of the crew member who works it (taken modulo the crew). */
  slot: number;
}
export type Speaker = 'worker' | 'young' | 'leader' | 'household';
export interface HeavyLine { t: number; ctx: HeavyCtx | 'dome_react_heavy'; who: Speaker; /** the strike this follows (beats), or the escalation step (0..5). */ of: number }
export interface HeavyPlan { steps: HeavyStep[]; lines: HeavyLine[] }

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** How many weapons: a bigger crew has more to bring; a desperate one, one fewer. At least two, and the window decides the most. */
export function heavyCount(crew: number, desperate: boolean, window: number): number {
  const base = crew <= 4 ? 3 : crew >= 10 ? 6 : 4;
  return Math.max(2, Math.min(base - (desperate ? 1 : 0), Math.floor(window / 3.4) + 1));
}

/** Choose `k` weapons of the order (seeded; the biggest always stays, the order is kept). */
export function chooseWeapons(k: number, seed: number): HeavyWeapon[] {
  const rnd = mulberry32(seed * 6151 + 29), list = [...HEAVY_ORDER];
  while (list.length > k) list.splice(Math.floor(rnd() * (list.length - 1)), 1);
  return list;
}

export function planHeavyFire(o: HeavyInput): HeavyPlan | null {
  const window = o.to - o.from;
  if (window < 3.4) return null;
  const weapons = heavyOptions.force?.length ? [...heavyOptions.force] : chooseWeapons(heavyCount(o.crew, o.desperate, window), o.seed);
  const k = weapons.length, gap = k > 1 ? Math.max(3.4, window / (k - 1)) : 0, rnd = mulberry32(o.seed * 7919 + 3);
  const steps: HeavyStep[] = weapons.map((weapon, i) => ({
    t: r2(o.from + Math.min(window, i * Math.min(gap, window / Math.max(1, k - 1)))),
    weapon, offset: HEAVY_SPOT[weapon].gate ? 0 : r2((i % 2 ? -1 : 1) * (0.35 + 0.3 * rnd()) * (1 + Math.floor(i / 2) * 0.6)), slot: i + Math.floor(rnd() * 3),
  }));
  // the words: after each strike its own beat; between them the crew's disbelief grows step by step (disbelief, a young one asking, never seen it, a curse, the leader quiet, someone says leave)
  const lines: HeavyLine[] = [];
  steps.forEach((s, i) => lines.push({ t: s.t + 1.6, ctx: HEAVY_BEAT[s.weapon], who: s.weapon === 'tank' || s.weapon === 'vbied' ? 'leader' : 'worker', of: i }));
  const first = steps[0].t + 2.6, last = Math.max(first + 3, o.to - 0.5);
  const whoOf: Record<string, Speaker> = { dome_young_asks: 'young', dome_quiet: 'leader' };
  HEAVY_ESCALATION.forEach((ctx, j) => lines.push({ t: r2(first + (last - first) * (j / (HEAVY_ESCALATION.length - 1))), ctx, who: whoOf[ctx] ?? 'worker', of: j }));
  // the household's calm reaction after every other strike, and after the last
  steps.forEach((s, i) => { if (i % 2 === 1 || i === steps.length - 1) lines.push({ t: s.t + 3.6, ctx: 'dome_react_heavy', who: 'household', of: i }); });
  // spread: nobody is talked over, and the escalation keeps its order
  lines.sort((a, b) => a.t - b.t || (a.ctx === 'dome_react_heavy' ? 1 : 0) - (b.ctx === 'dome_react_heavy' ? 1 : 0));
  let prev = -Infinity;
  const placed: HeavyLine[] = [];
  for (const l of lines) {
    const t = Math.max(l.t, prev + MIN_LINE_GAP);
    if (t > o.duration - 0.8) continue;
    placed.push({ ...l, t: r2(t) }); prev = t;
  }
  return { steps, lines: placed };
}
