/**
 * Classes, courses and drills (people depth, part 3). Pure.
 *
 * Skills (skills.ts) rise with use and with a mentor. This adds the third
 * way people learn: a course with a start and an end, taken in the evening
 * hours the family would otherwise spend idle, with a certificate-like note
 * on the Family tab when it is done.
 *
 *  Courses    first aid and first responder, the ham radio licence, small
 *             engines, welding, carpentry, wiring and solar, gardening,
 *             animal husbandry, canning and cooking. Each has a total of
 *             study hours (an American Red Cross first-aid class is a few
 *             hours; an emergency responder course about 50; a Technician
 *             licence takes 10 to 20 hours of study) and a skill it feeds.
 *  Ways       with a teacher, a book set, or online:
 *               teacher  a household adult who has the skill at 3 or more
 *                        sits down with the student on the same hours (they
 *                        must both be on the Class duty); needs the book set
 *                        from the Shop (kept, not used up). The best way:
 *                        0.85 + 0.06 per level of the teacher's skill.
 *               book     the book set (with a DVD) alone: slow, 0.5.
 *               online   an online course while the grid and the phone lines
 *                        are up: costs tuition at enrolment, no teacher, 0.9.
 *             A teacher gets teaching practice and keeps the skill fresh.
 *  Hours      the planner gives each student two evening hours a day (19 to
 *             21, else the idle hours before it) and the teacher the same.
 *             The Class duty is on the roster ('Cl'): the hours can be
 *             painted by hand, and "Who should do what" names the
 *             student and the teacher.
 *  Finish     practice in the skill all along (skills.ts `practice`), then a
 *             certificate: the person is raised to at least level 2 in the
 *             skill (a competent beginner), and the Family tab keeps the
 *             note. Courses end a sentence the school years could not: a
 *             teenager can come out of one a useful pair of hands.
 *  Drills     a firearms drill duty ('Dr') that spends ammunition and
 *             improves accuracy (shooting practice) and readiness (the
 *             fewer seconds frozen at the alarm: mind.ts `fightNerves`),
 *             on a schedule for the household: off, weekly, twice a week
 *             or three times, live fire (15 rounds an hour each) or dry-fire
 *             (free, a third as good). Readiness fades about 1 % a day.
 *
 * Effects reach the existing skill modifiers and nothing else: medicine
 * for casualty outcomes (medical.ts), electrical work for the wiring, pump
 * and generator faults (utilities.ts), mechanics for tools and vehicles
 * (tools.ts, vehicles.ts), gardening and husbandry for yields.
 */
import { calendarOf, dayIndex, type GameState } from './state';
import { log } from './economy';
import { GUN } from './armory';
import { bestLevel, learningOf, levelOf, practice, rangeWork, SKILL_NAME, type Practiced } from './skills';
import type { Person } from './family';
import type { MaterialId } from './materials';

export type CourseId = 'firstaid' | 'ham' | 'engines' | 'welding' | 'carpentry' | 'wiring' | 'gardening' | 'husbandry' | 'canning';
export type CourseMode = 'teacher' | 'book' | 'online';
export const COURSE_MODE_NAME: Record<CourseMode, string> = { teacher: 'with a teacher at home', book: 'from the book set', online: 'online' };

export interface CourseDef {
  id: CourseId;
  name: string;
  skill: Practiced;
  /** Study hours to finish at quality 1. */
  hours: number;
  /** The book set (kept, not used up). */
  book: MaterialId;
  /** Online tuition. */
  online: number;
  /** The level the certificate guarantees. */
  floor: number;
  minAge: number;
  /** What the certificate is called on the Family tab. */
  cert: string;
  blurb: string;
}

