/**
 * The starting family (GDS §3; docs/DECISIONS.md: 2 adults + 2 kids):
 * procedurally named, aged and skilled. Adults get different skill mixes so
 * one leads the building and the other the garden / care; kids help a little.
 */
import { mulberry32, pick } from './rng';
import type { Condition } from './body';

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
  job?: { title: string; wage: number; /** Pool id (sim/family.ts JOB_POOL); old saves and neighbors may lack it. */ id?: string };
  /** A grandparent: retired (no job), slower at heavy work, long on know-how. */
  elder?: boolean;
  /** Chronic conditions that need a daily medicine (sim/body.ts). */
  conditions?: Condition[];
  /** Household family (born or married in), not someone taken in. */
  kin?: boolean;
  /** Birthday (day of year); ages tick over on it (sim/lineage.ts). */
  bday?: number;
  /** Generation: grandparents 0, the founding adults 1, their kids 2… */
  gen?: number;
  /** Partner's id, and parents' ids (no partnering within the family). */
  partner?: string;
  parents?: string[];
  /** Born on the place. */
  bornHere?: boolean;
  /** An extended relative (sim/kin.ts): who they are to whom. Absent for the founding household. */
  rel?: { role: KinRole; of: string };
  /** Retirement income: Social Security and any pension, a day (stops at the collapse; sim/kin.ts). */
  income?: { label: string; perDay: number };
}

/** Extended family (sim/kin.ts): parents, grandparents, in-laws, siblings and grown children. */
export type KinRole = 'mother' | 'father' | 'grandmother' | 'grandfather' | 'mother_in_law' | 'father_in_law' | 'sister' | 'brother' | 'daughter' | 'son';

const FIRST_F = ['Abigail', 'Ava', 'Beth', 'Carmen', 'Dana', 'Elena', 'Grace', 'Hannah', 'Ivy', 'June', 'Kate', 'Laura', 'Maya', 'Nora', 'Rosa', 'Ruth', 'Sara', 'Tessa', 'Wren'];
const FIRST_M = ['Aaron', 'Ben', 'Caleb', 'Dan', 'Eli', 'Frank', 'Gabe', 'Hank', 'Isaac', 'Jake', 'Luis', 'Matt', 'Noah', 'Owen', 'Pete', 'Ray', 'Sam', 'Tom', 'Wade'];
const LAST = ['Archer', 'Baker', 'Carver', 'Dalton', 'Ellison', 'Fischer', 'Garza', 'Hale', 'Jensen', 'Keller', 'Larsen', 'Mendez', 'Nolan', 'Ortega', 'Parker', 'Quinn', 'Reyes', 'Sutton', 'Tate', 'Walsh'];
const SHIRTS = [0x8a3b2e, 0x3b5b8c, 0x5a6e3a, 0x7a5a2a, 0x6a3a6a, 0x2f6f6f, 0xa86a2a, 0x4a4a52];

/**
 * A person's skills. Always the same number of draws (8 base + 3 lead bonuses +
 * 2 hobby) whatever the leads are, so changing an adult's job never changes
 * the rest of the family.
 */
export function skills(r: () => number, lead: SkillId[], kid: boolean): Record<SkillId, number> {
  const out = {} as Record<SkillId, number>;
  for (const s of SKILL_IDS) out[s] = kid ? Math.floor(r() * 2) : Math.floor(r() * 3);
  const bonus = [r(), r(), r()], hobbyAt = r(), hobbyLv = r();
  if (!kid) {
    lead.slice(0, 3).forEach((s, i) => { out[s] = Math.min(10, (i === 0 ? 6 : i === 1 ? 4 : 3) + Math.floor(bonus[i] * 3)); });
    // one pastime off the job: a strength the day job doesn't explain
    const free = SKILL_IDS.filter(s => !lead.includes(s));
    const h = free[Math.floor(hobbyAt * free.length) % free.length];
    out[h] = Math.max(out[h], 3 + Math.floor(hobbyLv * 3));
  }
  return out;
}

