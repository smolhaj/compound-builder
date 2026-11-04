/**
 * The long game, part 1: the family over the years (task #34: endless play;
 * aging, heirs and births; a chronicle; a dynasty score; milestones). Pure.
 *
 *  Aging       everyone ages on their birthday. At 18 a kid is an adult (a
 *              day job if there is still a town to work in); at 67 an adult
 *              retires into an elder. Kids pick up the household's skills a
 *              little each year, faster with a teacher in the house.
 *  Old age     a yearly risk that doubles about every seven years (≈ 1 % at
 *              60, 6 % at 80, 16 % at 90; US life tables), twice that with
 *              no doctor to see.
 *  Partners    an unpartnered adult (20–45) meets someone: from town in
 *              peacetime, a neighbor or a survivor after. They marry in, or
 *              pair with someone already living here who isn't kin.
 *  Births      a partnered pair who can have a child: about one in ten a year
 *              (fewer once the world is down), not within two years of the
 *              last. With no hospital and no medic, childbirth is a risk.
 *              Couples who can't: now and then they adopt, or (after) take
 *              in a child with no one left.
 *  Chronicle   eras, births, deaths, partnerships, coming of age, milestones.
 *  Dynasty     points: a person-year lived on the place, each era's grade,
 *              each birth, each milestone.
 */
import { calendarOf, dayIndex, type GameState } from './state';
import { freshNeeds } from './needs';
import { dayJob, fullName, SKILL_IDS, type Person, type SkillId } from './family';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { mulberry32 } from './rng';
import { log } from './economy';
import { PRACTICED, isExtra, learningOf, levelFor } from './skills';
import { afterBirth, birthRisk, duePregnancies, startPregnancy } from './medical';
import { fosterOut, wardsDay, type Ward } from './orphans';
import { threatsDay } from './threats';
import type { Threat } from './threatState';

export type ChronicleKind = 'era' | 'birth' | 'death' | 'partner' | 'coming' | 'milestone' | 'retire' | 'home' | 'threat';
export interface ChronicleEntry { t: number; year: number; kind: ChronicleKind; text: string }

/** One era: a disaster lived through (eras.ts fills these in). */
export interface EraRecord { n: number; kind: string; name: string; fate: string; hitDay: number; endDay: number; ending: string; grade: string; score: number; /** The report card's front-page line (older saves have none). */ headline?: string }

export interface Lineage {
  /** The family name (the founders'). */
  family: string;
  /** Era number (1 = the first disaster). */
  era: number;
  eras: EraRecord[];
  /** The era's card was closed and played on; waiting for the world to settle before the next one is rolled. */
  settling: boolean;
  chronicle: ChronicleEntry[];
  milestones: string[];
  points: number;
  /** Last day of a birth, by parent id. */
  lastBirth: Record<string, number>;
  /** Deaths already written up. */
  mourned: string[];
  /** Last day aging ran. */
  day: number;
  /** The era whose hit is already in the chronicle. */
  hitEra: number;
  /** Where the dynasty score came from (sums to `points`; save v73). */
  parts: Record<string, number>;
  /** Kinds of building already written up as "finished" in the chronicle. */
  built: string[];
  /** Days in a row the place has grown what it eats (across eras, quiet years included). */
  selfFedDays: number;
  /** Children away with a neighbor household after the last adult died; the place is held for them (save v74; sim/orphans.ts). */
  wards: Ward[];
  /** The yearly threat in force, and the year it was last rolled (save v74; sim/threats.ts). */
  threat: Threat | null;
  threatYear: number;
  /** The place started on the county grid, and the day the family pulled the meter (null: still on it, or never was; save v74). */
  startedOnGrid: boolean;
  gridLeft: number | null;
  /** Upgrade / rebuild lines written this year, to keep the chronicle from filling with them. */
  noteYear: number;
  noteCount: number;
}

export const PART_LABEL: Record<string, string> = { years: 'People kept on the place', eras: 'Eras weathered', births: 'Children', milestones: 'Milestones', takenIn: 'People taken in', place: 'Size of the place', selfFed: 'Years feeding itself' };
/** Add to the dynasty score, filed under where it came from. */
export function award(L: Lineage, part: string, n: number): void {
  L.points += n;
  L.parts[part] = (L.parts[part] ?? 0) + n;
}

