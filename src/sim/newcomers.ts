/**
 * Neighbors and strangers who come to live on the place (docs/DECISIONS.md:
 * "the compound can take in neighbors and randoms"). This EXTENDS the gate
 * (sim/encounters.ts arrivals), the trial camp (sim/trial.ts), the neighbors'
 * lives (sim/neighborLife.ts askToJoin) and the housing plan
 * (sim/housing.ts); it does not replace them. Pure and seeded; the engine
 * calls `newcomersDay` once a day.
 *
 *  Strangers   twelve kinds of people at the gate (a nurse walking home, a
 *              mechanic with a truck, a family with kids, a hurt hiker, a
 *              veteran, a teenager alone, a drifter, a friendly stranger who
 *              asks too many questions...). Each has a hidden character
 *              (solid, gem, lazy, thief, scout for a crew, sick) the
 *              family can read: three questions at the gate (a good talker
 *              hears more), the month's trial, or simply time. Those taken in
 *              without a trial are on probation: the secret shows within weeks.
 *  Neighbors   the named households. Before the hit they ask to shelter from
 *              a storm, a fire, or the warning signs; after it, when the
 *              place is lost, raided, sick or starving. They bring what they
 *              have (stock, tools, dogs, kids). Refusing costs disposition
 *              with them and a little with every household that hears.
 *              A neighbor you helped is likelier to ask and likelier to be
 *              what they say. Their own farm stays standing as a fallback.
 *  Bonds       everyone who joined has a loyalty (0-100) that food, a bed, a
 *              place of their own and the gate's humanity raise and hunger,
 *              crowding and a cold floor wear down. Unhappy people leave.
 *  Carrying    `carryOf`: days of food at the headcount, with and without the
 *              newcomers, beds, and how many the stores and the fields can
 *              carry for six months. Past what the stores can feed, the whole
 *              table feels it (morale), loyalty falls and people drift off.
 */
import { mulberry32, pick } from './rng';
import { log } from './economy';
import { dayIndex, type GameState } from './state';
import { dayJob, SKILL_IDS, type Person, type SkillId } from './family';
import { FOODS, freshNeeds, KCAL, needOf } from './needs';
import { cachedPlan } from './housing';
import { HOME_BEDS } from './blueprints';
import { addWork, blockedReason, isFinished } from './construction';
import { infect } from './effects';
import { adoptDog } from './pets';
import { addTool, type ToolKind } from './tools';
import { fleetOf } from './vehicles';
import { syncParking } from './parking';
import type { Stock } from './materials';
import { scoutCrew, type Encounter, type Neighbor, type NeighborKind, type Outcome, type Stance } from './encounters';
import type { Character } from './trial';
import { lifeOf, plural, surname } from './neighborLife';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type BondKind = 'neighbor' | 'stranger' | 'guest';
/** What a person's card says about where they came from (Person.origin). */
export interface Origin { kind: BondKind; from?: string; arche?: string; since: number }

export interface Bond {
  id: string;
  kind: BondKind;
  /** The household they came from (neighbors and guests). */
  neighbor?: string;
  arche?: string;
  /** What they really are; hidden until it shows. */
  secret: Character;
  since: number;
  /** 0-100. */
  loyalty: number;
  /** The day the secret shows. */
  revealAt: number;
  revealed: boolean;
  /** What the family has noticed. */
  tells: string[];
  /** Guests: the day they go home, and why they came. */
  guestUntil?: number;
  why?: string;
  /** Days in a row below the walking-out line. */
  low: number;
  /** Pre-reveal hints given so far (0-2). */
  hints: number;
}
export interface Departure { day: number; name: string; why: string; kind: BondKind }
export interface GuestParty { nid: string; ids: string[]; from: number; until: number; why: ShelterWhy }
export interface NewcomerState {
  bonds: Record<string, Bond>;
  departed: Departure[];
  /** Neighbor households sheltering with the family now, by household. */
  guests: Record<string, GuestParty>;
  /** Requests already made (a storm, the warning), so a household asks once. */
  asked: string[];
  /** Days in a row the table has been over what the stores can feed. */
  strain: number;
  /** How many times each household has stayed (for stable ids). */
  stays: Record<string, number>;
  /** The day each household last asked (a household does not ask more than every 150 days; nobody asks within a month of anyone else). */
  lastAsk?: Record<string, number>;
  lastAny?: number;
  day: number;
}
export const newNewcomers = (): NewcomerState => ({ bonds: {}, departed: [], guests: {}, asked: [], strain: 0, stays: {}, day: -1 });
export const newcomersOf = (s: GameState): NewcomerState => (s.newcomers ??= newNewcomers());

const hashId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const list = (names: string[]) => names.length <= 1 ? names[0] ?? '' : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const idx = (s: GameState, id: string) => s.people.findIndex(p => p.id === id);
const present = (s: GameState, i: number) => { const n = s.personState[i]?.needs; return !!n && n.died == null && !n.taken; };

// ─────────────────────────────────────────────────────────────────────────
// How many can we carry
// ─────────────────────────────────────────────────────────────────────────

export interface Carry {
  people: number;
  extra: number;
  /** kcal a day: the table now, and the newcomers. */
  need: number;
  extraNeed: number;
  /** kcal put by, and grown a day (a year's average). */
  have: number;
  grown: number;
  /** Days of food at the table now / with the newcomers (Infinity: the fields cover it). */
  days: number;
  daysWith: number;
  /** The grocery stores are open: the put-by food is the reserve for the day they close. */
  fromStores: boolean;
  level: 'ok' | 'tight' | 'over';
  levelWith: 'ok' | 'tight' | 'over';
  /** How many more mouths the stores and fields carry for six months. */
  headroom: number;
}
const HORIZON = 180;
const levelOf = (days: number): Carry['level'] => (days >= 120 ? 'ok' : days >= 45 ? 'tight' : 'over');

/** Days of food at the headcount, with and without `extra` people, and how many the place can carry. */
export function carryOf(s: GameState, extra: readonly Pick<Person, 'kid' | 'age'>[] = []): Carry {
  const living = s.people.filter((_, i) => present(s, i));
  const need = living.reduce((a, p) => a + needOf(p), 0);
  const extraNeed = extra.reduce((a, p) => a + needOf(p), 0);
  const have = FOODS.reduce((a, f) => a + s.stock[f] * KCAL[f], 0);
  const st = s.stats;
  const grown = st && st.days >= 20 ? st.grownYear / Math.min(365, Math.max(1, st.days)) : 0;
  const daysAt = (n: number) => { const net = n - grown; return n <= 0 || net <= 0 ? Infinity : have / net; };
  const days = daysAt(need), daysWith = daysAt(need + extraNeed);
  const fromStores = s.disaster.tracks.stores > 0.5 && s.disaster.tracks.deliveries > 0.25;
  const avg = living.length ? need / living.length : 2200;
  const headroom = Math.max(0, Math.floor((have / HORIZON + grown) / avg) - living.length);
  return { people: living.length, extra: extra.length, need, extraNeed, have, grown, days, daysWith, fromStores, level: levelOf(days), levelWith: levelOf(daysWith), headroom };
}

/** The readout lines (gate card and Family tab). */
export function carryLines(c: Carry): string[] {
  const d = (x: number) => (x === Infinity ? 'the fields cover them' : `${Math.round(x)} days`);
  const out: string[] = [];
  const base = `Put by: ${d(c.days)} of food for ${c.people}`;
  out.push(c.extra > 0 ? `${base}; with ${c.extra === 1 ? 'them' : `the ${c.extra} of them`}, ${c.daysWith === Infinity ? 'still covered by the fields' : `${Math.round(c.daysWith)} days`}.` : `${base}.`);
  out.push(`The stores and fields carry ${c.people + c.headroom} people for six months${c.headroom > 0 ? ` (${c.headroom} more than now)` : ' (no more than now)'}${c.fromStores ? '; the grocery stores are still open, this is what you hold for the day they close' : ''}.`);
  if (c.extra > 0 && c.levelWith === 'over' && c.level !== 'over') out.push(`That is more than you can feed: ${c.extra === 1 ? 'one more mouth takes' : `${c.extra} more mouths take`} the stores below ${Math.round(c.daysWith)} days.`);
  else if (c.level === 'over') out.push('The table is already past what the stores can feed.');
  return out;
}

