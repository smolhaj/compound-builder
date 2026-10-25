/**
 * Skills from practice (decided with the user: "all of these", docs/DECISIONS.md).
 * People get better at what they do and slowly lose what they stop doing. Pure.
 *
 *  Levels      the 0–10 skills on each person (family.ts) plus shooting
 *              (armory.ts `skill`). Hours of practice move a person through a
 *              level: 60 h from 0 to 1, rising 40 % a level, so a novice is
 *              competent (5) after about 560 hours (a long season of steady
 *              work) and a master (10) after about 3,600 (a few years of it).
 *  Practice    `practice(s, pid, skill, hours)` is the hook every task calls:
 *              building and felling time (engine.ts), fitting pumps and wiring
 *              (mechanics), treating the sick (medical.ts), a real fight and
 *              range time (shooting), and, until the daily-life schedule awards
 *              it, a little gardening, radio, hunting and trading each day.
 *  Learning    the young learn faster (12–25 ×1.25), the old slower; relearning
 *              something you once knew goes twice as fast; the right books
 *              speed it (×1.4); someone stressed, grieving or low learns less.
 *  Teaching    `teach(s, teacher, learner, skill, hours)`: an hour with someone
 *              who knows more is worth more than an hour alone. After the
 *              collapse the kids are schooled at home: four hours a weekday with
 *              the household's best teacher, rotating through what the adults
 *              know.
 *  Courses     in peacetime, evening and weekend courses in town (first
 *              responder, EMT, ham license, Master Gardener, small engines,
 *              carpentry, hunter education): money and hours, up to a level.
 *  Rust        after a few months without it a skill slips back: shooting
 *              about a level a year, the rest about half that, never more
 *              than two levels below the best they ever had.
 *
 * Real-world anchors: an EMT-Basic course is about 150 hours, a Wilderness
 * First Responder 80; a ham Technician license is a weekend of study;
 * shooting skill decays measurably within months without practice.
 */
import { SKILL_IDS, type Person, type SkillId } from './family';
import { CALIBER, GUN, skillOf, type Caliber } from './armory';
import { mindLearn } from './mind';
import { log } from './economy';
import { dayIndex, type GameState } from './state';

export type Practiced = SkillId | 'shooting';
export const PRACTICED: readonly Practiced[] = ['shooting', ...SKILL_IDS];
export const SKILL_NAME: Record<Practiced, string> = {
  shooting: 'Shooting', builder: 'Building', gardener: 'Gardening', medic: 'Medicine', mechanic: 'Mechanics',
  hunter: 'Hunting', negotiator: 'Negotiation', teacher: 'Teaching', radio: 'Radio',
};
/** "a better hand at …" */
const SKILL_NOUN: Record<Practiced, string> = {
  shooting: 'shooting', builder: 'building', gardener: 'the garden', medic: 'doctoring', mechanic: 'engines and pumps',
  hunter: 'hunting', negotiator: 'bargaining', teacher: 'teaching', radio: 'the radio',
};

/** Work hours logged today, per person (engine.ts writes; medical.ts and mind.ts read; reset each night). */
export interface WorkToday { build: number; fell: number; fit: number; carry: number }

export interface Learning {
  /** Hours into the current level, per person and skill. */
  xp: Record<string, Partial<Record<Practiced, number>>>;
  /** Day last practiced. */
  used: Record<string, Partial<Record<Practiced, number>>>;
  /** Highest level ever reached (rust never takes more than two below it; relearning is fast). */
  peak: Record<string, Partial<Record<Practiced, number>>>;
  /** Courses taken, per person. */
  courses: Record<string, string[]>;
  /** Today's work hours (engine.ts), and the barter trades seen (negotiation practice). */
  today: Record<string, WorkToday>;
  trades: number;
  day: number;
}
export const newLearning = (): Learning => ({ xp: {}, used: {}, peak: {}, courses: {}, today: {}, trades: 0, day: -1 });
export function learningOf(s: GameState): Learning {
  s.learning ??= newLearning();
  return s.learning;
}

