/**
 * Yearly small threats (long game, GDS §10.11): the shape of one and how the rest of the sim asks about it. A leaf module
 * (no imports) so effects, adaptive, opsec and neighborLife can read it without a cycle. Rolled by sim/threats.ts.
 */
export type ThreatKind = 'plague' | 'famine' | 'hard_winter' | 'warlord';
export interface Threat {
  kind: ThreatKind;
  /** First and last day it bites (a hard winter: through the thaw). */
  from: number;
  to: number;
  /** Strength by difficulty (Standard 0.5, Hardcore 1; Cozy never rolls one). */
  k: number;
}

export const THREAT_NAME: Record<ThreatKind, string> = { plague: 'A plague', famine: 'A famine year', hard_winter: 'A hard winter', warlord: 'A warlord scare' };

/** The strength (0 when it is not on) of a kind of threat today. */
export function threatOn(s: { lineage?: { threat?: Threat | null }; clock: { t: number } }, kind: ThreatKind): number {
  const th = s.lineage?.threat;
  if (!th || th.kind !== kind) return 0;
  const day = Math.floor(s.clock.t + 0.25);
  return day >= th.from && day <= th.to ? th.k : 0;
}
