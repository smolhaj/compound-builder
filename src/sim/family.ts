/**
 * The starting family (GDS §3; docs/DECISIONS.md: 2 adults + 2 kids):
 * procedurally named, aged and skilled. Adults get different skill mixes so
 * one leads the building and the other the garden / care; kids help a little.
 */
import { mulberry32, pick } from './rng';

export type SkillId = 'builder' | 'gardener' | 'medic' | 'mechanic' | 'hunter' | 'negotiator' | 'teacher' | 'radio';
export const SKILL_IDS: readonly SkillId[] = ['builder', 'gardener', 'medic', 'mechanic', 'hunter', 'negotiator', 'teacher', 'radio'];

export interface Person {
  id: string;
  first: string;
  last: string;
  age: number;
  kid: boolean;
  /** 'f' | 'm' — drives the figure only (names don't imply pronouns in UI copy). */
  body: 'f' | 'm';
  /** 0–10. */
  skills: Record<SkillId, number>;
  /** Shirt / jacket color (figure tint). */
  shirt: number;
  /** Adults: the day job in town (peacetime income). */
  job?: { title: string; wage: number };
  /** A grandparent: retired (no job), slower at heavy work, long on know-how. */
  elder?: boolean;
}

const FIRST_F = ['Abigail', 'Ava', 'Beth', 'Carmen', 'Dana', 'Elena', 'Grace', 'Hannah', 'Ivy', 'June', 'Kate', 'Laura', 'Maya', 'Nora', 'Rosa', 'Ruth', 'Sara', 'Tessa', 'Wren'];
const FIRST_M = ['Aaron', 'Ben', 'Caleb', 'Dan', 'Eli', 'Frank', 'Gabe', 'Hank', 'Isaac', 'Jake', 'Luis', 'Matt', 'Noah', 'Owen', 'Pete', 'Ray', 'Sam', 'Tom', 'Wade'];
const LAST = ['Archer', 'Baker', 'Carver', 'Dalton', 'Ellison', 'Fischer', 'Garza', 'Hale', 'Jensen', 'Keller', 'Larsen', 'Mendez', 'Nolan', 'Ortega', 'Parker', 'Quinn', 'Reyes', 'Sutton', 'Tate', 'Walsh'];
const SHIRTS = [0x8a3b2e, 0x3b5b8c, 0x5a6e3a, 0x7a5a2a, 0x6a3a6a, 0x2f6f6f, 0xa86a2a, 0x4a4a52];

function skills(r: () => number, lead: SkillId[], kid: boolean): Record<SkillId, number> {
  const out = {} as Record<SkillId, number>;
  for (const s of SKILL_IDS) out[s] = kid ? Math.floor(r() * 2) : Math.floor(r() * 3);
  if (!kid) lead.forEach((s, i) => { out[s] = Math.min(10, (i === 0 ? 6 : 4) + Math.floor(r() * 3)); });
  return out;
}

/** Two adults with complementary skills and two kids. Deterministic per seed. */
export function generateFamily(seed: number): Person[] {
  const r = mulberry32(seed * 977 + 13);
  const last = pick(r, LAST);
  const adultBodies: Array<'f' | 'm'> = r() < 0.5 ? ['f', 'm'] : r() < 0.5 ? ['f', 'f'] : ['m', 'm'];
  // complementary leads: one builds, the other grows / mends
  const leadsA: SkillId[] = ['builder', pick(r, ['mechanic', 'hunter'] as SkillId[])];
  const leadsB: SkillId[] = [pick(r, ['gardener', 'medic'] as SkillId[]), pick(r, ['teacher', 'negotiator', 'builder'] as SkillId[])];
  const people: Person[] = [];
  const used = new Set<string>();
  const name = (body: 'f' | 'm') => {
    let n: string;
    do n = pick(r, body === 'f' ? FIRST_F : FIRST_M); while (used.has(n));
    used.add(n);
    return n;
  };
  const shirt = () => SHIRTS[Math.floor(r() * SHIRTS.length)];
  const a1Age = 31 + Math.floor(r() * 14);
  people.push({ id: 'p1', first: name(adultBodies[0]), last, age: a1Age, kid: false, body: adultBodies[0], skills: skills(r, leadsA, false), shirt: shirt() });
  people.push({ id: 'p2', first: name(adultBodies[1]), last, age: a1Age + Math.floor(r() * 7) - 3, kid: false, body: adultBodies[1], skills: skills(r, leadsB, false), shirt: shirt() });
  const k1 = 9 + Math.floor(r() * 7), k2 = 4 + Math.floor(r() * Math.max(1, k1 - 5));
  for (const [i, age] of [[3, k1], [4, k2]] as const) {
    const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    people.push({ id: `p${i}`, first: name(body), last, age, kid: true, body, skills: skills(r, [], true), shirt: shirt() });
  }
  for (const p of people) if (!p.kid) p.job = dayJob(p, seed);
  return people;
}

/** What households look like (GDS §3, decided with the user: "the family varies, seeded, with a reroll"). */
export type Household = 'couple_2' | 'couple_1' | 'couple_3' | 'couple' | 'single_2' | 'three_gen' | 'four_gen';
const HOUSEHOLDS: Array<[Household, number, string]> = [
  ['couple_2', 32, 'Two parents, two kids'], ['couple_1', 16, 'Two parents, one kid'], ['couple_3', 14, 'Two parents, three kids'],
  ['couple', 10, 'A couple, no kids'], ['single_2', 10, 'A single parent and two kids'], ['three_gen', 12, 'Two parents, two kids and a grandparent'],
  ['four_gen', 6, 'Two parents, a kid and both grandparents'],
];
export const HOUSEHOLD_NAME = Object.fromEntries(HOUSEHOLDS.map(([h, , n]) => [h, n])) as Record<Household, string>;

