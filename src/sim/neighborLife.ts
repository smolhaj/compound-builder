/**
 * Neighbors with lives (decided with the user: "all of these",
 * docs/DECISIONS.md). The households round the place (encounters.Neighbor)
 * age, fall sick and die; get raided, burn, leave, or ask to come and live
 * with the family; refugees settle on the empty ground. The family hears of
 * it the way people did: shooting in the night, smoke on the horizon, the
 * radio net, gossip, a visit, the market. Pure and seeded.
 *
 *  Aging and death   the head of each household has an age (old farmer
 *                    72–84, widow 68–80, young family 30–38…); each member
 *                    carries a Gompertz hazard (about 0.1 % a year at 30,
 *                    doubling every eight years: 7 % at 80), raised after the
 *                    collapse by no hospital (×1 … ×3) and hunger.
 *  Sickness          now and then (more in a plague): a week or three down,
 *                    with a chance of dying (the old and the unmedicated most).
 *  Raids             once the law is gone, about 0.15 % a day per household
 *                    (≈ 40 % a lawless year); less inside a pact or the militia.
 *                    They hold or they don't, by their guns and numbers; a
 *                    savage crew burns the place. Pact members call the family
 *                    (a callout to answer); it goes on alone otherwise.
 *  Fire              a chimney or a lamp (more in winter with the grid down),
 *                    a wildfire front.
 *  Leaving, joining  households leave for family elsewhere (or after a raid);
 *                    a widow or an old couple alone asks to come to the family
 *                    (an arrival at the gate: take in, trial, turn away).
 *  Refugees          from three weeks after the hit, families settle in empty
 *                    barns and the church camp, up to three of them.
 *  Groups            from six weeks, with three households or more, the
 *                    neighbors organize: a co-op (the market, a shared work
 *                    day) or, where it's lawless, a militia (men to a member's
 *                    shooting; a day's watch a week). The family can join, or
 *                    make its own mutual-defense pact with the households that
 *                    trust it (disposition 30+): pact members come when there's
 *                    shooting (pact.defenders), expect the family when they're
 *                    hit, and trade a work day every two weeks.
 */
import { mulberry32, pick } from './rng';
import { log } from './economy';
import { radioSet } from './radio';
import { addWork, blockedReason, isFinished } from './construction';
import { canGo, fightAtCamp } from './rescue';
import { applyCasualties, type RaiderTemper } from './battle';
import { raiderTemper, type Encounter, type Neighbor, type NeighborKind } from './encounters';
import { dayJob, SKILL_IDS, type Person, type SkillId } from './family';
import { calendarOf, dayIndex, type GameState } from './state';
import { inPact } from './pact';
import type { Caliber } from './armory';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type NewsHow = 'shots' | 'smoke' | 'radio' | 'gossip' | 'visit' | 'market' | 'seen';
export interface LifeEvent { day: number; text: string; known: boolean; how?: NewsHow }
export interface NeighborLife {
  /** Age of the head of the household. */
  head: number;
  history: LifeEvent[];
  sick?: { what: string; until: number };
  farm: 'standing' | 'burned';
  burnedDay?: number;
  raidedDay?: number;
  origin: 'native' | 'refugees';
  /** For refugees: who they are. */
  blurb?: string;
  /** A join request at the gate (the encounter id), until it's answered. */
  asked?: string;
}
export type GroupKind = 'coop' | 'militia';
export interface Group { kind: GroupKind; name: string; founded: number; leader: string; members: string[] }
export interface Callout { neighbor: string; day: number; raiders: number; temper: RaiderTemper }
export interface LocalsState {
  lives: Record<string, NeighborLife>;
  group: Group | null;
  /** The family belongs to the group; the group has asked them in (the market's good name). */
  member: boolean;
  invited: boolean;
  /** Mutual-defense pact: neighbor ids. */
  pact: string[];
  /** A pact member under attack, calling for help (answer today or tomorrow). */
  callout: Callout | null;
  /** The next shared work day, and who hosts it. */
  workDay: number;
  workHost: 'family' | 'them';
  /** Someone of the family away for the day: the militia watch, a work day at a pact member's. */
  duty: { day: number; pid: string; why: string } | null;
  /** News on its way (delivered on its day). */
  news: Array<{ day: number; nid: string; text: string; how: NewsHow; ev: number }>;
  lastYear: number;
  refugees: number;
}

export const newLocals = (): LocalsState => ({ lives: {}, group: null, member: false, invited: false, pact: [], callout: null, workDay: -1, workHost: 'family', duty: null, news: [], lastYear: -1, refugees: 0 });
export const localsOf = (s: GameState): LocalsState => (s.locals ??= newLocals());

