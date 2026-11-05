/**
 * Lead time on the road for the people who come to the gate (docs/DECISIONS.md, "Encounter lead time").
 * A raid already waits for its hour in `gate.incoming` while the crew is seen coming up the county road. Everyone else the day change
 * rolls (refugees, a trader, strangers, kin, neighbors asking for shelter) used to appear as a card at midnight. They now take the same
 * road: the roll holds them in `gate.incoming` for an approach time (on foot slower than driving), the road shows the real party (heads,
 * vehicle, cart), and the card appears when they reach the gate. Same encounter, same headcount, same stances, same results; only WHEN.
 *
 * Pure and deterministic: the approach time is a function of (seed, encounter), drawn from its own generator, so the sim's rolls are
 * not shifted. Nothing here is a detection mechanic: the family does not know they are coming (no alarm, no watch is posted), the
 * road simply shows it.
 */
import { mulberry32 } from './rng';
import type { GameState } from './state';
import type { Encounter } from './encounters';
import { hasCutscene } from './siege';
import { nobodyHome } from './orphans';
import { emptyNow } from './weekender';
import { partyForEncounter } from './roadTraffic';

/** The kinds that arrive by the road and wait at the gate for an answer (raids have their own hour: sim/siege.ts). */
export const LEAD_KINDS: ReadonlySet<string> = new Set(['arrival', 'refugees', 'trader', 'neighbor_help', 'kin', 'shelter']);

/** Approach time in game minutes: [min, max] by how they travel. Quarter-hour steps (the sim ticks every 15 minutes). */
export const LEAD_FOOT: readonly [number, number] = [60, 180];
export const LEAD_DRIVE: readonly [number, number] = [30, 90];

function hashId(s: string): number { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h; }

/** Do they come on foot (a family with a handcart, strangers walking up) or in a vehicle (a trader's pickup, a rig)? Read off the road party. */
export function comesOnFoot(e: Encounter, seed: number): boolean {
  const lead = partyForEncounter(e, seed).members[0]?.kind;
  return lead === 'walker' || lead === 'cart' || lead === 'bicycle';
}

/** Minutes between being sighted and standing at the gate. Deterministic in (seed, encounter); a multiple of 15. */
export function leadMinutes(e: Encounter, seed: number): number {
  const [lo, hi] = comesOnFoot(e, seed) ? LEAD_FOOT : LEAD_DRIVE;
  const u = mulberry32(seed * 4409 + hashId(e.id) * 13 + e.day * 7)();
  return Math.round((lo + u * (hi - lo)) / 15) * 15;
}

/** A fresh non-raid card that should walk up the road before it shows. */
export function wantsLead(s: GameState, e: Encounter | null | undefined): e is Encounter {
  return !!e && LEAD_KINDS.has(e.kind) && !hasCutscene(e) && !s.gate.incoming && !nobodyHome(s) && !emptyNow(s);
}

/**
 * Hold the card that was just set pending: it reaches the gate `leadMinutes` from now. Returns true when held (the caller logs nothing;
 * the arrival logs the title). Drops the producer's own "at the gate" log line, which would otherwise read an hour early.
 */
export function scheduleLead(s: GameState, e: Encounter): boolean {
  if (s.gate.pending !== e || !wantsLead(s, e)) return false;
  const at = s.clock.t + leadMinutes(e, s.seed) / 1440;
  s.gate.pending = null;
  s.gate.incoming = { e, at, from: s.clock.t };
  const line = `${e.title}.`;
  for (let i = s.log.length - 1; i >= 0 && i >= s.log.length - 3; i--) if (s.log[i].text === line && s.log[i].t === s.clock.t) { s.log.splice(i, 1); break; }
  return true;
}
