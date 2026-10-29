/**
 * Skills from practice (people depth). Pure.
 *
 * People get better at what they do and slowly lose what they stop doing.
 *
 *  Levels      0–10. Eight live on the person (`Person.skills`: builder,
 *              gardener, medic, mechanic, hunter, negotiator, teacher, radio),
 *              shooting is the armory's, and four more are kept here because
 *              they are things people pick up rather than hire for: cooking,
 *              animal husbandry, electrical / solar work and leadership.
 *              Those four start from what the person's job and years suggest
 *              (`baseLevel`) and only then move with practice.
 *  Practice    `practice(s, pid, skill, hours)` is the one hook every task
 *              calls (building, felling, fitting, the roster's garden, kitchen,
 *              livestock, hunt, medic, teach, radio and repairs hours; a fight;
 *              range time; a gathering). Hours move a person through a level:
 *              100 h from 0 to 1, rising 45 % a level, so a novice is
 *              competent (5) after about 640 more hours (a long season of
 *              steady work) and a master (10) after some 9,000.
 *  Learning    the young learn faster (12–25 ×1.25), the old slower; relearning
 *              something once known goes twice as fast; the right books speed
 *              it (x1.4); someone stressed, grieving or low learns less.
 *  Mentoring   an elder or skilled adult shows a youth the trade (the Mentor
 *              duty): an hour with someone who knows more is worth more than
 *              an hour alone, and the teacher gets a little teaching practice.
 *  Rust        after eight months without using it a skill slips, by about a
 *              third of a level a year (shooting twice that), never more than
 *              two levels under the best the person has reached, and
 *              relearning is quick. Whatever the day job is stays fresh.
 *  Effects     modest, centred on level 3 so an average hand is exactly as fast
 *              as before: `skillFactor` scales roster work speed (±3 % a level),
 *              the cook's hours, the herd's and the pond's care, accident
 *              odds; builder / gardener / hunter / medic / shooting keep the
 *              uses they always had (build rate, crop yield, game, the wound
 *              rolls, accuracy at the gate).
 *
 * Real-world anchors: an EMT-Basic course is about 150 hours; shooting
 * skill decays measurably within months without practice; a trade
 * apprenticeship is about 8,000 hours.
 */
import { backgroundOf, SKILL_IDS, type Person, type SkillId } from './family';
import { GUN, skillOf } from './armory';
import { log } from './economy';
import { dayIndex, type GameState } from './state';

export type ExtraSkill = 'cooking' | 'husbandry' | 'electrical' | 'leadership';
export const EXTRA_SKILLS: readonly ExtraSkill[] = ['cooking', 'husbandry', 'electrical', 'leadership'];
export type Practiced = SkillId | ExtraSkill | 'shooting';
export const PRACTICED: readonly Practiced[] = ['shooting', ...SKILL_IDS, ...EXTRA_SKILLS];
export const SKILL_NAME: Record<Practiced, string> = {
  shooting: 'Firearms', builder: 'Carpentry', gardener: 'Gardening', medic: 'Medicine', mechanic: 'Mechanics', hunter: 'Hunting and tracking',
  negotiator: 'Negotiating', teacher: 'Teaching', radio: 'Radio', cooking: 'Cooking', husbandry: 'Animal husbandry', electrical: 'Electrical and solar', leadership: 'Leadership',
};
/** "a better hand at …" */
const SKILL_NOUN: Record<Practiced, string> = {
  shooting: 'shooting', builder: 'building', gardener: 'the garden', medic: 'doctoring', mechanic: 'engines and tools', hunter: 'hunting', negotiator: 'bargaining',
  teacher: 'teaching', radio: 'the radio', cooking: 'the kitchen', husbandry: 'the animals', electrical: 'wiring and solar', leadership: 'running things',
};
export const isExtra = (k: Practiced): k is ExtraSkill => (EXTRA_SKILLS as readonly string[]).includes(k);

