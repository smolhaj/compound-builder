/**
 * The endless sandbox (user, task #34): there is no scripted final collapse, so each later era leans on the place a
 * little harder instead. The pressure multiplies how often and how many come (opsec.raidPressure): 1 in era I, then
 * a step an era up to a ceiling, so a century-old dynasty is still being tested without ever being buried. Cozy
 * barely moves, Standard stays fair, Hardcore climbs steeply. Pure.
 */
import type { GameState } from './state';

const STEP: Record<string, [step: number, cap: number]> = { cozy: [0.03, 1.2], standard: [0.08, 1.6], hardcore: [0.16, 2.4] };

export function eraPressure(s: Pick<GameState, 'lineage' | 'disaster'>): number {
  const n = Math.max(0, (s.lineage?.era ?? 1) - 1);
  const [step, cap] = STEP[s.disaster?.difficulty ?? 'standard'] ?? STEP.standard;
  return Math.min(cap, 1 + step * n);
}