/** Hours from a level to the next (60 h at 0, ×1.4 a level). */
export const hoursFor = (level: number) => 60 * 1.4 ** Math.max(0, Math.floor(level));
/** Days without practice before a skill starts to slip. */
export const RUST_GRACE: Record<Practiced, number> = { shooting: 60, builder: 120, gardener: 150, medic: 120, mechanic: 120, hunter: 120, negotiator: 180, teacher: 180, radio: 120 };
/** Levels lost a year past the grace (shooting fades fastest). */
export const RUST_PER_YEAR: Record<Practiced, number> = { shooting: 1, builder: 0.5, gardener: 0.4, medic: 0.6, mechanic: 0.5, hunter: 0.5, negotiator: 0.4, teacher: 0.3, radio: 0.6 };

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const alive = (s: GameState, pid: string) => { const n = s.personState.find(x => x.id === pid)?.needs; return !!n && n.died == null && !n.taken; };

/** The skill's level now (shooting is fractional; the others whole). */
export function levelOf(s: GameState, pid: string, k: Practiced): number {
  if (k === 'shooting') return skillOf(s, pid);
  return person(s, pid)?.skills[k] ?? 0;
}
/** Progress through the current level, 0–1 (the Family tab's bar). */
export function progressOf(s: GameState, pid: string, k: Practiced): number {
  if (k === 'shooting') { const v = skillOf(s, pid); return v >= 10 ? 1 : v - Math.floor(v); }
  const lv = levelOf(s, pid, k);
  if (lv >= 10) return 1;
  return Math.max(0, Math.min(1, (learningOf(s).xp[pid]?.[k] ?? 0) / hoursFor(lv)));
}
/** Days since last practiced (game start counts as practiced: they come with what they know). */
export function idleDays(s: GameState, pid: string, k: Practiced): number {
  return dayIndex(s.clock.t) - (learningOf(s).used[pid]?.[k] ?? 0);
}
export const rusting = (s: GameState, pid: string, k: Practiced) => levelOf(s, pid, k) >= 1 && idleDays(s, pid, k) > RUST_GRACE[k];

/** Books that help with a skill (stock ids). */
export function hasBooks(s: GameState, k: Practiced): boolean {
  if (k === 'medic') return (s.stock.medical_books ?? 0) >= 1;
  if (k === 'builder' || k === 'gardener' || k === 'mechanic' || k === 'radio' || k === 'hunter') return (s.stock.how_to_books ?? 0) >= 1;
  return false;
}

/** How fast this person learns now (age, books, relearning, state of mind). */
export function learnRate(s: GameState, p: Person, k: Practiced): number {
  const age = p.age < 8 ? 0.4 : p.age < 12 ? 0.7 : p.age <= 25 ? 1.25 : p.age <= 50 ? 1 : p.age <= 65 ? 0.85 : 0.7;
  const L = learningOf(s);
  const relearn = levelOf(s, p.id, k) < (L.peak[p.id]?.[k] ?? 0) ? 2 : 1;
  return age * relearn * (hasBooks(s, k) ? 1.4 : 1) * mindLearn(s, p.id);
}

/**
 * The practice hook: `hours` doing `skill`. Returns the level after. Logs a
 * level gained. Daily-life tasks call this (gardening, wood, medic duty, guard).
 * `quality` scales the hours (a course or a teacher > hours alone).
 */