const HEAD_AGE: Record<NeighborKind, [number, number]> = { old_farmer: [72, 84], widow: [68, 80], young_family: [30, 38], prepper: [45, 60], ranch: [50, 65], loner: [40, 60] };
const hashId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
/** "the Hendersons" → "Henderson". */
export const surname = (n: Neighbor) => n.name.replace(/^the /, '').replace(/s$/, '');
/** "Ortiz" → "the Ortizes", "Bauer" → "the Bauers". */
export const plural = (last: string) => /(s|x|z|ch|sh)$/.test(last) ? `${last}es` : `${last}s`;

export function lifeOf(s: GameState, n: Neighbor): NeighborLife {
  const L = localsOf(s);
  let l = L.lives[n.id];
  if (!l) {
    const [a, b] = HEAD_AGE[n.kind];
    const r = mulberry32(s.seed * 1013 + hashId(n.id));
    l = { head: a + Math.floor(r() * (b - a + 1)), history: [], farm: 'standing', origin: 'native' };
    L.lives[n.id] = l;
  }
  return l;
}

// ─────────────────────────────────────────────────────────────────────────
// Odds (pure, tested)
// ─────────────────────────────────────────────────────────────────────────

/** Yearly chance of dying at an age (Gompertz: 0.1 % at 30, doubling every ~8 years), times how bad things are. */
export function deathYear(age: number, mult = 1): number {
  return Math.min(0.9, 0.001 * Math.exp(0.085 * (age - 30)) * mult);
}
export const perDay = (yearly: number) => 1 - Math.pow(1 - yearly, 1 / 365);
/** How much worse dying gets after the collapse: no hospital, short of food. */
export function hardship(s: GameState): number {
  if (!s.disaster.kind || s.clock.t < s.disaster.hitAt) return 1;
  const t = s.disaster.tracks;
  return 1 + 2 * (1 - t.medical) + (1 - t.stores);
}
/** A household's daily chance of being raided. */
export function raidChance(s: GameState, n: Neighbor): number {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt + 14) return 0;
  const L = s.locals;
  const militia = L?.group?.kind === 'militia' && L.group.members.includes(n.id) ? 0.5 : 1;
  return 0.0015 * (1 - d.tracks.law) * (inPact(s, n.id) ? 0.6 : 1) * militia * (n.kind === 'prepper' ? 0.7 : 1);
}
/** Their chance of holding a raid of `raiders`: guns and numbers (preppers and ranchers shoot better), help from the family. */
export function holdChance(n: Neighbor, raiders: number, help = 0): number {
  const def = n.members * (n.kind === 'prepper' ? 1.6 : n.kind === 'ranch' ? 1.3 : 1) + 0.5 + help;
  return def / (def + raiders * 0.6);
}

// ─────────────────────────────────────────────────────────────────────────
// News
// ─────────────────────────────────────────────────────────────────────────

/**
 * Something happened to a household: write it in their history (unknown to
 * the family) and send the news on its way by the fastest way it can come:
 * shooting heard at night (3 km), smoke seen (8 km), the radio net, a visit
 * from a pact member, gossip from another household, the market.
 */
export function happen(s: GameState, n: Neighbor, text: string, kind: 'raid' | 'fire' | 'quiet', r: () => number): void {
  const L = localsOf(s), l = lifeOf(s, n);
  const day = dayIndex(s.clock.t);
  l.history.push({ day, text, known: false });
  if (l.history.length > 20) l.history.splice(0, l.history.length - 20);
  const ev = l.history.length - 1;
  const ways: Array<[number, NewsHow, string]> = [];
  const dir = n.dir === 'north' || n.dir === 'south' ? n.dir : `the ${n.dir}`;
  if (kind === 'raid' && n.km <= 3) ways.push([0, 'shots', `Shooting in the night, off to ${dir}, toward the ${surname(n)} place. Ten minutes of it, then nothing.`]);
  if ((kind === 'fire' || /burn/.test(text)) && n.km <= 8) ways.push([1, 'smoke', `A column of smoke in the morning, off to ${dir}. It's the ${surname(n)} place.`]);
  const others = s.neighbors.filter(x => x.id !== n.id && x.status === 'home' && x.disposition > -20);
  if (n.radio && radioSet(s) !== 'none') ways.push([1 + Math.floor(r() * 2), 'radio', '']);
  if (inPact(s, n.id) || L.pact.length) ways.push([2 + Math.floor(r() * 4), 'visit', '']);
  if (others.length) ways.push([3 + Math.floor(r() * 8), 'gossip', '']);
  if (s.market?.opened != null && s.market.opened >= 0) ways.push([((5 - day % 7) + 7) % 7 || 7, 'market', '']);
  if (!ways.length) return;
  ways.sort((a, b) => a[0] - b[0]);
  const [delay, how, sense] = ways[0];
  if (sense) L.news.push({ day: day + delay, nid: n.id, text: sense, how, ev: -1 });
  // what happened, when they hear the rest of it (the senses only say something's wrong)
  const later = sense ? ways.find(w => !w[2]) : ways[0];
  const say = later ?? ways[0];
  const from = say[1] === 'radio' ? 'On the net' : say[1] === 'gossip' ? `${cap(pick(r, others)?.name ?? 'a neighbor')} say` : say[1] === 'visit' ? 'Word from the pact' : say[1] === 'market' ? 'At the market' : 'Word is';
  L.news.push({ day: day + Math.max(sense ? delay + 1 : 0, say[0]), nid: n.id, text: `${from}: ${text}`, how: say[1], ev });
}