/** Morale points the table loses while it is past what it can feed (0 to -8), once the grocery stores are gone. */
export function carryStrain(s: GameState): number {
  const N = s.newcomers;
  if (!N || !Object.values(N.bonds).some(b => { const i = idx(s, b.id); return i >= 0 && present(s, i); })) return 0;
  const c = carryOf(s);
  if (c.fromStores || c.days >= 45) return 0;
  return -Math.min(8, (45 - c.days) / 5);
}

/** Added to a person's morale target: a newcomer's own (loyal feel at home), the table's strain, a fuller table when it is going well. */
export function newcomerMorale(s: GameState, id: string): number {
  const N = s.newcomers;
  if (!N) return 0;
  const strain = carryStrain(s);
  const b = N.bonds[id];
  let m = strain;
  if (b && b.kind !== 'guest') m += (b.loyalty - 50) / 12;
  else if (b) m += 1;
  else if (strain === 0) {
    const loyal = Object.values(N.bonds).filter(x => x.loyalty >= 60 && x.kind !== 'guest').length;
    if (loyal >= 3) m += Math.min(2, 0.5 * loyal / 2);   // more voices at the fire
  }
  return Math.max(-10, Math.min(5, m));
}

// ─────────────────────────────────────────────────────────────────────────
// Strangers
// ─────────────────────────────────────────────────────────────────────────

export interface Extras { tools?: ToolKind[]; dogs?: number; vehicle?: 'old_pickup' }

interface Spec {
  id: string;
  w: number;
  title: string;
  story: string[];
  adults: Array<{ body?: 'f' | 'm'; age: [number, number]; lead?: SkillId[]; job?: 'soldier' }>;
  kids?: [number, number];
  kidAge?: [number, number];
  /** A teenager on their own (a kid, but not small). */
  teen?: boolean;
  hurt?: { what: string; sev: number };
  brings?: Partial<Stock>;
  tool?: ToolKind;
  vehicle?: boolean;
  dog?: boolean;
  odds: Array<[Character, number]>;
  from: string[];
}

const SPECS: Spec[] = [
  { id: 'nurse', w: 5, title: 'A nurse walking home', story: ['Came off a double at the county hospital when the generators ran dry. Walking to her sister’s, ninety miles on, in clinic shoes.'], adults: [{ body: 'f', age: [29, 52], lead: ['medic'] }], kids: [0, 1], brings: { meds: 2 }, odds: [['solid', 0.62], ['gem', 0.18], ['sick', 0.1], ['lazy', 0.1]], from: ['the county hospital', 'the clinic on Route 9'] },
  { id: 'mechanic', w: 4, title: 'A mechanic with a truck', story: ['His flatbed ran dry two miles up the road and he pushed it to your drive. Says he can fix anything with an engine and has the tools to prove it.'], adults: [{ body: 'm', age: [28, 55], lead: ['mechanic', 'builder'] }], brings: { fuel: 3, hardware: 2, vehicle_parts: 1 }, tool: 'wrench_set', vehicle: true, odds: [['solid', 0.55], ['gem', 0.2], ['lazy', 0.1], ['thief', 0.1], ['scout', 0.05]], from: ['the truck stop on the interstate', 'a shop in town'] },
  { id: 'family', w: 6, title: 'A family with kids', story: ['Walked out when the water stopped. The youngest has been warm since yesterday.', 'From the subdivision by the highway. Their street emptied out in a week.'], adults: [{ age: [28, 46], lead: ['gardener'] }, { age: [28, 46], lead: ['teacher'] }], kids: [1, 3], brings: { canned: 2 }, odds: [['solid', 0.6], ['gem', 0.1], ['sick', 0.2], ['lazy', 0.1]], from: ['the subdivision on the highway', 'town'] },
  { id: 'hiker', w: 3, title: 'A hurt hiker', story: ['Came down off the ridge trail on a broken ankle, using a fence post for a crutch. Says he was out for the weekend and then the phones went.'], adults: [{ age: [24, 50], lead: ['hunter'] }], hurt: { what: 'a broken ankle', sev: 38 }, odds: [['solid', 0.68], ['gem', 0.2], ['lazy', 0.12]], from: ['the ridge trail', 'the national forest'] },
  { id: 'veteran', w: 3, title: 'A veteran on foot', story: ['Walking since the city. Doesn’t say much about where he served, and keeps the wall at his back.'], adults: [{ age: [30, 62], lead: ['hunter', 'medic', 'negotiator'], job: 'soldier' }], odds: [['solid', 0.55], ['gem', 0.15], ['sick', 0.1], ['scout', 0.1], ['thief', 0.05], ['lazy', 0.05]], from: ['the city', 'the old armory in town'] },
  { id: 'teen', w: 3, title: 'A teenager alone', story: ['Says his folks are a day behind him on the road. Nobody has come up the road behind him.'], adults: [], teen: true, odds: [['solid', 0.7], ['gem', 0.22], ['sick', 0.08]], from: ['the school in town', 'a farm to the east'] },
  { id: 'drifter', w: 4, title: 'A drifter looking for work', story: ['Easy smile, good boots, a story that is a little too smooth. Says he’ll work for a roof and a meal.'], adults: [{ age: [24, 52] }], odds: [['thief', 0.4], ['lazy', 0.2], ['scout', 0.15], ['solid', 0.15], ['gem', 0.1]], from: ['Billings', 'wherever the work is', 'down south'] },
  { id: 'traveler', w: 3, title: 'A friendly traveler', story: ['His car quit on the county road. Pleasant, curious, and glad to talk: about the road, the neighbors, how you manage out here.'], adults: [{ age: [30, 55] }], odds: [['scout', 0.7], ['solid', 0.3]], from: ['the county seat', 'a town two counties over'] },
  { id: 'couple', w: 4, title: 'A couple from town', story: ['From the subdivision by the highway. Their house was broken into last night.'], adults: [{ age: [26, 55], lead: ['gardener'] }, { age: [26, 55], lead: ['negotiator'] }], odds: [['solid', 0.6], ['gem', 0.15], ['lazy', 0.1], ['sick', 0.08], ['thief', 0.07]], from: ['the subdivision by the highway'] },
  { id: 'brothers', w: 3, title: 'Two brothers from the ranches', story: ['From a ranch to the south. Good shots; they want work and a roof.'], adults: [{ body: 'm', age: [22, 40], lead: ['hunter'] }, { body: 'm', age: [22, 40], lead: ['hunter', 'builder'] }], odds: [['solid', 0.55], ['gem', 0.15], ['lazy', 0.1], ['thief', 0.1], ['scout', 0.1]], from: ['a ranch to the south'] },
  { id: 'lineman', w: 3, title: 'A lineman with his own tools', story: ['Says he was a lineman for the co-op. Carries his own tools.'], adults: [{ body: 'm', age: [28, 56], lead: ['mechanic', 'radio'] }], tool: 'pliers', odds: [['solid', 0.6], ['gem', 0.2], ['lazy', 0.1], ['thief', 0.1]], from: ['the co-op yard'] },
  { id: 'friend', w: 2, title: 'A friend of a friend', story: ['Drove up from the city on back roads; the car died at the county line.'], adults: [{ age: [26, 54] }], kids: [0, 2], odds: [['solid', 0.6], ['gem', 0.1], ['lazy', 0.15], ['thief', 0.1], ['sick', 0.05]], from: ['the city'] },
];

const FN_F = ['Dolores', 'Marisol', 'Joan', 'Tamika', 'Renee', 'Lucinda', 'Odessa', 'Priya', 'Colleen', 'Yesenia', 'Margo', 'Hattie', 'Noor', 'Carla', 'Bridget', 'Inez', 'Leona', 'Sunny', 'Wilma', 'Tess'];
const FN_M = ['Hector', 'Walt', 'Marcus', 'Tomas', 'Dale', 'Rafael', 'Gus', 'Calvin', 'Ivan', 'Leroy', 'Nate', 'Omar', 'Duane', 'Felix', 'Rudy', 'Cal', 'Lonnie', 'Mateo', 'Abel', 'Harlan'];
const LAST = ['Reyes', 'Holt', 'Vance', 'Okafor', 'Brandt', 'Sato', 'Larkin', 'Moreau', 'Pruitt', 'Szabo', 'Whitlock', 'Duarte', 'Kessler', 'Amin', 'Cassidy', 'Tolliver'];
const SHIRTS = [0x8a3b2e, 0x3b5b8c, 0x5a6e3a, 0x7a5a2a, 0x6a3a6a, 0x2f6f6f, 0x7a7a7a, 0x9a6a3a];