export function practice(s: GameState, pid: string, skill: Practiced, hours: number, quality = 1): number {
  const p = person(s, pid);
  if (!p || hours <= 0 || !alive(s, pid)) return levelOf(s, pid, skill);
  const L = learningOf(s), day = dayIndex(s.clock.t);
  (L.used[pid] ??= {})[skill] = day;
  const gain = hours * quality * learnRate(s, p, skill);
  const peak = (L.peak[pid] ??= {});
  if (skill === 'shooting') {
    const before = skillOf(s, pid);
    let v = before, left = gain;
    while (left > 1e-9 && v < 10) { const need = (Math.floor(v) + 1 - v) * hoursFor(v); const use = Math.min(left, need); v += use / hoursFor(v); left -= use; }
    v = Math.min(10, v);
    s.armory.skill[pid] = v;
    peak.shooting = Math.max(peak.shooting ?? 0, Math.floor(v));
    if (Math.floor(v) > Math.floor(before) && Math.floor(v) >= 3) log(s, `${p.first} is a steadier shot now (${Math.floor(v)}).`);
    return v;
  }
  const xp = (L.xp[pid] ??= {});
  let lv = p.skills[skill], x = (xp[skill] ?? 0) + gain;
  const from = lv;
  while (lv < 10 && x >= hoursFor(lv)) { x -= hoursFor(lv); lv++; }
  if (lv >= 10) x = 0;
  p.skills[skill] = lv; xp[skill] = x;
  peak[skill] = Math.max(peak[skill] ?? 0, lv);
  if (lv > from && lv >= 2) log(s, `${p.first} is a better hand at ${SKILL_NOUN[skill]} now (${SKILL_NAME[skill].toLowerCase()} ${lv}).`);
  return lv;
}

/**
 * An hour with someone who knows more: the learner gains more than alone
 * (0.6 + 0.08 × the teacher's level in it + 0.05 × their teaching), the
 * teacher gets a little teaching practice. Nothing if the teacher knows less.
 */
export function teach(s: GameState, teacherId: string, learnerId: string, skill: Practiced, hours: number): number {
  const t = person(s, teacherId), l = person(s, learnerId);
  if (!t || !l || t === l || !alive(s, teacherId) || !alive(s, learnerId)) return 0;
  const tl = levelOf(s, teacherId, skill), ll = levelOf(s, learnerId, skill);
  if (tl <= ll) return 0;
  const q = 0.6 + 0.08 * tl + 0.05 * t.skills.teacher;
  practice(s, learnerId, skill, hours, q);
  practice(s, teacherId, 'teacher', hours * 0.5);
  (learningOf(s).used[teacherId] ??= {})[skill] = dayIndex(s.clock.t);   // explaining it keeps it fresh
  return q;
}

/** engine.ts: log the hours a person worked this sub-step (practice and the day's accident exposure). */
export function logWork(s: GameState, pid: string, kind: keyof WorkToday, hours: number): void {
  const w = (learningOf(s).today[pid] ??= { build: 0, fell: 0, fit: 0, carry: 0 });
  w[kind] += hours;
  const skill: Practiced = kind === 'fit' ? 'mechanic' : 'builder';
  practice(s, pid, skill, hours * (kind === 'carry' ? 0.2 : kind === 'fell' ? 0.6 : 1));
}

// ── courses (peacetime, while town works) ──

export interface Course { id: string; name: string; skill: Practiced; hours: number; usd: number; cap: number; minAge: number; blurb: string }
export const COURSES: Course[] = [
  { id: 'wfr', name: 'Wilderness First Responder', skill: 'medic', hours: 80, usd: 850, cap: 5, minAge: 16, blurb: 'Ten days: wounds, splints, the patient with no ambulance coming.' },
  { id: 'emt', name: 'EMT-Basic (community college)', skill: 'medic', hours: 150, usd: 1400, cap: 6, minAge: 18, blurb: 'A semester of evenings and ride-alongs.' },
  { id: 'ham', name: 'Ham radio license class', skill: 'radio', hours: 30, usd: 90, cap: 5, minAge: 10, blurb: 'Technician and General: a weekend class and the exam.' },
  { id: 'gardener', name: 'Master Gardener (county extension)', skill: 'gardener', hours: 60, usd: 250, cap: 6, minAge: 14, blurb: 'Soil, pests, seed saving, food preservation.' },
  { id: 'engine', name: 'Small engine & diesel repair', skill: 'mechanic', hours: 90, usd: 600, cap: 6, minAge: 14, blurb: 'Night classes: carburetors, injectors, generators.' },
  { id: 'carpentry', name: 'Carpentry I (community college)', skill: 'builder', hours: 120, usd: 900, cap: 6, minAge: 16, blurb: 'Framing, roofing, finish work.' },
  { id: 'hunter_ed', name: 'Hunter education and a guided hunt', skill: 'hunter', hours: 24, usd: 120, cap: 4, minAge: 10, blurb: 'Safety, tracking, field dressing.' },
];
export const COURSE = Object.fromEntries(COURSES.map(c => [c.id, c])) as Record<string, Course>;
export const coursesOpen = (s: GameState) => s.disaster.tracks.stores >= 0.5 && s.disaster.tracks.banks >= 0.5 && s.disaster.tracks.law >= 0.5;