/** What each occupation is, who gets it, and what it brings (GDS §3; rural Mountain West wages, 2020s). */
export interface JobDef {
  id: string;
  title: string;
  /** A day's take-home pay. */
  wage: number;
  /** Skills it trains, strongest first (the job drives the skills). */
  lead: SkillId[];
  /** How common it is where these families come from. */
  w: number;
  /** Needs a degree (student loans). */
  degree?: boolean;
  /** A shorter name for narrow dropdowns. */
  short?: string;
  /** The setup screen's one-line note: what it is good for. */
  good: string;
  /** Tools the trade owns (names; the tools branch maps them to items via jobTools). */
  tools: string[];
}
export const JOB_POOL: readonly JobDef[] = [
  { id: 'carpenter', title: 'Carpenter', wage: 210, lead: ['builder', 'mechanic'], w: 6, good: 'Frames, roofs and finish work: the fastest builder you can start with.', tools: ['framing_hammer', 'circular_saw', 'speed_square', 'nail_gun'] },
  { id: 'electrician', title: 'Electrician', wage: 260, lead: ['mechanic', 'builder'], w: 4, good: 'Wires the place and keeps solar, batteries and generators alive.', tools: ['multimeter', 'wire_strippers', 'conduit_bender', 'cordless_drill'] },
  { id: 'plumber', title: 'Plumber', wage: 250, lead: ['builder', 'mechanic'], w: 4, good: 'Wells, pipe runs, water treatment and septic.', tools: ['pipe_wrench', 'pipe_cutter', 'torch_kit', 'drain_snake'] },
  { id: 'farmer', title: 'Farmer / rancher', wage: 150, lead: ['gardener', 'mechanic', 'hunter'], w: 6, good: 'Fields, livestock and old machinery; thin pay, strong food skills.', tools: ['garden_tools', 'chainsaw', 'fencing_pliers', 'livestock_kit'] },
  { id: 'emt', title: 'EMT / paramedic', wage: 200, lead: ['medic', 'negotiator'], w: 4, good: 'Trauma care and a steady head when people are hurt.', tools: ['trauma_kit', 'stethoscope', 'splint_set'] },
  { id: 'nurse', title: 'Nurse at the county hospital', short: 'Nurse', wage: 280, lead: ['medic', 'teacher'], w: 5, degree: true, good: 'Sickness, medicines and long-term care; good pay.', tools: ['stethoscope', 'bp_cuff', 'suture_kit'] },
  { id: 'police', title: 'Police officer', wage: 250, lead: ['negotiator', 'hunter', 'medic'], w: 3, good: 'De-escalation, the gate and a steady hand with a gun; knows the county.', tools: ['duty_pistol', 'handcuffs', 'flashlight', 'body_armor'] },
  { id: 'vet', title: 'Large-animal veterinarian', short: 'Large-animal vet', wage: 330, lead: ['medic', 'gardener'], w: 2, degree: true, good: 'Medicine for people and livestock; stock-keeping.', tools: ['vet_bag', 'suture_kit', 'stethoscope'] },
  { id: 'diesel', title: 'Diesel mechanic', wage: 230, lead: ['mechanic', 'builder'], w: 5, good: 'Keeps trucks, tractors and generators running.', tools: ['socket_set', 'impact_wrench', 'jack_stands', 'welder_stick'] },
  { id: 'welder', title: 'Welder / fabricator', wage: 235, lead: ['mechanic', 'builder'], w: 4, good: 'Steel gates, frames and repairs; hardens the perimeter.', tools: ['welder_mig', 'angle_grinder', 'cutting_torch', 'welding_helmet'] },
  { id: 'teacher', title: 'Schoolteacher', wage: 190, lead: ['teacher', 'negotiator'], w: 5, degree: true, good: 'Teaches the kids and the neighbors; steady with people.', tools: ['books', 'whiteboard'] },
  { id: 'soldier', title: 'National Guard soldier', short: 'Guard soldier', wage: 200, lead: ['hunter', 'negotiator', 'medic'], w: 3, good: 'Weapons, discipline and first aid; a veteran of drills and the field.', tools: ['rifle_trained', 'field_radio', 'ifak', 'entrenching_tool'] },
  { id: 'software', title: 'Remote software developer', short: 'Remote developer', wage: 400, lead: ['radio', 'teacher'], w: 3, degree: true, good: 'Best pay and works from home; electronics and radio, weak with tools.', tools: ['laptop', 'soldering_iron', 'multimeter'] },
  { id: 'trucker', title: 'Long-haul truck driver', short: 'Truck driver', wage: 220, lead: ['mechanic', 'radio'], w: 4, good: 'Roads, routes, CB radio and enough mechanics to keep a rig going.', tools: ['cb_radio', 'tire_iron', 'tow_chain', 'jumper_cables'] },
  { id: 'hvac', title: 'HVAC technician', wage: 235, lead: ['mechanic', 'builder'], w: 3, good: 'Stoves, heat, ventilation and filtered air.', tools: ['manifold_gauges', 'tin_snips', 'cordless_drill'] },
  { id: 'butcher', title: 'Butcher / meat cutter', wage: 175, lead: ['hunter', 'gardener'], w: 2, good: 'Dresses game and livestock; smoking and curing.', tools: ['boning_knives', 'meat_saw', 'grinder', 'smoker_rig'] },
  { id: 'forester', title: 'Forester / logger', wage: 215, lead: ['builder', 'hunter'], w: 3, good: 'Fells, bucks and skids timber; reads woods and game.', tools: ['chainsaw', 'axe', 'peavey', 'wedges'] },
  { id: 'pharmacist', title: 'Pharmacist', wage: 450, lead: ['medic', 'teacher'], w: 1, degree: true, good: 'Medicines, doses and interactions; the highest pay, soft hands.', tools: ['pill_counter', 'reference_books'] },
  { id: 'accountant', title: 'Accountant', wage: 270, lead: ['negotiator', 'teacher'], w: 3, degree: true, good: 'Money, deals and barter; light on tools.', tools: ['calculator', 'ledger_books'] },
  { id: 'nursery', title: 'Nursery hand', wage: 140, lead: ['gardener'], w: 3, good: 'Plants, seed and soil: the garden starts strong.', tools: ['garden_tools', 'pruners', 'wheelbarrow'] },
  { id: 'warden', title: 'Game warden', wage: 200, lead: ['hunter', 'gardener'], w: 2, good: 'Tracking, hunting and wild food.', tools: ['hunting_rifle', 'binoculars', 'atv_trained'] },
  { id: 'insurance', title: 'Insurance agent', wage: 220, lead: ['negotiator'], w: 3, good: 'Talks to anyone; knows the county and what things cost.', tools: ['laptop', 'ledger_books'] },
  { id: 'dispatcher', title: 'Dispatcher', wage: 175, lead: ['radio', 'negotiator'], w: 2, good: 'Radio, emergencies and keeping a head count.', tools: ['base_radio', 'headset', 'maps'] },
  { id: 'lineman', title: 'Utility lineman', wage: 300, lead: ['mechanic', 'radio', 'builder'], w: 2, good: 'Poles, lines and climbing; understands the grid and why it fails.', tools: ['climbing_gear', 'lineman_pliers', 'hot_stick', 'bucket_truck_trained'] },
  { id: 'operator', title: 'Heavy equipment operator', short: 'Equipment operator', wage: 240, lead: ['builder', 'mechanic'], w: 3, good: 'Digs trenches, ponds and foundations in a day.', tools: ['excavator_trained', 'grease_gun', 'surveying_level'] },
];
const JOB_BY_ID = new Map(JOB_POOL.map(j => [j.id, j]));
export const jobDef = (id: string | undefined): JobDef | undefined => (id ? JOB_BY_ID.get(id) : undefined);
/** The tools a trade owns (names): the one hook the tools system reads to stock a starting kit. */
export function jobTools(jobId: string | undefined): readonly string[] {
  return jobDef(jobId)?.tools ?? [];
}