export const COURSES: Record<CourseId, CourseDef> = {
  firstaid: { id: 'firstaid', name: 'First aid and first responder', skill: 'medic', hours: 20, book: 'course_firstaid', online: 90, floor: 2, minAge: 12, cert: 'First aid and first responder',
    blurb: 'Bleeding, breathing, bones, burns and when it is beyond you. Casualty care (dressings, splints, who lives) runs on this skill.' },
  ham: { id: 'ham', name: 'Ham radio licence', skill: 'radio', hours: 20, book: 'course_ham', online: 70, floor: 2, minAge: 12, cert: 'Amateur radio licence (Technician)',
    blurb: 'Radio theory, rules and operating practice. The radio duty and the net run on this skill.' },
  engines: { id: 'engines', name: 'Small engines', skill: 'mechanic', hours: 30, book: 'course_engines', online: 110, floor: 2, minAge: 14, cert: 'Small engines and generators',
    blurb: 'Chainsaws, mowers, pumps and the generator: carburetors, plugs, filters, starting. Tools and vehicles last longer in these hands.' },
  welding: { id: 'welding', name: 'Welding and metalwork', skill: 'mechanic', hours: 40, book: 'course_welding', online: 150, floor: 2, minAge: 15, cert: 'Welding and metalwork',
    blurb: 'Stick and wire welding, cutting and fitting steel: gates, brackets, trailers, repairs to the tools.' },
  carpentry: { id: 'carpentry', name: 'Carpentry', skill: 'builder', hours: 30, book: 'course_carpentry', online: 100, floor: 2, minAge: 12, cert: 'Carpentry',
    blurb: 'Framing, roofing and finish work. Builds go up faster with a good carpenter.' },
  wiring: { id: 'wiring', name: 'Wiring and solar', skill: 'electrical', hours: 30, book: 'course_wiring', online: 120, floor: 2, minAge: 15, cert: 'Wiring and off-grid solar',
    blurb: 'Home wiring, batteries, inverters and generators. Fewer faults on the pump and the panels, and the wiring goes in faster.' },
  gardening: { id: 'gardening', name: 'Gardening', skill: 'gardener', hours: 24, book: 'course_gardening', online: 80, floor: 2, minAge: 10, cert: 'Market gardening',
    blurb: 'Soil, spacing, succession planting, saving seed. Better yields from the same beds.' },
  husbandry: { id: 'husbandry', name: 'Animal husbandry', skill: 'husbandry', hours: 24, book: 'course_husbandry', online: 85, floor: 2, minAge: 10, cert: 'Animal husbandry',
    blurb: 'Feed, water, hooves, birthing and when to call it. Healthier stock, more eggs and milk.' },
  canning: { id: 'canning', name: 'Canning and cooking', skill: 'cooking', hours: 20, book: 'course_canning', online: 65, floor: 2, minAge: 10, cert: 'Canning and cooking',
    blurb: 'Putting food by safely and cooking from scratch with what the place gives.' },
};
export const COURSE_IDS = Object.keys(COURSES) as CourseId[];

export interface Enrollment {
  id: string;
  course: CourseId;
  pid: string;
  mode: CourseMode;
  teacher?: string;
  /** Hours of study done (quality-weighted) toward `COURSES[course].hours`. */
  done: number;
  start: number;
  /** Cannot go on for now (no teacher left, the grid is down): the planner leaves it. */
  stalled?: string;
}
export interface Cert { pid: string; course: CourseId; at: number; by?: string; mode: CourseMode }
export interface Drills {
  /** Sessions a week (0 = off). */
  perWeek: 0 | 1 | 2 | 3;
  /** Live fire (15 rounds an hour each); off = dry-fire. */
  live: boolean;
  /** Readiness 0–1 per person: the practiced response at the alarm. */
  ready: Record<string, number>;
  /** Today's tally, flushed into one log line at midnight. */
  rounds: number;
  hours: number;
  people: string[];
  dry: boolean;
  /** Day index of the last session. */
  last?: number;
}
export interface Courses { enrolled: Enrollment[]; certs: Cert[]; drills: Drills; day: number; next: number }