function deliver(s: GameState, day: number, out: string[]): void {
  const L = localsOf(s);
  for (const x of L.news.filter(m => m.day <= day)) {
    out.push(x.text);
    s.disaster.news.push({ t: s.clock.t, text: x.text, tone: 2 });
    if (s.disaster.news.length > 40) s.disaster.news.splice(0, s.disaster.news.length - 40);
    const n = s.neighbors.find(q => q.id === x.nid);
    if (n && x.ev >= 0) { const e = lifeOf(s, n).history[x.ev]; if (e) { e.known = true; e.how = x.how; } }
  }
  L.news = L.news.filter(m => m.day > day);
}

// ─────────────────────────────────────────────────────────────────────────
// What happens to them
// ─────────────────────────────────────────────────────────────────────────

const SICK = ['pneumonia', 'a fever that won\'t break', 'the flu', 'an abscessed tooth gone bad', 'dysentery from the stock tank', 'a cut gone septic'];
const DEATH_OLD = ['died in the night. They found him in his chair by the stove.', 'died in her sleep.', 'had a stroke in the yard and was gone by evening.', 'just stopped eating, and then stopped.'];
const FIRE = ['A chimney fire took the house in the night.', 'A kerosene lamp went over. The house burned to the foundation.', 'The barn went up, hay and all.'];
const REFUGEE: Array<[string, string]> = [
  ['Okafor', 'Came out of Salt Lake in a minivan with nothing in it. Camped in the Pruitt barn.'],
  ['Larkin', 'Three families from a subdivision by the interstate, living in the church camp.'],
  ['Szabo', 'A couple and their teenagers, walking from Billings. They fixed up a line shack.'],
  ['Vance', 'A man, his sister and her kids in a camper on the county road. They don\'t say where from.'],
  ['Moreau', 'Two nurses and an old man in a horse trailer by the reservoir.'],
];

function dies(n: Neighbor, l: NeighborLife, r: () => number, why: string): string {
  const old = l.head >= 65;
  const who = n.members <= 1 ? (n.kind === 'widow' ? `Old Mrs. ${surname(n)}` : `${cap(n.kind === 'old_farmer' ? 'old ' : '')}${surname(n)}`) : old && r() < 0.5 ? `Old ${surname(n)}` : `One of the ${plural(surname(n))}`;
  n.members = Math.max(0, n.members - 1);
  if (who.startsWith('Old')) l.head = Math.max(25, l.head - 4 - Math.floor(r() * 30));
  return `${who.replace(/^Old Old/, 'Old')} ${why}`;
}

/** The household is finished (all dead or all gone). */
function emptied(s: GameState, n: Neighbor, how: 'left' | 'gone'): void {
  n.status = how;
  const L = localsOf(s);
  L.pact = L.pact.filter(id => id !== n.id);
  if (L.group) L.group.members = L.group.members.filter(id => id !== n.id);
}

