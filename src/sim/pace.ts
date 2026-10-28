/**
 * How fast the family builds, and why it is slow (Projects panel). The
 * routine (schedule.ts) gives adults two work blocks a day (5 h + 3 h);
 * an adult with a day job spends the weekday blocks in town, so they build
 * on weekends only. All hands work on one project at a time, oldest first.
 * Pure (tested): estimates, not promises (health, weather and waiting for
 * materials move them).
 */
import { buildRate, workHoursPerDay } from './family';
import { isFinished } from './construction';
import { hoursLeft } from './crews';
import { isAway } from './rescue';
import { runFinished, type PerimeterRun } from './perimeter';
import type { GameState } from './state';

export interface Pace {
  /** Rate-weighted person-hours the family puts in per week. */
  perWeek: number;
  /** Adults who work a day job in town and so build only on weekends. */
  employed: string[];
  /** Adults / teens building every day. */
  fullTime: number;
}

const WEEKDAYS = 5, WEEKEND = 2;

/** Who is free to build, and how many effective hours a week that adds up to. */
export function paceOf(s: GameState): Pace {
  let perWeek = 0, fullTime = 0;
  const employed: string[] = [];
  s.people.forEach(p => {
    const ps = s.personState.find(x => x.id === p.id);
    if (!ps || ps.needs.died != null || isAway(s, p.id)) return;
    const hours = workHoursPerDay(p) * buildRate(p);
    const job = !!ps.employed && !!p.job && !p.kid;
    perWeek += hours * (job ? WEEKEND : WEEKDAYS + WEEKEND);
    if (job) employed.push(p.first); else if (!p.kid && !p.elder) fullTime++;
  });
  return { perWeek, employed, fullTime };
}

const runLeft = (r: PerimeterRun) => (runFinished(r) ? 0 : Math.max(0, r.hours - r.done));

/** The queue the family works through, oldest first: structures, then lines, then hardening (as engine.subStep picks them). */
export interface QueueItem { id: string; name: string; hours: number }

export function workQueue(s: GameState): QueueItem[] {
  const out: QueueItem[] = [];
  for (const st of s.structures) if (!isFinished(st)) out.push({ id: st.id, name: st.kind, hours: hoursLeft(st) });
  for (const r of s.perimeter) if (!runFinished(r)) out.push({ id: r.id, name: r.kind, hours: runLeft(r) });
  for (const j of s.hardenJobs) if (j.finishedAt === null) out.push({ id: j.id, name: 'hardening', hours: Math.max(0, j.hours - j.done) });
  return out;
}

export const totalHoursLeft = (s: GameState): number => workQueue(s).reduce((a, q) => a + q.hours, 0);

/** Weeks until the queue has worked through `id` (inclusive), at the family's pace. */
export function weeksUntil(s: GameState, id: string, pace = paceOf(s)): number | null {
  if (pace.perWeek <= 0) return null;
  let h = 0;
  for (const q of workQueue(s)) { h += q.hours; if (q.id === id) return h / pace.perWeek; }
  return null;
}

export const weeksFor = (hours: number, pace: Pace): number | null => (pace.perWeek > 0 ? hours / pace.perWeek : null);

/** "about 3 weeks", "about 5 months", "over a year". */
export function eta(weeks: number | null): string {
  if (weeks === null) return 'no one is free to build';
  if (weeks < 0.15) return 'a day or so';
  if (weeks < 1.5) return 'about a week';
  if (weeks < 9) return `about ${Math.round(weeks)} weeks`;
  if (weeks < 52) return `about ${Math.round(weeks / 4.35)} months`;
  return weeks < 78 ? 'about a year' : `about ${(weeks / 52).toFixed(1)} years`;
}

/** Why it is slow and what would help, when the whole queue takes more than `slow` weeks. */
export function slowHint(s: GameState, weeks: number | null, pace = paceOf(s), slow = 6): string | null {
  if (weeks === null) return 'No one is free to build.';
  if (weeks < slow) return null;
  const parts: string[] = [];
  if (pace.employed.length) parts.push(`${pace.employed.join(' and ')} ${pace.employed.length > 1 ? 'work' : 'works'} in town on weekdays and build${pace.employed.length > 1 ? '' : 's'} only on weekends: quitting the job (Family tab) puts them on the site five more days a week`);
  parts.push('a hired crew works weekdays on one building (Projects: Hire a crew)');
  return `Slow going: ${parts.join('; ')}.`;
}