export const newLineage = (family: string): Lineage => ({ family, era: 1, eras: [], settling: false, chronicle: [], milestones: [], points: 0, lastBirth: {}, mourned: [], day: -1, hitEra: 0, parts: {}, built: [], selfFedDays: 0, wards: [], threat: null, threatYear: -1, startedOnGrid: false, gridLeft: null, noteYear: -1, noteCount: 0 });

const NOTABLE = /tower|bunker|wall|gate|greenhouse|barn|orchard|well|cistern|solar|workshop|forge|clinic|cellar/;
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

const hash = (s: string, seed: number) => { let h = seed * 2654435761 >>> 0; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 2246822519) >>> 0; return h; };

/** Fill in the founding family's kinship: birthdays, generations, the couple(s), whose kids are whose. */
export function foundLineage(people: Person[], seed: number): void {
  const adults = people.filter(p => !p.kid && !p.elder), elders = people.filter(p => p.elder);
  for (const p of people) {
    p.kin ??= true;
    p.bday ??= 1 + hash(p.id, seed) % 365;
    p.gen ??= p.elder ? 0 : p.kid ? 2 : 1;
  }
  if (adults.length === 2 && !adults[0].partner) { adults[0].partner = adults[1].id; adults[1].partner = adults[0].id; }
  if (elders.length === 2 && !elders[0].partner) { elders[0].partner = elders[1].id; elders[1].partner = elders[0].id; }
  for (const k of people.filter(p => p.kid)) k.parents ??= adults.map(a => a.id);
  for (const a of adults) if (elders.length) a.parents ??= [elders[0].id];
}

const alive = (s: GameState, p: Person) => s.personState.find(x => x.id === p.id)?.needs.died == null;
const kinOf = (a: Person, b: Person) => a.parents?.includes(b.id) || b.parents?.includes(a.id) || !!a.parents?.some(x => b.parents?.includes(x));

export function chronicle(s: GameState, kind: ChronicleKind, text: string): void {
  const L = s.lineage;
  L.chronicle.push({ t: s.clock.t, year: calendarOf(s.clock).year, kind, text });
  if (L.chronicle.length > 400) L.chronicle.splice(0, L.chronicle.length - 400);
}

/** Upgrades and rebuilds the chronicle will write up in a year; the rest still happen, they just are not recorded. */
export const UPKEEP_NOTES_PER_YEAR = 3;
/** One line for an upgrade or a rebuild, capped per year so a busy builder does not fill the chronicle. */
export function chronicleUpkeep(s: GameState, text: string): boolean {
  const L = s.lineage, year = calendarOf(s.clock).year;
  if (L.noteYear !== year) { L.noteYear = year; L.noteCount = 0; }
  if (L.noteCount >= UPKEEP_NOTES_PER_YEAR) return false;
  L.noteCount++;
  chronicle(s, 'home', text);
  return true;
}

/** The family pulled the meter (or took the line again). Only a grid the place started on counts toward "first winter off-grid". */
export function gridChanged(s: GameState, on: boolean): void {
  const L = s.lineage;
  L.gridLeft = on || !L.startedOnGrid ? null : dayIndex(s.clock.t);
}
/** Whole deep winters (the turn of the year) lived through since leaving the grid: the first one counts. */
export function winterOffGrid(s: GameState): boolean {
  const L = s.lineage;
  if (!L.startedOnGrid || L.gridLeft == null || s.utilities.grid) return false;
  const day = dayIndex(s.clock.t), doy = calendarOf(s.clock).doy;
  const sinceThaw = (doy - 21 + 365) % 365;       // days since the 21st of January
  const thawDay = day - sinceThaw;                // the end of the latest deep winter
  return L.gridLeft <= thawDay - 36;              // ...and the family was off the grid when it began (day 350)
}
/** Yearly risk of dying of old age. */
export function oldAgeRisk(age: number, doctor: boolean): number {
  return Math.min(0.6, 0.00003 * Math.exp(0.095 * age)) * (doctor ? 1 : 2);
}

const FIRST: Record<'f' | 'm', string[]> = {
  f: ['Ada', 'Clara', 'Edie', 'Faye', 'Hazel', 'Iris', 'Josie', 'Lena', 'Mae', 'Opal', 'Pearl', 'Rose', 'Sadie', 'Vera', 'Willa', 'Zoe'],
  m: ['Abe', 'Cal', 'Dean', 'Emmett', 'Gus', 'Hollis', 'Jesse', 'Levi', 'Milo', 'Ned', 'Otis', 'Rhett', 'Silas', 'Theo', 'Virgil', 'Will'],
};
const LAST = ['Abbott', 'Boone', 'Crane', 'Doyle', 'Everett', 'Foley', 'Grant', 'Holt', 'Ives', 'Kemp', 'Lowry', 'Marsh', 'Pruitt', 'Rowe', 'Shaw', 'Vance'];