export interface Learning {
  /** Hours into the current level, per person and skill. */
  xp: Record<string, Partial<Record<Practiced, number>>>;
  /** Day last practiced. */
  used: Record<string, Partial<Record<Practiced, number>>>;
  /** Highest level reached (rust never takes more than two below it; relearning is fast). */
  peak: Record<string, Partial<Record<Practiced, number>>>;
  /** The four skills that do not live on the person. */
  extra: Record<string, Partial<Record<ExtraSkill, number>>>;
  /** Hours of mentoring given and taken, for the readout. */
  mentored: Record<string, number>;
  day: number;
}
export const newLearning = (): Learning => ({ xp: {}, used: {}, peak: {}, extra: {}, mentored: {}, day: -1 });
export function learningOf(s: GameState): Learning {
  s.learning ??= newLearning();
  return s.learning;
}

/** Hours from a level to the next (100 h at 0, x1.45 a level). */
export const hoursFor = (level: number) => 100 * 1.45 ** Math.max(0, Math.floor(level));
/** Days without practice before a skill starts to slip. */
export const RUST_GRACE: Record<Practiced, number> = {
  shooting: 90, builder: 240, gardener: 270, medic: 240, mechanic: 240, hunter: 240, negotiator: 300, teacher: 300, radio: 240, cooking: 300, husbandry: 270, electrical: 240, leadership: 360,
};
/** Levels lost a year past the grace. */
export const RUST_PER_YEAR: Record<Practiced, number> = {
  shooting: 0.8, builder: 0.35, gardener: 0.3, medic: 0.45, mechanic: 0.35, hunter: 0.35, negotiator: 0.3, teacher: 0.2, radio: 0.45, cooking: 0.2, husbandry: 0.3, electrical: 0.35, leadership: 0.15,
};

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const here = (s: GameState, pid: string) => { const n = s.personState.find(x => x.id === pid)?.needs; return !!n && n.died == null && !n.taken && !n.left; };
const hash = (t: string) => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

/** What a person starts the game with in the four kept-here skills (from the job, age, family and a seeded pinch of talent). */
export function baseLevel(p: Person, k: ExtraSkill): number {
  if (p.kid && p.age < 8) return 0;
  const talent = hash(p.id + p.first + k) % 3;            // 0..2
  const job = p.job?.id, sk = p.skills;
  const young = p.kid ? 0.4 : 1;
  let v = 0;
  switch (k) {
    case 'cooking':
      v = 1 + (p.age >= 35 ? 1 : 0) + (p.elder ? 1 : 0) + (job === 'butcher' ? 2 : 0) + (sk.gardener >= 5 ? 1 : 0) + talent * 0.7;
      break;
    case 'husbandry':
      v = Math.round(sk.gardener * 0.4) + (job === 'farmer' || job === 'vet' ? 3 : job === 'warden' || job === 'nursery' || job === 'butcher' ? 2 : 0) + (p.elder ? 1 : 0) + talent * 0.5;
      break;
    case 'electrical':
      v = Math.round(Math.max(sk.mechanic * 0.5, sk.radio * 0.45)) + (job === 'electrician' || job === 'lineman' ? 4 : job === 'hvac' || job === 'software' || job === 'dispatcher' ? 2 : 0) + talent * 0.4;
      break;
    case 'leadership': {
      const bg = backgroundOf(p);
      v = (p.age >= 35 ? 1 : 0) + (p.age >= 50 ? 1 : 0) + Math.round(sk.negotiator * 0.4) + (bg ? 3 : 0) + (job === 'teacher' || job === 'insurance' || job === 'dispatcher' ? 1 : 0) + (job === 'police' || job === 'soldier' ? 2 : 0) + talent * 0.4;
      break;
    }
  }
  return Math.max(0, Math.min(8, Math.floor(v * young)));
}

