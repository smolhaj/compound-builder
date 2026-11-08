/**
 * The man under the white flag: what the player can do (user answer: accept the terms, refuse and fight, counter-offer or bluff, or shoot the envoy).
 * Pure and seeded; sim/encounters.ts resolves the stances `flag_pay`, `flag_pass`, `flag_bluff`, `flag_shoot` and a plain `defend` (refuse) with these.
 *
 *   flag_pay    accept the toll: the crew takes what it asked for and goes (sim/encounters.ts).
 *   flag_pass   accept the passage a disciplined crew asked for: no cost, no fight.
 *   counter     the existing talk (sim/negotiation.ts) is the counter-offer; `flag_bluff` is a bluff: "we are many, we are armed, we are ready". The odds
 *               are the best talker in the house, how hard the place looks (walls and guns) and how many fighters stand at the gate, against how hungry,
 *               organized and proud the crew is. A bluff that is called leaves a crew that is angrier.
 *   flag_shoot  shoot the envoy: it costs humanity (a man under a flag), takes one off the crew, and the crew is nearly always enraged; a few run.
 *   refuse      fight on: the crew is angrier or readier about four times in ten.
 * An angry crew is harder to break (`BattleOptions.angry`).
 */
import type { CrewKind } from './surrender';

export const SHOOT_ENVOY_HUMANITY = 10;

export interface BluffCtx { negotiator: number; fortress: number; fighters: number; armed: boolean; kind: CrewKind; temper: 'desperate' | 'hard' | 'savage'; talk: number }
/** The chance a bluff makes the crew back off. Never above 0.8, never below 0.04. */
export function bluffOdds(c: BluffCtx): number {
  const proud = c.kind === 'gang' ? 0.7 : c.kind === 'militia' || c.kind === 'patrol' ? 0.9 : 1;
  const hungry = c.temper === 'desperate' ? 0.8 : 1;   // men who came for food do not back off for talk
  const p = (0.12 + c.negotiator * 0.045 + c.fortress / 100 * 0.3 + Math.min(4, c.fighters) * 0.04 + (c.armed ? 0.1 : -0.05)) * proud * hungry * (c.temper === 'savage' ? 0 : 1) * c.talk;
  return Math.max(c.temper === 'savage' ? 0 : 0.04, Math.min(0.8, p));
}

export interface EnvoyOutcome { enraged: boolean; flees: boolean }
/** What the crew does when its envoy is shot: nearly always the fight is on and hotter; a disciplined or desperate crew sometimes runs. */
export function shootEnvoy(c: { kind: CrewKind; temper: 'desperate' | 'hard' | 'savage'; fortress: number }, r: () => number): EnvoyOutcome {
  if (c.temper === 'savage' || c.kind === 'gang' || c.kind === 'horde') return { enraged: true, flees: false };
  const flee = (c.temper === 'desperate' ? 0.22 : 0.1) + c.fortress / 100 * 0.12;
  const u = r();
  return { flees: u < flee, enraged: u >= flee && r() < 0.85 };
}

/** Refused the flag: the crew comes back angrier or readier. */
export const refusedAngry = (temper: 'desperate' | 'hard' | 'savage', r: () => number): boolean => r() < (temper === 'desperate' ? 0.3 : temper === 'hard' ? 0.45 : 0.55);

/** The passage a disciplined crew asks for: only militia and patrols. */
export const asksPassage = (kind: CrewKind): boolean => kind === 'militia' || kind === 'patrol';