function newPerson(s: GameState, p: Omit<Person, 'id' | 'shirt' | 'skills'> & { skills?: Person['skills'] }, r: () => number): Person {
  const skills = p.skills ?? Object.fromEntries(SKILL_IDS.map(k => [k, 0])) as Record<SkillId, number>;
  const out: Person = { id: `b${s.nextId++}`, shirt: [0x8a3b2e, 0x3b5b8c, 0x5a6e3a, 0x7a5a2a, 0x6a3a6a, 0x2f6f6f, 0xa86a2a, 0x4a4a52][Math.floor(r() * 8)], ...p, skills };
  s.people.push(out);
  s.personState.push({ id: out.id, task: 'idle', target: null, needs: freshNeeds() });
  // a weekender's baby goes back and forth with its parents (sim/weekender.ts)
  if (s.weekend?.mode === 'split' && out.parents?.some(id => s.weekend!.travelers.includes(id))) s.weekend.travelers.push(out.id);
  return out;
}
const pickName = (s: GameState, body: 'f' | 'm', r: () => number) => {
  const used = new Set(s.people.map(p => p.first));
  const free = FIRST[body].filter(n => !used.has(n));
  const list = free.length ? free : FIRST[body];
  return list[Math.floor(r() * list.length)];
};

const MILESTONES: Array<{ id: string; name: string; points: number; test: (s: GameState, years: number) => boolean }> = [
  { id: 'first_winter', name: 'First winter on the place', points: 10, test: (_, y) => y >= 1 },
  { id: 'off_grid_winter', name: 'First winter off-grid', points: 25, test: s => winterOffGrid(s) },
  { id: 'a_home', name: 'A home of your own making', points: 10, test: s => s.structures.some(x => isFinished(x) && isHome(x.kind) && !x.pre) },
  { id: 'first_era', name: 'Came through the first era', points: 25, test: s => s.lineage.eras.length >= 1 },
  { id: 'three_eras', name: 'Three eras weathered', points: 75, test: s => s.lineage.eras.length >= 3 },
  { id: 'born_here', name: 'The first child born on the place', points: 20, test: s => s.people.some(p => p.bornHere) },
  { id: 'heir', name: 'A child of the place comes of age', points: 40, test: s => s.people.some(p => p.bornHere && !p.kid) },
  { id: 'three_gen', name: 'Three generations under one roof', points: 40, test: s => new Set(s.people.filter(p => p.kin && alive(s, p)).map(p => p.gen ?? 1)).size >= 3 },
  { id: 'dozen', name: 'A dozen at the table', points: 30, test: s => s.people.filter(p => alive(s, p)).length >= 12 },
  { id: 'decade', name: 'Ten years on the place', points: 30, test: (_, y) => y >= 10 },
  { id: 'quarter', name: 'Twenty-five years on the place', points: 60, test: (_, y) => y >= 25 },
  { id: 'half', name: 'Fifty years on the place', points: 120, test: (_, y) => y >= 50 },
  { id: 'century', name: 'A hundred years on the place', points: 250, test: (_, y) => y >= 100 },
  { id: 'self_fed_year', name: 'A full year feeding yourselves', points: 30, test: s => s.lineage.selfFedDays >= 365 },
  { id: 'self_fed_decade', name: 'Ten years self-fed', points: 100, test: s => s.lineage.selfFedDays >= 3650 },
  { id: 'long_dark', name: 'Five years in a world that never came back', points: 60, test: s => s.lineage.eras.some(e => e.fate === 'never') && s.disaster.tracks.stores < 0.3 && s.disaster.tracks.grid < 0.3 && s.lineage.eras.filter(e => e.fate === 'never').some(e => dayIndex(s.clock.t) - e.hitDay >= 5 * 365) },
];
export const MILESTONE_NAME: Record<string, string> = Object.fromEntries(MILESTONES.map(m => [m.id, m.name]));
export const MILESTONE_COUNT = MILESTONES.length;

