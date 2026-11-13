/**
 * Hired crews (GDS §10.9, decided with the user: owner-built saves the
 * labor, hiring a crew is faster and dearer). A local crew of four puts in
 * weekday hours, 8 to 5, on one building, at about $60 an hour a head (2025
 * rural rates for framers, concrete and general labor). They need the
 * materials on site, as the family does; they bill only the hours they work;
 * they go home when it's done, when the money runs out, or when the outside
 * world stops working (no banks, no roads, no law and order). A crew can also
 * take a perimeter run (wall, fence, hedge); a rich family hires several crews
 * at once, side by side on long runs (GDS §10.7: money buys speed). Pure.
 */
import { addCarryWork, log } from './economy';
import { addRunWork, PERIMETER, runBlocked, runFinished, wallLength, type PerimeterRun } from './perimeter';
import { wantedNow } from './stalls';
import { addWork, blockedReason, blueprintOf, isFinished } from './construction';
import { addFixWork, fixBlocked, fixHoursLeft, pendingFixes } from './improvements';
import { dayIndex, hourOf, type GameState, type Structure } from './state';

export const CREW_SIZE = 4;
/** $ per person-hour. */
export const CREW_RATE = 60;
/** A crew works 8 to 5, weekdays. */
export const CREW_HOURS: [number, number] = [8, 17];

export interface Crew {
  id: string;
  /** The building (or perimeter run: a wall, fence or hedge) they're on. */
  target: string;
  hiredAt: number;
  /** Person-hours they've put in, and what they've been paid. */
  hours: number;
  paid: number;
}

/** Person-hours left on a building. */
export function hoursLeft(st: Structure): number {
  const stages = blueprintOf(st).stages;
  let h = fixHoursLeft(st);
  for (let i = st.stage; i < stages.length; i++) h += i === st.stage ? stages[i].hours - st.done : stages[i].hours;
  return Math.max(0, h);
}

/** Person-hours left on a perimeter run. */
export const runHoursLeft = (r: PerimeterRun): number => (runFinished(r) ? 0 : Math.max(0, r.hours - r.done));

/** A crew's target: a structure or a perimeter run. */
export type CrewJob = { st: Structure; run: null } | { st: null; run: PerimeterRun };
export function crewJob(s: GameState, id: string): CrewJob | null {
  const st = s.structures.find(x => x.id === id);
  if (st) return { st, run: null };
  const run = s.perimeter.find(x => x.id === id);
  return run ? { st: null, run } : null;
}

/** Person-hours left on whatever a crew is on (0: gone or finished). */
export function crewHoursLeft(s: GameState, id: string): number {
  const j = crewJob(s, id);
  return !j ? 0 : j.st ? hoursLeft(j.st) : runHoursLeft(j.run);
}

/** Crews on one target now. */
export const crewsOn = (s: GameState, id: string): number => (s.crews ?? []).filter(c => c.target === id).length;

/** Person-hours one crew puts in a week (four people, 9 hours, 5 weekdays). */
export const CREW_WEEK = CREW_SIZE * 9 * 5;

/**
 * The hiring market (GDS §10.7: money buys speed; wages follow the state of the world). While the banks, the law and the fuel are fine,
 * crews are unlimited and cost the usual rate. As the outside world fails, wages climb (up to +150%) and fewer crews can be had at once
 * (8 x the worst of the three tracks); once nobody can be paid, kept safe or driven in (banks or law under 20%, fuel under 15%) no crew
 * can be hired and the ones at work go home. Crews keep working after the hit for as long as the market stays open.
 */
export interface CrewMarket { open: boolean; rateMult: number; maxCrews: number; why: string | null }
export function crewMarket(s: GameState): CrewMarket {
  const t = s.disaster.tracks, reach = Math.min(t.banks, t.law, t.fuel);
  if (t.banks < 0.2 || t.law < 0.2 || t.fuel < 0.15) return { open: false, rateMult: 1, maxCrews: 0, why: 'nobody is hiring out crews now' };
  const rateMult = 1 + 1.5 * (1 - Math.min(1, t.banks, t.law));
  return { open: true, rateMult: Math.round(rateMult * 100) / 100, maxCrews: reach >= 0.95 ? Infinity : Math.max(1, Math.round(8 * reach)), why: null };
}

/** $ per person-hour now. */
export const crewRate = (s: GameState): number => CREW_RATE * crewMarket(s).rateMult;

/** One crew per 4 world units (80 ft) of wall at most, and none that would have under a week of work. */
export const RUN_SEGMENT = 4;
export function maxRunCrews(r: PerimeterRun): number {
  return Math.max(1, Math.min(Math.floor(wallLength(r) / RUN_SEGMENT), Math.ceil(runHoursLeft(r) / CREW_WEEK)));
}

/** What a crew would cost to finish it, and about how many weeks (`crews` working a run side by side). */
export function crewQuote(st: Structure | PerimeterRun, crews = 1, rate = CREW_RATE): { usd: number; weeks: number } {
  const h = 'pts' in st ? runHoursLeft(st) : hoursLeft(st);
  return { usd: Math.round(h * rate / 100) * 100, weeks: Math.max(1, Math.ceil(h / (CREW_WEEK * Math.max(1, crews)))) };
}

/** Why no crew can be hired now (null = one can). */
export function crewProblem(s: GameState, st: Structure | PerimeterRun): string | null {
  if ('pts' in st) {
    if (runFinished(st)) return 'finished';
    if (PERIMETER[st.kind].bore || PERIMETER[st.kind].span) return 'crews do not do that kind of work';
    if (crewsOn(s, st.id) >= maxRunCrews(st)) return crewsOn(s, st.id) ? 'the run has all the crews it has room for' : 'finished';
  } else {
    if (isFinished(st) && !pendingFixes(st).length) return 'finished';
    if (crewsOn(s, st.id)) return 'a crew is already on it';
  }
  const m = crewMarket(s);
  if (!m.open) return m.why;
  if ((s.crews ?? []).length >= m.maxCrews) return 'no more crews can be found now';
  if (s.money < crewRate(s) * CREW_WEEK) return 'not enough money for a week of a crew';
  return null;
}