/** Resolve a raid on a household (alone, or with the family's help: `help` fighters). Returns what happened. */
export function raidHousehold(s: GameState, n: Neighbor, raiders: number, temper: RaiderTemper, r: () => number, help = 0): { held: boolean; text: string } {
  const l = lifeOf(s, n);
  const day = dayIndex(s.clock.t);
  l.raidedDay = day;
  if (r() < holdChance(n, raiders, help)) {
    if (r() < 0.3 && n.members > 1) { n.members--; return { held: true, text: `The ${plural(surname(n))} fought off ${raiders} raiders. One of theirs was killed.` }; }
    return { held: true, text: `The ${plural(surname(n))} fought off ${raiders} raiders from the barn and the house.` };
  }
  const killed = temper === 'savage' ? n.members : Math.min(n.members, Math.floor(r() * (n.members + 1)));
  n.members -= killed;
  const burn = temper === 'savage' ? r() < 0.8 : r() < 0.3;
  if (burn) { l.farm = 'burned'; l.burnedDay = day; }
  if (n.members <= 0) { emptied(s, n, 'gone'); return { held: false, text: `Raiders hit the ${surname(n)} place${burn ? ' and burned it' : ''}. Nobody made it out.` }; }
  const left = r() < 0.6;
  if (left) emptied(s, n, 'left');
  return { held: false, text: `Raiders hit the ${surname(n)} place${burn ? ' and burned it' : ''}. ${killed ? `${killed} dead. ` : ''}${left ? 'The rest are gone, nobody knows where.' : 'The rest are hanging on in what\'s left.'}` };
}

/** A household alone asks to come and live with the family: an arrival at the gate. */
function askToJoin(s: GameState, n: Neighbor, why: string, r: () => number): boolean {
  if (s.gate.pending || n.members <= 0) return false;
  const l = lifeOf(s, n), day = dayIndex(s.clock.t);
  const people: Person[] = Array.from({ length: Math.min(3, n.members) }, (_, i) => {
    const kid = n.kind === 'young_family' && i >= 2;
    const skills = Object.fromEntries(SKILL_IDS.map(k => [k, Math.floor(r() * (kid ? 2 : 3))])) as Record<SkillId, number>;
    if (!kid) skills[n.skill] = 5 + Math.floor(r() * 3);
    const body: 'f' | 'm' = n.kind === 'widow' ? 'f' : i === 0 ? 'm' : 'f';
    const p: Person = { id: `pn_${n.id}_${i}`, first: pick(r, body === 'f' ? ['Ruth', 'Marlene', 'Jo', 'Kate', 'Ada', 'Lorna', 'Bea'] : ['Walt', 'Gene', 'Earl', 'Dale', 'Luis', 'Tom', 'Marty']), last: surname(n), age: i === 0 ? l.head : kid ? 6 + Math.floor(r() * 9) : Math.max(18, l.head - Math.floor(r() * 6)), kid, body, skills, shirt: Math.floor(r() * 0xffffff) & 0x7f7f7f };
    if (!kid && p.age < 66) p.job = dayJob(p, s.seed);
    if (p.age >= 66) p.elder = true;
    return p;
  });
  const e: Encounter = {
    id: `e${s.nextId++}`, kind: 'arrival', day, title: `The ${plural(surname(n))} at the gate`,
    dossier: [why, `${people.length} of them: ${people.map(p => `${p.first}, ${p.age}`).join('; ')}.`, `Good at: ${n.skill}.`, `${people.length} more to feed: about ${people.length * 2200} kcal a day.`],
    size: people.length, armed: false, strength: 0, people, brings: { canned: 2 + Math.floor(r() * 4), staples: 1 }, neighbor: n.id,
    stances: ['take_in', 'trial', 'turn_away'],
  };
  s.gate.pending = e;
  l.asked = e.id;
  log(s, `${e.title}.`);
  return true;
}

function settleRefugees(s: GameState, r: () => number): string | null {
  const L = localsOf(s);
  const used = new Set(s.neighbors.map(n => surname(n)));
  const opts = REFUGEE.filter(([last]) => !used.has(last));
  if (!opts.length) return null;
  const [last, blurb] = pick(r, opts);
  const id = `n${s.neighbors.length + 1}_r`;
  const skill = pick(r, ['medic', 'mechanic', 'carpenter', 'teacher', 'gardener'] as SkillId[]);
  const n: Neighbor = { id, name: `the ${plural(last)}`, kind: 'young_family', disposition: Math.round((r() - 0.5) * 30), members: 3 + Math.floor(r() * 5), dir: pick(r, ['north', 'south', 'east', 'west'] as const), km: Math.round((1 + r() * 4) * 10) / 10, radio: false, skill, status: 'home' };
  s.neighbors.push(n);
  const l = lifeOf(s, n);
  l.origin = 'refugees'; l.blurb = blurb; l.head = 28 + Math.floor(r() * 18);
  L.refugees++;
  const text = `Refugees have settled ${n.km} km ${n.dir}: the ${last}s. ${blurb}`;
  l.history.push({ day: dayIndex(s.clock.t), text: 'Settled here after the collapse.', known: true, how: 'seen' });
  return text;
}