export const newCourses = (): Courses => ({ enrolled: [], certs: [], drills: { perWeek: 0, live: true, ready: {}, rounds: 0, hours: 0, people: [], dry: false }, day: -1, next: 1 });
export function coursesOf(s: GameState): Courses {
  s.courses ??= newCourses();
  s.courses.drills ??= newCourses().drills;
  return s.courses;
}

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const here = (s: GameState, pid: string) => { const n = s.personState.find(x => x.id === pid)?.needs; return !!n && n.died == null && !n.taken && !n.left; };
const has = (s: GameState, m: MaterialId) => Math.floor((s.stock as Record<string, number>)[m] ?? 0);
const online = (s: GameState) => (s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5)) && s.disaster.tracks.phone >= 0.5;
export const TEACH_LEVEL = 3;

/** Has this person finished the course? */
export const hasCert = (s: GameState, pid: string, course: CourseId): boolean => !!s.courses?.certs.some(c => c.pid === pid && c.course === course);
export const certsOf = (s: GameState, pid: string): Cert[] => (s.courses?.certs ?? []).filter(c => c.pid === pid);
export const enrollmentOf = (s: GameState, pid: string): Enrollment | undefined => s.courses?.enrolled.find(e => e.pid === pid);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
/** The certificate-like note for the Family tab: "First aid and first responder, Mar 2028 (taught by Dad)". */
export function certNote(s: GameState, c: Cert): string {
  const { doy, year } = calendarOf(s.clock, c.at);
  let m = 11; while (m > 0 && doy <= START[m]) m--;
  const by = c.by ? person(s, c.by)?.first : null;
  return `${COURSES[c.course].cert}, ${MONTHS[m]} ${year}${by ? ` (taught by ${by})` : c.mode === 'online' ? ' (online)' : ''}`;
}

/** Household adults and teens who could teach `course` to `pid` (the skill at 3 or more, not the student, able and here). */
export function teachersFor(s: GameState, course: CourseId, pid: string): Person[] {
  const def = COURSES[course];
  return s.people.filter(p => p.id !== pid && here(s, p.id) && (!p.kid || p.age >= 16) && levelOf(s, p.id, def.skill) >= TEACH_LEVEL)
    .sort((a, b) => levelOf(s, b.id, def.skill) - levelOf(s, a.id, def.skill));
}

/** Why `pid` cannot take this course this way now, or null. */
export function modeProblem(s: GameState, course: CourseId, pid: string, mode: CourseMode, teacher?: string): string | null {
  const def = COURSES[course], p = person(s, pid);
  if (!p || !here(s, pid)) return 'not here';
  if (p.age < def.minAge) return `${p.first} is too young for this one (${def.minAge}+)`;
  if (hasCert(s, pid, course)) return `${p.first} already has this certificate`;
  if (enrollmentOf(s, pid)) return `${p.first} is already taking a course`;
  if (mode === 'online') {
    if (!online(s)) return 'online classes need power and the phone lines up';
    if (s.money < def.online) return `tuition is $${def.online}`;
    return null;
  }
  if (has(s, def.book) < 1) return `needs the ${COURSES[course].name.toLowerCase()} book set from the Shop`;
  if (mode === 'teacher') {
    const t = teacher ? person(s, teacher) : teachersFor(s, course, pid)[0];
    if (!t || !teachersFor(s, course, pid).some(x => x.id === t.id)) return `nobody here has ${SKILL_NAME[def.skill].toLowerCase()} at ${TEACH_LEVEL} or more to teach it`;
  }
  return null;
}

/** The best way for `pid` to take the course now, or null when none works. */
export function bestMode(s: GameState, course: CourseId, pid: string): { mode: CourseMode; teacher?: string } | null {
  const ts = teachersFor(s, course, pid);
  if (ts.length && !modeProblem(s, course, pid, 'teacher', ts[0].id)) return { mode: 'teacher', teacher: ts[0].id };
  if (!modeProblem(s, course, pid, 'online')) return { mode: 'online' };
  if (!modeProblem(s, course, pid, 'book')) return { mode: 'book' };
  return null;
}

