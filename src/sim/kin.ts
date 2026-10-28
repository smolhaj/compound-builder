/**
 * Extended family (docs/DECISIONS.md: "Parents, grandparents and in-laws CAN
 * arrive as people who CAN join, or you can refuse, using the housing system;
 * guest houses and separate dwellings keep them happy"). Pure; tested.
 *
 *  - At the setup screen a seeded pool of relatives (`kinPool`: parents,
 *    in-laws, a grandparent, a sibling, a grown child) can be brought along
 *    or left in town. Those left in town may ask to come later.
 *  - Through the peace years, more often as the warning signs grow, and for a
 *    few weeks after the hit, one of them asks to join: a decision card on the
 *    gate (`EncounterKind` 'kin'): Welcome them / Build them a place first /
 *    Refuse. Strangers at the gate are a different system (sim/encounters.ts
 *    arrivals); this one is family.
 *  - Joining goes through the housing system (sim/housing.ts): beds, couches,
 *    bags, tents. Relatives and elders do best in a separate dwelling (a guest
 *    house, a cottage, Mom's house): OWN_PLACE_MORALE there.
 *  - Elders bring Social Security and any pension, a day, while the banks work
 *    (it stops at the collapse), carry chronic conditions (medicine on hand
 *    when they come), fall now and then, teach and mind the children.
 *  - Refusing costs humanity, strains the family's morale for a while, and
 *    has a follow-up after the hit: word they are fine, they turn up at the
 *    gate, or word that they did not make it.
 */
import { mulberry32, pick } from './rng';
import { conditionsFor } from './body';
import { dayIndex, type GameState } from './state';
import { dayJob, JOB_POOL, skills as rollSkills, SKILL_IDS, type KinRole, type Person } from './family';
import { freshNeeds } from './needs';
import { tension } from './disaster';
import { arrivalOutlook } from './housing';
import type { Encounter, Outcome, Stance } from './encounters';

// ── Who they are ───────────────────────────────────────────────────────────

export const ROLE_NAME: Record<KinRole, string> = {
  mother: 'mother', father: 'father', grandmother: 'grandmother', grandfather: 'grandfather',
  mother_in_law: 'mother-in-law', father_in_law: 'father-in-law', sister: 'sister', brother: 'brother', daughter: 'daughter', son: 'son',
};
const LAST_NAMES = ['Abbott', 'Brandt', 'Cole', 'Dunn', 'Engel', 'Foley', 'Grady', 'Hess', 'Ivers', 'Kerr', 'Lund', 'Moss', 'Novak', 'Pratt', 'Rowe', 'Sloan', 'Tran', 'Voss'];
const FIRST_F = ['Agnes', 'Barbara', 'Carol', 'Dolores', 'Edith', 'Frances', 'Gloria', 'Helen', 'Irene', 'Joan', 'Lorraine', 'Margaret', 'Nancy', 'Patricia', 'Ruth', 'Shirley', 'Vera', 'Wanda'];
const FIRST_M = ['Arthur', 'Bernard', 'Clifford', 'Donald', 'Earl', 'Frank', 'Gene', 'Harold', 'Jerry', 'Kenneth', 'Leonard', 'Melvin', 'Norman', 'Ralph', 'Stanley', 'Vernon', 'Walter', 'Roy'];
const FIRST_Y_F = ['Ava', 'Beth', 'Dana', 'Elena', 'Hannah', 'Jess', 'Kate', 'Maya', 'Nora', 'Sara', 'Tessa'];
const FIRST_Y_M = ['Ben', 'Caleb', 'Dan', 'Eli', 'Jake', 'Luis', 'Matt', 'Noah', 'Owen', 'Sam', 'Tom'];