function formGroup(s: GameState, r: () => number): string | null {
  const L = localsOf(s);
  const home = s.neighbors.filter(n => n.status === 'home' && n.members > 0);
  const lawless = s.disaster.tracks.law < 0.25;
  const fighters = home.filter(n => n.kind === 'ranch' || n.kind === 'prepper');
  const kind: GroupKind = lawless && fighters.length ? 'militia' : 'coop';
  const leader = kind === 'militia' ? fighters.sort((a, b) => b.members - a.members)[0] : home.find(n => n.kind === 'old_farmer' || n.kind === 'widow') ?? home[0];
  const valley = pick(r, ['Bench', 'Valley', 'Creek', 'Ridge Road', 'Grange']);
  L.group = { kind, name: kind === 'militia' ? `the ${valley} Militia` : `the ${valley} Co-op`, founded: dayIndex(s.clock.t), leader: leader.id, members: home.filter(n => n.kind !== 'loner' || r() < 0.4).map(n => n.id) };
  return kind === 'militia'
    ? `${cap(leader.name)} have the neighbors organized: ${L.group.name}. Armed men on the roads at night, a list of who stands watch. They asked if the family is in.`
    : `The neighbors met at the Grange hall: ${L.group.name}. A seed library, a work rotation, the Saturday market. They asked if the family is in.`;
}

// ─────────────────────────────────────────────────────────────────────────
// The family's choices
// ─────────────────────────────────────────────────────────────────────────

export function joinGroupProblem(s: GameState): string | null {
  const L = localsOf(s);
  if (!L.group) return 'nobody has organized yet';
  if (L.member) return 'already in';
  const leader = s.neighbors.find(n => n.id === L.group!.leader);
  if (!L.invited && leader && leader.disposition < 0) return `${leader.name} don't trust you`;
  return null;
}
export function joinGroup(s: GameState): string | null {
  const why = joinGroupProblem(s);
  if (why) return why;
  const L = localsOf(s);
  L.member = true;
  log(s, L.group!.kind === 'militia' ? `The family joined ${L.group!.name}. Somebody stands a watch one day a week; three men come when there's shooting.` : `The family joined ${L.group!.name}: a case of food a week to the common store, a seat at the Grange hall.`);
  return null;
}
export function leaveGroup(s: GameState): void {
  const L = localsOf(s);
  if (!L.member || !L.group) return;
  L.member = false;
  const leader = s.neighbors.find(n => n.id === L.group!.leader);
  if (leader) leader.disposition = Math.max(-100, leader.disposition - 10);
  log(s, `The family left ${L.group.name}.`);
}

/** Who would take a pact (disposition 30+; a loner wants 50, a prepper 40). */
export const PACT_MIN: Record<NeighborKind, number> = { old_farmer: 30, widow: 30, young_family: 30, ranch: 30, prepper: 40, loner: 50 };
export function pactWilling(s: GameState, n: Neighbor): boolean {
  return n.status === 'home' && n.members > 0 && n.disposition >= PACT_MIN[n.kind] && !inPact(s, n.id);
}
/** Ask a household into the mutual-defense pact. Returns why not, or null. */
export function askPact(s: GameState, id: string): string | null {
  const n = s.neighbors.find(x => x.id === id);
  if (!n || n.status !== 'home') return 'nobody there';
  if (inPact(s, id)) return 'already in the pact';
  if (n.disposition < PACT_MIN[n.kind]) return `${n.name} don't trust you enough (${Math.round(n.disposition)} / ${PACT_MIN[n.kind]})`;
  const L = localsOf(s);
  L.pact.push(id);
  if (L.workDay < 0) { L.workDay = dayIndex(s.clock.t) + 7; L.workHost = 'family'; }
  n.disposition = Math.min(100, n.disposition + 5);
  log(s, `${cap(n.name)} shook on it: if there's shooting at either place, the other comes. Three shots is the signal.`);
  lifeOf(s, n).history.push({ day: dayIndex(s.clock.t), text: 'Made a mutual-defense pact with the family.', known: true, how: 'seen' });
  return null;
}
export function leavePact(s: GameState, id: string): void {
  const L = localsOf(s);
  if (!L.pact.includes(id)) return;
  L.pact = L.pact.filter(x => x !== id);
  const n = s.neighbors.find(x => x.id === id);
  if (n) n.disposition = Math.max(-100, n.disposition - 15);
}

export function calloutProblem(s: GameState, team: string[]): string | null {
  const c = localsOf(s).callout;
  if (!c) return 'nobody is calling';
  if (!team.length) return 'pick who goes';
  if (team.some(id => { const p = s.people.find(x => x.id === id); return !p || !canGo(s, p) || p.age < 16; })) return 'someone picked can\'t go';
  return null;
}