/**
 * A varied household for a new game (the setup screen; `roll` rerolls it).
 * Roll 0 of any seed may be any shape; ages, names, skills and jobs follow.
 */
export function variedFamily(seed: number, roll = 0): { kind: Household; people: Person[] } {
  const r = mulberry32(seed * 7907 + roll * 104723 + 3);
  const tot = HOUSEHOLDS.reduce((a, h) => a + h[1], 0);
  let x = r() * tot, kind: Household = 'couple_2';
  for (const [h, w] of HOUSEHOLDS) { x -= w; if (x <= 0) { kind = h; break; } }
  const last = pick(r, LAST);
  const used = new Set<string>();
  const name = (body: 'f' | 'm') => { let n: string; do n = pick(r, body === 'f' ? FIRST_F : FIRST_M); while (used.has(n)); used.add(n); return n; };
  const shirt = () => SHIRTS[Math.floor(r() * SHIRTS.length)];
  const people: Person[] = [];
  const add = (p: Omit<Person, 'id'>) => people.push({ id: `p${people.length + 1}`, ...p });
  const bodies: Array<'f' | 'm'> = r() < 0.5 ? ['f', 'm'] : r() < 0.5 ? ['f', 'f'] : ['m', 'm'];
  const kids = { couple_2: 2, couple_1: 1, couple_3: 3, couple: 0, single_2: 2, three_gen: 2, four_gen: 1 }[kind];
  const adults = kind === 'single_2' ? 1 : 2;
  const a1 = kids === 0 ? 27 + Math.floor(r() * 30) : 29 + Math.floor(r() * 16);
  const leadsA: SkillId[] = ['builder', pick(r, ['mechanic', 'hunter'] as SkillId[])];
  const leadsB: SkillId[] = [pick(r, ['gardener', 'medic'] as SkillId[]), pick(r, ['teacher', 'negotiator', 'builder'] as SkillId[])];
  for (let i = 0; i < adults; i++) {
    const body = bodies[i];
    add({ first: name(body), last, age: i === 0 ? a1 : a1 + Math.floor(r() * 7) - 3, kid: false, body, skills: skills(r, i === 0 ? leadsA : leadsB, false), shirt: shirt() });
  }
  // a single parent covers both leads, thinner
  if (adults === 1) for (const s of leadsB) people[0].skills[s] = Math.max(people[0].skills[s], 3 + Math.floor(r() * 2));
  let kidAge = Math.min(17, a1 - 22 - Math.floor(r() * 4));
  for (let i = 0; i < kids; i++) {
    const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    const age = Math.max(2, Math.min(17, kidAge));
    add({ first: name(body), last, age, kid: true, body, skills: skills(r, [], true), shirt: shirt() });
    kidAge -= 2 + Math.floor(r() * 4);
  }
  const elders = kind === 'three_gen' ? 1 : kind === 'four_gen' ? 2 : 0;
  for (let i = 0; i < elders; i++) {
    const body: 'f' | 'm' = elders === 2 ? (i === 0 ? 'f' : 'm') : r() < 0.6 ? 'f' : 'm';
    const sk = skills(r, [pick(r, ['gardener', 'medic', 'teacher', 'radio'] as SkillId[]), pick(r, ['builder', 'hunter', 'mechanic', 'gardener'] as SkillId[])], false);
    for (const s of SKILL_IDS) sk[s] = Math.min(10, sk[s] + 1);
    add({ first: name(body), last: i === 0 || r() < 0.5 ? last : pick(r, LAST), age: Math.max(a1 + 22, 60) + Math.floor(r() * 12), kid: false, elder: true, body, skills: sk, shirt: shirt() });
  }
  for (const p of people) if (!p.kid && !p.elder) p.job = dayJob(p, seed + roll * 13);
  return { kind, people };
}

/** An adult's day job, from their strongest skill (its own random stream: the family itself doesn't change). */
export function dayJob(p: Person, seed: number): { title: string; wage: number } {
  const r = mulberry32(seed * 131 + Number(p.id.replace(/\D/g, '') || 0) * 17 + 7);
  const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));
  const [title, wage] = JOBS[top];
  return { title, wage: Math.round(wage * (0.9 + 0.2 * r()) / 5) * 5 };
}

/** Day jobs by lead skill: title and a day's take-home pay (rural Mountain West, 2020s). */
const JOBS: Record<SkillId, [string, number]> = {
  builder: ['Carpenter', 210], gardener: ['Nursery hand', 140], medic: ['Nurse at the county hospital', 280], mechanic: ['Diesel mechanic', 230],
  hunter: ['Game warden', 200], negotiator: ['Insurance agent', 220], teacher: ['Schoolteacher', 190], radio: ['Dispatcher', 175],
};

/**
 * Building work rate (1 = a competent builder): skill 5 → 1.0, 0 → 0.5,
 * 10 → 1.5. Kids under 12 barely help; teens help at half pace.
 */
export function buildRate(p: Person): number {
  const base = 0.5 + p.skills.builder * 0.1;
  if (p.elder) return base * (p.age >= 75 ? 0.35 : 0.6);
  if (!p.kid) return base;
  return p.age < 12 ? 0.15 : 0.45;
}

/** Hours a person can give to work per day (kids: school / chores first). */
export function workHoursPerDay(p: Person): number {
  return p.kid ? (p.age < 12 ? 1.5 : 3) : p.elder ? 4 : 8;
}

export function fullName(p: Person): string {
  return `${p.first} ${p.last}`;
}