/** "Dana's mother", "Sam's father-in-law". */
export function kinTitle(p: Person, people: readonly Person[]): string {
  if (!p.rel) return '';
  const of = people.find(x => x.id === p.rel!.of);
  return `${of ? `${of.first}’s` : 'Your'} ${ROLE_NAME[p.rel.role]}`;
}
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** What the family calls them on a card: "Mom", "Grandpa", or the title. */
export function kinCallName(p: Person, people: readonly Person[]): string {
  const r = p.rel?.role;
  if (r === 'mother') return 'Mom';
  if (r === 'father') return 'Dad';
  if (r === 'grandmother') return 'Grandma';
  if (r === 'grandfather') return 'Grandpa';
  return p.rel ? kinTitle(p, people) : p.first;
}

/** The ids of the family's adults the relatives hang from. */
const anchorsOf = (family: readonly Person[]) => family.filter(p => !p.kid && !p.elder && !p.rel);

function weightedJob(r: () => number) {
  const tot = JOB_POOL.reduce((a, j) => a + j.w, 0);
  let x = r() * tot;
  for (const j of JOB_POOL) { x -= j.w; if (x <= 0) return j; }
  return JOB_POOL[0];
}

/** What a day of retirement income is: Social Security, and often a pension. (Seeded by the person.) */
export function retirementIncome(p: Pick<Person, 'id' | 'age'>, seed: number): { label: string; perDay: number } {
  const r = mulberry32(seed * 7001 + (Number(p.id.replace(/\D/g, '')) || 0) * 131 + 29);
  const ss = 1350 + Math.floor(r() * 1100);
  const pension = r() < 0.4 ? 400 + Math.floor(r() * 1400) : 0;
  return { label: pension ? 'Social Security and a pension' : 'Social Security', perDay: Math.round((ss + pension) / 30) };
}

/** What a relative brings in savings (for the setup funds, and when they move in). */
export function kinSavings(p: Pick<Person, 'id' | 'age' | 'elder' | 'rel'>, seed: number): number {
  const r = mulberry32(seed * 3301 + (Number(p.id.replace(/\D/g, '')) || 0) * 53 + 7);
  const k = (n: number) => Math.round(n / 1000) * 1000;
  if (p.elder) return k(25_000 + 120_000 * r());
  if (p.rel?.role === 'daughter' || p.rel?.role === 'son') return k(1_000 + 6_000 * r());
  return k(4_000 + 22_000 * r());
}

/**
 * The relatives of a new family, seeded: who could come. Mothers and fathers of
 * the first adult, the second adult's parents (in-laws), maybe a grandparent,
 * a sibling, a grown child. Ids `pk1…`; nothing in the household is changed.
 */
