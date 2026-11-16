/**
 * First-contact deterrence (docs/DECISIONS.md "Wealth and defense"): what a compound's money does BEFORE and at the opening of a fight, not
 * only inside it. Contract guards, trained dogs on post, powered cameras, the wall's tier, towers, signs and armed hands add up to a 0-0.9
 * score. It does two things, both read by sim/encounters.ts:
 *
 *   turn back   the chance a crew (or the scouts ahead of it) sees the place is not worth it and goes, with no shot fired. Scales with the
 *               score and with who they are: hungry looters and refugees go, a savage crew or a horde nearly never does, and an angry crew
 *               (an envoy shot, a demand refused) never does.
 *   nerve       in the fight itself, raiders break after fewer losses (battle.ts `deter`), so a defended place ends fights early.
 *
 * Pure (tested in sim/deterrence.test.ts). A poor family's fence and two adults come to about 0.1; a rich compound (three guards, two dogs, cameras,
 * a steel wall, two towers) to 0.8 or more.
 */
import type { GameState } from './state';
import { isFinished } from './construction';
import { daysOfFood } from './needs';
import { guardCount } from './guards';
import { dogWatch } from './pets';
import { towersBuilt } from './towers';
import { powered } from './gear';
import type { Posture } from './encounters';
import type { EncounterKind } from './encounters';
import type { RaiderTemper } from './battle';

export const DETER = { GUARD: 12, DOG: 8, CAMERA: 6, THERMAL: 9, WALL: 0.35, TOWER: 8, TOWER_MAX: 4, SIGNS: 0.5, SIGNS_MAX: 6, HAND: 2, HANDS_MAX: 6, ARMED: 4, FULL: 110, CAP: 0.9 } as const;

export interface DeterParts { guards: number; dogs: number; cameras: number; wall: number; towers: number; signs: number; hands: number }
export interface Deterrence { score: number; points: number; parts: DeterParts; lines: string[] }

/** The deterrence of this place as it stands (the posture is passed in so one call per gate reads the same numbers as the rest). */
export function deterrence(s: GameState, p: Posture): Deterrence {
  const n = (m: 'cameras' | 'thermal_cam') => Math.floor(s.stock[m] ?? 0);
  const on = powered(s);
  const guards = guardCount(s), dogs = dogWatch(s).onPost;
  const cams = on ? Math.min(3, n('cameras')) : 0, therm = on ? Math.min(2, n('thermal_cam')) : 0;
  const towers = Math.min(DETER.TOWER_MAX, towersBuilt(s).length);
  const parts: DeterParts = {
    guards: guards * DETER.GUARD, dogs: dogs * DETER.DOG, cameras: cams * DETER.CAMERA + therm * DETER.THERMAL,
    wall: p.barrier * DETER.WALL, towers: towers * DETER.TOWER, signs: Math.min(DETER.SIGNS_MAX, (p.signs ?? 0) * DETER.SIGNS),
    hands: Math.min(DETER.HANDS_MAX, p.fighters) * DETER.HAND + (p.armed ? DETER.ARMED : 0),
  };
  const points = Object.values(parts).reduce((a, v) => a + v, 0);
  const lines: string[] = [];
  if (guards) lines.push(`${guards} contract ${guards === 1 ? 'guard' : 'guards'}`);
  if (dogs) lines.push(`${dogs} guard ${dogs === 1 ? 'dog' : 'dogs'}`);
  if (cams + therm) lines.push(`${cams + therm} powered ${cams + therm === 1 ? 'camera' : 'cameras'}`);
  if (towers) lines.push(`${towers} ${towers === 1 ? 'tower' : 'towers'}`);
  if (p.barrier >= 40) lines.push(p.barrier >= 70 ? 'a hard wall' : 'a wall');
  return { score: Math.min(DETER.CAP, points / DETER.FULL), points, parts, lines };
}

/** How readily each kind of crew is put off by a hard-looking place (1: as readily as the score says). */
const KIND_K: Partial<Record<EncounterKind, number>> = { looters: 0.8, refugees: 0.8, gang: 0.6, requisition: 0.5, militia: 0.5, patrol: 0.45, tunnelers: 0, horde: 0.1 };
export function turnBackChance(deter: number, e: { kind: EncounterKind; temper?: RaiderTemper; size: number; back?: boolean; scouted?: string }, angry = false): number {
  if (angry) return 0;
  const k = KIND_K[e.kind] ?? 0.4;
  const t = e.temper === 'savage' ? 0.25 : e.temper === 'hard' ? 0.75 : 1;
  const crowd = Math.max(0.5, 1 - Math.max(0, e.size - 4) * 0.05);   // a big crew is bolder
  const known = (e.back ? 0.6 : 1) * (e.scouted ? 0.7 : 1);          // they know the place, or were told how it lies
  return Math.max(0, Math.min(0.7, deter * k * t * crowd * known));
}

/** In the fight: the share of the usual loss limit at which raiders break (1: no change). A fully defended place breaks a crew at 55 % of it. */
export const nerveK = (deter: number): number => 1 - 0.5 * Math.max(0, Math.min(1, deter));

/** One line for the gate card: what the place's deterrence does. Empty when it does nothing worth saying. */
export function deterLine(d: Deterrence, turnBack: number): string {
  if (d.score < 0.12) return '';
  const pct = Math.round(turnBack * 100);
  const what = d.lines.length ? d.lines.join(', ') : 'the look of the place';
  return `${what}: about ${pct >= 5 ? `${pct} in 100` : 'one in twenty'} turn back before a shot, and the rest break sooner.`;
}

/**
 * How much there is to find (balance: hiding was wealth-blind, a stocked compound hid as safely as a bare one). A crew that finds a rich, stocked
 * place hunts it harder and carries off more, so a hide is worse the more you have: up to LOOT.CAP points on the house find chance (percentage
 * points), half again on the search below, and `lootK` on the share carried off.
 */
export const LOOT = { FOOD_DAYS: 60, FOOD_MAX: 8, BUILT_PER: 4, BUILT_MAX: 6, GUNS_PER: 2, GUNS_MAX: 4, CAP: 18, STRIP: 0.5 } as const;
export function lootPoints(s: GameState): number {
  const built = s.structures.filter(st => isFinished(st) && !st.kind.startsWith('bunker_')).length;
  const guns = s.armory?.guns.length ?? 0;
  return Math.min(LOOT.CAP, Math.min(LOOT.FOOD_MAX, daysOfFood(s) / LOOT.FOOD_DAYS) + Math.min(LOOT.BUILT_MAX, built / LOOT.BUILT_PER) + Math.min(LOOT.GUNS_MAX, guns / LOOT.GUNS_PER));
}
/** The share of what a crew carries off, times this (1 for a bare place, up to 1 + STRIP * full). */
export const lootK = (s: GameState): number => 1 + LOOT.STRIP * lootPoints(s) / LOOT.CAP;