/** Once a day: birthdays, old age, partners, births, the chronicle and the score. Returns lines for the log. */
export function lineageDay(s: GameState): string[] {
  const L = s.lineage, day = dayIndex(s.clock.t);
  if (day === L.day) return [];
  L.day = day;
  const out: string[] = [];
  const say = (kind: ChronicleKind, text: string) => { chronicle(s, kind, text); out.push(text); };
  const r = mulberry32(s.seed * 4253 + day * 29 + 3);
  const d = s.disaster, { doy, year } = calendarOf(s.clock);
  const town = d.tracks.stores >= 0.5 && d.tracks.banks >= 0.5;
  const doctor = d.tracks.medical >= 0.5;
  const living = s.people.filter(p => alive(s, p));
  // deaths (any cause) go in the chronicle
  for (const p of s.people) if (!alive(s, p) && !L.mourned.includes(p.id)) {
    L.mourned.push(p.id);
    passOn(s, p);
    const taken = s.personState.find(ps => ps.id === p.id)?.needs.taken;
    if (p.kin) chronicle(s, 'death', taken ? `${fullName(p)} was taken by raiders, aged ${p.age}.` : `${fullName(p)} died, aged ${p.age}.`);
  }
  // birthdays
  for (const p of living) {
    if ((p.bday ?? 1) !== doy) continue;
    p.age++;
    if (p.kid) {
      // learning from the household: its best skill, and a bit of everything with a teacher about
      const adults = living.filter(a => !a.kid);
      const teacher = Math.max(0, ...adults.map(a => a.skills.teacher));
      if (p.age >= 6 && adults.length) {
        const best = SKILL_IDS.reduce((a, b) => (Math.max(...adults.map(x => x.skills[b])) > Math.max(...adults.map(x => x.skills[a])) ? b : a));
        if (r() < 0.6) p.skills[best] = Math.min(10, p.skills[best] + 1);
        for (const k of SKILL_IDS) if (r() < 0.05 + teacher * 0.02) p.skills[k] = Math.min(10, p.skills[k] + 1);
      }
      if (p.age >= 18) {
        p.kid = false;
        if (town) { p.job = dayJob(p, s.seed + year); const ps = s.personState.find(x => x.id === p.id); if (ps) ps.employed = true; }
        if (p.kin) say('coming', `${p.first} turned 18${p.bornHere ? ', the first of the place\'s own children to come of age' : ''}${p.job ? ` and found work as a ${p.job.title.toLowerCase()}` : ''}.`);
      }
    } else if (!p.elder && p.age >= 67) {
      p.elder = true;
      const ps = s.personState.find(x => x.id === p.id)!;
      ps.employed = false;
      if (p.job && p.kin) say('retire', `${p.first} retired from ${p.job.title.toLowerCase()}.`);
      delete p.job;
    }
  }
  // old age
  for (const p of living) {
    if (p.age < 45 || r() >= oldAgeRisk(p.age, doctor) / 365) continue;
    const ps = s.personState.find(x => x.id === p.id)!;
    ps.needs.died = Math.floor(s.clock.t);
    L.mourned.push(p.id);
    passOn(s, p);
    const line = `${fullName(p)} died ${p.age >= 75 ? 'in their sleep' : 'suddenly'}, aged ${p.age}.`;
    log(s, line);
    if (p.kin) chronicle(s, 'death', line);
    const mate = s.people.find(x => x.id === p.partner);
    if (mate) delete mate.partner;
  }
  // the last adult gone and only children left: a neighbor household takes them in; the place is held for them until the eldest is 18
  fosterOut(s, say, day);
  if (wardsDay(s, doy, day, town, r, say)) for (const p of s.people) if (p.job) { const ps = s.personState.find(x => x.id === p.id); if (ps) ps.employed = true; }
  // partners: meet someone (from town, or a neighbor; after, a survivor), or pair with someone here who isn't kin
  const lawful = d.tracks.law >= 0.5;
  for (const p of s.people.filter(x => alive(s, x) && !x.kid && !x.elder && !x.partner && x.kin && x.age >= 20 && x.age <= 45)) {
    if (r() >= (lawful ? 0.12 : 0.05) / 365) continue;
    const here = s.people.find(x => x !== p && alive(s, x) && !x.kid && !x.elder && !x.partner && Math.abs(x.age - p.age) <= 10 && !kinOf(p, x));
    const body: 'f' | 'm' = r() < 0.88 ? (p.body === 'f' ? 'm' : 'f') : p.body;
    const mate = here ?? newPerson(s, {
      first: pickName(s, body, r), last: LAST[Math.floor(r() * LAST.length)], age: Math.max(20, p.age + Math.floor(r() * 7) - 3), kid: false, body, kin: true,
      bday: 1 + Math.floor(r() * 365), gen: p.gen ?? 1,
      skills: Object.fromEntries(SKILL_IDS.map((k, i) => [k, i === Math.floor(r() * SKILL_IDS.length) ? 4 + Math.floor(r() * 4) : Math.floor(r() * 3)])) as Record<SkillId, number>,
    }, r);
    mate.kin = true; mate.gen ??= p.gen;
    p.partner = mate.id; mate.partner = p.id;
    if (s.weekend?.mode === 'split' && s.weekend.travelers.includes(p.id)) s.weekend.travelers.push(mate.id);
    if (!here && town) { mate.job = dayJob(mate, s.seed + day); const ms = s.personState.find(x => x.id === mate.id); if (ms) ms.employed = true; }
    say('partner', here ? `${p.first} and ${mate.first} are together now.` : `${p.first} married ${fullName(mate)}, ${lawful ? 'from town' : 'who came up the road one spring and stayed'}.`);
  }
  // deliveries: a pregnancy comes due (sim/medical.ts: who is there and what they have decides the risk)
  for (const { mother, father } of duePregnancies(s)) {
    const risk = birthRisk(s, mother), mate = father ?? s.people.find(x => x.id === mother.partner) ?? mother;
    const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    if (r() < risk.baby) { say('birth', `${mother.first}'s baby didn't live (${risk.how}).`); afterBirth(s, mother, r); continue; }
    const kid = newPerson(s, { first: pickName(s, body, r), last: L.family, age: 0, kid: true, body, kin: true, bornHere: true, bday: doy, gen: Math.max(mother.gen ?? 1, mate.gen ?? 1) + 1, parents: [mother.id, mate.id] }, r);
    award(L, 'births', 25);
    say('birth', `${kid.first} ${kid.last} was born to ${mother.first} and ${mate.first}, ${risk.how}.`);
    if (r() < risk.mother) { const ps = s.personState.find(x => x.id === mother.id)!; ps.needs.died = Math.floor(s.clock.t); L.mourned.push(mother.id); passOn(s, mother); say('death', `${fullName(mother)} died in childbirth, aged ${mother.age}.`); }
    else afterBirth(s, mother, r);
  }
  // births (and, for couples who can't, adoption or a child with no one left)
  const doneP = new Set<string>();
  for (const p of s.people.filter(x => alive(s, x) && x.partner && !x.kid)) {
    const mate = s.people.find(x => x.id === p.partner);
    if (!mate || !alive(s, mate) || doneP.has(p.id)) continue;
    doneP.add(p.id); doneP.add(mate.id);
    const last = Math.max(L.lastBirth[p.id] ?? -1e9, L.lastBirth[mate.id] ?? -1e9);
    if (day - last < 2 * 365) continue;
    const mother = p.body === 'f' && p.body !== mate.body ? p : mate.body === 'f' && mate.body !== p.body ? mate : null;
    const kidsNow = s.people.filter(k => k.kid && alive(s, k) && k.parents?.includes(p.id)).length;
    if (mother) {
      if (mother.age < 18 || mother.age > 43 || r() >= (town ? 0.1 : 0.07) * (kidsNow >= 4 ? 0.3 : 1) / 365) continue;
      L.lastBirth[p.id] = L.lastBirth[mate.id] = day;
      r();   // (the draw the sex of the baby used to take, kept so a seeded game's other rolls do not move)
      startPregnancy(s, mother, mother === p ? mate : p);
      say('birth', `${mother.first} is expecting. The baby is due in about nine months.`);
    } else if (p.age <= 50 && kidsNow < 3 && r() < 0.04 / 365) {
      L.lastBirth[p.id] = L.lastBirth[mate.id] = day;
      const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
      const kid = newPerson(s, { first: pickName(s, body, r), last: L.family, age: town ? Math.floor(r() * 4) : 3 + Math.floor(r() * 9), kid: true, body, kin: true, bday: 1 + Math.floor(r() * 365), gen: Math.max(p.gen ?? 1, mate.gen ?? 1) + 1, parents: [p.id, mate.id] }, r);
      award(L, 'births', 25);
      say('birth', town ? `${p.first} and ${mate.first} adopted ${kid.first}.` : `${p.first} and ${mate.first} took in ${kid.first}, ${kid.age}, who had no one left.`);
    }
  }
  // the yearly small threats of a world that has not come back (sim/threats.ts)
  out.push(...threatsDay(s, say));
  // feeding yourselves (a streak, kept across eras)
  const f = s.food;
  L.selfFedDays = f.needKcal > 0 && f.producedKcal >= f.needKcal * 0.9 ? L.selfFedDays + 1 : 0;
  // what was built goes in the chronicle: the first of each notable kind
  for (const x of s.structures) if (!x.pre && isFinished(x) && !L.built.includes(x.kind) && (isHome(x.kind) || NOTABLE.test(x.kind))) {
    L.built.push(x.kind);
    chronicle(s, 'home', `${cap(x.kind.replace(/_/g, ' '))} finished.`);
  }
  // each year on the place, the dynasty is also scored on what it has become: strangers taken in, the size of the place, a place that feeds itself
  if (day > 0 && day % 365 === 0) {
    const takenIn = living.filter(p => !p.kin).length, place = s.structures.filter(x => !x.pre && isFinished(x)).length;
    award(L, 'takenIn', 2 * takenIn);
    award(L, 'place', Math.floor(place / 5));
    if (L.selfFedDays >= 365) award(L, 'selfFed', 10);
  }
  // the score: a person-year a year for everyone here
  award(L, 'years', (s.people.filter(p => alive(s, p)).length + L.wards.length) / 365);
  // milestones
  const years = Math.floor(day / 365);
  for (const m of MILESTONES) if (!L.milestones.includes(m.id) && m.test(s, years)) {
    L.milestones.push(m.id);
    award(L, 'milestones', m.points);
    say('milestone', `${m.name}.`);
  }
  return out;
}