/** Sign someone up. Online tuition is paid now. Returns a problem, or null. */
export function enroll(s: GameState, course: CourseId, pid: string, mode: CourseMode, teacher?: string): string | null {
  const why = modeProblem(s, course, pid, mode, teacher);
  if (why) return why;
  const C = coursesOf(s), def = COURSES[course], p = person(s, pid)!;
  const t = mode === 'teacher' ? (teacher ?? teachersFor(s, course, pid)[0].id) : undefined;
  if (mode === 'online') s.money -= def.online;
  C.enrolled.push({ id: `c${C.next++}`, course, pid, mode, ...(t ? { teacher: t } : {}), done: 0, start: dayIndex(s.clock.t) });
  const tn = t ? person(s, t)?.first : null;
  log(s, `${p.first} signs up for the ${def.name.toLowerCase()} course${tn ? `, with ${tn} teaching` : mode === 'online' ? ' online' : ' from the book set'}: two hours most evenings.`);
  return null;
}

/** Drop a course (nothing is refunded). */
export function dropCourse(s: GameState, id: string): void {
  const C = coursesOf(s);
  C.enrolled = C.enrolled.filter(e => e.id !== id);
}

/** How good the study is this hour (1 = a plain hour). `teacherHere`: the teacher is on the Class duty at the same hour. */
export function courseQuality(s: GameState, e: Enrollment, teacherHere: boolean): number {
  if (e.mode === 'online') return 0.9;
  if (e.mode === 'teacher' && e.teacher && teacherHere) {
    const t = person(s, e.teacher);
    return 0.85 + 0.06 * levelOf(s, e.teacher, COURSES[e.course].skill) + 0.03 * (t?.skills.teacher ?? 0);
  }
  return 0.5;
}

/** Enrollments the planner puts hours on (active, student here). */
export function classSlots(s: GameState): Array<{ e: Enrollment; teacher: string | null }> {
  return (s.courses?.enrolled ?? []).filter(e => !e.stalled && here(s, e.pid)).map(e => ({ e, teacher: e.mode === 'teacher' && e.teacher && here(s, e.teacher) ? e.teacher : null }));
}
/** Is this person teaching someone this term (so a Class hour of theirs is a lesson given)? */
export const isTeaching = (s: GameState, pid: string): boolean => !!s.courses?.enrolled.some(e => e.teacher === pid && !e.stalled);

/**
 * One hour of the Class duty for a student: practice in the skill, progress
 * toward the certificate. Returns a log line when the course is finished.
 */
export function courseHour(s: GameState, p: Person, personHours: number, teacherHere: (tid: string) => boolean): string | null {
  const C = coursesOf(s), e = C.enrolled.find(x => x.pid === p.id && !x.stalled);
  if (!e) return null;
  const def = COURSES[e.course];
  const q = courseQuality(s, e, !!e.teacher && teacherHere(e.teacher));
  practice(s, p.id, def.skill, personHours, q);
  e.done += personHours * q;
  if (e.done >= def.hours) return finishCourse(s, e);
  return null;
}
/** One hour of the Class duty for a teacher: teaching practice, and the skill kept fresh by explaining it. */
export function teachHour(s: GameState, p: Person, personHours: number): void {
  const mine = (s.courses?.enrolled ?? []).filter(e => e.teacher === p.id && !e.stalled);
  if (!mine.length) return;
  practice(s, p.id, 'teacher', personHours * 0.4);
  const L = learningOf(s), day = dayIndex(s.clock.t);
  for (const e of mine) (L.used[p.id] ??= {})[COURSES[e.course].skill] = day;
}