/** Why this person can't take the course now, or null. */
export function courseProblem(s: GameState, pid: string, id: string): string | null {
  const c = COURSE[id], p = person(s, pid);
  if (!c || !p) return 'no such course';
  if (!coursesOpen(s)) return 'nobody is teaching courses now';
  if (!alive(s, pid)) return 'not here';
  if (p.age < c.minAge) return `${c.minAge} and up`;
  if (learningOf(s).courses[pid]?.includes(id)) return 'already taken';
  if (levelOf(s, pid, c.skill) >= c.cap) return 'past what the course teaches: practice';
  if (s.money < c.usd) return 'not enough money';
  return null;
}
export function takeCourse(s: GameState, pid: string, id: string): string | null {
  const why = courseProblem(s, pid, id);
  if (why) return why;
  const c = COURSE[id], p = person(s, pid)!;
  s.money -= c.usd;
  (learningOf(s).courses[pid] ??= []).push(id);
  // structured teaching with an instructor: worth half again its hours, up to the course's level
  const before = levelOf(s, pid, c.skill);
  practice(s, pid, c.skill, c.hours, 1.5);
  if (c.skill !== 'shooting' && p.skills[c.skill] > c.cap) { p.skills[c.skill] = Math.max(before, c.cap); learningOf(s).xp[pid]![c.skill] = 0; }
  log(s, `${p.first} took ${c.name} ($${c.usd.toLocaleString('en-US')}).`);
  return null;
}

// ── the range ──

/** Rounds an hour at the range. */
export const RANGE_ROUNDS = 50;
/**
 * Range time: `hours` of it with whatever they carry (or the .22). Live fire
 * costs ammunition (50 rounds an hour); with none left it's dry-fire drills,
 * worth a third as much. Returns a line for the log.
 */
export function rangeTime(s: GameState, pid: string, hours: number): string | null {
  const p = person(s, pid);
  if (!p || (p.kid && p.age < 10)) return 'too young';
  const gun = s.armory.guns.find(g => g.carrier === pid) ?? s.armory.guns.find(g => GUN[g.model].cal === '22lr') ?? s.armory.guns[0];
  if (!gun) return 'no gun to practice with';
  const cal: Caliber = GUN[gun.model].cal;
  const want = Math.round(RANGE_ROUNDS * hours), have = Math.floor(s.armory.ammo[cal] ?? 0), fired = Math.min(want, have);
  s.armory.ammo[cal] = have - fired;
  gun.fired += fired; gun.condition = Math.max(0, gun.condition - 0.0003 * fired);
  const live = want > 0 ? fired / want : 0;
  practice(s, pid, 'shooting', hours * (live + (1 - live) / 3));
  return fired > 0 ? `${p.first} put ${fired} rounds of ${CALIBER[cal].name} through the ${GUN[gun.model].name}.` : `${p.first} ran dry-fire drills: no ${CALIBER[cal].name} to spare.`;
}

// ── once a day ──

/** Passive practice the daily-life schedule will take over (set false there once its tasks call `practice`). */
export const PASSIVE_PRACTICE = { garden: true, radio: true, hunting: true, trading: true, school: true };

