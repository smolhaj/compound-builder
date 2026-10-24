/**
 * Hired crews (GDS §10.9, decided with the user: owner-built saves the
 * labor, hiring a crew is faster and dearer). A local crew of four puts in
 * weekday hours, 8 to 5, on one building, at about $60 an hour a head (2025
 * rural rates for framers, concrete and general labor). They need the
 * materials on site, as the family does; they bill only the hours they work;
 * they go home when it's done, when the money runs out, or when the outside
 * world stops working (no banks, no roads, no law and order). Pure.
 */
import { log } from './economy';
import { addWork, blockedReason, blueprintOf, isFinished } from './construction';
import { dayIndex, hourOf, type GameState, type Structure } from './state';

export const CREW_SIZE = 4;
/** $ per person-hour. */
export const CREW_RATE = 60;
/** A crew works 8 to 5, weekdays. */
export const CREW_HOURS: [number, number] = [8, 17];

export interface Crew {
  id: string;
  /** The building they're on. */
  target: string;
  hiredAt: number;
  /** Person-hours they've put in, and what they've been paid. */
  hours: number;
  paid: number;
}

/** Person-hours left on a building. */
export function hoursLeft(st: Structure): number {
  const stages = blueprintOf(st).stages;
  let h = 0;
  for (let i = st.stage; i < stages.length; i++) h += i === st.stage ? stages[i].hours - st.done : stages[i].hours;
  return Math.max(0, h);
}

/** What a crew would cost to finish it, and about how many weeks. */
export function crewQuote(st: Structure): { usd: number; weeks: number } {
  const h = hoursLeft(st);
  return { usd: Math.round(h * CREW_RATE / 100) * 100, weeks: Math.max(1, Math.ceil(h / (CREW_SIZE * 9 * 5))) };
}

/** Why no crew can be hired now (null = one can). */
export function crewProblem(s: GameState, st: Structure): string | null {
  if (isFinished(st)) return 'finished';
  if ((s.crews ?? []).some(c => c.target === st.id)) return 'a crew is already on it';
  const t = s.disaster.tracks;
  if (t.banks < 0.5 || t.law < 0.5 || t.fuel < 0.3) return 'nobody is hiring out crews now';
  if (s.money < CREW_RATE * CREW_SIZE * 9 * 5) return 'not enough money for a week of a crew';
  return null;
}

export function hireCrew(s: GameState, id: string): string | null {
  const st = s.structures.find(x => x.id === id);
  if (!st) return 'no such building';
  const why = crewProblem(s, st);
  if (why) return why;
  (s.crews ??= []).push({ id: `c${s.nextId++}`, target: id, hiredAt: s.clock.t, hours: 0, paid: 0 });
  const q = crewQuote(st);
  log(s, `Hired a crew of ${CREW_SIZE} for the ${st.kind.replace('_', ' ')}: about $${q.usd.toLocaleString('en-US')} and ${q.weeks} week${q.weeks > 1 ? 's' : ''}.`);
  return null;
}

export function dismissCrew(s: GameState, crewId: string): void {
  s.crews = (s.crews ?? []).filter(c => c.id !== crewId);
}

/** One sub-step (`days` long): crews at work in working hours, billed by the hour. */
export function crewStep(s: GameState, days: number): void {
  if (!s.crews?.length) return;
  const h = hourOf(s.clock.t), weekday = dayIndex(s.clock.t) % 7 < 5;
  const t = s.disaster.tracks;
  for (const c of [...s.crews]) {
    const st = s.structures.find(x => x.id === c.target);
    const gone = (why: string) => { dismissCrew(s, c.id); log(s, why); };
    if (!st || isFinished(st)) { gone(`The crew finished${st ? ` the ${st.kind.replace('_', ' ')}` : ''} and went home ($${Math.round(c.paid).toLocaleString('en-US')} all told).`); continue; }
    if (t.banks < 0.5 || t.law < 0.5 || t.fuel < 0.3) { gone('The crew stopped coming: nobody can pay them or get them here now.'); continue; }
    if (!weekday || h < CREW_HOURS[0] || h >= CREW_HOURS[1]) continue;
    if (blockedReason(s, st)) continue;                    // waiting on materials: they work elsewhere that day
    const ph = CREW_SIZE * days * 24;
    const bill = ph * CREW_RATE;
    if (s.money < bill) { gone('The crew went home: there was no money to pay them.'); continue; }
    const used = addWork(s, st, ph);
    s.money -= used * CREW_RATE;
    c.hours += used; c.paid += used * CREW_RATE;
  }
}