export function kinPool(seed: number, roll: number, family: readonly Person[]): Person[] {
  const adults = anchorsOf(family);
  if (!adults.length) return [];
  const r = mulberry32(seed * 3571 + roll * 131 + 17);
  const [a1, a2] = adults;
  const hasElders = family.some(p => p.elder);
  const used = new Set(family.map(p => p.first));
  const out: Person[] = [];
  let idN = 0;
  const nameOf = (body: 'f' | 'm', old: boolean) => {
    const list = old ? (body === 'f' ? FIRST_F : FIRST_M) : body === 'f' ? FIRST_Y_F : FIRST_Y_M;
    let n: string, guard = 0;
    do n = pick(r, list); while (used.has(n) && guard++ < 30);
    used.add(n);
    return n;
  };
  const make = (role: KinRole, anchor: Person, body: 'f' | 'm', age: number, last: string): Person => {
    const old = age >= 58;
    const id = `pk${++idN}`;
    const lead = old ? [weightedJob(r).lead[0], weightedJob(r).lead[0]] : [];
    const sk = rollSkills(r, lead, false);
    if (old) for (const s of SKILL_IDS) sk[s] = Math.min(10, sk[s] + 1);
    const p: Person = { id, first: nameOf(body, old), last, age, kid: false, body, skills: sk, shirt: [0x8a3b2e, 0x3b5b8c, 0x5a6e3a, 0x7a5a2a, 0x6a3a6a, 0x2f6f6f][Math.floor(r() * 6)], kin: true, rel: { role, of: anchor.id } };
    if (old) { p.elder = true; p.income = retirementIncome(p, seed); p.gen = 0; }
    else { p.job = dayJob(p, seed); p.gen = role === 'daughter' || role === 'son' ? 2 : 1; }
    p.conditions = conditionsFor(p, seed);
    if (old && age >= 72 && !p.conditions.length) p.conditions.push('blood_pressure');
    return p;
  };
  /** Parents of an anchor: both, the mother alone, or the father alone. */
  const parentsOf = (anchor: Person, inLaw: boolean, last: string) => {
    const u = r();
    const base = Math.min(88, Math.max(60, anchor.age + 24 + Math.floor(r() * 9)));
    const pair: Person[] = [];
    if (u < 0.85) pair.push(make(inLaw ? 'mother_in_law' : 'mother', anchor, 'f', base - Math.floor(r() * 3), last));
    if (u < 0.55 || u >= 0.85) pair.push(make(inLaw ? 'father_in_law' : 'father', anchor, 'm', base + Math.floor(r() * 4) - 1, last));
    if (pair.length === 2) { pair[0].partner = pair[1].id; pair[1].partner = pair[0].id; }
    return pair;
  };
  // a1's own parents (the family name), a2's parents (another name)
  if (r() < (hasElders ? 0.5 : 0.85)) out.push(...parentsOf(a1, false, a1.last));
  if (a2 && r() < (hasElders ? 0.45 : 0.75)) out.push(...parentsOf(a2, true, pick(r, LAST_NAMES)));
  if (!hasElders && r() < 0.3) {
    const g = make('grandmother', a1, 'f', 78 + Math.floor(r() * 12), a1.last);
    out.push(g);
  }
  // a sibling (or two, when the parents are gone): everyone has somebody
  for (let k = 0; k < 2 && (k === 0 ? r() < 0.6 : out.length < 2); k++) {
    const anchor = a2 && (k === 1 || r() < 0.5) ? (k === 1 ? a1 : a2) : a1, body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    out.push(make(body === 'f' ? 'sister' : 'brother', anchor, body, Math.max(22, anchor.age + Math.floor(r() * 9) - 5), anchor === a1 ? a1.last : pick(r, LAST_NAMES)));
  }
  if (out.length < 2) out.push(make('sister', a1, 'f', Math.max(22, a1.age - 3), a1.last));
  if (a1.age >= 41 && r() < 0.4) {
    const body: 'f' | 'm' = r() < 0.5 ? 'f' : 'm';
    out.push(make(body === 'f' ? 'daughter' : 'son', a1, body, 19 + Math.floor(r() * 7), a1.last));
  }
  return out.slice(0, 7);
}

/**
 * Make a household's links agree with the relatives in it: a parent's partner,
 * their child's `parents` (so the lineage does not guess), and a grown child's
 * parents. Mutates `people` (call before `foundLineage`).
 */
export function linkKin(people: Person[]): void {
  for (const p of people) {
    const rel = p.rel;
    if (!rel) continue;
    const anchor = people.find(x => x.id === rel.of);
    if (!anchor) continue;
    if (rel.role === 'mother' || rel.role === 'father') anchor.parents = [...new Set([...(anchor.parents ?? []), p.id])];
    else if (rel.role === 'mother_in_law' || rel.role === 'father_in_law') {
      const spouse = people.find(x => x.id === anchor.partner) ?? people.find(x => !x.kid && !x.elder && !x.rel && x.id !== anchor.id);
      if (spouse) spouse.parents = [...new Set([...(spouse.parents ?? []), p.id])];
    } else if (rel.role === 'daughter' || rel.role === 'son') p.parents = [anchor.id, ...(anchor.partner ? [anchor.partner] : [])];
  }
}

// ── State ──────────────────────────────────────────────────────────────────