function finishCourse(s: GameState, e: Enrollment): string {
  const C = coursesOf(s), def = COURSES[e.course], p = person(s, e.pid)!;
  C.enrolled = C.enrolled.filter(x => x.id !== e.id);
  C.certs.push({ pid: e.pid, course: e.course, at: s.clock.t, ...(e.teacher ? { by: e.teacher } : {}), mode: e.mode });
  // the certificate guarantees a competent beginner (level 2 at least), and a little practice on top
  const lv = levelOf(s, e.pid, def.skill);
  if (lv < def.floor) raiseTo(s, p, def.skill, def.floor);
  practice(s, e.pid, def.skill, 6);
  const tn = e.teacher ? person(s, e.teacher)?.first : null;
  return `${p.first} finished the ${def.name.toLowerCase()} course${tn ? `, taught by ${tn}` : e.mode === 'online' ? ' online' : ''}. A certificate goes up on the fridge.`;
}

/** Raise a skill to `to` (the person's own eight live on `p.skills`, the rest in `learning.extra`). */
function raiseTo(s: GameState, p: Person, skill: Practiced, to: number): void {
  const L = learningOf(s);
  if (skill === 'shooting') return;
  if (skill === 'cooking' || skill === 'husbandry' || skill === 'electrical' || skill === 'leadership') (L.extra[p.id] ??= {})[skill] = to;
  else p.skills[skill] = to;
  const pk = (L.peak[p.id] ??= {});
  pk[skill] = Math.max(pk[skill] ?? 0, to);
  (L.used[p.id] ??= {})[skill] = dayIndex(s.clock.t);
  (L.xp[p.id] ??= {})[skill] = 0;
}

// ── drills ──

/** Which days of the week (0 = the first day of the game) a drill is held. */
const DRILL_DAYS: Record<1 | 2 | 3, readonly number[]> = { 1: [5], 2: [2, 5], 3: [1, 3, 5] };
export const drillDay = (s: GameState, day = dayIndex(s.clock.t)): boolean => {
  const D = s.courses?.drills;
  return !!D && D.perWeek > 0 && (DRILL_DAYS[D.perWeek as 1 | 2 | 3] ?? []).includes(day % 7);
};
/** The hour a drill is held (mid-afternoon, after the midday meal and before the cooking). */
export const DRILL_HOUR = 15;
export const DRILL_ROUNDS = 15;

export function setDrills(s: GameState, perWeek: 0 | 1 | 2 | 3, live?: boolean): void {
  const D = coursesOf(s).drills;
  D.perWeek = perWeek;
  if (live !== undefined) D.live = live;
  if (s.daily) s.daily.plan.day = -1;   // the planner runs again at once
}

/** Who is called to a drill: anyone 15+ who is well enough, with a gun to drill with. */
export const drillable = (s: GameState, p: Person): boolean => (!p.kid || p.age >= 15) && here(s, p.id) && s.armory.guns.length > 0;

/** How practiced someone is at the alarm (0–1). */
export const drilledOf = (s: GameState, pid: string): number => s.courses?.drills.ready[pid] ?? 0;

/** One hour (or part of one) of the Drill duty for one person: rounds fired, shooting practice, readiness. */
export function drillHour(s: GameState, p: Person, personHours: number): void {
  const D = coursesOf(s).drills;
  if (!drillable(s, p)) return;
  const live = D.live && s.armory.guns.length > 0;
  const r = rangeWork(s, p.id, personHours, DRILL_ROUNDS, live);
  if (!r.ok) return;
  D.rounds += r.fired; D.hours += personHours;
  if (!D.people.includes(p.id)) D.people.push(p.id);
  if (live && r.fired === 0) D.dry = true;
  const gain = (r.fired > 0 ? 0.14 : 0.07) * personHours;
  D.ready[p.id] = Math.min(1, (D.ready[p.id] ?? 0) + gain);
}

/** The average readiness of the household's adults (0–1). */
export function readiness(s: GameState): number {
  const adults = s.people.filter(p => drillable(s, p));
  return adults.length ? adults.reduce((a, p) => a + drilledOf(s, p.id), 0) / adults.length : 0;
}

