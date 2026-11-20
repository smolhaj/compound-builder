/**
 * What a raid leaves on a dome's shell that is not a hole: a scorch where a torch or a charge went, star chips where rounds hit glass, a dent where a sledge
 * rang. They wear off (armor and film clean up, glass chips stay longest) and never change the dome's strength (a lost panel is a `panel` job, siege.ts).
 * Pure (tested in domeBeats.test.ts). Saved as the optional `GameState.shellScars`.
 */
import type { Battle } from '../battleTypes';
import { dayIndex, type GameState } from '../state';
import type { Dome } from './standing';
import type { DomeTier } from './tiers';

export type ScarKind = 'scorch' | 'chip' | 'dent';
export interface ShellScar { dome: string; /** Angle on the shell, radians from +z toward +x. */ angle: number; /** Height up the shell, 0 (ground) to 1 (crown). */ h: number; kind: ScarKind; day: number }

/** Days a mark stays visible (a scorch is washed and scrubbed first; chipped glass waits for the glazier). */
export const SCAR_LIFE: Record<ScarKind, Record<DomeTier, number>> = {
  scorch: { earthen: 60, geodesic: 20, glass: 25, arcology: 12 },
  chip: { earthen: 60, geodesic: 40, glass: 120, arcology: 30 },
  dent: { earthen: 60, geodesic: 30, glass: 60, arcology: 20 },
};
export const MAX_SCARS = 40;

/** The mark a probe leaves (null: none). */
export const scarOf = (what: 'rifle' | 'sledge' | 'saw' | 'torch' | 'pry'): ScarKind | null => (what === 'rifle' ? 'chip' : what === 'torch' ? 'scorch' : what === 'sledge' ? 'dent' : what === 'saw' ? 'scorch' : null);

/** Add the marks a staged fight's probes leave on `dome` (deterministic height from the probe's time). Returns how many were added. */
export function addScars(s: GameState, dome: Pick<Dome, 'id' | 'x' | 'z'>, b: Battle): number {
  const day = dayIndex(s.clock.t), list = (s.shellScars ??= []);
  let n = 0;
  for (const e of b.events) {
    if (e.kind !== 'probe') continue;
    const kind = scarOf(e.what);
    if (!kind) continue;
    list.push({ dome: dome.id, angle: Math.round(Math.atan2(e.x - dome.x, e.z - dome.z) * 1000) / 1000, h: 0.08 + ((e.t * 37) % 10) / 10 * 0.28, kind, day });
    n++;
  }
  while (list.length > MAX_SCARS) list.shift();
  if (!list.length) delete s.shellScars;
  return n;
}

/** The marks still showing on `dome` today, with how faded each is (1 fresh, 0 gone). */
export function visibleScars(s: Pick<GameState, 'shellScars' | 'clock'>, dome: Pick<Dome, 'id' | 'tier'>): Array<ShellScar & { fade: number }> {
  const today = dayIndex(s.clock.t), out: Array<ShellScar & { fade: number }> = [];
  for (const sc of s.shellScars ?? []) {
    if (sc.dome !== dome.id) continue;
    const life = SCAR_LIFE[sc.kind][dome.tier], age = today - sc.day;
    if (age < life) out.push({ ...sc, fade: Math.max(0, 1 - age / life) });
  }
  return out;
}

/** Drop marks that have worn off (called once a day). */
export function wearScars(s: GameState, tiers: (id: string) => DomeTier | null): void {
  if (!s.shellScars) return;
  const today = dayIndex(s.clock.t);
  s.shellScars = s.shellScars.filter(sc => { const t = tiers(sc.dome); return t ? today - sc.day < SCAR_LIFE[sc.kind][t] : false; });
  if (!s.shellScars.length) delete s.shellScars;
}