export interface KinWait { ids: string[]; people: Person[]; since: number; until: number; savings: number }
export interface KinRefusal { people: Person[]; day: number; fate: 'fine' | 'came' | 'died' | null; /** The day the follow-up is due after the hit. */ due: number }
export interface Strain { at: number; points: number; why: string; of: string[] }
export interface Kin {
  /** Whether those left in town may ask to come (the setup choice). */
  open: boolean;
  /** Relatives still in town (not asked, or asked and turned away to wait). */
  away: Person[];
  /** Asked to come once a place is built. */
  waiting: KinWait[];
  /** Turned away, and what became of them. */
  refused: KinRefusal[];
  /** People who joined through a request, and total requests, for the chronicle. */
  joined: number;
  asked: number;
  /** The day of the next request (−1: not set). */
  next: number;
  /** Morale the family carries for what was said to them (decays). */
  strain: Strain[];
  /** Last day `kinDay` ran. */
  day: number;
}
export const newKin = (away: Person[] = [], open = true): Kin => ({ open, away, waiting: [], refused: [], joined: 0, asked: 0, next: -1, strain: [], day: -1 });
export const kinOf = (s: GameState): Kin => (s.kin ??= newKin());

const alive = (s: GameState, i: number) => !!s.personState[i] && s.personState[i].needs.died == null && !s.personState[i].needs.taken;
/** Relatives who live here now (alive, joined). */
export function residents(s: GameState): Person[] {
  return s.people.filter((p, i) => p.rel && alive(s, i));
}
/** Elders alive and here (any, including grandparents who came with the household). */
const elders = (s: GameState) => s.people.map((p, i) => ({ p, i })).filter(({ p, i }) => p.elder && alive(s, i));

// ── Money ──────────────────────────────────────────────────────────────────

const banksOpen = (s: GameState) => s.disaster.tracks.banks >= 0.5 && s.disaster.tracks.stores >= 0.5;
/** A retiree's income a day: the person's own, or the seeded Social Security of any elder of 62 or more. */
export function incomeOf(p: Person, seed: number): { label: string; perDay: number } | null {
  if (p.income) return p.income;
  if (p.elder && p.age >= 62) return retirementIncome(p, seed);
  return null;
}
/** What the household's retirees bring in a day while the banks work. */
export function retireeIncomePerDay(s: GameState): number {
  return s.people.reduce((a, p, i) => a + (alive(s, i) ? incomeOf(p, s.seed)?.perDay ?? 0 : 0), 0);
}

// ── Morale: what was said to them ─────────────────────────────────────────

/** The family-wide morale target from relatives turned away or kept waiting (zero or negative; a little positive for good news). */
export function kinMorale(s: GameState): number {
  const k = s.kin;
  if (!k) return 0;
  let m = 0;
  for (const x of k.strain) m += x.points * 0.5 * Math.exp(-(s.clock.t - x.at) / 60);
  return Math.max(-8, Math.min(3, m));
}
/** An extra share for the people the refused relatives were close to, and the grandparents' help with the little ones, for person `i`. */
export function kinPersonal(s: GameState, i: number): number {
  const p = s.people[i];
  if (!p) return 0;
  let m = 0;
  for (const x of s.kin?.strain ?? []) if (x.of.includes(p.id)) m += x.points * 0.5 * Math.exp(-(s.clock.t - x.at) / 60);
  if (!p.kid && !p.elder && s.people.some((q, j) => q.kid && q.age < 8 && alive(s, j)) && mindingElders(s) > 0) m += 1.5;
  return Math.max(-8, Math.min(3, m));
}
/** Able elders (alive, not hurt, under 82) who can watch the little ones and teach. */
export function mindingElders(s: GameState): number {
  return elders(s).filter(({ p, i }) => p.age < 82 && s.personState[i].needs.hurt.length === 0).length;
}

// ── The request ────────────────────────────────────────────────────────────

