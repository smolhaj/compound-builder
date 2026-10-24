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
  if (!p.kid) return base;
  return p.age < 12 ? 0.15 : 0.45;
}

/** Hours a person can give to work per day (kids: school / chores first). */
export function workHoursPerDay(p: Person): number {
  return p.kid ? (p.age < 12 ? 1.5 : 3) : 8;
}

export function fullName(p: Person): string {
  return `${p.first} ${p.last}`;
}
