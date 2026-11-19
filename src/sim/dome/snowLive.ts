/**
 * Snow on a dome's shell as live state (docs/design/climate_disasters.md PR 5): the ice age's ground load, what a shell carries given how much of its
 * plant is running, and the daily roll that takes panels off a shell loaded past its rating (an open `panel` repair job, the same one a raid leaves).
 * Pure rules are in snowLoad.ts. Zero outside an ice age. Imports `live.ts` for types only.
 */
import type { GameState } from '../state';
import { calendarOf, dayIndex } from '../state';
import { log } from '../economy';
import { iceGroundPsf } from '../slowClimate';
import { breachChance, panelsLost, shellSnow, type ShellSnow } from '../snowLoad';
import { shellHealth, domeFrom, PANELS } from './standing';
import { panelJob, panelSpot } from './siege';
import { leadStretch } from './plantClimate';
import { fxOf } from './plantLive';
import type { DomeRef, DomeState } from './live';

type Ref = Pick<DomeRef, 'st' | 'tier' | 'cells' | 'r'>;

/** Ground snow load now (psf); 0 unless an ice age is on. */
export const groundSnowNow = (s: GameState): number => iceGroundPsf(s, calendarOf(s.clock).doy);

/** Panels of this dome that are down now. */
export const panelsDownOf = (s: GameState, id: string): number => (s.raidDamage ?? []).filter(j => j.kind === 'panel' && j.structure === id && j.done < j.hours).reduce((a, j) => a + (j.panels ?? 1), 0);

/** Snow on this dome's shell against its rating. A powered, working climate plant sheds it. */
export function shellSnowNow(s: GameState, d: Ref, st: DomeState): ShellSnow & { ground: number; share: number } {
  const ground = groundSnowNow(s), share = st.powered ? fxOf(s, d, st).climate : 0;
  return { ...shellSnow(d.tier, ground, share, shellHealth(d.tier, panelsDownOf(s, d.st.id))), ground, share };
}

/** Once a day: a shell loaded past its rating may lose panels. Returns log lines. `r` is the day's stream, `scale` the difficulty's failure scale. */
export function shellSnowDay(s: GameState, d: Ref, st: DomeState, r: () => number, scale: number): string[] {
  if (s.disaster.kind !== 'ice_age') return [];
  const sn = shellSnowNow(s, d, st);
  if (!sn.breach || !(r() < breachChance(sn.ratio) * Math.min(1.4, Math.max(0.35, scale)))) return [];
  const n = Math.min(panelsLost(PANELS[d.tier], sn.ratio), PANELS[d.tier] - panelsDownOf(s, d.st.id));   // (never more panels down than the shell has)
  if (n <= 0) return [];
  const dome = domeFrom(d.st, panelsDownOf(s, d.st.id), s);
  if (!dome) return [];
  const job = panelJob(d.tier, n, { wealth: 0 }), spot = panelSpot(dome, (s.raidDamage ?? []).filter(j => j.kind === 'panel' && j.structure === d.st.id && j.done < j.hours).length);
  const lead = Math.round(job.leadDays * leadStretch(s.disaster.tracks.deliveries));
  (s.raidDamage ??= []).push({ id: `d${s.nextId++}`, kind: 'panel', x: spot.x, z: spot.z, day: dayIndex(s.clock.t), hours: Math.max(2, job.hours), done: 0, supplied: Object.keys(job.bill).length === 0, bill: job.bill, readyDay: dayIndex(s.clock.t) + lead, structure: d.st.id, panels: n, what: 'the snow-crushed glazing' });
  const line = `Snow brought down ${n} panel${n === 1 ? '' : 's'} of the shell: about ${Math.round(sn.psf)} pounds a square foot on glazing rated for ${Math.round(sn.rating)}. A glazier has to order replacements (about ${lead} days).`;
  log(s, line);
  return [line];
}