/** The skill's level now (shooting and the young's school-learned skills may be fractional; the rest whole). */
export function levelOf(s: GameState, pid: string, k: Practiced): number {
  if (k === 'shooting') return skillOf(s, pid);
  const p = person(s, pid);
  if (!p) return 0;
  if (isExtra(k)) {
    const L = learningOf(s), e = (L.extra[pid] ??= {});
    return (e[k] ??= baseLevel(p, k));
  }
  return p.skills[k] ?? 0;
}
/** A person object's level (no state needed for the eight; the four default to their base). */
export function levelFor(s: GameState, p: Person, k: Practiced): number {
  if (k === 'shooting') return skillOf(s, p.id);
  if (isExtra(k)) return learningOf(s).extra[p.id]?.[k] ?? baseLevel(p, k);
  return p.skills[k] ?? 0;
}
/** Progress through the current level, 0–1 (the Family tab's bar). */
export function progressOf(s: GameState, pid: string, k: Practiced): number {
  if (k === 'shooting') { const v = skillOf(s, pid); return v >= 10 ? 1 : v - Math.floor(v); }
  const lv = levelOf(s, pid, k);
  if (lv >= 10) return 1;
  return Math.max(0, Math.min(1, (learningOf(s).xp[pid]?.[k] ?? 0) / hoursFor(lv)));
}
/** Days since last practiced (the start of the game counts as practiced: they arrive with what they know). */
export function idleDays(s: GameState, pid: string, k: Practiced): number {
  return dayIndex(s.clock.t) - (learningOf(s).used[pid]?.[k] ?? 0);
}
export const rusting = (s: GameState, pid: string, k: Practiced) => levelOf(s, pid, k) >= 1 && idleDays(s, pid, k) > RUST_GRACE[k];

/** The best level among the living adults on the place (or among `ids`). */
export function bestLevel(s: GameState, k: Practiced, ids?: readonly string[]): number {
  let best = 0;
  for (const p of s.people) {
    if (p.kid && p.age < 14) continue;
    if (!here(s, p.id) || (ids && !ids.includes(p.id))) continue;
    best = Math.max(best, levelFor(s, p, k));
  }
  return best;
}
/** Who is best at it (ties go to the elder in the list), or null. */
export function bestHand(s: GameState, k: Practiced): Person | null {
  let best: Person | null = null, lv = -1;
  for (const p of s.people) {
    if (p.kid && p.age < 14) continue;
    if (!here(s, p.id)) continue;
    const v = levelFor(s, p, k);
    if (v > lv) { lv = v; best = p; }
  }
  return best;
}

/** Speed / yield multiplier from a level: 1 at level 3, ±3 % a level (0.91 at none, 1.21 at ten). */
export const skillFactor = (level: number): number => 1 + 0.03 * (Math.max(0, Math.min(10, level)) - 3);

/** Books that help with a skill (stock ids). */
export function hasBooks(s: GameState, k: Practiced): boolean {
  if (k === 'medic' && (s.stock.medical_books ?? 0) >= 1) return true;
  return (s.stock.manuals ?? 0) >= 1 && k !== 'negotiator' && k !== 'leadership';
}

/** How fast this person learns now (age, books, relearning, state of mind). */
export function learnRate(s: GameState, p: Person, k: Practiced): number {
  const age = p.age < 8 ? 0.4 : p.age < 12 ? 0.7 : p.age <= 25 ? 1.25 : p.age <= 50 ? 1 : p.age <= 65 ? 0.85 : 0.7;
  const L = learningOf(s);
  const relearn = levelOf(s, p.id, k) < (L.peak[p.id]?.[k] ?? 0) ? 2 : 1;
  return age * relearn * (hasBooks(s, k) ? 1.4 : 1) * mindLearning(s, p.id);
}
/** Learning rate from the state of mind (0.5–1): the stressed, grieving and low take less in. Read straight off the psyche so this file need not import mind.ts. */
function mindLearning(s: GameState, pid: string): number {
  const ps = s.mind?.psyche[pid];
  if (!ps) return 1;
  return Math.max(0.5, 1 - ps.stress / 300 - ps.low / 250 - ps.trauma / 400);
}

/**
 * The practice hook: `hours` doing `skill`. Returns the level after. Logs a
 * level gained. `quality` scales the hours (a teacher or a book is more than
 * hours alone).
 */