/**
 * Heirs inherit everything (user, task #34): the compound, stores, tools and animals simply stay (the household is one
 * stockpile), and a person's skills pass whole to their children: each living child's level in every skill rises to at
 * least the parent's. With two parents gone a child holds the better of the two, so a trade is never lost between
 * generations while a child is alive to carry it. Returns the names of the heirs who gained.
 */
export function inheritSkills(s: GameState, dead: Person): string[] {
  const heirs = s.people.filter(k => k.id !== dead.id && alive(s, k) && k.parents?.includes(dead.id));
  if (!heirs.length) return [];
  const L = learningOf(s), gained: string[] = [];
  for (const h of heirs) {
    let up = false;
    for (const k of PRACTICED) {
      if (k === 'shooting') continue;
      const from = levelFor(s, dead, k), now = levelFor(s, h, k);
      if (from <= now) continue;
      if (isExtra(k)) (L.extra[h.id] ??= {})[k] = from; else h.skills[k] = from;
      ((L.peak[h.id] ??= {})[k]) = Math.max(L.peak[h.id]?.[k] ?? 0, Math.floor(from));
      up = true;
    }
    if (up) gained.push(h.first);
  }
  return gained;
}

/** Death: the heirs take up the trade (and say so in the chronicle for the family's own). */
function passOn(s: GameState, dead: Person): void {
  const heirs = inheritSkills(s, dead);
  if (heirs.length && dead.kin) chronicle(s, 'death', `${dead.first}'s trades pass to ${heirs.join(' and ')}.`);
}


export interface GenRow { gen: number; people: Array<{ id: string; name: string; age: number; alive: boolean; role: string; parents: string[] }> }
/** The family by generation, eldest first: who is here, who has gone, whose child they are. The heirs are the grown, living children of the place. */
export function generations(s: GameState): GenRow[] {
  const byId = new Map(s.people.map(p => [p.id, p]));
  const rows = new Map<number, GenRow>();
  for (const p of s.people) {
    if (!p.kin) continue;
    const g = p.gen ?? 1, row = rows.get(g) ?? { gen: g, people: [] };
    rows.set(g, row);
    const a = alive(s, p);
    row.people.push({ id: p.id, name: p.first, age: p.age, alive: a, parents: (p.parents ?? []).map(id => byId.get(id)?.first).filter((x): x is string => !!x), role: !a ? 'gone' : p.kid ? 'child' : p.elder ? 'elder' : p.bornHere ? 'heir' : 'adult' });
  }
  return [...rows.values()].sort((a, b) => a.gen - b.gen);
}