function rollCharacter(r: () => number, odds: Array<[Character, number]>): Character {
  let u = r();
  for (const [c, w] of odds) { if (u < w) return c; u -= w; }
  return 'solid';
}
const rint = (r: () => number, [a, b]: [number, number]) => a + Math.floor(r() * (b - a + 1));
const topSkill = (p: Person): SkillId => SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a));

/** Someone at the gate: a seeded kind of stranger with a hidden character (the encounter carries it). */
export function strangerArrival(s: GameState, r: () => number, id: string, day: number): Encounter {
  const tot = SPECS.reduce((a, x) => a + x.w, 0);
  let u = r() * tot, spec = SPECS[0];
  for (const x of SPECS) { u -= x.w; if (u <= 0) { spec = x; break; } }
  const last = pick(r, LAST);
  const used = new Set(s.people.map(p => p.first));
  const name = (body: 'f' | 'm') => { let n: string, g = 0; do n = pick(r, body === 'f' ? FN_F : FN_M); while (used.has(n) && g++ < 40); used.add(n); return n; };
  const people: Person[] = [];
  const add = (body: 'f' | 'm', age: number, kid: boolean, lead: SkillId[] = []) => {
    const skills = Object.fromEntries(SKILL_IDS.map(k => [k, Math.floor(r() * (kid ? 2 : 4))])) as Record<SkillId, number>;
    lead.forEach((k, j) => { skills[k] = Math.max(skills[k], (j === 0 ? 7 : 5) + Math.floor(r() * 3)); });
    if (!lead.length && !kid) skills[pick(r, SKILL_IDS)] = 5 + Math.floor(r() * 4);
    const p: Person = { id: `p${id}_${people.length}`, first: name(body), last, age, kid, body, skills, shirt: SHIRTS[Math.floor(r() * SHIRTS.length)] };
    people.push(p);
    return p;
  };
  const bodies: Array<'f' | 'm'> = r() < 0.5 ? ['f', 'm'] : r() < 0.5 ? ['f', 'f'] : ['m', 'm'];
  spec.adults.forEach((a, i) => {
    const p = add(a.body ?? (spec.adults.length === 2 && !spec.adults[0].body ? bodies[i] : r() < 0.5 ? 'f' : 'm'), rint(r, a.age), false, a.lead ?? []);
    p.job = a.job === 'soldier' ? { title: 'National Guard soldier', wage: 200, id: 'soldier' } : dayJob(p, s.seed);
  });
  if (spec.teen) { const p = add(r() < 0.5 ? 'f' : 'm', rint(r, [14, 17]), true); p.skills[pick(r, ['gardener', 'hunter', 'mechanic'] as SkillId[])] = 4 + Math.floor(r() * 2); }
  if (spec.kids) { const n = rint(r, spec.kids); for (let k = 0; k < n; k++) add(r() < 0.5 ? 'f' : 'm', rint(r, spec.kidAge ?? [3, 13]), true); }
  const secret = rollCharacter(r, spec.odds);
  const brings: Partial<Stock> = { ...(spec.brings ?? {}) };
  if (!spec.brings && r() < 0.4) brings.canned = 1 + Math.floor(r() * 3);
  const extras: Extras = {};
  if (spec.tool) extras.tools = [spec.tool];
  if (spec.vehicle && fleetOf(s).filter(v => v.kind === 'old_pickup').length < 1 && r() < 0.7) extras.vehicle = 'old_pickup';
  if (spec.dog) extras.dogs = 1;
  const n = people.length, kidsN = people.filter(p => p.kid).length;
  const best = people.filter(p => !p.kid || p.age >= 14).map(p => { const t = topSkill(p); return `${p.first} (${t} ${p.skills[t]})`; });
  const hurtWho = spec.hurt ? people[0] : null;
  const e: Encounter = {
    id, kind: 'arrival', day, title: `${spec.title} at the gate`,
    dossier: [
      pick(r, spec.story),
      `${n} ${n === 1 ? 'person' : 'people'}${kidsN ? `, ${kidsN} ${kidsN === 1 ? 'kid' : 'kids'}` : ''}: ${people.map(p => `${p.first}, ${p.age}`).join('; ')}.`,
      `Say they’re good at: ${best.join(', ') || 'not much yet'}.`,
      ...(hurtWho ? [`${hurtWho.first} is hurt: ${spec.hurt!.what}.`] : []),
      ...(Object.keys(brings).length || extras.tools || extras.vehicle ? [`They carry: ${bringsLine(brings, extras)}.`] : []),
      `${n} more to feed: about ${people.reduce((a, p) => a + needOf(p), 0).toLocaleString('en-US')} kcal a day.`,
    ],
    size: n, armed: false, strength: 0, people, brings,
    stances: ['take_in', 'trial', 'trade', 'turn_away'],
    arche: spec.id, secret, extras, said: [], asked: 0,
    ...(hurtWho ? { hurt: { who: hurtWho.id, what: spec.hurt!.what, sev: spec.hurt!.sev } } : {}),
  };
  // where they say they are from (the gate questions answer from it)
  e.said = [pick(r, spec.from)];
  return e;
}

const BRING_NAME: Partial<Record<keyof Stock, string>> = { canned: 'cans of food', staples: 'sacks of staples', meds: 'meds', fuel: 'cans of fuel', goat: 'goats', sheep: 'sheep', hardware: 'hardware', seed: 'seed', seed_heirloom: 'heirloom seed', tent: 'a tent', feed: 'bags of feed', lids: 'canning lids', vehicle_parts: 'vehicle parts', rabbit: 'rabbits', fresh: 'fresh food' };
/** "2 cans of food, 3 sheep, a dog and a wrench set". */
export function bringsLine(brings: Partial<Stock> | undefined, ex: Extras | undefined): string {
  const out: string[] = [];
  for (const [k, n] of Object.entries(brings ?? {}) as Array<[keyof Stock, number]>) if (n > 0) out.push(k === 'tent' ? 'a tent' : `${n} ${BRING_NAME[k] ?? k}`);
  if (ex?.dogs) out.push(ex.dogs === 1 ? 'a dog' : `${ex.dogs} dogs`);
  for (const t of ex?.tools ?? []) out.push(`a ${t.replace(/_/g, ' ')}`);
  if (ex?.vehicle) out.push('an old pickup (not much gas in it)');
  return out.join(', ') || 'what is on their backs';
}

// ── Questions at the gate ─────────────────────────────────────────────────

export const QUESTIONS = ['Where have you come from?', 'Is anyone behind you?', 'What can you do for us?'] as const;
export const MAX_QUESTIONS = QUESTIONS.length;

const TELLS: Record<Character, string[]> = {
  solid: ['Keeps checking the road behind them: afraid of something, or someone.', 'Rubs their hands raw, the way people do who are ashamed to be asking.'],
  gem: ['Eyes the pump and the gutters while they talk, the way people do who fix things.', 'Hands like old leather; they have worked.'],
  lazy: ['Looks at the house, not the work: where the beds are and what’s for supper.', 'Sizes up the woodpile, then the porch.'],
  thief: ['Their eyes keep sliding to the shed, the truck and the porch.', 'They offer to “look after the place” while you are out: a bit too keen.'],
  scout: ['Asks how many adults live here, and who stands watch at night.', 'Asks which way the road goes, and who else is out here. Friendly, and a little too curious.'],
  sick: ['A wet cough they try to swallow, and a flush that is not from the walking.', 'The youngest hasn’t spoken once. Warm to the touch.'],
};
const ANSWER: Record<Character, Array<(from: string, top: string) => string>> = {
  solid: [f => `From ${f}. We left when it got bad.`, () => 'Nobody. We’d tell you if there were.', t => `${t}. I’ll show you, if you give me something to do.`],
  gem: [f => `${f}. Long way.`, () => 'No. Just us.', t => `A bit of ${t}. I’d rather show you than say.`],
  lazy: [f => `Oh, ${f}. You know.`, () => 'Probably not.', () => 'Anything you need. I’ve done it all.'],
  thief: [() => 'Around. Here and there.', () => 'No. Why, are you expecting somebody?', () => 'Whatever you need. Anything at all.'],
  scout: [f => `${f}, mostly. Nice place you have. How many of you live here?`, () => 'No. Why do you ask? Is there trouble out this way?', () => 'I pick things up quick. Say, do you keep the gate shut at night?'],
  sick: [f => `From ${f}. We’ve been walking since Tuesday.`, () => 'No, nobody. (A cough.)', () => 'Whatever you need, when we’re over this.'],
};