export function practice(s: GameState, pid: string, skill: Practiced, hours: number, quality = 1): number {
  const p = person(s, pid);
  if (!p || hours <= 0 || !here(s, pid)) return p ? levelOf(s, pid, skill) : 0;
  const L = learningOf(s), day = dayIndex(s.clock.t);
  (L.used[pid] ??= {})[skill] = day;
  const gain = hours * quality * learnRate(s, p, skill);
  const peak = (L.peak[pid] ??= {});
  if (skill === 'shooting') {
    const before = skillOf(s, pid);
    let v = before, left = gain;
    while (left > 1e-9 && v < 10) { const need = (Math.floor(v) + 1 - v) * hoursFor(v) * 0.25; const use = Math.min(left, need); v += use / (hoursFor(v) * 0.25); left -= use; }
    v = Math.min(10, v);
    s.armory.skill[pid] = v;
    peak.shooting = Math.max(peak.shooting ?? 0, Math.floor(v));
    if (Math.floor(v) > Math.floor(before) && Math.floor(v) >= 3) log(s, `${p.first} is a steadier shot now (${Math.floor(v)}).`);
    return v;
  }
  const xp = (L.xp[pid] ??= {});
  let lv = levelOf(s, pid, skill), x = (xp[skill] ?? 0) + gain;
  const from = lv;
  while (lv < 10 && x >= hoursFor(lv)) { x -= hoursFor(lv); lv = Math.floor(lv) + 1; }
  if (lv >= 10) x = 0;
  if (isExtra(skill)) (L.extra[pid] ??= {})[skill] = lv; else p.skills[skill] = lv;
  xp[skill] = x;
  peak[skill] = Math.max(peak[skill] ?? 0, Math.floor(lv));
  if (Math.floor(lv) > Math.floor(from) && lv >= 2 && !p.kid) log(s, `${p.first} is a better hand at ${SKILL_NOUN[skill]} now (${SKILL_NAME[skill].toLowerCase()} ${Math.floor(lv)}).`);
  return lv;
}

/**
 * An hour of mentoring: the learner gains more than alone (0.7 + 0.07 x the
 * teacher's level + 0.04 x their teaching), the teacher gets some teaching
 * practice and keeps the skill fresh by explaining it. Nothing if the teacher
 * does not know more.
 */
export function teach(s: GameState, teacherId: string, learnerId: string, skill: Practiced, hours: number): number {
  const t = person(s, teacherId), l = person(s, learnerId);
  if (!t || !l || t === l || !here(s, teacherId) || !here(s, learnerId)) return 0;
  const tl = levelOf(s, teacherId, skill), ll = levelOf(s, learnerId, skill);
  if (tl <= ll) return 0;
  const q = 0.7 + 0.07 * tl + 0.04 * t.skills.teacher;
  practice(s, learnerId, skill, hours, q);
  practice(s, teacherId, 'teacher', hours * 0.4);
  const L = learningOf(s);
  (L.used[teacherId] ??= {})[skill] = dayIndex(s.clock.t);
  L.mentored[learnerId] = (L.mentored[learnerId] ?? 0) + hours;
  L.mentored[teacherId] = (L.mentored[teacherId] ?? 0) + hours;
  return q;
}

/** What a mentor can pass on to a pupil: the skill where the mentor leads by most (at least two levels, and the mentor at 3+), or null. `prefer` breaks ties. */
export function mentorSkill(s: GameState, mentorId: string, pupilId: string, prefer: readonly Practiced[] = []): Practiced | null {
  let best: Practiced | null = null, gap = 1.5;
  for (const k of PRACTICED) {
    if (k === 'shooting' || k === 'teacher') continue;
    const m = levelOf(s, mentorId, k), pl = levelOf(s, pupilId, k);
    const g = m - pl + (prefer.includes(k) ? 0.75 : 0);
    if (m >= 3 && m - pl >= 2 && g > gap) { gap = g; best = k; }
  }
  return best;
}