export function hireCrew(s: GameState, id: string): string | null {
  const job = crewJob(s, id);
  if (!job) return 'no such building';
  const target = job.st ?? job.run;
  const why = crewProblem(s, target);
  if (why) return why;
  (s.crews ??= []).push({ id: `c${s.nextId++}`, target: id, hiredAt: s.clock.t, hours: 0, paid: 0 });
  const q = crewQuote(target, 1, crewRate(s));
  const name = job.st ? job.st.kind.replace('_', ' ') : PERIMETER[job.run.kind].name.toLowerCase();
  log(s, `Hired a crew of ${CREW_SIZE} for the ${name}: about $${q.usd.toLocaleString('en-US')} and ${q.weeks} week${q.weeks > 1 ? 's' : ''}${job.run && crewsOn(s, id) > 1 ? ` (${crewsOn(s, id)} crews on it side by side)` : ''}.`);
  return null;
}

/** Hire up to `n` crews on one target (a run takes several side by side). `why` is the reason none could be hired. */
export function hireCrews(s: GameState, id: string, n: number): { hired: number; why: string | null } {
  let hired = 0, why: string | null = null;
  for (let i = 0; i < n; i++) { why = hireCrew(s, id); if (why) break; hired++; }
  return { hired, why: hired ? null : why };
}

/** How many MORE crews finish a run in about `weeks` (0 when enough are on it; never more than fit or the market allows). */
export function crewsFor(s: GameState, r: PerimeterRun, weeks: number): number {
  const m = crewMarket(s), room = Number.isFinite(m.maxCrews) ? m.maxCrews - (s.crews ?? []).length : 99;
  const want = Math.max(1, Math.ceil(runHoursLeft(r) / (CREW_WEEK * weeks)));
  return Math.max(0, Math.min(Math.min(want, maxRunCrews(r)) - crewsOn(s, r.id), room));
}

export function dismissCrew(s: GameState, crewId: string): void {
  s.crews = (s.crews ?? []).filter(c => c.id !== crewId);
}

/** One sub-step (`days` long): crews at work in working hours, billed by the hour. */
export function crewStep(s: GameState, days: number): void {
  if (!s.crews?.length) return;
  const h = hourOf(s.clock.t), weekday = dayIndex(s.clock.t) % 7 < 5;
  const market = crewMarket(s), rate = CREW_RATE * market.rateMult;
  const nameOf = (id: string): string => { const j = crewJob(s, id); return j?.st ? j.st.kind.replace('_', ' ') : j ? PERIMETER[j.run.kind].name.toLowerCase() : 'job'; };
  const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  /** Everyone on one target goes home (one line for all of them). */
  const finishTarget = (id: string, why: (paid: number, n: number) => string) => {
    const on = (s.crews ?? []).filter(x => x.target === id);
    if (!on.length) return;
    s.crews = s.crews.filter(x => x.target !== id);
    log(s, why(on.reduce((a, x) => a + x.paid, 0), on.length));
  };
  const gone = (c: Crew, why: string) => { dismissCrew(s, c.id); log(s, why); };
  // the outside world sets how many can be had: the newest hires go home first
  if (market.open && s.crews.length > market.maxCrews) {
    for (const c of [...s.crews].reverse().slice(0, s.crews.length - market.maxCrews)) gone(c, 'A crew went home: with the world coming apart there are not enough to go around.');
  }
  for (const c of [...s.crews]) {
    if (!s.crews.some(x => x.id === c.id)) continue;
    const job = crewJob(s, c.target);
    const st = job?.st ?? null, run = job?.run ?? null;
    const fix = st && isFinished(st) ? pendingFixes(st).find(f => !fixBlocked(s, f)) ?? null : null;
    if (!job || (st ? isFinished(st) && !pendingFixes(st).length : runFinished(run!))) {
      finishTarget(c.target, (paid, n) => `The ${n > 1 ? 'crews' : 'crew'} finished${job ? ` the ${nameOf(c.target)}` : ''} and went home (${money(paid)} all told).`);
      continue;
    }
    if (!market.open) { gone(c, 'The crew stopped coming: nobody can pay them or get them here now.'); continue; }
    if (!weekday || h < CREW_HOURS[0] || h >= CREW_HOURS[1]) continue;
    const ph = CREW_SIZE * days * 24;
    const bill = ph * rate;
    const waiting = st ? (isFinished(st) ? !fix : blockedReason(s, st) !== null) : runBlocked(s, run!) !== null;
    // a delivery left at the road (no drive in) is carried in by the crew before anything else, on their hours
    // (a crew whose job can go on works on it; it carries the pile in only while the job waits, or has nothing to do)
    if (s.roadside?.length && waiting) {
      if (s.money < bill) { gone(c, 'The crew went home: there was no money to pay them.'); continue; }
      const carried = addCarryWork(s, ph, wantedNow(s));
      s.money -= carried * rate; c.hours += carried; c.paid += carried * rate;
      continue;
    }
    if (waiting) continue;   // waiting on materials or the county: they work elsewhere that day, unbilled
    if (s.money < bill) { gone(c, 'The crew went home: there was no money to pay them.'); continue; }
    const used = run ? addRunWork(s, run, ph, true) : fix ? addFixWork(s, st!, fix, ph) : addWork(s, st!, ph);
    s.money -= used * rate;
    c.hours += used; c.paid += used * rate;
  }
}