export const joinNames = (names: string[]): string => joinList(names);
const joinList = (names: string[]) => names.length <= 1 ? names[0] ?? '' : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function story(s: GameState, group: Person[], late: boolean, r: () => number): string {
  const lead = group[0];
  const call = joinList(group.map(p => kinCallName(p, s.people)));
  const title = group.length === 1 ? kinTitle(lead, s.people) : `${kinTitle(lead, s.people).replace(/ (mother|father|mother-in-law|father-in-law)$/, '')} parents`;
  const first = group.map(p => p.first).join(' and ');
  if (late) return `${cap(call)} made it out to the road and walked the last miles. ${first} ${group.length > 1 ? 'are' : 'is'} at the gate with ${group.length > 1 ? 'two bags' : 'a bag'}, tired and scared, asking for a place at the table.`;
  const old = group.every(p => p.elder);
  const peace = s.disaster.phase === 'peace';
  if (old) return pick(r, peace
    ? [`${title} (${first}) is finding the house too much to keep up with, and the news makes ${group.length > 1 ? 'them' : lead.body === 'f' ? 'her' : 'him'} nervous. ${cap(call)} would like to be near family.`,
       `${cap(call)} called again last night. The stairs are getting hard, and ${group.length > 1 ? 'they have' : 'there is'} nobody nearby. Could ${group.length > 1 ? 'they' : lead.body === 'f' ? 'she' : 'he'} come live with you?`]
    : [`With everything on the news getting worse, ${cap(call)} does not want to face it alone. ${first} ask${group.length > 1 ? '' : 's'} to come now, while the roads are still open.`,
       `${cap(call)} has packed the car. ${first} ${group.length > 1 ? 'say they are' : 'says they are'} coming up whether or not there is a bed ready, but would rather you said yes.`]);
  return pick(r, peace
    ? [`${first} lost the apartment lease and is between jobs. ${cap(call)} asks if there is room for a while.`, `${first} has been watching the same news you have, and would feel safer on your land than in town.`]
    : [`${first} says the town is getting tense and wants to be with family. ${cap(call)} can pull weight on the place.`, `${first} will bring what they have and work. ${cap(call)} just needs somewhere to be when it comes.`]);
}

/** Make the decision card for a group of relatives asking to join. */
export function makeKinRequest(s: GameState, group: Person[], late: boolean, r: () => number, id: string): Encounter {
  const day = dayIndex(s.clock.t);
  const n = group.length;
  const call = joinList(group.map(p => kinCallName(p, s.people)));
  const incomeLine = group.map(p => incomeOf(p, s.seed)).filter(Boolean) as Array<{ label: string; perDay: number }>;
  const month = Math.round(incomeLine.reduce((a, x) => a + x.perDay, 0) * 30 / 10) * 10;
  const meds = group.filter(p => p.conditions?.length);
  const savings = group.reduce((a, p) => a + kinSavings(p, s.seed), 0);
  const best = group.map(p => { const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a)); return `${p.first} (${top} ${p.skills[top]})`; });
  const dossier = [
    story(s, group, late, r),
    group.map(p => `${p.first} ${p.last}, ${p.age} — ${kinTitle(p, s.people)}`).join(' · '),
    `Good at: ${best.join(', ')}.`,
    meds.length ? `${joinList(meds.map(p => p.first))} take${meds.length === 1 ? 's' : ''} daily medicine (${meds.flatMap(p => p.conditions ?? []).join(', ').replace(/_/g, ' ')}); they would bring a couple of months of it.` : '',
    month > 0 && !late ? `Brings about $${month.toLocaleString('en-US')} a month in ${incomeLine[0].label}, until the banks close, and about $${savings.toLocaleString('en-US')} in savings.` : savings > 0 && !late ? `Brings about $${savings.toLocaleString('en-US')} in savings.` : '',
    `${n} more to feed: about ${n * 2000} kcal a day.`,
  ];
  return {
    id, kind: 'kin', day,
    title: `${cap(call)} ${n > 1 ? 'ask' : 'asks'} to ${late ? 'come in' : 'join you'}`,
    dossier, size: n, armed: false, strength: 0, people: group, brings: {},
    stances: late ? ['take_in', 'turn_away'] : ['take_in', 'build_first', 'turn_away'],
    kin: { savings, late },
  };
}

/** The family a relative belongs to: the person and their partner if both are still in town. */
function groupFor(away: readonly Person[], first: Person): Person[] {
  const mate = first.partner ? away.find(x => x.id === first.partner) : undefined;
  return mate ? [first, mate] : [first];
}