/**
 * Answer a pact member's callout: go (the team rides over: rescue.fightAtCamp
 * against the raiders, the household's own people fighting alongside), or
 * stay home (they fight alone, and remember it).
 */
export function answerCallout(s: GameState, team: string[] | null): string | null {
  const L = localsOf(s);
  const c = L.callout;
  if (!c) return 'nobody is calling';
  const n = s.neighbors.find(x => x.id === c.neighbor);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 4793 + day * 19 + hashId(c.neighbor));
  if (team) { const why = calloutProblem(s, team); if (why) return why; }
  L.callout = null;
  if (!n || n.status !== 'home') return null;
  const l = lifeOf(s, n);
  if (!team) {
    const res = raidHousehold(s, n, c.raiders, c.temper, r);
    n.disposition = Math.max(-100, n.disposition - 25);
    l.history.push({ day, text: `${res.text} They called the family for help. Nobody came.`, known: true, how: 'radio' });
    log(s, `Nobody went. ${res.text}`);
    if (n.status === 'home' && n.disposition < PACT_MIN[n.kind]) { L.pact = L.pact.filter(x => x !== n.id); log(s, `${cap(n.name)} are out of the pact. "We called. You heard us."`); }
    return null;
  }
  const f = fightAtCamp(s, team, { camp: c.raiders, temper: c.temper, status: 'traded' }, s.seed * 977 + day, Math.min(4, n.members));
  const lines = applyCasualties(s, f.battle);
  for (const [cal, k] of Object.entries(f.spent) as Array<[Caliber, number]>) s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - k);
  const names = team.map(id => s.people.find(x => x.id === id)?.first).filter(Boolean).join(', ');
  const won = f.result === 'wiped' || f.result === 'routed';
  let text: string;
  if (won) {
    n.members = Math.max(1, n.members - (f.allies.dead > 0 ? 1 : 0));
    n.disposition = Math.min(100, n.disposition + 20);
    s.gate.respect = Math.min(1, (s.gate.respect ?? 0) + 0.15);
    text = `${names} rode to the ${surname(n)} place and hit the raiders from behind. They broke and ran.`;
  } else {
    const res = raidHousehold(s, n, Math.max(1, c.raiders - f.campDown), c.temper, r, 2);
    n.disposition = Math.min(100, n.disposition + 8);
    text = `${names} rode to the ${surname(n)} place and couldn't break them. ${res.text}`;
  }
  l.history.push({ day, text, known: true, how: 'seen' });
  log(s, text);
  for (const x of lines) log(s, x);
  s.gate.card ??= { title: won ? `The ${surname(n)} place held` : `Too many of them`, text, tone: won ? 'good' : 'bad', lines };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day
// ─────────────────────────────────────────────────────────────────────────

/** On the duty roster today (the militia watch, a work day away). */
export const onDuty = (s: GameState, pid: string) => s.locals?.duty?.pid === pid && s.locals.duty.day === dayIndex(s.clock.t);

function freeAdult(s: GameState, r: () => number): Person | null {
  const ok = s.people.filter(p => !p.kid && canGo(s, p));
  return ok.length ? pick(r, ok) : null;
}