/** Rounds a live drill costs the household per session. */
export function drillCost(s: GameState): number {
  return s.people.filter(p => drillable(s, p)).length * DRILL_ROUNDS;
}
/** The caliber the drills fire (the first gun's), and what is on hand. */
export function drillAmmo(s: GameState): { cal: string; have: number } | null {
  const g = s.armory.guns[0];
  if (!g) return null;
  const cal = GUN[g.model].cal;
  return { cal, have: Math.floor(s.armory.ammo[cal] ?? 0) };
}

// ── once a day ──

/** Once a day: stalled and ended courses, the drill's one-line report, readiness fading. Returns log lines. */
export function coursesDay(s: GameState): string[] {
  const C = coursesOf(s), day = dayIndex(s.clock.t);
  if (C.day === day) return [];
  C.day = day;
  const out: string[] = [];
  // a student who is gone ends the course; a teacher who is gone (or the grid) stalls it, or the course goes on from the book
  for (const e of [...C.enrolled]) {
    if (!here(s, e.pid)) { C.enrolled = C.enrolled.filter(x => x.id !== e.id); continue; }
    const def = COURSES[e.course], book = has(s, def.book) >= 1, name = person(s, e.pid)?.first;
    if (e.mode === 'teacher') {
      if (e.teacher && here(s, e.teacher) && levelOf(s, e.teacher, def.skill) >= TEACH_LEVEL) delete e.stalled;
      else if (book) { e.mode = 'book'; delete e.teacher; delete e.stalled; out.push(`${name}'s teacher is not there any more; the course goes on from the book set.`); }
      else e.stalled = 'no teacher';
    } else if (e.mode === 'online') {
      if (online(s)) delete e.stalled;
      else if (book) { e.mode = 'book'; delete e.stalled; out.push(`The online class is out with the power or the phones; ${name} goes on from the book set.`); }
      else e.stalled = 'no connection';
    } else delete e.stalled;
  }
  // the drill
  const D = C.drills;
  if (D.hours > 0) {
    const n = D.people.length;
    out.push(D.rounds > 0
      ? `Drill at three: ${n} on the line, ${D.rounds} rounds, ${D.dry ? 'and then dry-fire when the ammunition ran out. ' : ''}everybody knows where to go when the alarm sounds.`
      : `Drill at three: ${n} ran it dry-fire${D.live ? ', with no ammunition to spare' : ''}. Everybody knows where to go when the alarm sounds.`);
    const lead = bestLevel(s, 'leadership') >= 1 ? s.people.filter(p => here(s, p.id)).sort((a, b) => levelOf(s, b.id, 'leadership') - levelOf(s, a.id, 'leadership'))[0] : null;
    if (lead) practice(s, lead.id, 'leadership', 0.4);
    D.last = day;
  }
  D.rounds = 0; D.hours = 0; D.people = []; D.dry = false;
  // readiness fades about 1 % a day, and goes with the people who are gone
  for (const id of Object.keys(D.ready)) {
    if (!here(s, id)) { delete D.ready[id]; continue; }
    D.ready[id] = D.ready[id] * 0.988;
    if (D.ready[id] < 0.01) delete D.ready[id];
  }
  return out;
}

// ── what to suggest ──