/** The chance a day that one asks to come (peace, the warning signs, the first weeks after). */
export function requestChance(s: GameState): number {
  const d = s.disaster, t = s.clock.t;
  if (!d.kind) return 0;
  if (d.phase === 'peace' || d.phase === 'warning') {
    if (t < 30) return 0;
    return 0.004 + 0.13 * tension(d, t) ** 1.3;
  }
  if ((d.phase === 'impact' || d.phase === 'survival') && t < d.hitAt + 45) return 0.07;
  return 0;
}

// ── Taking them in ─────────────────────────────────────────────────────────

/** Bring relatives into the household: bedroll each, medicine on hand, savings in the pot, their old jobs still going before the hit. */
export function admitKin(s: GameState, people: readonly Person[], savings: number): void {
  const k = kinOf(s);
  const peaceJobs = (s.disaster.phase === 'peace' || s.disaster.phase === 'warning') && s.personState.some(ps => ps.employed);
  for (const raw of people) {
    const p: Person = { ...raw, kin: true };
    s.people.push(p);
    s.personState.push({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), fatigue: 0, ...(peaceJobs && p.job ? { employed: true } : {}) });
    if (p.conditions?.length) s.body.rx[p.id] = 60;
  }
  const ids = new Set(people.map(p => p.id));
  k.away = k.away.filter(x => !ids.has(x.id));
  k.waiting = k.waiting.filter(w => !w.ids.some(i => ids.has(i)));
  k.refused = k.refused.filter(r => !r.people.some(p => ids.has(p.id)));   // (turned away once, let in now)
  k.joined += people.length;
  s.stock.sleeping_bag += people.length;
  if (banksOpen(s)) s.money += savings;
}

/** Resolve a kin decision. */
export function resolveKin(s: GameState, e: Encounter, stance: Stance): Outcome {
  const k = kinOf(s), g = s.gate;
  const people = e.people ?? [];
  const names = joinList(people.map(p => p.first));
  const call = joinList(people.map(p => kinCallName(p, s.people)));
  const day = dayIndex(s.clock.t);
  const anchors = [...new Set(people.map(p => p.rel?.of).filter((x): x is string => !!x))];
  const lines: string[] = [];
  const old = people.some(p => p.elder);
  k.asked += 1;
  if (stance === 'take_in') {
    const outlook = arrivalOutlook(s, people);
    const { savings } = e.kin ?? { savings: 0 };
    admitKin(s, people, savings);
    g.humanity = Math.min(100, g.humanity + (e.kin?.late ? 6 : 4));
    lines.push(...outlook.lines.slice(1));
    if (savings > 0 && banksOpen(s)) lines.push(`${names} put $${savings.toLocaleString('en-US')} into the family account.`);
    const inc = people.map(p => incomeOf(p, s.seed)).filter(Boolean) as Array<{ label: string; perDay: number }>;
    if (inc.length && banksOpen(s)) lines.push(`${inc[0].label}: about $${Math.round(inc.reduce((a, x) => a + x.perDay, 0) * 30).toLocaleString('en-US')} a month, until the banks close.`);
    k.strain.push({ at: s.clock.t, points: 3, why: `${names} came home`, of: anchors });
    return { title: people.length > 1 ? 'They are home' : 'Home at last', text: `${cap(call)} ${people.length > 1 ? 'move' : 'moves'} in. Hugs on the porch; the kids carry the bags. ${old ? 'It is good to have the old people at the table again.' : 'One more pair of hands.'}`, tone: 'good', lines };
  }
  if (stance === 'build_first') {
    const since = day, until = day + (s.disaster.phase === 'warning' ? 75 : 150);
    k.away = k.away.filter(x => !people.some(p => p.id === x.id));
    k.waiting.push({ ids: people.map(p => p.id), people: structuredClone(people), since, until, savings: e.kin?.savings ?? 0 });
    lines.push(`They will wait ${until - since} days. Beds in a house of their own (a guest house, a cottage, Mom’s house) end the wait; so does the hit, and they would come anyway.`);
    return { title: 'Build them a place first', text: `You tell ${names} to hold on until there is a roof ready for them: not a couch in the hall. ${cap(call)} says that is fair, and will keep the car packed.`, tone: 'mixed', lines };
  }
  // refuse
  g.humanity = Math.max(0, g.humanity - (old ? 8 : 5));
  const strain = old ? -9 : -6;
  k.strain.push({ at: s.clock.t, points: strain, why: `${names} turned away`, of: anchors });
  k.away = k.away.filter(x => !people.some(p => p.id === x.id));
  k.refused = k.refused.filter(r => !r.people.some(p => people.some(q => q.id === p.id)));   // a second no replaces the first
  const hit = s.disaster.kind ? Math.floor(s.disaster.hitAt + 0.25) : Infinity;
  k.refused.push({ people: structuredClone(people), day, fate: null, due: Math.max(hit, day) + 12 + (people.length * 7 + day % 23) });
  lines.push(`Humanity ${old ? '-8' : '-5'}. The family takes it hard: ${anchors.length ? s.people.find(p => p.id === anchors[0])?.first ?? 'someone' : 'someone'} especially.`);
  return { title: 'No room', text: `You tell ${names} you cannot take ${'them'}. The line is quiet for a long time before ${cap(call)} says they understand. Nobody says much at supper.`, tone: 'bad', lines };
}

