/**
 * homeSafety: how safe the compound feels right now, one number (0 = under the gun, 1 = at peace).
 *
 * Shared by the contrast grade (oasisGrade.ts: warm inside held walls, cold and ashy outside), the warm interiors and the family
 * rituals, so every layer agrees on when the place feels like an oasis. Pure: no three.js, no store. API (kept small and stable):
 *
 *   homeSafety(input) -> { level, target, reasons }
 *   homeSafetyInput(game, live) -> HomeSafetyInput     (reads the real sim state; live = what only the renderer knows)
 *   collapseProgress(game) -> 0..1                     (how far the world outside has fallen)
 *
 * `level` is smoothed: pass last frame's `level` as `prev` and the frame's seconds as `dt`. It drops fast (about 1 s) when a breach opens or a
 * raid arrives and recovers slowly (about 25 s) as repairs happen. Omit `prev` to get the target unsmoothed.
 * Disaster-free peacetime always reads 1 (nothing to be safe from), so nothing looks different before the collapse.
 */
import { tracksAt, tension, TRACKS } from '../../sim/disaster';
import { postureOf } from '../../sim/encounters';
import { openDamage } from '../../sim/raidDamage';
import { isHome } from '../../sim/blueprints';
import { isFinished } from '../../sim/construction';
import { openCaptives } from '../../sim/rescue';
import type { GameState } from '../../sim/state';

export type RaidState = 'none' | 'knock' | 'attack';

export interface HomeSafetyInput {
  /** 0-1: how well the walls hold the line (sim posture barrier / 100). */
  perimeter: number;
  /** Open breaches plus broken gates (raid damage not yet mended) and fires burning. */
  breaches: number;
  /** A stranger at the gate (knock) or a fight on (attack). */
  raid: RaidState;
  /** A home on the place has power / heat. */
  power: boolean;
  heat: boolean;
  /** 0-1: how far the world outside has fallen (collapseProgress). */
  collapse: number;
  /** People hurt (health under 45), people taken or missing, and everyone alive. */
  hurt: number;
  missing: number;
  people: number;
  /** Last frame's level and the frame's seconds, to smooth. */
  prev?: number;
  dt?: number;
}

export interface HomeSafety {
  /** The smoothed level (what to draw with). */
  level: number;
  /** Where the level is heading. */
  target: number;
  /** Why it is low (worst first), or what holds when it is high. */
  reasons: string[];
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** Seconds to fall and to recover (time constants of the smoothing). */
export const FALL_TAU = 1.2;
export const RISE_TAU = 22;

/** The level the inputs call for, before smoothing, and the reasons. */
export function safetyTarget(i: HomeSafetyInput): { target: number; reasons: string[] } {
  const c = clamp01(i.collapse);
  const parts: Array<[number, string]> = [];
  parts.push([0.5 * c * (1 - clamp01(i.perimeter)), 'The line is open: the walls are thin or missing']);
  parts.push([Math.min(0.5, 0.3 * i.breaches), 'A breach stands open']);
  parts.push([i.raid === 'attack' ? 0.45 : i.raid === 'knock' ? 0.12 : 0, i.raid === 'attack' ? 'Raiders are at the walls' : 'A stranger is at the gate']);
  parts.push([i.power ? 0 : 0.1 * c, 'The power is out']);
  parts.push([i.heat ? 0 : 0.12 * c, 'There is no heat']);
  const share = i.people > 0 ? i.hurt / i.people : 0;
  parts.push([Math.min(0.3, 0.25 * share + 0.12 * i.missing), i.missing > 0 ? 'Someone is missing' : 'Someone is hurt']);
  let target = 1;
  for (const [d] of parts) target -= d;
  target = clamp01(target);
  const reasons = parts.filter(p => p[0] > 0.02).sort((a, b) => b[0] - a[0]).map(p => p[1]);
  if (!reasons.length && c > 0.15 && target > 0.85) reasons.push('The walls hold and the lights are on');
  return { target, reasons };
}

/** Level now: the target, smoothed from `prev` (fast down, slow up). */
export function homeSafety(i: HomeSafetyInput): HomeSafety {
  const { target, reasons } = safetyTarget(i);
  if (i.prev === undefined || i.dt === undefined) return { level: target, target, reasons };
  const tau = target < i.prev ? FALL_TAU : RISE_TAU;
  const k = 1 - Math.exp(-Math.max(0, i.dt) / tau);
  const level = clamp01(i.prev + (target - i.prev) * k);
  return { level, target, reasons };
}

/** 0-1: how far the world has fallen: the warning rises to 0.3, then the tracks (grid, fuel, stores, law ...) falling. */
export function collapseProgress(s: GameState): number {
  const d = s.disaster, t = s.clock.t;
  if (!d.kind || t < d.warnAt) return 0;
  const warn = 0.3 * tension(d, t);
  if (t < d.hitAt) return warn;
  const lv = tracksAt(d, t);
  let sum = 0;
  for (const k of TRACKS) sum += 1 - lv[k];
  return clamp01(Math.max(0.3, 0.3 + 0.7 * (sum / TRACKS.length) / 0.6));
}

/** What the renderer knows and the state does not. */
export interface LiveSafety { raid?: RaidState }

/** The input for the real game state. `postureOf` walks the property line, so call this about once a second, not every frame. */
export function homeSafetyInput(s: GameState, live: LiveSafety = {}): HomeSafetyInput {
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind));
  const lit = s.utilities.lit;
  let hurt = 0, alive = 0;
  s.people.forEach((_, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null) return;
    alive++;
    if (n.health < 45) hurt++;
  });
  const raid: RaidState = live.raid ?? (s.gate.pending ? 'knock' : 'none');
  return {
    perimeter: clamp01(postureOf(s).barrier / 100),
    breaches: openDamage(s).filter(d => d.kind !== 'burn').length + (s.raidFires?.length ?? 0),
    raid,
    power: homes.length === 0 || homes.some(h => lit.includes(h.id)),
    heat: (s.heat.cold ?? -1) < 0,
    collapse: collapseProgress(s),
    hurt, missing: openCaptives(s).length, people: alive,
  };
}