/** One question at the gate. The answer and, sometimes, what you notice go on the card. Returns why not, or null. */
export function askQuestion(s: GameState): string | null {
  const e = s.gate.pending;
  if (!e || e.kind !== 'arrival' || !e.secret || !e.people?.length) return 'nobody to ask';
  const asked = e.asked ?? 0;
  if (asked >= MAX_QUESTIONS) return 'you have asked what you can';
  const r = mulberry32(s.seed * 771 + e.day * 13 + asked * 97 + hashId(e.id));
  const sec = e.secret, from = e.said?.[0] ?? 'the road';
  const lead = e.people.find(p => !p.kid) ?? e.people[0];
  const answer = ANSWER[sec][asked](from, topSkill(lead));
  const negotiator = Math.max(0, ...s.people.filter((_, i) => present(s, i)).map(p => p.skills.negotiator));
  // what a good talker sees: the bad ones slip, the sick can't hide it, and an honest scared one can look shifty too
  const p = sec === 'sick' ? 0.8 : sec === 'solid' || sec === 'gem' ? 0.12 : Math.min(0.9, 0.3 + 0.08 * negotiator);
  const lines = [`You ask: “${QUESTIONS[asked]}”  — “${answer}”`];
  if (r() < p) {
    const fresh = TELLS[sec].filter(x => !(e.tells ?? []).includes(x));
    const tell = pick(r, fresh.length ? fresh : TELLS[sec]);
    if (!(e.tells ?? []).includes(tell)) { lines.push(`You notice: ${tell}`); (e.tells ??= []).push(tell); }
  }
  e.dossier.push(...lines);
  e.asked = asked + 1;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Taking them in
// ─────────────────────────────────────────────────────────────────────────

export interface AdmitOpts {
  kind: BondKind;
  neighbor?: string;
  arche?: string;
  secret?: Character;
  brings?: Partial<Stock>;
  extras?: Extras;
  hurt?: { who: string; what: string; sev: number };
  /** Guests: the day they go home, and why they came. */
  guestUntil?: number;
  why?: string;
  /** What they are is already known (a month's trial, a prisoner who came round). */
  known?: boolean;
  /** A month of trial behind them (loyalty starts a little higher). */
  tried?: boolean;
  /** Who carries a fever. */
  fever?: string;
  /** What the gate already noticed. */
  tells?: string[];
}

/** Which of the group the secret belongs to: the first adult (the oldest kid if there are no adults); the sick one is the youngest. */
function actorOf(people: readonly Person[], secret: Character): Person | undefined {
  if (secret === 'sick') return [...people].sort((a, b) => a.age - b.age)[0];
  return people.find(p => !p.kid) ?? people.find(p => p.age >= 14) ?? people[0];
}

/** How a household's standing with the family sets what they are: a trusted neighbor is what they say. */
export function neighborSecret(disposition: number, r: () => number): Character {
  return rollCharacter(r, disposition >= 30 ? [['solid', 0.82], ['gem', 0.18]] : disposition >= 0 ? [['solid', 0.62], ['gem', 0.1], ['lazy', 0.18], ['thief', 0.1]] : [['solid', 0.3], ['lazy', 0.3], ['thief', 0.3], ['scout', 0.1]]);
}

/** Everyone comes in through here: strangers, neighbors, guests, a trial's survivors. Returns the lines for the card. */
export function admitNewcomers(s: GameState, people: readonly Person[], o: AdmitOpts): string[] {
  const N = newcomersOf(s), g = s.gate;
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 4231 + day * 29 + people.length * 7 + hashId(people[0]?.id ?? 'x'));
  const lines: string[] = [];
  const secret = o.secret ?? 'solid';
  const actor = actorOf(people, secret);
  const nb = o.neighbor ? s.neighbors.find(n => n.id === o.neighbor) : undefined;
  for (const raw of people) {
    const p: Person = { ...raw, origin: { kind: o.kind, from: o.neighbor, arche: o.arche, since: day } };
    const needs = freshNeeds();
    if (o.fever === p.id || (secret === 'sick' && raw === actor && !o.known && !o.fever)) needs.hurt.push({ what: 'fever', sev: 40 });
    if (o.hurt?.who === p.id) { needs.hurt.push({ what: o.hurt.what, sev: o.hurt.sev }); needs.health = Math.max(40, 100 - o.hurt.sev); }
    s.people.push(p);
    s.personState.push({ id: p.id, task: 'idle', target: null, needs, fatigue: 0 });
    const mine = raw === actor ? secret : 'solid';
    const loyalty = o.kind === 'neighbor' ? Math.max(25, Math.min(90, 42 + (nb?.disposition ?? 0) * 0.45)) : o.kind === 'guest' ? 55 : 36 + (o.tried ? 12 : 0) + g.humanity / 10;
    N.bonds[p.id] = {
      id: p.id, kind: o.kind, neighbor: o.neighbor, arche: o.arche, secret: mine, since: day, loyalty,
      revealAt: o.known || o.kind === 'guest' ? day : day + (mine === 'solid' ? 10 : 14) + Math.floor(r() * 26),
      revealed: !!o.known || o.kind === 'guest', tells: raw === actor && o.tells ? [...o.tells.map(t => `At the gate: ${t}`)] : [], low: 0, hints: 0,
      ...(o.guestUntil != null ? { guestUntil: o.guestUntil, why: o.why } : {}),
    };
  }
  // they come with a bedroll each (sim/housing.ts) and what they carry
  s.stock.sleeping_bag += people.length;
  for (const [k, v] of Object.entries(o.brings ?? {}) as Array<[keyof Stock, number]>) s.stock[k] += v;
  for (const t of o.extras?.tools ?? []) addTool(s, t, 0.5 + 0.4 * r(), 0.5 + 0.4 * r(), r() < 0.3 ? 'pro' : 'cheap');
  for (let k = 0; k < (o.extras?.dogs ?? 0); k++) { const d = adoptDog(s, { ageYears: 1.5 + r() * 5, training: 35, guard: nb?.kind === 'ranch' || nb?.kind === 'prepper' }); lines.push(`${d.name}, their dog, comes in with them.`); }
  if (o.extras?.vehicle) { const vs = fleetOf(s); vs.push({ id: `v${Math.max(0, ...vs.map(v => Number(v.id.slice(1)) || 0)) + 1}`, kind: 'old_pickup', mileage: 190_000, condition: 0.5, fuel: 6, oilAt: 188_000, serviceAt: 187_000 }); syncParking(s); lines.push('The old pickup comes in behind them, running on fumes.'); }
  const bl = bringsLine(o.brings, { tools: o.extras?.tools });
  if (Object.keys(o.brings ?? {}).length || o.extras?.tools?.length) lines.push(`They brought: ${bl}.`);
  if (secret === 'sick' && !o.known && r() < 0.35) { const l = infect(s, r, 'they brought it in'); if (l) lines.push(l); }
  g.tookIn += people.length;
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────
// Neighbors
// ─────────────────────────────────────────────────────────────────────────

export type ShelterWhy = 'storm' | 'fire' | 'warning' | 'raided' | 'sick' | 'hungry' | 'settle';

const BRING: Record<NeighborKind, (r: () => number) => { brings: Partial<Stock>; extras: Extras }> = {
  old_farmer: r => ({ brings: { canned: 2, staples: 1, seed_heirloom: 1, ...(r() < 0.4 ? { goat: 2 } : {}) }, extras: r() < 0.5 ? { dogs: 1 } : {} }),
  young_family: r => ({ brings: { canned: 3, ...(r() < 0.6 ? { tent: 1 } : {}) }, extras: r() < 0.3 ? { dogs: 1 } : {} }),
  prepper: () => ({ brings: { canned: 6, meds: 1, fuel: 2 }, extras: {} }),
  widow: r => ({ brings: { meds: 2, canned: 2, lids: 12 }, extras: r() < 0.4 ? { dogs: 1 } : {} }),
  ranch: r => ({ brings: { canned: 3, feed: 2, sheep: 3 + Math.floor(r() * 3), goat: Math.floor(r() * 3) }, extras: r() < 0.6 ? { dogs: 1 } : {} }),
  loner: r => ({ brings: { fuel: 2, hardware: 2 }, extras: { tools: ['wrench_set', 'pliers'], ...(r() < 0.5 ? { dogs: 1 } : {}) } }),
};
/** What a household carries to the gate: stock, tools, dogs, livestock by the kind of people they are. */
export function neighborBrings(n: Neighbor, r: () => number): { brings: Partial<Stock>; extras: Extras } {
  const b = BRING[n.kind](r);
  for (const k of Object.keys(b.brings) as Array<keyof Stock>) if (!b.brings[k]) delete b.brings[k];
  return b;
}

/** "Good friends: ..." from their disposition. */
export function trustLine(n: Neighbor): string {
  return n.disposition >= 50 ? 'Good friends: you have traded and stood watch for each other. They would do the same.'
    : n.disposition >= 20 ? 'Friendly. You have traded with them.'
    : n.disposition > -20 ? 'Neighbors, nothing more. They hardly know you.'
    : 'They have little reason to love you, and they are asking anyway.';
}
/** How readily a household asks (1 = even; more for those you have helped). */
export const trustMult = (n: Neighbor): number => Math.max(0.4, Math.min(1.7, 0.8 + n.disposition / 80));

/** The people of a household, as they would stand at the gate (stable per household and stay). */
export function householdPeople(s: GameState, n: Neighbor, count: number, r: () => number, idFor: (i: number) => string): Person[] {
  const l = lifeOf(s, n);
  return Array.from({ length: count }, (_, i) => {
    const kid = n.kind === 'young_family' && i >= 2;
    const skills = Object.fromEntries(SKILL_IDS.map(k => [k, Math.floor(r() * (kid ? 2 : 3))])) as Record<SkillId, number>;
    if (!kid) skills[n.skill] = 5 + Math.floor(r() * 3);
    const body: 'f' | 'm' = n.kind === 'widow' ? 'f' : i === 0 ? 'm' : 'f';
    const p: Person = { id: idFor(i), first: pick(r, body === 'f' ? ['Ruth', 'Marlene', 'Jo', 'Kate', 'Ada', 'Lorna', 'Bea'] : ['Walt', 'Gene', 'Earl', 'Dale', 'Luis', 'Tom', 'Marty']), last: surname(n), age: i === 0 ? l.head : kid ? 6 + Math.floor(r() * 9) : Math.max(18, l.head - Math.floor(r() * 6)), kid, body, skills, shirt: Math.floor(r() * 0xffffff) & 0x7f7f7f };
    if (!kid && p.age < 66) p.job = dayJob(p, s.seed);
    if (p.age >= 66) p.elder = true;
    return p;
  });
}

/** Days between one household's requests for shelter. */
const SHELTER_GAP = 150;
const STORMS = new Set(['blizzard', 'ice_storm', 'flood', 'tornado', 'derecho', 'hurricane_remnants', 'flash_flood', 'windstorm']);
const STORM_TEXT: Record<string, string> = { blizzard: 'A blizzard is coming down the valley', ice_storm: 'An ice storm is forecast', flood: 'The creek is rising and the flood watch is up', tornado: 'A tornado watch is up', derecho: 'A derecho is bearing down', hurricane_remnants: 'The remnants of a hurricane are coming up the ridges', flash_flood: 'The wash is running', windstorm: 'A windstorm is coming off the Pacific' };

/** A household asks to shelter with the family for a while. Null if the gate is busy or they cannot. */
export function requestShelter(s: GameState, n: Neighbor, why: ShelterWhy, r: () => number, days?: number): Encounter | null {
  const g = s.gate;
  if (g.pending || n.status !== 'home' || n.members <= 0) return null;
  const N = newcomersOf(s);
  if (N.guests[n.id]) return null;
  const day = dayIndex(s.clock.t), d = s.disaster;
  const last = (N.lastAsk ??= {})[n.id];
  if ((last != null && day - last < SHELTER_GAP) || (N.lastAny != null && day - N.lastAny < 30)) return null;
  const stay = (N.stays[n.id] ?? 0) + 1;
  const count = Math.min(5, n.members);
  const w = s.weather?.active;
  const hitDay = d.kind ? Math.floor(d.hitAt + 0.25) : day + 30;
  const stayDays = days ?? (why === 'storm' && w ? Math.max(2, w.until - day + 2) : why === 'fire' ? 45 : why === 'warning' ? Math.max(14, hitDay + 14 - day) : why === 'sick' ? 14 : why === 'raided' ? 21 : 25);
  const people = householdPeople(s, n, count, mulberry32(s.seed * 1913 + hashId(n.id)), i => `ps_${n.id}_${i}_${stay}`);
  const { brings, extras } = neighborBrings(n, r);
  const who = `The ${plural(surname(n))}`;
  const reason: Record<ShelterWhy, string> = {
    storm: `${STORM_TEXT[w?.kind ?? ''] ?? 'A bad storm is coming'}. Their place sits out on the open ground and the roof is not what it was. They would like to sit it out behind your walls.`,
    fire: 'Their house burned in the night. They are standing in your drive with what they could carry.',
    warning: 'They have been watching the same news you have. They would sooner be behind your walls when it comes than alone out there.',
    raided: 'Raiders went through their place. They held, but nobody can sleep there tonight.',
    sick: 'Somebody at their place is sick and the stove is cold. They have no one else to turn to.',
    hungry: 'Their cellar is nearly empty. They are not begging; they are asking to share a table until the garden comes in.',
    settle: 'Their place is not fit to live in, and the days you gave them are up. They are asking to stay.',
  };
  const e: Encounter = {
    id: `e${s.nextId++}`, kind: 'shelter', day, title: why === 'settle' ? `${who} ask to stay` : `${who} ask for shelter`,
    dossier: [
      reason[why],
      `${count} of them: ${people.map(p => `${p.first}, ${p.age}`).join('; ')}. ${NEIGHBOR_GOOD[n.kind] ?? ''}`.trim(),
      trustLine(n),
      `They carry: ${bringsLine(brings, extras)}.`,
      why === 'settle' ? 'Their place stays theirs if it comes right; until then they would live here.' : `They would stay about ${stayDays} days. Their farm stays theirs.`,
      `${count} more to feed: about ${people.reduce((a, p) => a + needOf(p), 0).toLocaleString('en-US')} kcal a day.`,
    ],
    size: count, armed: false, strength: 0, people, brings, extras, neighbor: n.id,
    stances: ['take_in', 'turn_away'],
    shelter: { nid: n.id, why, days: stayDays },
    secret: neighborSecret(n.disposition, mulberry32(s.seed * 3169 + hashId(n.id) + stay)),
  };
  g.pending = e;
  N.lastAsk![n.id] = day; N.lastAny = day;
  log(s, `${e.title}.`);
  return e;
}
const NEIGHBOR_GOOD: Partial<Record<NeighborKind, string>> = { old_farmer: 'Good with soil and weather.', young_family: 'Willing, and green.', prepper: 'They know their gear.', widow: 'A retired nurse.', ranch: 'Good hands with stock and a rifle.', loner: 'Can fix anything with an engine.' };

/** Guests whose place is gone ask to stay for good (the same people, already under the roof). */
function requestSettle(s: GameState, n: Neighbor, party: GuestParty, people: Person[]): boolean {
  const g = s.gate;
  if (g.pending) return false;
  const day = dayIndex(s.clock.t);
  const who = `The ${plural(surname(n))}`;
  g.pending = {
    id: `e${s.nextId++}`, kind: 'shelter', day, title: `${who} ask to stay`,
    dossier: [
      'Their place is not fit to live in, and the days you gave them are up. They are asking to stay.',
      `${people.length} of them: ${people.map(p => `${p.first}, ${p.age}`).join('; ')}. They have been at your table ${day - party.from} days.`,
      trustLine(n),
      'If they stay, they keep nothing but what they carry: the farmstead is ash.',
    ],
    size: people.length, armed: false, strength: 0, people, neighbor: n.id, stances: ['take_in', 'turn_away'],
    shelter: { nid: n.id, why: 'settle', days: 0, settle: true },
  };
  log(s, `${g.pending.title}.`);
  return true;
}

/** Word gets round: a household's disposition falls, and every other household hears how the gate was shut. */
export function refuseNeighbor(s: GameState, n: Neighbor, hard: number): string[] {
  const out: string[] = [];
  n.disposition = Math.max(-100, n.disposition - hard);
  let heard = 0;
  for (const o of s.neighbors) if (o.id !== n.id && o.status === 'home' && o.members > 0) { o.disposition = Math.max(-100, o.disposition - 3); heard++; }
  if (heard) out.push(`Word gets round: ${heard} ${heard === 1 ? 'household hears' : 'households hear'} the gate was shut on the ${surname(n)}s.`);
  lifeOf(s, n).history.push({ day: dayIndex(s.clock.t), text: 'Turned away at the family’s gate when they asked for shelter.', known: true, how: 'seen' });
  return out;
}

/** The answer to a shelter request (stance take_in / turn_away). */
export function resolveShelter(s: GameState, e: Encounter, stance: Stance): Outcome {
  const g = s.gate, N = newcomersOf(s);
  const n = s.neighbors.find(x => x.id === e.shelter?.nid);
  const sh = e.shelter;
  const people = e.people ?? [];
  const day = dayIndex(s.clock.t);
  const who = n ? `The ${plural(surname(n))}` : 'They';
  const r = mulberry32(s.seed * 5171 + day * 7 + people.length);
  const lines: string[] = [];
  if (!n || !sh) return { title: 'Gone', text: 'They are gone.', tone: 'mixed', lines };
  if (stance === 'take_in') {
    if (sh.settle) {
      // the same people, already here: they stay for good
      for (const p of people) { const b = N.bonds[p.id]; const q = s.people.find(x => x.id === p.id); if (b) { b.kind = 'neighbor'; delete b.guestUntil; b.loyalty = Math.min(100, b.loyalty + 10); } if (q?.origin) q.origin.kind = 'neighbor'; }
      delete N.guests[n.id];
      n.status = 'joined'; n.members = 0;
      n.disposition = Math.min(100, n.disposition + 10);
      g.humanity = Math.min(100, g.humanity + 4);
      lifeOf(s, n).history.push({ day, text: 'Came to live with the family.', known: true, how: 'seen' });
      return { title: 'They are staying', text: `${who} unpack for good. Somebody finds another chair.`, tone: 'good', lines };
    }
    lines.push(...admitNewcomers(s, people, { kind: 'guest', neighbor: n.id, arche: 'neighbor', secret: e.secret, brings: e.brings, extras: e.extras, guestUntil: day + sh.days, why: sh.why }));
    N.guests[n.id] = { nid: n.id, ids: people.map(p => p.id), from: day, until: day + sh.days, why: sh.why };
    N.stays[n.id] = (N.stays[n.id] ?? 0) + 1;
    n.disposition = Math.min(100, n.disposition + 8);
    g.humanity = Math.min(100, g.humanity + (sh.why === 'fire' || sh.why === 'hungry' || sh.why === 'sick' ? 6 : 4));
    lifeOf(s, n).history.push({ day, text: `Sheltered with the family (${sh.why}).`, known: true, how: 'seen' });
    const where = r() < 0.5 ? 'the kids drag in the quilts' : 'a pot goes on the stove';
    return { title: 'The door is open', text: `${who} come in out of the weather: ${where}. About ${sh.days} days.`, tone: 'good', lines };
  }
  // turned away
  if (sh.settle) { for (const p of people) moveOut(s, p.id, 'sent on'); delete N.guests[n.id]; }
  g.turnedAway += people.length;
  g.humanity = Math.max(0, g.humanity - (sh.why === 'fire' || sh.why === 'hungry' || sh.why === 'sick' ? 8 : 6));
  lines.push(...refuseNeighbor(s, n, sh.why === 'settle' ? 25 : 18));
  const l = lifeOf(s, n);
  if (sh.why === 'storm' && r() < 0.4 && !l.sick) { l.sick = { what: 'pneumonia from a night in the truck', until: day + 14 }; lines.push(`${who} sat it out in their truck.`); }
  if (sh.why === 'settle' || sh.why === 'fire') { n.status = 'left'; lines.push(`${who} go down the road with what they carry.`); }
  return { title: 'The gate stays shut', text: `${who} look at the house a long time, then at you. Nobody says much at supper.`, tone: 'bad', lines };
}

// ─────────────────────────────────────────────────────────────────────────
// Leaving
// ─────────────────────────────────────────────────────────────────────────

/** Someone leaves the place for good (not dead, not taken). */
export function moveOut(s: GameState, id: string, why: string): boolean {
  const i = idx(s, id);
  if (i < 0 || !present(s, i)) return false;
  const p = s.people[i], n = s.personState[i].needs;
  const N = newcomersOf(s), b = N.bonds[id];
  n.died = Math.floor(s.clock.t); n.left = true;
  s.personState[i].task = 'gone';
  delete p.home;
  N.departed.push({ day: dayIndex(s.clock.t), name: p.first, why, kind: b?.kind ?? 'stranger' });
  if (N.departed.length > 12) N.departed.splice(0, N.departed.length - 12);
  return true;
}

/** A neighbor household's people still living here from this stay. */
const partyOf = (s: GameState, b: Bond): Bond[] => Object.values(newcomersOf(s).bonds).filter(x => x.kind === b.kind && x.neighbor === b.neighbor && x.since === b.since);
const partyHere = (s: GameState, b: Bond): Bond[] => partyOf(s, b).filter(x => { const i = idx(s, x.id); return i >= 0 && present(s, i); });

/** Neighbors who go back to a farm that is still standing take their place back (the farmstead is the fallback). Returns whether there was a place to go. */
function returnHome(s: GameState, b: Bond): boolean {
  const n = b.neighbor ? s.neighbors.find(x => x.id === b.neighbor) : undefined;
  if (!n) return false;
  const standing = lifeOf(s, n).farm === 'standing';
  if (standing) { if (n.status === 'joined') { n.status = 'home'; n.members = Math.max(1, partyOf(s, b).length); } return true; }
  n.status = 'left';
  return false;
}

/** One of a neighbor household has left: when none of them is left here the household goes back to its farm (or has none), and cools toward you by `cost`. */
function leftNeighbor(s: GameState, b: Bond, cost: number): boolean {
  if (!b.neighbor) return false;
  const n = s.neighbors.find(x => x.id === b.neighbor);
  if (n && cost) n.disposition = Math.max(-100, n.disposition - cost);
  if (partyHere(s, b).length) return false;
  delete newcomersOf(s).guests[b.neighbor];
  return returnHome(s, b);
}

/** The family sends someone (and their party) away, or home. Returns why not, or null. */
export function sendAway(s: GameState, id: string, home = false): string | null {
  const i = idx(s, id);
  if (i < 0 || !present(s, i)) return 'no such person';
  const p = s.people[i], N = newcomersOf(s), b = N.bonds[id];
  if (!b) return 'they are family';
  const group = partyHere(s, b);
  for (const x of group) {
    const q = s.people[idx(s, x.id)];
    moveOut(s, x.id, home ? 'went home' : 'sent away');
    if (x.id !== id) log(s, `${q.first} goes with ${p.first}.`);
  }
  const g = s.gate;
  if (b.neighbor) {
    const n = s.neighbors.find(x => x.id === b.neighbor);
    const back = returnHome(s, b);
    if (n) n.disposition = Math.max(-100, n.disposition + (home ? 2 : -12));
    delete N.guests[b.neighbor];
    log(s, home ? `${p.first} and the others go home to their place${back ? '' : '. There is not much left of it'}.` : `${p.first} is sent on. ${back ? 'They go back to their own place, and they will remember it.' : 'They have nowhere to go back to.'}`);
  } else log(s, home ? `${p.first} goes on down the road with a handshake.` : `${p.first} is sent on down the road.`);
  if (!home) { g.humanity = Math.max(0, g.humanity - 3); g.turnedAway += group.length; }
  return null;
}

/** Give someone (and the rest of their party) a home of their own: a finished building with beds left. Returns why not, or null. */
export function givePlace(s: GameState, id: string, structureId: string, solo = false): string | null {
  const i = idx(s, id);
  if (i < 0 || !present(s, i)) return 'no such person';
  const st = s.structures.find(x => x.id === structureId);
  if (!st || !isFinished(st) || !(HOME_BEDS[st.kind] > 0)) return 'that is not a home';
  const N = newcomersOf(s), b = N.bonds[id];
  const party = b && !solo ? partyHere(s, b) : [];
  const members = party.length ? party.map(x => s.people[idx(s, x.id)]) : [s.people[i]];
  const taken = s.people.filter((p, k) => p.home === st.id && present(s, k) && !members.includes(p)).length;
  const beds = HOME_BEDS[st.kind];
  if (taken + members.length > beds) return `the ${st.kind.replace(/_/g, ' ')} has ${Math.max(0, beds - taken)} beds left`;
  for (const m of members) m.home = st.id;
  log(s, `${list(members.map(m => m.first))} ${members.length > 1 ? 'move' : 'moves'} into the ${st.kind.replace(/_/g, ' ')}: a door of their own.`);
  return null;
}

/** Homes with beds left for a party of `n`, for the "give them a place" list. */
export function placeOptions(s: GameState, n: number, self: readonly string[] = []): Array<{ id: string; label: string; left: number }> {
  return s.structures.filter(st => isFinished(st) && HOME_BEDS[st.kind] > 0 && !st.unplaced).map(st => {
    const taken = s.people.filter((p, k) => p.home === st.id && present(s, k) && !self.includes(p.id)).length;
    return { id: st.id, label: st.kind.replace(/_/g, ' '), left: HOME_BEDS[st.kind] - taken };
  }).filter(o => o.left >= n);
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day
// ─────────────────────────────────────────────────────────────────────────

/** Loyalty change for a day, from how they are living (pure). */
export function loyaltyDelta(o: { hunger: number; over: boolean; spot: string | null; own: boolean; privacy: number; stormy: boolean; humanity: number; neighbor: boolean }): number {
  let d = 0.15 + (o.neighbor ? 0.1 : 0);
  d += o.hunger > 6000 ? -1.4 : o.hunger > 2500 ? -0.7 : 0.2;
  if (o.over) d -= 0.9;
  if (o.own) d += 0.8;
  else if (o.spot === 'bed') d += 0.3;
  else if (o.spot === 'bunk' || o.spot === 'couch' || o.spot === 'floor') d -= 0.05;
  else if (o.spot === 'tent' || o.spot === 'outbuilding') d -= o.stormy ? 0.8 : 0.3;
  else if (o.spot === 'nowhere') d -= 1;
  if (o.privacy < 0.3) d -= 0.2;
  d += o.humanity >= 60 ? 0.2 : o.humanity < 35 ? -0.4 : 0;
  return d;
}

export function loyaltyWord(l: number): string {
  return l >= 80 ? 'devoted' : l >= 62 ? 'loyal' : l >= 42 ? 'settling in' : l >= 24 ? 'uneasy' : 'ready to leave';
}
/** What the family knows about them, in a word. */
export function trustWord(b: Bond, day: number): string {
  if (b.revealed) return b.secret === 'solid' || b.secret === 'gem' ? 'you trust them' : b.secret === 'thief' ? 'a thief' : b.secret === 'scout' ? 'someone’s scout' : b.secret === 'lazy' ? 'carrying little' : 'sick';
  return day - b.since < 14 ? 'you do not know them yet' : 'still making up your mind';
}

const HINT: Record<Character, string[]> = {
  solid: ['Up before the others and gone to the woodpile without being asked.', 'Fixed the latch on the coop and said nothing about it.'],
  gem: ['Turns out to know a good deal more than they let on: you watched them splice a line like it was nothing.', 'Quietly taught the kids something nobody asked about.'],
  lazy: ['Always seems to be somewhere else when the wood needs splitting.', 'Takes the second helping and the first seat by the stove.'],
  thief: ['A box of shells is a few short. A can of fuel from the shed is gone. Nobody saw anything.', 'Things are in the wrong place in the shop. Somebody has been going through it.'],
  scout: ['Walks the fence line at dusk "for the air", counting posts.', 'Asked again who stands watch at night, and when the dog sleeps.'],
  sick: ['Coughing in the night, and a fever that comes and goes.', 'Not eating. Flushed. Keeping to the corner of the room.'],
};
const REVEAL_STEAL: Array<[keyof Stock, number]> = [['canned', 0.12], ['fuel', 0.15], ['meds', 0.25], ['staples', 0.05]];

/** Raiders told where to hit: a crew comes back for the place, knowing it (sim/encounters.ts `comeBack`, `guide`). */
function sendCrew(s: GameState, guide: string, r: () => number): void {
  scoutCrew(s, guide, r);
}

/** Once a day: loyalty, what the family notices, thieves and scouts, people who walk out, guests going home, neighbors asking for shelter. Returns lines for the log. */
export function newcomersDay(s: GameState): string[] {
  const N = newcomersOf(s);
  const day = dayIndex(s.clock.t);
  if (N.day === day) return [];
  N.day = day;
  const out: string[] = [];
  const g = s.gate;
  const r = mulberry32(s.seed * 8123 + day * 53 + 11);
  const c = carryOf(s);
  const over = !c.fromStores && c.days < 30;
  const strain = !c.fromStores && c.days < 45;
  N.strain = strain && Object.keys(N.bonds).length ? N.strain + 1 : Math.max(0, N.strain - 1);
  const plan = Object.keys(N.bonds).length ? cachedPlan(s) : null;
  const stormy = !!plan?.night.stormy;
  const living = (b: Bond) => { const i = idx(s, b.id); return i >= 0 && present(s, i) ? i : -1; };
  let said = 0;

  for (const b of Object.values(N.bonds)) {
    const i = living(b);
    if (i < 0) continue;
    const p = s.people[i], ps = s.personState[i];
    const sl = plan?.sleepers.find(x => x.id === p.id);
    b.loyalty = Math.max(0, Math.min(100, b.loyalty + loyaltyDelta({ hunger: ps.needs.hunger, over, spot: sl?.spot.kind ?? null, own: !!sl?.own, privacy: sl?.privacy ?? 1, stormy, humanity: g.humanity, neighbor: b.kind !== 'stranger' })));
    b.low = b.loyalty < 15 ? b.low + 1 : 0;

    // hints before the secret shows (a stranger taken in without a month's trial)
    if (!b.revealed) {
      const first = b.revealAt - Math.max(3, Math.floor((b.revealAt - b.since) * 0.6)), second = b.revealAt - 3;
      if ((b.hints === 0 && day >= first && day < b.revealAt) || (b.hints === 1 && day >= second && day < b.revealAt)) {
        if (b.secret !== 'solid' || r() < 0.5) {
          const t = pick(r, HINT[b.secret]);
          b.tells.push(t); b.hints++;
          out.push(`${p.first}: ${t}`);
        } else b.hints++;
      }
    }

    // the secret shows
    if (!b.revealed && day >= b.revealAt) {
      b.revealed = true;
      const name = p.first, lines: string[] = [];
      if (b.secret === 'thief') {
        if (b.loyalty >= 65 && r() < 0.6) {
          b.secret = 'solid'; b.loyalty = Math.min(100, b.loyalty + 5);
          lines.push(`${name} put the can of fuel back on the shelf and said it would not happen again. After the winter you have given them, you believe it.`);
        } else {
          const lost: string[] = [];
          for (const [k, sh] of REVEAL_STEAL) { const t = Math.floor((s.stock[k] ?? 0) * sh); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
          const gun = s.armory.guns.find(x => !x.carrier);
          if (gun && r() < 0.3) { s.armory.guns.splice(s.armory.guns.indexOf(gun), 1); lost.push(`a ${gun.model.replace(/_/g, ' ')}`); }
          moveOut(s, b.id, 'stole and left');
          leftNeighbor(s, b, 30);
          g.humanity = Math.max(0, g.humanity - 1);
          const text = `In the night ${name}’s bed was empty. ${lost.length ? `So were the shelves: ${lost.join(', ')}.` : 'Nothing was missing but them.'}`;
          lines.push(text);
          if (!g.pending && !g.card) g.card = { title: `${name} is gone`, text, tone: 'bad', lines: ['You took them in on a handshake. That was the price of finding out.'] };
        }
      } else if (b.secret === 'scout') {
        if (b.loyalty >= 75) {
          b.secret = 'solid'; g.forewarned = true; b.loyalty = Math.min(100, b.loyalty + 8);
          lines.push(`${name} came to you at dawn. They were sent ahead to look the place over for a crew, and they had meant to go back and tell them. They have changed their mind. They told you how the crew comes in.`);
        } else {
          moveOut(s, b.id, 'left in the night');
          leftNeighbor(s, b, 30);
          sendCrew(s, name, r);
          lines.push(`${name}’s bed was empty at dawn, and the pack gone. They had counted the posts and the guns and the hours of the watch. A crew will be coming.`);
        }
      } else if (b.secret === 'lazy') {
        const k = topSkill(p), was = p.skills[k];
        p.skills[k] = Math.max(1, was - 3 - Math.floor(r() * 2));
        b.loyalty = Math.max(0, b.loyalty - 5);
        lines.push(`${name} does as little as they can get away with, and the ${k} is not what they said: more like ${p.skills[k]} than ${was}.`);
      } else if (b.secret === 'gem') {
        const hidden = SKILL_IDS.filter(k => k !== topSkill(p)).sort((x, y) => p.skills[x] - p.skills[y])[0];
        p.skills[hidden] = Math.max(p.skills[hidden], 6 + Math.floor(r() * 3));
        b.loyalty = Math.min(100, b.loyalty + 10);
        lines.push(`${name} is a fair hand at ${hidden} (${p.skills[hidden]}) and never mentioned it. Up before anyone, every day.`);
      } else if (b.secret === 'sick') {
        lines.push(`${name} is over the fever. It could have gone round the house.`);
      } else {
        b.loyalty = Math.min(100, b.loyalty + 6);
        lines.push(`${name} pulls their weight. You stopped counting spoons the day they fixed the pump.`);
      }
      for (const l of lines) { out.push(l); b.tells.push(l); }
      continue;
    }

    // walking out: unhappy for a week, or hungry past reason
    if (b.kind !== 'guest' && (b.low >= 5 || (over && c.days < 8 && b.loyalty < 40 && r() < 0.08))) {
      const grievance = over ? 'There is not enough here to feed everyone.' : 'They do not feel welcome.';
      moveOut(s, b.id, over ? 'left, short of food' : 'left, unhappy');
      const back = leftNeighbor(s, b, 0);
      out.push(`${p.first} took their things and walked out the gate${back ? ', back to their own place' : ''}. ${grievance}`);
      g.humanity = Math.max(0, g.humanity - 1);
      continue;
    }
    // a hungry crowded table: say so now and then
    if (strain && said < 1 && day % 6 === 0) {
      said++;
      out.push(`${p.first} counted the cans again. ${Math.round(c.days)} days at this table${over ? ' and people are asking who gets cut first' : ''}.`);
    }
  }

  out.push(...guestsDay(s, N, day));
  out.push(...shelterDay(s, N, day, r));
  return out.filter(Boolean);
}

/** Guests: the storm passes, the day is up. They go home (a gift and a good name) or ask to stay. */
function guestsDay(s: GameState, N: NewcomerState, day: number): string[] {
  const out: string[] = [];
  const w = s.weather?.active;
  for (const party of Object.values(N.guests)) {
    const n = s.neighbors.find(x => x.id === party.nid);
    const here = party.ids.map(id => idx(s, id)).filter(i => i >= 0 && present(s, i));
    if (!n || !here.length) { delete N.guests[party.nid]; continue; }
    // a storm keeps them till it has passed
    let until = party.until;
    if (party.why === 'storm' && w && STORMS.has(w.kind) && w.until + 1 > until) until = w.until + 1;
    if (day < until) continue;
    if (s.gate.pending) continue;
    const l = lifeOf(s, n);
    const names = list(here.map(i => s.people[i].first));
    if (l.farm === 'burned' && party.why !== 'settle') {
      // nothing to go back to
      if (!requestSettle(s, n, party, here.map(i => s.people[i]))) party.until = day + 1;
      else party.until = day + 6;
      continue;
    }
    for (const i of here) moveOut(s, s.people[i].id, 'went home');
    delete N.guests[party.nid];
    n.disposition = Math.min(100, n.disposition + 8);
    s.stock.canned += 2;
    const lines = [`${names} went home. They left two jars of preserves on the table.`];
    // a good guest repays the roof: a day's work on whatever is going up
    const st = s.structures.find(x => !isFinished(x) && blockedReason(s, x) === null);
    if (st && here.length >= 2) { addWork(s, st, here.length * 6); lines.push(`They lent a day on the ${st.kind.replace(/_/g, ' ')} before they went.`); }
    l.history.push({ day, text: 'Went home after sheltering with the family.', known: true, how: 'seen' });
    out.push(...lines);
  }
  return out;
}

/** Neighbors asking to shelter: a storm coming, a fire, the warning signs; after the hit, sickness, raids, hunger. */
function shelterDay(s: GameState, N: NewcomerState, day: number, r: () => number): string[] {
  const g = s.gate;
  if (g.pending || g.card) return [];
  const d = s.disaster;
  const hit = !!d.kind && s.clock.t >= d.hitAt;
  const guestsNow = Object.keys(N.guests).length;
  if (guestsNow >= 2) return [];
  const homes = s.neighbors.filter(n => n.status === 'home' && n.members > 0 && !N.guests[n.id] && n.disposition > -25);
  if (!homes.length) return [];
  const w = s.weather?.active;
  const out: string[] = [];
  const key = (k: string) => N.asked.includes(k);
  const ask = (n: Neighbor, why: ShelterWhy, k: string) => { N.asked.push(k); if (N.asked.length > 80) N.asked.splice(0, 20); const e = requestShelter(s, n, why, r); if (e) out.push(`${e.title}.`); return !!e; };
  const wantsWalls = (n: Neighbor) => (n.kind === 'prepper' ? 0.15 : n.kind === 'loner' ? 0.5 : 1) * trustMult(n);
  // a storm on its way (the day before, or the day of)
  if (w && STORMS.has(w.kind) && day >= w.at - 1 && day <= w.at + 1) {
    for (const n of homes) {
      const k = `storm:${w.at}:${n.id}`;
      if (key(k) || n.km > 4.5) continue;
      if (r() < 0.15 * wantsWalls(n)) { if (ask(n, 'storm', k)) return out; } else N.asked.push(k);
    }
  }
  // the warning signs: a household that would sooner be behind walls
  if (d.kind && !hit && d.phase === 'warning') {
    const tension = Math.min(1, (s.clock.t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
    if (tension >= 0.5) for (const n of homes) {
      const k = `warning:${n.id}`;
      if (key(k) || n.kind === 'prepper') continue;
      if (r() < 0.05 * wantsWalls(n) * (n.kind === 'young_family' || n.kind === 'widow' ? 1.6 : 1)) { if (ask(n, 'warning', k)) return out; }
    }
  }
  if (!hit) return out;
  // after the hit
  const since = s.clock.t - d.hitAt;
  for (const n of homes) {
    const l = lifeOf(s, n);
    if (l.asked) continue;
    if (l.sick && l.sick.until - day > 4 && !key(`sick:${n.id}:${l.sick.until}`) && r() < 0.03 * wantsWalls(n)) { if (ask(n, 'sick', `sick:${n.id}:${l.sick.until}`)) return out; }
    if (l.raidedDay != null && day - l.raidedDay < 10 && l.farm === 'standing' && !key(`raided:${n.id}:${l.raidedDay}`) && r() < 0.06 * wantsWalls(n)) { if (ask(n, 'raided', `raided:${n.id}:${l.raidedDay}`)) return out; }
    if (since > 40 && d.tracks.stores < 0.3 && (n.kind === 'young_family' || n.kind === 'widow' || n.kind === 'old_farmer') && !key(`hungry:${n.id}:${Math.floor(since / 90)}`) && r() < 0.004 * wantsWalls(n)) { if (ask(n, 'hungry', `hungry:${n.id}:${Math.floor(since / 90)}`)) return out; }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// For the cards
// ─────────────────────────────────────────────────────────────────────────

/** "neighbor (the Hendersons)", "stranger you took in", "guest, storm". */
export function originLabel(s: GameState, p: Person): string {
  const o = p.origin;
  if (!o) return '';
  if (o.kind === 'guest') { const n = s.neighbors.find(x => x.id === o.from); return `guest${n ? ` of the ${surname(n)}s` : ''}`; }
  if (o.kind === 'neighbor') { const n = s.neighbors.find(x => x.id === o.from); return `neighbor${n ? `, the ${surname(n)}s` : ''}`; }
  return 'stranger you took in';
}