export interface CourseIdea { course: CourseId; pid: string; why: string }
/** The one course worth suggesting now (a skill the place lacks that a course would give), or null. Never required. */
export function courseIdea(s: GameState): CourseIdea | null {
  const C = coursesOf(s);
  if (C.enrolled.length >= 2) return null;
  const adults = s.people.filter(p => here(s, p.id) && (!p.kid || p.age >= 14));
  if (!adults.length) return null;
  const built = (...k: string[]) => s.structures.some(st => k.includes(st.kind) && st.finishedAt !== null);
  const wants: Array<[CourseId, boolean, string]> = [
    ['firstaid', bestLevel(s, 'medic') < TEACH_LEVEL, 'nobody here is trained in first aid'],
    ['wiring', bestLevel(s, 'electrical') < 2 && built('solar_array', 'solar_farm', 'garage_solar', 'battery_shed', 'battery_bank', 'generator_shed'), 'the solar and the generator need someone who can read a wiring diagram'],
    ['engines', bestLevel(s, 'mechanic') < TEACH_LEVEL && (has(s, 'generator') >= 1 || s.structures.some(st => st.kind === 'generator_shed')), 'the generator and the saws need someone who knows engines'],
    ['ham', bestLevel(s, 'radio') < 2 && (has(s, 'ham_rig') >= 1 || has(s, 'sw_radio') >= 1), 'the radio sits unused: nobody has the licence'],
    ['gardening', bestLevel(s, 'gardener') < TEACH_LEVEL && built('garden', 'field', 'greenhouse'), 'the garden would give more with someone who has the training'],
    ['husbandry', bestLevel(s, 'husbandry') < TEACH_LEVEL && (built('chicken_coop', 'barn', 'sheep_barn') || ['goat', 'pig', 'steer', 'sheep', 'cow', 'rabbit'].some(a => has(s, a as MaterialId) >= 1)), 'the animals would do better with someone who has the training'],
    ['carpentry', bestLevel(s, 'builder') < 2, 'the building goes slowly with no carpenter'],
  ];
  for (const [course, need, why] of wants) {
    if (!need || C.enrolled.some(e => e.course === course)) continue;
    // the student: whoever already has the most of the skill (the best base to build on), who is free of a course
    const def = COURSES[course];
    const cands = adults.filter(p => p.age >= def.minAge && !hasCert(s, p.id, course) && !enrollmentOf(s, p.id)).sort((a, b) => levelOf(s, b.id, def.skill) - levelOf(s, a.id, def.skill));
    if (cands.length) return { course, pid: cands[0].id, why };
  }
  return null;
}

/** Practiced skill ids the key long-term "skilled hands" goal looks at. */
export function skillsGoalSteps(s: GameState): Array<{ label: string; done: boolean; detail: string }> {
  const hand = (k: Practiced) => s.people.find(p => here(s, p.id) && levelOf(s, p.id, k) === bestLevel(s, k))?.first ?? 'someone';
  const D = s.courses?.drills;
  return [
    { label: 'Someone who knows first aid', done: bestLevel(s, 'medic') >= TEACH_LEVEL, detail: bestLevel(s, 'medic') >= TEACH_LEVEL ? `${hand('medic')} (medicine ${Math.floor(bestLevel(s, 'medic'))})` : 'a first-aid course takes about twenty hours; casualties live or die on it' },
    { label: 'A licensed radio operator', done: bestLevel(s, 'radio') >= 2 || (s.courses?.certs ?? []).some(c => c.course === 'ham'), detail: 'the ham radio licence guide; the net and the news run on it' },
    { label: 'Hands for engines and metal', done: bestLevel(s, 'mechanic') >= TEACH_LEVEL, detail: bestLevel(s, 'mechanic') >= TEACH_LEVEL ? `${hand('mechanic')} (mechanics ${Math.floor(bestLevel(s, 'mechanic'))})` : 'small engines and welding courses; tools and vehicles last longer' },
    { label: 'Someone who can fix the wiring', done: bestLevel(s, 'electrical') >= TEACH_LEVEL, detail: bestLevel(s, 'electrical') >= TEACH_LEVEL ? `${hand('electrical')} (electrical ${Math.floor(bestLevel(s, 'electrical'))})` : 'the wiring and solar course; fewer faults on the pump and the panels' },
    { label: 'Run drills for the defense', done: !!D && (D.perWeek > 0 || readiness(s) >= 0.3), detail: s.armory.guns.length ? 'a weekly drill keeps the household from freezing at the alarm' : 'needs a gun first' },
  ];
}