/** Once a day: passive practice, homeschool, rust. Returns log lines. */
export function skillsDay(s: GameState): string[] {
  const L = learningOf(s), day = dayIndex(s.clock.t);
  if (L.day === day) return [];
  L.day = day;
  const out: string[] = [];
  const here = s.people.filter(p => alive(s, p.id));
  const adults = here.filter(p => !p.kid);
  const best = (k: SkillId, n = 1) => [...adults].sort((a, b) => b.skills[k] - a.skills[k]).slice(0, n);
  const after = s.disaster.phase === 'impact' || s.disaster.phase === 'survival';
  // the day job: whatever they do at work stays fresh
  for (const ps of s.personState) if (ps.employed) {
    const p = person(s, ps.id);
    if (!p?.job) continue;
    const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));
    (L.used[p.id] ??= {})[top] = day;
  }
  const fin = s.structures.filter(x => x.finishedAt != null);
  if (PASSIVE_PRACTICE.garden && fin.some(x => x.kind === 'garden' || x.kind === 'field' || x.kind === 'greenhouse') && s.food.producedKcal > 500) for (const p of best('gardener', 2)) practice(s, p.id, 'gardener', 1.5);
  if (PASSIVE_PRACTICE.radio && ((s.stock.ham_rig ?? 0) >= 1 || (s.stock.sw_radio ?? 0) >= 1) && after) for (const p of best('radio')) practice(s, p.id, 'radio', (s.stock.ham_rig ?? 0) >= 1 ? 1 : 0.4);
  if (PASSIVE_PRACTICE.hunting && after && (s.armory.guns.length > 0 || (s.stock.snares ?? 0) >= 1)) for (const p of best('hunter')) practice(s, p.id, 'hunter', 1);
  // negotiation: every trade made with a neighbor
  const trades = (s as GameState & { barter?: { trades: number } }).barter?.trades ?? 0;
  if (PASSIVE_PRACTICE.trading && trades > L.trades) { for (const p of best('negotiator')) practice(s, p.id, 'negotiator', 3 * (trades - L.trades)); }
  L.trades = trades;
  // homeschool once the town school is gone: weekdays, four hours with the best teacher, two subjects a day
  if (PASSIVE_PRACTICE.school && s.disaster.tracks.stores < 0.5 && day % 7 < 5) {
    const kids = here.filter(p => p.kid && p.age >= 6);
    const t = [...adults].sort((a, b) => b.skills.teacher - a.skills.teacher)[0];
    if (t && kids.length) {
      const subjects = SKILL_IDS.filter(k => k !== 'teacher');
      for (const k of [subjects[day % subjects.length], subjects[(day + 3) % subjects.length]]) {
        // the subject's best adult teaches it if they know more than the teacher; the teacher otherwise
        const who = [...adults].sort((a, b) => b.skills[k] - a.skills[k])[0];
        const by = who && who.skills[k] > t.skills[k] + 1 ? who : t;
        for (const kid of kids) if (!teach(s, by.id, kid.id, k, 2)) practice(s, kid.id, k, 1);
      }
    }
  }
  // rust
  for (const p of here) for (const k of PRACTICED) {
    const lv = levelOf(s, p.id, k);
    if (lv < 1 || idleDays(s, p.id, k) <= RUST_GRACE[k]) continue;
    const peak = Math.max(L.peak[p.id]?.[k] ?? 0, Math.floor(lv));
    (L.peak[p.id] ??= {})[k] = peak;
    const floor = Math.max(0, peak - 2), loss = RUST_PER_YEAR[k] / 365;
    if (k === 'shooting') { s.armory.skill[p.id] = Math.max(Math.min(lv, floor), lv - loss); continue; }
    const xp = (L.xp[p.id] ??= {});
    let x = (xp[k] ?? 0) - loss * hoursFor(lv), l = p.skills[k];
    if (x < 0) {
      if (l > floor) { l--; x += hoursFor(l); out.push(`${p.first} is getting rusty at ${SKILL_NOUN[k]} (${SKILL_NAME[k].toLowerCase()} ${l}).`); }
      else x = 0;
    }
    p.skills[k] = l; xp[k] = x;
  }
  return out;
}