/** Once a day: the neighbors' lives go on. Returns lines for the log. */
export function neighborLifeDay(s: GameState): string[] {
  const out: string[] = [];
  if (s.ending && !s.ending.continued) return out;
  const L = localsOf(s);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 2203 + day * 29);
  const { year, doy } = calendarOf(s.clock);
  const hit = !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
  const since = hit ? s.clock.t - s.disaster.hitAt : 0;
  if (L.lastYear < 0) L.lastYear = year;
  const aged = year > L.lastYear;
  L.lastYear = year;
  const hard = hardship(s);
  const plague = hit && (s.disaster.kind === 'pandemic' || s.disaster.kind === 'bioweapon') ? 4 : 1;
  // an answer to a join request
  for (const n of s.neighbors) {
    const l = L.lives[n.id];
    if (!l?.asked || s.gate.pending?.id === l.asked) continue;
    l.asked = undefined;
    if (s.people.some(p => p.id.startsWith(`pn_${n.id}_`))) { n.status = 'joined'; n.members = 0; l.history.push({ day, text: 'Came to live with the family.', known: true, how: 'seen' }); L.pact = L.pact.filter(x => x !== n.id); }
    else { emptied(s, n, 'left'); n.disposition = Math.max(-100, n.disposition - 40); l.history.push({ day, text: 'Turned away at the family\'s gate. They went on down the road.', known: true, how: 'seen' }); }
  }
  // a callout nobody answered by the next day
  if (L.callout && day > L.callout.day) answerCallout(s, null);
  for (const n of [...s.neighbors]) {
    if (n.status !== 'home' || n.members <= 0) continue;
    const l = lifeOf(s, n);
    if (aged) l.head++;
    const nr = mulberry32(s.seed * 7477 + day * 37 + hashId(n.id));
    // dying of age, of what's going round, of no hospital
    const sickMult = l.sick ? 4 : 1;
    if (nr() < perDay(deathYear(l.head, hard * sickMult)) * Math.min(2, 0.6 + 0.4 * n.members)) {
      const text = dies(n, l, nr, l.sick ? `died of ${l.sick.what}.` : pick(nr, DEATH_OLD));
      happen(s, n, text, 'quiet', nr);
      if (n.members <= 0) { emptied(s, n, 'gone'); continue; }
      // the one left alone: may ask to come to the family
      if (n.members === 1 && hit && n.disposition > 20 && nr() < 0.5) askToJoin(s, n, `${text} The one left can't work the place alone.`, nr);
      continue;
    }
    // sickness
    if (l.sick && day >= l.sick.until) l.sick = undefined;
    else if (!l.sick && nr() < 0.0003 * n.members * (hit ? 2 : 1) * plague) {
      l.sick = { what: pick(nr, SICK), until: day + 7 + Math.floor(nr() * 18) };
      happen(s, n, `The ${plural(surname(n))} are down with ${l.sick.what}.`, 'quiet', nr);
    }
    // raided
    if (nr() < raidChance(s, n)) {
      const temper = raiderTemper(s, 'gang', nr);
      const raiders = 3 + Math.floor(nr() * 8);
      if (inPact(s, n.id) && !L.callout) {
        L.callout = { neighbor: n.id, day, raiders, temper };
        out.push(`Three shots from the ${surname(n)} place, then three more: the signal. ${n.radio ? `On the net: "${raiders} of them, maybe more. We need you."` : 'They need help.'}`);
        s.gate.card ??= { title: `The ${plural(surname(n))} are calling`, text: `Raiders at the ${surname(n)} place, ${n.km} km ${n.dir}. Answer on the Neighbors panel: send people, or stay home.`, tone: 'bad', lines: [] };
        continue;
      }
      const res = raidHousehold(s, n, raiders, temper, nr);
      happen(s, n, res.text, 'raid', nr);
      if (n.status === 'home' && !res.held && n.disposition > 20 && nr() < 0.4) askToJoin(s, n, `${res.text} They have nowhere else to go.`, nr);
      continue;
    }
    // fire
    const winter = doy < 80 || doy > 300;
    const fireP = 0.00025 + (hit && s.disaster.tracks.grid < 0.5 && winter ? 0.0006 : 0) + (s.disaster.kind === 'wildfire' && s.disaster.phase === 'impact' && n.km < 5 ? 0.01 : 0);
    if (l.farm === 'standing' && nr() < fireP) {
      l.farm = 'burned'; l.burnedDay = day;
      const text = `${pick(nr, FIRE)} The ${plural(surname(n))} got out${nr() < 0.15 && n.members > 1 ? ', all but one' : ''}.`;
      if (/all but one/.test(text)) n.members--;
      happen(s, n, text, 'fire', nr);
      const u = nr();
      if (hit && u < 0.4) { emptied(s, n, 'left'); happen(s, n, `The ${plural(surname(n))} packed what was left and went to family out of state.`, 'quiet', nr); }
      else if (hit && u < 0.7 && n.disposition > 20) askToJoin(s, n, `${text} They're living in the truck.`, nr);
      continue;
    }
    // leaving
    const leaveP = hit ? 0.0006 + (s.disaster.tracks.stores < 0.3 && (n.kind === 'young_family' || n.kind === 'loner') ? 0.0012 : 0) + (l.raidedDay != null && day - l.raidedDay < 30 ? 0.01 : 0) : 0.00005;
    if (nr() < leaveP) { emptied(s, n, 'left'); happen(s, n, `The ${plural(surname(n))} loaded the truck and left. ${pick(nr, ['Going to her sister in Idaho.', 'Heading for the FEMA camp, they said.', 'Nobody knows where.', 'Back to the city, if there is one.'])}`, 'quiet', nr); continue; }
    // the old and alone ask to come in
    if (hit && since > 30 && n.members <= 2 && (n.kind === 'widow' || n.kind === 'old_farmer') && n.disposition > 30 && nr() < 0.004) askToJoin(s, n, `${n.kind === 'widow' ? 'She' : 'They'} can't keep the place going: no wood split, the well pump dead.`, nr);
  }
  // refugees settle on the empty ground
  if (hit && since > 20 && since < 400 && L.refugees < 3 && s.neighbors.filter(n => n.status === 'home').length < 8) {
    const flow = ['pandemic', 'nuclear', 'drought', 'bioweapon', 'ash_winter'].includes(s.disaster.kind ?? '') ? 2 : 1;
    if (r() < 0.004 * flow) { const t = settleRefugees(s, r); if (t) out.push(t); }
  }
  // the neighbors organize
  if (hit && since > 45 && !L.group && s.disaster.tracks.law < 0.5 && s.neighbors.filter(n => n.status === 'home' && n.members > 0).length >= 3 && r() < 0.01) { const t = formGroup(s, r); if (t) out.push(t); }
  if (L.group) {
    L.group.members = L.group.members.filter(id => s.neighbors.find(n => n.id === id)?.status === 'home');
    if (L.group.members.length && !L.group.members.includes(L.group.leader)) L.group.leader = L.group.members[0];
    if (!L.group.members.length) { out.push(`${cap(L.group.name)} is finished: nobody left to stand watch.`); L.group = null; L.member = false; }
  }
  // dues: a case of food a week to the co-op, a day's watch for the militia
  if (L.group && L.member && day % 7 === 1) {
    if (L.group.kind === 'coop') {
      if (s.stock.canned >= 1) s.stock.canned -= 1;
      else { const ld = s.neighbors.find(n => n.id === L.group!.leader); if (ld) ld.disposition = Math.max(-100, ld.disposition - 3); }
    } else {
      const p = freeAdult(s, r);
      if (p) { L.duty = { day, pid: p.id, why: 'on the militia watch' }; const ps = s.personState.find(x => x.id === p.id); if (ps) { ps.task = 'away'; ps.target = null; } }
    }
  }
  // the shared work day (pact): every two weeks, at one place or the other
  if (L.pact.length && L.workDay >= 0 && day >= L.workDay) {
    const pact = s.neighbors.filter(n => inPact(s, n.id) && n.status === 'home');
    if (L.workHost === 'family') {
      const st = s.structures.find(x => !isFinished(x) && blockedReason(s, x) === null);
      const hands = pact.reduce((a, n) => a + Math.min(3, n.members), 0);
      if (st && hands) { addWork(s, st, hands * 6); out.push(`Work day: ${pact.map(n => n.name).join(' and ')} came over, ${hands} pairs of hands on the ${st.kind.replace(/_/g, ' ')}.`); }
    } else {
      const p = freeAdult(s, r);
      if (p && pact.length) {
        L.duty = { day, pid: p.id, why: 'at the pact work day' };
        const ps = s.personState.find(x => x.id === p.id); if (ps) { ps.task = 'away'; ps.target = null; }
        for (const n of pact) n.disposition = Math.min(100, n.disposition + 2);
        out.push(`${p.first} went to the work day at the ${surname(pact[0])} place: fencing, and a beef to cut up.`);
      } else for (const n of pact) n.disposition = Math.max(-100, n.disposition - 2);
    }
    L.workHost = L.workHost === 'family' ? 'them' : 'family';
    L.workDay = day + 14;
  }
  if (L.duty && L.duty.day < day) { const ps = s.personState.find(x => x.id === L.duty!.pid); if (ps && ps.task === 'away') ps.task = 'idle'; L.duty = null; }
  deliver(s, day, out);
  return out;
}

/** How each household is doing, for the panel. */
export function stateWord(s: GameState, n: Neighbor): string {
  const l = s.locals?.lives[n.id];
  if (n.status === 'joined') return 'living with you';
  if (n.status === 'left') return l?.farm === 'burned' ? 'burned out, gone' : 'gone away';
  if (n.status === 'gone') return 'all dead';
  const bits: string[] = [];
  if (l?.farm === 'burned' && l.history.some(h => h.known && /burn|fire|went up/i.test(h.text))) bits.push('burned out');
  if (l?.sick && l.history.some(h => h.known && h.text.includes(l.sick!.what))) bits.push('sick');
  bits.push(n.disposition > 50 ? 'allies' : n.disposition > 15 ? 'friendly' : n.disposition < -20 ? 'hostile' : 'wary');
  return bits.join(' · ');
}

/** Which neighbor farmsteads the world draws burned (index i: the i-th household that isn't refugees). Optional render hook. */
export function burnedFarms(s: GameState): boolean[] {
  return s.neighbors.filter(n => (s.locals?.lives[n.id]?.origin ?? 'native') === 'native').map(n => s.locals?.lives[n.id]?.farm === 'burned' && !!s.locals.lives[n.id].history.some(h => h.known));
}