/** The skills a person is best at, strongest first (the readout). */
export function topSkills(s: GameState, p: Person, n = 3): Array<{ skill: Practiced; level: number; progress: number; rusty: boolean }> {
  return PRACTICED.map(k => ({ skill: k, level: levelOf(s, p.id, k) }))
    .filter(x => x.level >= 1)
    .sort((a, b) => b.level - a.level)
    .slice(0, n)
    .map(x => ({ ...x, progress: progressOf(s, p.id, x.skill), rusty: rusting(s, p.id, x.skill) }));
}

/** Once a day: the day job stays fresh, leadership grows a little in a big household that keeps going, and the unused rust. Returns log lines. */
export function skillsDay(s: GameState): string[] {
  const L = learningOf(s), day = dayIndex(s.clock.t);
  if (L.day === day) return [];
  L.day = day;
  const out: string[] = [];
  const here_ = s.people.filter(p => here(s, p.id));
  // the day job: whatever they do at work stays fresh
  for (const ps of s.personState) if (ps.employed) {
    const p = person(s, ps.id);
    if (!p?.job) continue;
    const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));
    (L.used[p.id] ??= {})[top] = day;
  }
  // running a household of five or more is practice in running things (a little, for the one who does)
  if (here_.length >= 5) { const lead = bestHand(s, 'leadership'); if (lead) practice(s, lead.id, 'leadership', 0.25); }
  // rust
  for (const p of here_) for (const k of PRACTICED) {
    const lv = levelOf(s, p.id, k);
    if (lv < 1 || idleDays(s, p.id, k) <= RUST_GRACE[k]) continue;
    const peak = Math.max(L.peak[p.id]?.[k] ?? 0, Math.floor(lv));
    (L.peak[p.id] ??= {})[k] = peak;
    const floor = Math.max(0, peak - 2), loss = RUST_PER_YEAR[k] / 365;
    if (k === 'shooting') { s.armory.skill[p.id] = Math.max(Math.min(lv, floor), lv - loss); continue; }
    const xp = (L.xp[p.id] ??= {});
    let x = (xp[k] ?? 0) - loss * hoursFor(lv), l = Math.floor(lv);
    if (x < 0) {
      if (l > floor) { l--; x += hoursFor(l); if (!p.kid) out.push(`${p.first} is getting rusty at ${SKILL_NOUN[k]} (${SKILL_NAME[k].toLowerCase()} ${l}). It comes back fast with use.`); }
      else x = 0;
    }
    if (isExtra(k)) (L.extra[p.id] ??= {})[k] = l; else p.skills[k] = l;
    xp[k] = x;
  }
  return out;
}

// ── range time ──

/** Rounds an hour at the range (.22 or whatever they carry). */
export const RANGE_ROUNDS = 40;
/** Range time costs ammunition; with none it is dry-fire drills, worth a third. Returns a log line, or an explanation when it cannot happen. */
export function rangeTime(s: GameState, pid: string, hours: number): string {
  const p = person(s, pid);
  if (!p || !here(s, pid)) return 'not here';
  if (p.kid && p.age < 12) return `${p.first} is too young for the range`;
  const gun = s.armory.guns.find(g => g.carrier === pid) ?? s.armory.guns[0];
  if (!gun) return 'There is no gun to practice with.';
  const cal = GUN[gun.model].cal;
  const want = Math.round(RANGE_ROUNDS * hours), have = Math.floor(s.armory.ammo[cal] ?? 0), fired = Math.min(want, have);
  s.armory.ammo[cal] = have - fired;
  gun.fired += fired; gun.condition = Math.max(0, gun.condition - 0.0002 * fired);
  const live = want > 0 ? fired / want : 0;
  practice(s, pid, 'shooting', hours * (live + (1 - live) / 3));
  return fired > 0 ? `${p.first} put ${fired} rounds through the ${GUN[gun.model].name} at the range.` : `${p.first} ran dry-fire drills: no ammunition to spare.`;
}