/** Weighted pick from the pool (not `not`, so a couple don't share a trade). */
function rollJob(r: () => number, not?: string): JobDef {
  const pool = JOB_POOL.filter(j => j.id !== not);
  let x = r() * pool.reduce((a, j) => a + j.w, 0);
  for (const j of pool) { x -= j.w; if (x <= 0) return j; }
  return pool[pool.length - 1];
}
/** A job for slot `slot` of a given family roll, for the "randomize this one" button (n counts the presses). */
export function randomJobId(seed: number, roll: number, slot: number, n: number, not?: string): string {
  return rollJob(mulberry32(seed * 6151 + roll * 389 + slot * 97 + n * 7919 + 11), not).id;
}

/** An adult's job: the seniority of age and a little luck move the day's pay. */
function jobFor(def: JobDef, age: number, r: () => number): { title: string; wage: number; id: string } {
  const senior = 0.9 + Math.min(25, Math.max(0, age - 24)) * 0.0066;
  return { title: def.title, wage: Math.round(def.wage * (0.92 + 0.16 * r()) * senior / 5) * 5, id: def.id };
}

/** Two adults with complementary skills and two kids. Deterministic per seed. */
export function generateFamily(seed: number): Person[] {
  const r = mulberry32(seed * 977 + 13);
  const last = pick(r, LAST);
  const adultBodies: Array<'f' | 'm'> = r() < 0.5 ? ['f', 'm'] : r() < 0.5 ? ['f', 'f'] : ['m', 'm'];
  // each adult has a day job drawn from the pool; the job sets the leads
  const jobA = rollJob(r), jobB = rollJob(r, jobA.id);
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
  people.push({ id: 'p1', first: name(adultBodies[0]), last, age: a1Age, kid: false, body: adultBodies[0], skills: skills(r, jobA.lead, false), shirt: shirt() });
  people.push({ id: 'p2', first: name(adultBodies[1]), last, age: a1Age + Math.floor(r() * 7) - 3, kid: false, body: adultBodies[1], skills: skills(r, jobB.lead, false), shirt: shirt() });
  const k1 = 9 + Math.floor(r() * 7), k2 = 4 + Math.floor(r() * Math.max(1, k1 - 5));
  for (const [i, age] of [[3, k1], [4, k2]] as const) {
    const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    people.push({ id: `p${i}`, first: name(body), last, age, kid: true, body, skills: skills(r, [], true), shirt: shirt() });
  }
  [jobA, jobB].forEach((d, i) => { people[i].job = jobFor(d, people[i].age, r); });
  handyFloor(people);
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
 * `picks[i]` fixes adult i's occupation (a JOB_POOL id) and leaves the rest of
 * the family exactly as the roll made it (the draws don't depend on the job).
 */
export function variedFamily(seed: number, roll = 0, picks: ReadonlyArray<string | null | undefined> = []): { kind: Household; people: Person[] } {
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
  const rolled = [rollJob(r), rollJob(r)];
  const defs: JobDef[] = [];
  for (let i = 0; i < adults; i++) {
    const want = jobDef(picks[i] ?? undefined);
    // a couple don't share a trade unless the player chose it
    defs.push(want ?? (i === 1 && rolled[1].id === defs[0].id ? rollJob(r, defs[0].id) : rolled[i]));
  }
  for (let i = 0; i < adults; i++) {
    const body = bodies[i], d = defs[i];
    const age = i === 0 ? a1 : a1 + Math.floor(r() * 7) - 3;
    add({ first: name(body), last, age, kid: false, body, skills: skills(r, d.lead, false), shirt: shirt(), job: jobFor(d, age, r) });
  }
  // a single parent also covers the garden or the sickroom, thinner
  const alt = pick(r, ['gardener', 'medic'] as SkillId[]), altLv = 3 + Math.floor(r() * 2);
  if (adults === 1) people[0].skills[alt] = Math.max(people[0].skills[alt], altLv);
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
  handyFloor(people);
  return { kind, people };
}

/** An adult's day job, from their strongest skill (its own random stream: the family itself doesn't change). Neighbors, newcomers and grown kids use this. */
export function dayJob(p: Person, seed: number): { title: string; wage: number; id: string } {
  const r = mulberry32(seed * 131 + Number(p.id.replace(/\D/g, '') || 0) * 17 + 7);
  const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));
  const fit = JOB_POOL.filter(j => j.lead[0] === top);
  let x = r() * fit.reduce((a, j) => a + j.w, 0), def = fit[0];
  for (const j of fit) { x -= j.w; if (x <= 0) { def = j; break; } }
  return jobFor(def, p.age, r);
}