// ── Daily ──────────────────────────────────────────────────────────────────

/** A fall: chance a day for an elder of this age (zero under 72), lower with a medic in the house. */
export function fallChance(age: number, medic: number): number {
  if (age < 72) return 0;
  return Math.min(0.03, 0.0012 * (age - 70)) * (medic >= 3 ? 0.4 : 1);
}

/** Once a day, from the engine: income, falls, the ones who are waiting, the ones who were refused, a new request. Returns log lines. */
export function kinDay(s: GameState): string[] {
  const k = kinOf(s);
  const day = dayIndex(s.clock.t);
  if (k.day === day) return [];
  k.day = day;
  const out: string[] = [];
  const d = s.disaster;
  k.strain = k.strain.filter(x => s.clock.t - x.at < 240);

  // retirement income stops when the banks do
  if (banksOpen(s)) s.money += retireeIncomePerDay(s);

  // falls: the old on the stairs, the porch steps in the ice; a medic in the house makes it rarer and lighter
  const medic = Math.max(0, ...s.people.filter((_, i) => alive(s, i)).map(p => p.skills.medic));
  for (const { p, i } of elders(s)) {
    const n = s.personState[i].needs;
    if (n.hurt.some(h => h.what === 'a fall')) continue;
    const u = Math.abs(Math.sin((day + 1) * 12.9898 + s.seed * 0.37 + i * 78.233) * 43758.5453) % 1;
    if (u < fallChance(p.age, medic)) { n.hurt.push({ what: 'a fall', sev: Math.round((medic >= 3 ? 18 : 30) + (u * 1000) % 15) }); out.push(`${p.first} fell on the steps and is badly bruised${medic >= 3 ? '; they were seen to right away' : ''}.`); }
  }

  const gate = s.gate;
  const hitDay = d.kind ? Math.floor(d.hitAt + 0.25) : Infinity;
  const hit = d.phase === 'impact' || d.phase === 'survival' || d.phase === 'over';

  // the ones who are waiting for a place of their own
  for (const w of [...k.waiting]) {
    const out2 = arrivalOutlook(s, w.people);
    const bedded = out2.guests.bed + out2.guests.bunk >= w.people.length && out2.guests.nowhere === 0;
    const own = out2.own >= w.people.filter(p => p.elder || p.rel).length;
    const names = joinList(w.people.map(p => p.first));
    if (bedded && (own || hit)) {
      admitKin(s, w.people, w.savings);
      gate.humanity = Math.min(100, gate.humanity + 4);
      k.strain.push({ at: s.clock.t, points: 4, why: `${names} arrived to a place of their own`, of: w.people.map(p => p.rel?.of ?? '') });
      out.push(`${names} arrive: the place you built is ready, and they have a front door of their own.`);
      if (!gate.pending && !gate.card) gate.card = { title: w.people.length > 1 ? 'They are home' : 'Home at last', text: `${names} ${w.people.length > 1 ? 'move' : 'moves'} into the place you built. The kettle is on before the bags are down.`, tone: 'good', lines: out2.lines.slice(1) };
    } else if (hit && day >= hitDay) {
      admitKin(s, w.people, 0);
      out.push(`${names} came anyway: the roads are closing and they would not wait. They are sleeping wherever there is room.`);
      k.strain.push({ at: s.clock.t, points: -2, why: 'came before the house was ready', of: w.people.map(p => p.rel?.of ?? '') });
    } else if (day >= w.until) {
      k.waiting = k.waiting.filter(x => x !== w);
      k.away.push(...w.people);
      k.strain.push({ at: s.clock.t, points: -3, why: `${names} stopped waiting`, of: w.people.map(p => p.rel?.of ?? '') });
      out.push(`${names} stopped waiting and made other plans in town. It stings a little. They might still ask again.`);
      k.next = Math.max(k.next, day + 20);
    }
  }

  // the ones who were refused: after the hit, what became of them
  for (const rf of k.refused) {
    if (rf.fate || !hit || day < rf.due || gate.pending) continue;
    const r = mulberry32(s.seed * 4723 + rf.day * 31 + rf.people[0].age);
    const u = r();
    const names = joinList(rf.people.map(p => p.first));
    const anchors = rf.people.map(p => p.rel?.of ?? '');
    const cozy = d.difficulty === 'cozy';
    if (u < 0.5 || (cozy && u < 0.72)) {
      rf.fate = 'fine';
      k.strain.push({ at: s.clock.t, points: 5, why: `word that ${names} are alright`, of: anchors });
      out.push(`Word over the radio: ${names} ${rf.people.length > 1 ? 'are' : 'is'} alive and staying with a neighbor in town. Nobody mentions the day you said no, but the whole house breathes out.`);
    } else if (u < 0.78 || cozy) {
      rf.fate = 'came';
      const e = makeKinRequest(s, rf.people, true, r, `e${s.nextId++}`);
      e.title = `${e.title.replace(/ to come in$/, '')} to come in, after all`;
      e.dossier[0] = `${cap(joinList(rf.people.map(p => kinCallName(p, s.people))))} ${rf.people.length > 1 ? 'are' : 'is'} at the gate. You told them no, back when there was a choice. They have walked a long way anyway, and ${rf.people.length > 1 ? 'are' : 'is'} not asking for much.`;
      gate.pending = e;
      out.push(`${e.title}.`);
    } else {
      rf.fate = 'died';
      k.strain.push({ at: s.clock.t, points: -12, why: `${names} did not make it`, of: anchors });
      gate.humanity = Math.max(0, gate.humanity - 3);
      out.push(`Word came, secondhand, that ${names} did not make it through the first weeks. Nobody says it out loud. Everybody remembers the phone call.`);
    }
  }

  // a new request
  if (k.open && k.away.length && !gate.pending && !gate.card && day >= k.next && !(hit && day >= hitDay + 45)) {
    const r = mulberry32(s.seed * 6131 + day * 17 + 3);
    if (r() < requestChance(s)) {
      const first = k.away[Math.floor(r() * k.away.length)];
      const late = hit;
      const e = makeKinRequest(s, groupFor(k.away, first), late, r, `e${s.nextId++}`);
      gate.pending = e;
      k.next = day + (hit ? 6 : 14 + Math.floor(r() * 10));
      out.push(`${e.title}.`);
    }
  }
  return out;
}

// ── The Family tab ─────────────────────────────────────────────────────────

/** "Mom, Dad and Ruth's brother wait in town" etc. */
export function awayLine(s: GameState): string {
  const k = s.kin;
  if (!k || !k.away.length) return '';
  return k.away.map(p => `${p.first} (${kinTitle(p, s.people) || ROLE_NAME[p.rel?.role ?? 'mother']})`).join(', ');
}