/**
 * Everyone has fixed a fence or a roof: if none of the adults can swing a
 * hammer (builder under 3), the handiest gets a 3, so a run is not hopeless
 * for want of a hand.
 */
function handyFloor(people: Person[]): void {
  const adults = people.filter(p => !p.kid && !p.elder);
  if (!adults.length || adults.some(p => p.skills.builder >= 3)) return;
  const best = adults.reduce((a, b) => (b.skills.builder + b.skills.mechanic > a.skills.builder + a.skills.mechanic ? b : a));
  best.skills.builder = 3;
}

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

/** A past in uniform: most people never served; some did, a few were police. */
export type Background = 'military' | 'police' | null;
export const BACKGROUND_NAME: Record<'military' | 'police', string> = { military: 'Army veteran', police: 'former police officer' };
/** Seeded by the person (stable across saves): about 7 % of adults are veterans (15 % of the elders), 2 % were police. */
export function backgroundOf(p: Person): Background {
  if (p.kid || p.age < 22) return null;
  if (p.job?.id === 'soldier') return 'military';
  if (p.job?.id === 'police') return 'police';
  let h = 2166136261;
  for (const c of p.id + p.first + p.last) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const u = (h % 10000) / 10000;
  if (u < (p.elder ? 0.15 : 0.07)) return 'military';
  if (u < (p.elder ? 0.17 : 0.09)) return 'police';
  return null;
}

export function fullName(p: Person): string {
  return `${p.first} ${p.last}`;
}
