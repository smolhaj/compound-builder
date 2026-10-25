/**
 * Getting the taken back (decided with the user: radio rumors, a rescue
 * raid, a ransom trade). A savage crew that breaks in carries the children
 * off (battle.ts `taken`). Each one taken gets a record here: who took them,
 * when, and what has really become of them since, which the family doesn't
 * see. They learn it only from what they hear.
 *
 *  Fate      a seeded daily hazard that grows with time: about 9 in 10 are
 *            still held after a week, half after a month, 1 in 5 after two
 *            months, almost none after three. A child who isn't held any more
 *            is traded on (sold to another crew, down the road: out of reach)
 *            or dead.
 *  Leads     over the following weeks someone may know something: a voice on
 *            the radio (a ham rig hears the most and the truest), a neighbor
 *            riding over or a trader at the gate, a prisoner who talks. A lead
 *            says where the crew camps, how many they are and whether the child
 *            was seen alive. Leads can be wrong, and they go cold: the crew
 *            moves camp every few weeks, and the trail fades.
 *  Ransom    some crews will trade a child back for fuel, ammunition, medicine
 *            and food. They send word to the gate, or answer word the family
 *            sends through whoever gave the lead. Paying can be a double-cross
 *            (they keep the goods, or come to the gate shooting), likelier
 *            with a savage crew.
 *  Rescue    armed adults go to the camp by night and hit it before dawn: the
 *            fight at the compound turned round (the same hit, armor, skill and
 *            wound rules as battle.ts). Numbers, guns, armor, skill, those who
 *            served, night vision, surprise (dogs at the camp spoil it) and the
 *            crew's size and temper decide it. While they're gone the place is
 *            lightly held: they're off the line (task 'away').
 *
 * A child who comes home rejoins the family's day (eats, ages, works, shows
 * on the Family tab), shaken. Pure and seeded.
 */
import { ARMS, FISTS, hitRoll, applyCasualties, applyBattle, planBattle, type Arm, type ArmorSet, type RaiderTemper } from './battle';
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { GUN, skillOf, type Caliber } from './armory';
import { backgroundOf, fullName, type Person } from './family';
import { chronicle } from './lineage';
import { homeFromCaptivity } from './mind';
import { peopleAfterFight } from './people';
import { log } from './economy';
import { radioSet, reception } from './radio';
import { VEHICLES, startingVehicles, type Vehicle } from './vehicles';
import { mulberry32 } from './rng';
import { calendarOf, dayIndex, type GameState } from './state';
import type { Stock } from './materials';
import type { Encounter, Outcome, Stance } from './encounters';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type CaptiveStatus = 'held' | 'traded' | 'dead';
export type LeadSource = 'radio' | 'neighbor' | 'trader' | 'prisoner';

export interface Lead {
  day: number;
  source: LeadSource;
  /** Where the crew camps, how far (km), how many of them. */
  where: string;
  km: number;
  count: number;
  /** The child was seen alive (true), not seen (null), or the lead says they're not there any more. */
  seenAlive: boolean | null;
  news?: 'traded' | 'dead';
  /** A long-shot rumor of a child traded on: a trading post or work camp far off (a trip by truck, not a raid). */
  far?: boolean;
  /** The line the family heard. */
  text: string;
  /** Whether it was true when it was said (hidden). */
  true: boolean;
}

export interface Captive {
  /** The person taken. */
  pid: string;
  /** The crew that took them, their temper, how many came to the place. */
  crew: string;
  temper: RaiderTemper;
  raiders: number;
  /** The truth (hidden): how many hold the camp, where it is, how far. */
  camp: number;
  where: string;
  km: number;
  dir: string;
  /** Day taken. */
  day: number;
  /** What has really become of them (hidden), and since when. */
  status: CaptiveStatus;
  statusDay: number;
  /** What the family has heard. */
  known: 'nothing' | 'alive' | 'traded' | 'dead';
  /** Traded on: where to now (hidden), a trading post or camp 80–400 km off; it moves every couple of months. */
  farWhere?: string;
  farKm?: number;
  farDir?: string;
  /** This crew deals: they'll trade a child back for goods. */
  deals: boolean;
  leads: Lead[];
  /** The family sent word they'd pay: the day an answer is due. The day of the last offer. */
  offerDue?: number;
  lastOffer?: number;
  /** How it ended for the family: home again, given up, known dead. */
  closed?: 'home' | 'given_up' | 'dead';
  closedDay?: number;
}

export interface RescueRaid {
  captive: string;
  /** A raid on the camp, or a long trip by truck after a child traded on. */
  kind?: 'raid' | 'trip';
  /** Who went, and the neighbors who sent men (household id, how many). */
  team: string[];
  allies?: Array<{ id: string; n: number }>;
  left: number;
  /** The day they hit the camp, the day they're back. */
  hitDay: number;
  backDay: number;
  resolved: boolean;
  /** The child is coming home with them. */
  freed?: boolean;
}

export interface RescueState { captives: Captive[]; raid: RescueRaid | null }

export const newRescue = (): RescueState => ({ captives: [], raid: null });
const rescueOf = (s: GameState): RescueState => (s.rescue ??= newRescue());

/** A lead is warm for ten days, cooling to three weeks, then cold (the crew has likely moved on). */
export const LEAD_WARM = 10, LEAD_COLD = 21;
/** A far rumor stays worth the drive for six weeks. */
export const FAR_COLD = 45;
export const leadAge = (s: GameState, l: Lead) => dayIndex(s.clock.t) - l.day;
/** The latest lead on the crew's camp (not a far rumor of a child traded on). */
export const latestLead = (c: Captive): Lead | undefined => c.leads.filter(l => !l.far).pop();
export const latestFarLead = (c: Captive): Lead | undefined => c.leads.filter(l => l.far).pop();
export const openCaptives = (s: GameState) => (s.rescue?.captives ?? []).filter(c => !c.closed);

/** Away on a rescue: off the line, off the work. */
export const isAway = (s: GameState, pid: string) => {
  const r = s.rescue?.raid;
  return !!r && r.team.includes(pid);
};

// ─────────────────────────────────────────────────────────────────────────
// Names, places, voices
// ─────────────────────────────────────────────────────────────────────────

const CREWS = ['the Dry Creek crew', 'the white-truck crew', 'Boyd\'s people', 'the bunch from the reservoir', 'the Hollister boys', 'the crew with the dogs', 'the Gatlin crew', 'the men in the school bus'];
const PLACES = ['the old gravel pit off Route 9', 'the Kessler grain elevator', 'the burned-out truck stop at the interchange', 'the church camp up Bear Creek', 'the campground by the reservoir', 'the sale barn in town', 'the mine buildings on Copper Hill', 'the rest area on the interstate', 'the fairgrounds', 'the lumber mill on the river'];
const DIRS = ['north', 'south', 'east', 'west', 'up the valley', 'down the river'];
const pick = <T,>(r: () => number, xs: T[]): T => xs[Math.floor(r() * xs.length)];
const hashId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

const person = (s: GameState, pid: string) => s.people.find(p => p.id === pid);
const stateOf = (s: GameState, pid: string) => s.personState.find(ps => ps.id === pid);
const free = (s: GameState, p: Person) => stateOf(s, p.id)?.needs.died == null;

/** The child's mom and dad (or whoever's raising them) who are still here, by voice. */
function parents(s: GameState, child: Person): { mom?: Person; dad?: Person; any?: Person } {
  if (!child.kid) {
    // an adult taken: their partner speaks, or whoever's closest to them
    const mate = child.partner ? person(s, child.partner) : undefined;
    const kin = s.people.filter(p => p !== child && !p.kid && free(s, p) && (p.kin || p.last === child.last));
    return { any: mate && free(s, mate) ? mate : kin[0] ?? s.people.find(p => p !== child && !p.kid && free(s, p)) };
  }
  const ps = (child.parents ?? []).map(id => person(s, id)).filter((p): p is Person => !!p && free(s, p));
  const adults = ps.length ? ps : s.people.filter(p => !p.kid && free(s, p) && (p.kin || p.last === child.last));
  const mom = adults.find(p => p.body === 'f'), dad = adults.find(p => p.body === 'm');
  return { mom, dad, any: mom ?? dad ?? s.people.find(p => !p.kid && free(s, p)) };
}
/** A line spoken by the child's mother or father. */
function voice(s: GameState, child: Person, r: () => number, mom: string[], dad: string[], adult?: string[]): string {
  const { mom: m, dad: d, any } = parents(s, child);
  if (!child.kid) {
    const f = child.first;
    return any ? `${any.first}: "${pick(r, adult ?? [`We get ${f} back. Whatever it takes.`, `I keep thinking about ${f} out there, working for those animals.`, `${f}'s strong. ${f} will hold on. ${f} has to.`])}"` : '';
  }
  const who = m && d ? (r() < 0.5 ? m : d) : m ?? d ?? any;
  if (!who) return '';
  return `${who.first}: "${pick(r, who === m || (!d && who.body === 'f') ? mom : dad)}"`;
}
const they = (p: Person) => (p.body === 'f' ? ['she', 'her'] : ['he', 'him']);
/** How the family speaks of them: the child, the kid, or by name (an adult). */
const callIt = (p: Person) => (!p.kid ? p.first : p.age < 13 ? 'the child' : 'the kid');
const news = (s: GameState, text: string, tone: 0 | 1 | 2 | 3) => {
  s.disaster.news.push({ t: s.clock.t, text, tone });
  if (s.disaster.news.length > 40) s.disaster.news.splice(0, s.disaster.news.length - 40);
};

// ─────────────────────────────────────────────────────────────────────────
// Taken
// ─────────────────────────────────────────────────────────────────────────

/** Start a record for someone carried off, from the raid that took them (the crew's size and temper). */
export function recordTaken(s: GameState, pid: string, raiders: number, temper: RaiderTemper, lost = 0): Captive {
  const R = rescueOf(s);
  const had = R.captives.find(c => c.pid === pid && !c.closed);
  if (had) return had;
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 3301 + day * 17 + hashId(pid) % 9973);
  // the same crew if they took more than one today
  const mate = R.captives.find(c => c.day === day && !c.closed);
  const c: Captive = mate ? { ...structuredClone(mate), pid, leads: [], known: 'nothing', status: 'held', statusDay: day } : {
    pid, crew: pick(r, CREWS), temper, raiders,
    // the ones who came, less those who went down, plus whoever stayed at the camp
    camp: Math.max(3, raiders - lost + Math.floor(r() * 5)),
    where: pick(r, PLACES), km: 4 + Math.round(r() * 30), dir: pick(r, DIRS),
    day, status: 'held', statusDay: day, known: 'nothing',
    deals: r() < (temper === 'savage' ? 0.45 : temper === 'hard' ? 0.8 : 0.8),
    leads: [],
  };
  R.captives.push(c);
  return c;
}

/** After a fight at the compound: a record for every child carried off (encounters.ts calls this). */
export function recordBattle(s: GameState, b: Battle, raiders: number, temper: RaiderTemper | undefined): void {
  const lost = b.events.filter(e => e.kind === 'death' && !e.unit.startsWith('h_')).length;
  for (const e of b.events) if (e.kind === 'taken') {
    const pid = b.units.find(u => u.id === e.unit)?.personId;
    if (pid && stateOf(s, pid)?.needs.taken) recordTaken(s, pid, raiders, temper ?? 'savage', lost);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Fate
// ─────────────────────────────────────────────────────────────────────────

/** The day's chance a child held this long is moved on or dies (savage crews; the less ruthless kinder). */
export function fateHazard(c: Pick<Captive, 'temper'>, days: number): number {
  return (0.015 + 0.0004 * days) * (c.temper === 'savage' ? 1 : c.temper === 'hard' ? 0.6 : 0.4);
}
/** One day of what becomes of them. */
const FAR_PLACES = ['the trading post at Hadley Junction', 'the market in the old Walmart lot at Ridgeway', 'a work camp at the dam on the river', 'the convoy yard at Fort Madison', 'the salt flats market', 'the barge landing at Crow Point', 'the feedlot camp outside Garden City'];
const setFar = (c: Captive, r: () => number) => { c.farWhere = pick(r, FAR_PLACES.filter(p => p !== c.farWhere)); c.farKm = 80 + Math.round(r() * 320); c.farDir = pick(r, ['south', 'east', 'west', 'north']); };
function fateDay(s: GameState, c: Captive, day: number): void {
  const r = mulberry32(s.seed * 7717 + day * 101 + hashId(c.pid) % 7919);
  // traded on: a hard life somewhere far off; they get moved on every couple of months
  if (c.status === 'traded') {
    if (!c.farWhere) setFar(c, r);
    if (r() < 0.003) { c.status = 'dead'; c.statusDay = day; } else if (r() < 1 / 60) setFar(c, r);
    return;
  }
  if (c.status !== 'held') return;
  if (r() >= fateHazard(c, day - c.day)) {
    // the crew moves camp every few weeks: the leads point at an empty place
    if (r() < 1 / 25) { c.where = pick(r, PLACES.filter(p => p !== c.where)); c.km = 4 + Math.round(r() * 30); c.dir = pick(r, DIRS); }
    return;
  }
  // a hard crew keeps a worker alive and sells him on; a savage one is likelier to kill
  c.status = r() < (c.temper === 'savage' ? 0.45 : c.temper === 'hard' ? 0.2 : 0.3) ? 'dead' : 'traded';
  c.statusDay = day;
  if (c.status === 'traded') setFar(c, r);
}

// ─────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────

const RADIO_SRC = ['On the 40-meter net', 'On the county net', 'On the shortwave, faint', 'A trucker on channel 19'];

/** Hear something about one of the taken. Returns the line (also logged and in the ticker). */
export function addLead(s: GameState, c: Captive, source: LeadSource, r: () => number, from = ''): string {
  const child = person(s, c.pid);
  if (!child) return '';
  const truth = source === 'radio' ? reception(s).truth : source === 'prisoner' ? 0.9 : source === 'neighbor' ? 0.75 : 0.6;
  const tru = r() < truth;
  const where = tru ? c.where : pick(r, PLACES), km = tru ? c.km : 4 + Math.round(r() * 30), dir = tru ? c.dir : pick(r, DIRS);
  const count = Math.max(2, Math.round((tru ? c.camp : 3 + r() * 10) * (0.8 + 0.45 * r())));
  let seenAlive: boolean | null = null, said: Lead['news'];
  if (tru) {
    if (c.status === 'held') seenAlive = r() < 0.7 ? true : null;
    else if (r() < (c.status === 'traded' ? 0.6 : 0.5)) { seenAlive = false; said = c.status; }
  } else seenAlive = r() < 0.5 ? true : null;
  const [sh] = they(child);
  const first = child.first;
  const about = said === 'traded' ? `They don't have ${child.kid ? callIt(child) : child.first} any more: traded ${child.body === 'f' ? 'her' : 'him'} to a convoy going south.`
    : said === 'dead' ? `There's a fresh grave behind the place.${child.kid ? ' Small.' : ''}`
    : seenAlive ? (child.kid ? `There's a ${child.age < 13 ? 'child' : 'kid'} with them, ${child.age} or so. Alive.` : `Somebody matching ${child.first} is working their camp under guard. Alive.`) : child.kid ? 'Nobody saw a child.' : `Nobody saw ${child.first}.`;
  const camp = `${c.crew[0].toUpperCase() + c.crew.slice(1)} camp at ${where}, about ${km} km ${dir}. ${count} of them.`;
  const lead0 = source === 'radio' ? `${pick(r, RADIO_SRC)}: ${camp} ${about}`
    : source === 'prisoner' ? `The prisoner knows them. ${camp} ${about}`
    : source === 'neighbor' ? `${from || 'A neighbor'} rode over: ${camp} ${about}`
    : `${from || 'The trader'} at the gate: ${camp} ${about}`;
  const lead: Lead = { day: dayIndex(s.clock.t), source, where, km, count, seenAlive, ...(said ? { news: said } : {}), text: lead0, true: tru };
  c.leads.push(lead);
  if (c.leads.length > 8) c.leads.splice(0, c.leads.length - 8);
  if (said) c.known = said; else if (seenAlive) c.known = 'alive';
  const reply = said === 'dead' ? voice(s, child, r, ['No. No, that isn\'t — they don\'t know that. They don\'t KNOW that.', `Don't. Don't say it. Not ${first}.`], ['It could be anyone\'s. It could be anyone\'s.', 'I need to see it. I need to see it myself.'])
    : said === 'traded' ? voice(s, child, r, [`South. ${first} is out there somewhere going south and I'm standing here.`, 'Then we find the convoy. We find it.'], ['Sold. Like a — like a goat.', 'I swore I\'d get ' + they(child)[1] + ' back. I swore it.'])
    : seenAlive ? voice(s, child, r, [`${sh[0].toUpperCase() + sh.slice(1)}'s alive. Oh God, ${sh}'s alive.`, `That's ${first}. That has to be ${first}.`], ['Alive. Okay. Okay. Then we can still do something.', `${count} of them. I need to think. I need to think.`])
    : voice(s, child, r, ['Somebody has to have seen something.', 'Then we keep asking.'], ['That\'s where they are. That\'s a start.', 'At least we know where to look.']);
  log(s, lead0);
  if (reply) log(s, reply);
  news(s, lead0, said === 'dead' ? 3 : 2);
  return lead0;
}

/** A lead from a trader or neighbor at the gate (encounters.ts, after a trade or a talk). */
export function gateLead(s: GameState, kind: 'trader' | 'neighbor', from: string, r: () => number): string | null {
  const c = openCaptives(s).filter(x => x.known !== 'dead')[0];
  if (!c || r() > 0.5 * Math.exp(-(dayIndex(s.clock.t) - c.day) / 60)) return null;
  return addLead(s, c, kind, r, from);
}

/** A prisoner who talks may know the crew that took the child (aftermath.ts). */
export function prisonerLead(s: GameState, r: () => number): string | null {
  const c = openCaptives(s).filter(x => x.known !== 'dead')[0];
  if (!c) return null;
  return addLead(s, c, 'prisoner', r);
}

// ─────────────────────────────────────────────────────────────────────────
// Ransom
// ─────────────────────────────────────────────────────────────────────────

export interface RansomTerms { pid: string; goods: Partial<Stock>; ammo: Partial<Record<Caliber, number>> }

/** What a crew asks for a child: fuel, ammunition, medicine, food (more from a savage crew). */
export function ransomTerms(s: GameState, c: Captive, r: () => number): RansomTerms {
  const x = c.temper === 'savage' ? 1.3 : 1;
  const all: Array<() => Partial<RansomTerms>> = [
    () => ({ goods: { fuel: Math.round((5 + r() * 5) * x) } }),
    () => {
      const cal = (Object.entries(s.armory.ammo) as Array<[Caliber, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '556';
      return { ammo: { [cal]: Math.round((150 + r() * 150) * x / 10) * 10 } };
    },
    () => ({ goods: { meds: Math.round((2 + r() * 3) * x) } }),
    () => ({ goods: { canned: Math.round((12 + r() * 18) * x) } }),
  ];
  const n = 2 + (r() < 0.4 ? 1 : 0);
  const order = [...all.keys()].sort(() => r() - 0.5).slice(0, n);
  const t: RansomTerms = { pid: c.pid, goods: {}, ammo: {} };
  for (const k of order) { const p = all[k](); Object.assign(t.goods, p.goods ?? {}); Object.assign(t.ammo, p.ammo ?? {}); }
  return t;
}
export const termsText = (t: RansomTerms) => [
  ...(Object.entries(t.goods) as Array<[keyof Stock, number]>).map(([k, n]) => `${n} ${k === 'fuel' ? 'cans of fuel' : k === 'meds' ? 'med kits' : k === 'canned' ? 'cases of canned food' : k}`),
  ...(Object.entries(t.ammo) as Array<[Caliber, number]>).map(([k, n]) => `${n} rounds of ${k}`),
].join(', ');
export function canPay(s: GameState, t: RansomTerms, share = 1): boolean {
  return (Object.entries(t.goods) as Array<[keyof Stock, number]>).every(([k, n]) => (s.stock[k] ?? 0) >= Math.ceil(n * share))
    && (Object.entries(t.ammo) as Array<[Caliber, number]>).every(([k, n]) => (s.armory.ammo[k] ?? 0) >= Math.ceil(n * share));
}
function pay(s: GameState, t: RansomTerms, share: number) {
  for (const [k, n] of Object.entries(t.goods) as Array<[keyof Stock, number]>) s.stock[k] = Math.max(0, s.stock[k] - Math.ceil(n * share));
  for (const [k, n] of Object.entries(t.ammo) as Array<[Caliber, number]>) s.armory.ammo[k] = Math.max(0, (s.armory.ammo[k] ?? 0) - Math.ceil(n * share));
}

/** A double-cross: likelier the more ruthless the crew. */
export const DOUBLE_CROSS: Record<RaiderTemper, number> = { savage: 0.35, hard: 0.2, desperate: 0.1 };

/** The ransom offer at the gate (the game pauses on it). */
function ransomEncounter(s: GameState, c: Captive, r: () => number): Encounter {
  const child = person(s, c.pid)!;
  const t = ransomTerms(s, c, r);
  const day = dayIndex(s.clock.t);
  c.lastOffer = day; c.offerDue = undefined;
  const [, him] = they(child);
  const how = pick(r, [
    `A boy on a bicycle leaves a note in the gate and pedals off fast. It's in pencil: they have ${child.first}.`,
    `A man stands at the end of the drive under a white rag on a stick. He says they have ${child.first}, and holds up ${child.first}'s shoe.`,
    `A voice on the CB, on your channel: "We got ${child.kid ? 'your kid' : 'your man'}. ${child.first}. You want ${him} back?"`.replace('your man', child.body === 'f' ? 'your woman' : 'your man'),
  ]);
  const alive = c.status === 'held' ? pick(r, [child.kid ? `They put ${child.first} on the radio for a second. "Mom? Dad? I'm okay, I'm —" Then nothing.` : `They put ${child.first} on the radio for a second. "I'm okay. Don't do anything stupid —" Then nothing.`, `${child.first}'s name is written at the bottom, in ${child.first}'s own hand.`]) : `They won't say how ${child.first} is. "You'll see when you pay."`;
  return {
    id: `e${s.nextId++}`, kind: 'ransom', day, title: `Word from ${c.crew}`,
    dossier: [how, alive, `They want: ${termsText(t)}.`, `They'll bring ${him} to the gate at first light. One of you, unarmed, at the gate.`],
    size: 3, armed: true, strength: 0, stances: ['pay', 'parley', 'refuse'], ransom: t, temper: c.temper,
  };
}

/** Send word through whoever gave the last lead that the family will pay. An answer comes in a few days, if this crew deals. */
export function askRansom(s: GameState, pid: string): string | null {
  const c = openCaptives(s).find(x => x.pid === pid);
  if (!c) return 'no one to ask about';
  const l = c.leads.filter(x => !x.far).pop();
  if (!l || leadAge(s, l) > LEAD_COLD) return 'nobody to carry word: you need a lead on where they are';
  if (c.offerDue != null) return 'word has gone; waiting for an answer';
  const day = dayIndex(s.clock.t);
  c.offerDue = day + 2 + (hashId(c.pid + day) % 4);
  const child = person(s, pid)!;
  log(s, `Word went out through ${l.source === 'radio' ? 'the radio net' : l.source === 'prisoner' ? 'the prisoner\'s people' : l.source === 'neighbor' ? 'the neighbors' : 'the trader'}: ${c.crew} can name their price for ${child.first}.`);
  return null;
}

/** The family answers the offer. */
export function resolveRansom(s: GameState, e: Encounter, stance: Stance): Outcome {
  const t = e.ransom!;
  const c = openCaptives(s).find(x => x.pid === t.pid);
  const child = person(s, t.pid);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 5503 + day * 13 + stance.length);
  const lines: string[] = [];
  if (!c || !child) return { title: 'Nobody came', text: 'Whoever sent word never came back.', tone: 'mixed', lines };
  const [sh, him] = they(child);
  if (stance === 'refuse') {
    if (r() < 0.5) c.deals = false;
    lines.push(voice(s, child, r, ['We can\'t. We can\'t, and I hate us for it.', 'They\'d take it and keep us starving and still not give ' + him + ' back.'], ['If we pay once, they come back every month.', 'There has to be another way.']));
    return { title: 'No deal', text: `You send them away with nothing. ${c.deals ? 'They say they\'ll ask once more.' : 'They say ' + sh + '\'ll go down the road to someone who pays.'}`, tone: 'bad', lines: lines.filter(Boolean) };
  }
  let share = 1;
  if (stance === 'parley') {
    const talker = Math.max(0, ...s.people.filter(p => !p.kid && free(s, p)).map(p => p.skills.negotiator));
    if (r() * 100 < 35 + talker * 7 - (c.temper === 'savage' ? 15 : 0)) { share = 0.6; lines.push('Hours of it at the gate. They came down to six parts in ten.'); }
    else return { title: 'They walked off', text: 'You pushed too hard. They spat in the road and left. Maybe they\'ll send word again.', tone: 'bad', lines };
  }
  if (!canPay(s, t, share)) {
    return { title: 'Not enough', text: `You don't have it all. They look at what you've got and laugh. "Get the rest."`, tone: 'bad', lines: [`They want: ${termsText(t)}${share < 1 ? ' (six in ten of it)' : ''}.`] };
  }
  pay(s, t, share);
  lines.push(`Paid: ${share < 1 ? 'six parts in ten of ' : ''}${termsText(t)}.`);
  const crossed = c.status !== 'held' || r() < DOUBLE_CROSS[c.temper];
  if (!crossed) {
    lines.push(voice(s, child, r, [`${child.first}! Oh, baby — I've got you, I've got you, I'm never letting go —`, `Look at me. Look at me. You're home. You're home now.`], [`Come here. Come here, kiddo. It's over. It's over.`, `I've got ${him}. I've got ${him}. Get the door —`], [`${child.first}. Oh God, ${child.first}. You're home.`, `Look at your hands. What did they — never mind. You're home.`]));
    lines.push(...bringHome(s, c, 'ransom'));
    return { title: `${child.first} is home`, text: `At first light a truck stops at the end of the drive. They push ${child.first} out and are gone before ${sh} reaches the gate.`, tone: 'good', lines: lines.filter(Boolean) };
  }
  // double-cross: they keep the goods, or they come shooting
  c.deals = false;
  if (r() < 0.5 || c.status !== 'held') {
    lines.push(voice(s, child, r, ['They lied. They lied to us and we gave them everything.', `We should never — I should have gone after ${him} myself.`], ['Never again. Never again, I swear to God.', 'They were never going to bring ' + him + '.']));
    return { title: 'Nobody came', text: `You stood at the gate until noon. The goods are gone, and so are they.${c.status !== 'held' ? ` Maybe they never had ${him} to give.` : ''}`, tone: 'bad', lines: lines.filter(Boolean) };
  }
  const n = Math.min(c.camp, 3 + Math.floor(r() * 4));
  const b = planBattle(s, n, s.seed * 977 + day * 3 + 7, { armed: true, temper: c.temper });
  s.gate.battle = b;
  lines.push('A truck at first light. The tailgate drops — and there are men in the back with rifles.');
  lines.push(...applyBattle(s, b));
  recordBattle(s, b, n, c.temper);
  if ((b.result === 'repelled' || b.result === 'fled') && r() < 0.4) {
    lines.push(`When they ran, they left ${child.first} in the ditch by the road, tied, alive.`);
    lines.push(...bringHome(s, c, 'ransom'));
    return { title: 'An ambush at the gate', text: `It was a trap. You held, and ${child.first} came home in the middle of it.`, tone: 'mixed', lines: lines.filter(Boolean) };
  }
  return { title: 'An ambush at the gate', text: b.result === 'repelled' || b.result === 'fled' ? `It was a trap. You held the gate, but they drove off with the goods, and with ${child.first}.` : 'It was a trap. They got in.', tone: 'bad', lines: lines.filter(Boolean) };
}

// ─────────────────────────────────────────────────────────────────────────
// Coming home
// ─────────────────────────────────────────────────────────────────────────

/** Back with the family: back in the day's work, the meals, the birthdays; shaken. */
export function bringHome(s: GameState, c: Captive, how: 'ransom' | 'rescue' | 'trip'): string[] {
  const i = s.people.findIndex(p => p.id === c.pid);
  if (i < 0) return [];
  const p = s.people[i], ps = s.personState[i], n = ps.needs;
  const day = dayIndex(s.clock.t);
  const gone = Math.max(0, day - c.day);
  n.died = null; n.taken = false;
  ps.task = 'idle'; ps.target = null;
  // thin, hurt, frightened: a hard-kept captive comes home in poor shape
  n.health = Math.min(n.health, Math.max(35, 85 - gone * 0.8));
  n.hunger = Math.max(n.hunger, Math.min(12000, gone * 300));
  n.morale = Math.min(n.morale, 20);
  // what they went through stays with them (sim/mind.ts: trauma, and the family's relief)
  homeFromCaptivity(s, p.id, gone);
  // the birthdays missed while gone
  for (let d = c.day + 1; d <= day; d++) if (calendarOf(s.clock, d).doy === (p.bday ?? -1)) p.age++;
  if (p.kid && p.age >= 18) p.kid = false;
  // the rest of the family: the weight comes off
  for (const q of s.personState) if (q !== ps && q.needs.died == null) q.needs.morale = Math.min(100, q.needs.morale + 12);
  // the chronicle wrote them off as taken: write them back in
  s.lineage.mourned = s.lineage.mourned.filter(id => id !== p.id);
  c.closed = 'home'; c.closedDay = day; c.known = 'alive'; c.offerDue = undefined;
  const line = `${fullName(p)} came home after ${gone} day${gone === 1 ? '' : 's'} with ${c.crew}${how === 'ransom' ? ', ransomed' : how === 'trip' ? `, brought back from ${c.farWhere ?? 'far away'}` : ', brought back by force'}.`;
  if (p.kin) chronicle(s, 'home', line);
  log(s, line);
  news(s, line, 0);
  return [line];
}

/** The family stops looking (they can't keep doing this). */
export function giveUp(s: GameState, pid: string): string | null {
  const c = openCaptives(s).find(x => x.pid === pid);
  if (!c) return 'no one to give up on';
  if (s.rescue?.raid?.captive === pid && !s.rescue.raid.resolved) return 'they\'re out there now';
  const child = person(s, pid);
  c.closed = 'given_up'; c.closedDay = dayIndex(s.clock.t);
  for (const q of s.personState) if (q.needs.died == null) q.needs.morale = Math.max(0, q.needs.morale - 10);
  if (child) {
    const line = `The family stopped looking for ${fullName(child)}.`;
    if (child.kin) chronicle(s, 'death', line);
    log(s, line);
    log(s, voice(s, child, mulberry32(s.seed + c.day), ['We light a candle. Every night. That\'s what we can do now.', `I keep setting ${they(child)[1]} a place at the table.`], ['We have the others to keep alive. God forgive me.', 'Somewhere out there. That\'s all. Somewhere.']));
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// The rescue raid
// ─────────────────────────────────────────────────────────────────────────

/** Who could go: adults (and teens 15+) on their feet, not badly wounded. */
export function canGo(s: GameState, p: Person): boolean {
  const n = stateOf(s, p.id)?.needs;
  if (!n || n.died != null || isAway(s, p.id)) return false;
  if (p.kid && p.age < 15) return false;
  return n.health >= 35 && !n.hurt.some(h => h.trauma && h.sev >= 50);
}

/** Why a raid can't go now, or null. */
export function raidProblem(s: GameState, pid: string, team: string[]): string | null {
  const c = openCaptives(s).find(x => x.pid === pid);
  if (!c) return 'no one to go after';
  if (s.rescue?.raid && !s.rescue.raid.resolved) return 'a rescue is already out';
  if (s.rescue?.raid) return 'wait for the last ones to get home';
  const l = c.leads.filter(x => !x.far).pop();
  if (!l) return 'nobody knows where they are yet';
  if (leadAge(s, l) > LEAD_COLD) return 'the trail is cold: you need a fresh lead';
  if (!team.length) return 'pick who goes';
  if (team.some(id => { const p = person(s, id); return !p || !canGo(s, p); })) return 'someone picked can\'t go';
  return null;
}

/**
 * Neighbors who'd send a man or two: home, on the radio net, and who like you
 * (the same households that ride over when there's shooting at the gate).
 */
export function alliesFor(s: GameState): Array<{ id: string; name: string; n: number }> {
  return s.neighbors.filter(n => n.status === 'home' && n.radio && n.disposition > 50 && n.members > 0).map(n => ({ id: n.id, name: n.name, n: n.members >= 3 ? 2 : 1 }));
}
const ALLY_FIRST = ['Walt', 'Dale', 'Marty', 'Ruth', 'Gene', 'Tom', 'Luis', 'Jo', 'Earl', 'Kate'];

/** Send them (with the neighbors' men if asked). They go tonight, hit the camp before dawn and are back the day after. */
export function startRescue(s: GameState, pid: string, team: string[], withAllies = false): string | null {
  const why = raidProblem(s, pid, team);
  if (why) return why;
  const c = openCaptives(s).find(x => x.pid === pid)!;
  const l = c.leads.filter(x => !x.far).pop()!;
  const day = dayIndex(s.clock.t);
  const far = l.km > 25 ? 1 : 0;
  const allies = withAllies ? alliesFor(s).map(a => ({ id: a.id, n: a.n })) : [];
  rescueOf(s).raid = { kind: 'raid', captive: pid, team: [...team], allies, left: day, hitDay: day + 1 + far, backDay: day + 2 + 2 * far, resolved: false };
  if (allies.length) log(s, `${alliesFor(s).map(a => `${a.name[0].toUpperCase() + a.name.slice(1)} sent ${a.n === 1 ? 'a man' : 'two men'}`).join('; ')}, on the radio net.`);
  for (const id of team) { const ps = stateOf(s, id); if (ps) { ps.task = 'away'; ps.target = null; } }
  const child = person(s, pid)!;
  const names = team.map(id => person(s, id)?.first).filter(Boolean) as string[];
  log(s, `${names.join(', ')} went after ${child.first}, to ${l.where}. The place is left with ${s.people.filter(p => free(s, p) && !team.includes(p.id) && (!p.kid || p.age >= 15)).length} who can hold a gun.`);
  log(s, voice(s, child, mulberry32(s.seed + day), ['Bring them home. All of you. Promise me.', 'I\'m going. Don\'t try to stop me.'], ['Lock the gate behind us. Don\'t open it for anyone.', 'If we\'re not back by Thursday — don\'t come looking.']));
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Traded on: the long-shot trip
// ─────────────────────────────────────────────────────────────────────────

const CAN_L = 20, L_PER_GAL = 3.785;
/** The truck for a long trip (running, not fried) and the liters there and back. */
export function tripFuel(s: GameState, km: number): { truck: Vehicle | undefined; liters: number; have: number } {
  const truck = (s.vehicles ?? startingVehicles()).filter(v => (v.kind === 'pickup' || v.kind === 'old_pickup') && !v.fried && v.condition > 0.1).sort((a, b) => b.condition - a.condition)[0];
  const liters = truck ? Math.ceil(2 * km / 1.609 / VEHICLES[truck.kind].mpg * L_PER_GAL) : 0;
  return { truck, liters, have: (truck?.fuel ?? 0) + s.stock.fuel * CAN_L };
}
const farLead = (c: Captive) => c.leads.filter(l => l.far).pop();

/** Why a trip after a traded-on child can't go now, or null. */
export function tripProblem(s: GameState, pid: string, team: string[]): string | null {
  const c = openCaptives(s).find(x => x.pid === pid);
  if (!c) return 'no one to go after';
  if (s.rescue?.raid) return s.rescue.raid.resolved ? 'wait for the last ones to get home' : 'someone is already out';
  const l = farLead(c);
  if (!l) return 'no word of where they were taken';
  if (leadAge(s, l) > FAR_COLD) return 'that rumor is months old: wait for another';
  const { truck, liters, have } = tripFuel(s, l.km);
  if (!truck) return 'no running truck';
  if (have < liters) return `not enough fuel: ${liters} L there and back, ${Math.floor(have)} L on hand`;
  if (!team.length) return 'pick who goes';
  if (team.length > 3) return 'the truck takes three';
  if (team.some(id => { const p = person(s, id); return !p || !canGo(s, p); })) return 'someone picked can\'t go';
  return null;
}

/** Drive to the trading post or camp the rumor named: days on the road each way, the fuel, wear on the truck. */
export function startTrip(s: GameState, pid: string, team: string[]): string | null {
  const why = tripProblem(s, pid, team);
  if (why) return why;
  const c = openCaptives(s).find(x => x.pid === pid)!;
  const l = farLead(c)!;
  const { truck, liters } = tripFuel(s, l.km);
  const fromTank = Math.min(truck!.fuel, liters);
  truck!.fuel -= fromTank;
  s.stock.fuel = Math.max(0, s.stock.fuel - (liters - fromTank) / CAN_L);
  truck!.mileage += 2 * l.km / 1.609; truck!.condition = Math.max(0, truck!.condition - 0.03);
  const day = dayIndex(s.clock.t), leg = Math.ceil(l.km / 150);
  rescueOf(s).raid = { kind: 'trip', captive: pid, team: [...team], left: day, hitDay: day + leg, backDay: day + 2 * leg, resolved: false };
  for (const id of team) { const ps = stateOf(s, id); if (ps) { ps.task = 'away'; ps.target = null; } }
  const child = person(s, pid)!;
  log(s, `${team.map(id => person(s, id)?.first).join(', ')} took the truck to ${l.where}, ${l.km} km off: ${liters} L of fuel and ${2 * leg} days, for a rumor.`);
  log(s, voice(s, child, mulberry32(s.seed + day + 1), ['Even if it\'s nothing. Even if it\'s nothing, go.', 'Bring a picture. Show everyone the picture.'], ['If there\'s any chance at all.', 'Take the good rifle. And the trade goods. All of them.']));
  return null;
}

/** At the trading post: ask, show the picture, and buy them back if they're there. */
function tripArrive(s: GameState, raid: RescueRaid): Outcome {
  const R = rescueOf(s);
  const c = R.captives.find(x => x.pid === raid.captive)!;
  const child = person(s, c.pid)!;
  const day = dayIndex(s.clock.t);
  const l = farLead(c)!;
  const r = mulberry32(s.seed * 8111 + day * 5 + 9);
  raid.resolved = true;
  const names = raid.team.map(id => person(s, id)?.first).filter(Boolean).join(', ');
  const [, him] = they(child);
  const lines: string[] = [];
  // the road: roadblocks, a crew working the highway
  if (r() < 0.2) {
    const id = pick(r, raid.team), p = person(s, id), ps = stateOf(s, id);
    if (p && ps) { const sev = 30 + Math.round(r() * 25); ps.needs.hurt.push({ what: 'shot at a roadblock on the highway', sev, trauma: true }); ps.needs.health = Math.max(1, ps.needs.health - sev * 0.5); lines.push(`They were shot at at a roadblock on the way. ${p.first} was hit.`); }
  }
  if (!l.true || c.status !== 'traded' || l.where !== c.farWhere) {
    l.day = Math.min(l.day, day - FAR_COLD - 1);
    const grave = l.true && c.status === 'dead' && l.where === c.farWhere;
    if (grave) { c.known = 'dead'; c.closed = 'dead'; c.closedDay = day; const ps = stateOf(s, c.pid); if (ps) ps.needs.taken = false; if (child.kin) chronicle(s, 'death', `${fullName(child)} died far from home, at ${l.where}, aged ${child.age}.`); }
    return { title: grave ? 'Too late' : 'Nobody had heard of them', text: grave ? `At ${l.where} a woman remembered ${child.first}. She showed them the grave. ${names} are on the long road home.` : `${names} showed ${child.first}'s picture to everyone at ${l.where}. Nobody knew the face. They're on the long road home.`, tone: 'bad', lines };
  }
  // there: buy them back from whoever has them now
  const t = ransomTerms(s, { ...c, temper: 'desperate' }, r);
  const paid = canPay(s, t);
  if (r() < (paid ? 0.65 : 0.25)) {
    if (paid) { pay(s, t, 1); lines.push(`Paid: ${termsText(t)}.`); } else lines.push('They had nothing like the price; they talked, and then they ran with ' + him + '.');
    raid.freed = true;
    lines.push(voice(s, child, r, ['Is it — is it really — oh God. Oh God, it is.', 'You found ' + him + '. You actually found ' + him + '.'], ['All that way. All that way, and there ' + they(child)[0] + ' was.', 'I never stopped. I never stopped looking.'], ['I never stopped looking. Not one day.', 'You\'re thin. You\'re so thin. Come on. Home.']));
    return { title: `Found at ${l.where}`, text: `${child.first} was there, ${c.farKm} km from home, working for a man who'd bought ${him} off a convoy. They're bringing ${him} home.`, tone: 'good', lines: lines.filter(Boolean) };
  }
  setFar(c, r);
  return { title: 'So close', text: `${child.first} was there. The man who has ${him} wouldn't sell, and moved ${him} on that night. ${names} are on the long road home.`, tone: 'bad', lines };
}

/** Now and then, months on, a rumor of a child traded on: a trading post or work camp far off (radio only; a ham hears the most). */
function farRumorDay(s: GameState, c: Captive, day: number, r: () => number): void {
  if (c.status !== 'traded' && c.known !== 'traded') return;
  const set = radioSet(s);
  const p = (set === 'ham' ? 0.008 : set === 'shortwave' ? 0.004 : 0.0015) * Math.exp(-(day - c.statusDay) / 240);
  if (r() >= p) return;
  const child = person(s, c.pid);
  if (!child) return;
  if (!c.farWhere) setFar(c, r);
  const tru = c.status === 'traded' && r() < reception(s).truth;
  const where = tru ? c.farWhere! : pick(r, FAR_PLACES), km = tru ? c.farKm! : 80 + Math.round(r() * 320);
  const text = `${pick(r, RADIO_SRC)}: someone at ${where}, ${km} km off, has a ${child.kid ? (child.age < 13 ? 'child' : 'kid') : 'worker'} who says ${child.body === 'f' ? 'her' : 'his'} name is ${child.first}.`;
  c.leads.push({ day, source: 'radio', where, km, count: 0, seenAlive: true, far: true, text, true: tru });
  if (c.leads.length > 8) c.leads.splice(0, c.leads.length - 8);
  c.known = 'traded';
  log(s, text);
  log(s, voice(s, child, r, [`${km} kilometers. I'd walk it. I'd walk it barefoot.`, 'It\'s a rumor. It\'s a rumor. But it\'s ' + child.first + '\'s name.'], ['The truck would make it. If we had the fuel. We have the fuel.', 'People say things on the radio. But ' + child.first + '.']));
  news(s, text, 2);
}

export interface CampFight {
  /** How it went: the camp wiped out, broken and run off, or the team driven back. */
  result: 'snatched' | 'wiped' | 'routed' | 'failed' | 'empty';
  /** The child: freed, killed in the crossfire, wounded and freed, not there. */
  child: 'freed' | 'wounded' | 'killed' | 'not_there' | 'still_held';
  surprise: boolean;
  /** Wounds and deaths in the battle contract (applyCasualties writes them). */
  battle: Battle;
  spent: Partial<Record<Caliber, number>>;
  campDown: number;
  /** The neighbors' men: hurt, killed. */
  allies: { wounded: number; dead: number };
  lines: string[];
}

interface Side { id: string; pid?: string; home: boolean; hp: number; out: boolean; dead: boolean; arm: Arm; skill: number; armor: ArmorSet; vet: boolean; nvg: boolean; ready: number; rounds: number; supp: number; medic?: boolean }

/**
 * The fight at the camp, second by second: the compound battle turned
 * round. They come up in the dark to ~50 m, open up on a camp that may be
 * asleep (surprise: fewer is quieter, a good hunter stalks, dogs spoil it,
 * night vision helps), then go in for the child once the camp is down to
 * their number or after a minute. Hit chance, where a round lands, armor and
 * wounds are battle.ts's (hitRoll); the crew breaks at ~45 % losses (a
 * savage one at ~65 %); the team pulls back at half down. Every shot fired
 * in the camp can find the child.
 */
export function fightAtCamp(s: GameState, team: string[], c: Pick<Captive, 'camp' | 'temper' | 'status'>, seed: number, allyN = 0): CampFight {
  const r = mulberry32(seed * 2654435 + 4441);
  const late = s.disaster.kind ? Math.min(1, Math.max(0, s.clock.t - s.disaster.hitAt) / 365) : 0;
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const ammo: Partial<Record<Caliber, number>> = { ...s.armory.ammo };
  const spent: Partial<Record<Caliber, number>> = {};
  const units: BattleUnit[] = [], ev: BattleEvent[] = [], lines: string[] = [];
  // the team: guns (their own first, then the best free one with ammo), armor to those who served first, night vision
  const guns = s.armory.guns.filter(x => (ammo[GUN[x.model].cal] ?? 0) >= 1).sort((a, b) => (ARMS[GUN[b.model].type].acc * ARMS[GUN[b.model].type].range) - (ARMS[GUN[a.model].type].acc * ARMS[GUN[a.model].type].range));
  const ppl = team.map(id => person(s, id)).filter((p): p is Person => !!p);
  const medicId = ppl.filter(p => p.skills.medic >= 3).sort((a, b) => b.skills.medic - a.skills.medic)[0]?.id;
  const H: Side[] = ppl.map(p => {
    const gun = guns.find(x => x.carrier === p.id) ?? guns.find(x => !x.carrier);
    let arm = FISTS;
    if (gun) { guns.splice(guns.indexOf(gun), 1); const m = GUN[gun.model]; arm = { ...(ARMS[m.type] ?? ARMS.pistol), cal: m.cal }; if (m.capacity) arm.mag = m.capacity; if (gun.condition < 0.5) arm.acc *= 0.7; }
    return { id: `h_${p.id}`, pid: p.id, home: true, hp: Math.max(20, stateOf(s, p.id)?.needs.health ?? 100), out: false, dead: false, arm, skill: skillOf(s, p.id), armor: { plate: false, soft: false, helmet: false }, vet: backgroundOf(p) !== null, nvg: false, ready: 0, rounds: 0, supp: 0, medic: p.id === medicId };
  });
  {
    let plates = n('plate_carrier'), soft = n('soft_armor'), helmets = n('helmet'), nvgs = n('nvg') + n('thermal');
    for (const f of [...H].sort((a, b) => Number(b.vet) - Number(a.vet))) {
      if (plates > 0) { f.armor.plate = true; plates--; } else if (soft > 0) { f.armor.soft = true; soft--; }
      if (helmets > 0) { f.armor.helmet = true; helmets--; }
      if (nvgs > 0) { f.nvg = true; nvgs--; }
      // what they carry: the magazines on them (a plate carrier holds more), from what's in the ammo can
      const cal = f.arm.cal;
      if (cal) { const want = f.arm.mag * (f.armor.plate ? 7 : 4); f.rounds = Math.min(want, ammo[cal] ?? 0); ammo[cal] = (ammo[cal] ?? 0) - f.rounds; }
    }
  }
  // the neighbors' men: their own rifles and a box of shells, steady country shots, no armor
  for (let i = 0; i < allyN; i++) H.push({ id: `a${i}`, home: true, hp: 100, out: false, dead: false, arm: { ...ARMS.semi_rifle, cal: null }, skill: 3 + Math.floor(r() * 3), armor: { plate: false, soft: false, helmet: false }, vet: false, nvg: false, ready: 0, rounds: 90, supp: 0 });
  for (const f of H) units.push({ id: f.id, side: 'home', personId: f.pid, x: 0, z: 0, ...(f.armor.plate || f.armor.soft || f.armor.helmet ? { armor: { ...f.armor } } : {}) });
  // the camp: like the crews at the gate (rifles, later armor and the odd night sight); a savage crew keeps dogs more often than not
  const dogs = r() < (c.temper === 'savage' ? 0.6 : 0.35);
  const hunter = Math.max(0, ...ppl.map(p => p.skills.hunter));
  const anyNvg = H.some(f => f.nvg);
  const surpriseP = Math.max(0.1, Math.min(0.95, 0.75 - 0.08 * (H.length - 2) + 0.04 * hunter - (dogs ? 0.3 : 0) + (anyNvg ? 0.1 : 0)));
  const surprise = r() < surpriseP;
  const R: Side[] = Array.from({ length: c.camp }, (_, i) => {
    const autoR = late > 0.5 && r() < 0.3;
    const arm: Arm = { ...(autoR ? ARMS.auto_rifle : r() < 0.55 ? ARMS.semi_rifle : r() < 0.6 ? ARMS.pump : ARMS.pistol), cal: null };
    return { id: `r${i}`, home: false, hp: 100, out: false, dead: false, arm, skill: 3 + Math.floor(r() * 4), armor: { plate: r() < late * 0.35, soft: r() < 0.15 + late * 0.2, helmet: r() < late * 0.3 }, vet: false, nvg: late > 0.6 && r() < 0.25, ready: surprise ? 6 + r() * 20 : 1 + r() * 4, rounds: arm.mag * 4, supp: 0 };
  });
  for (const f of R) units.push({ id: f.id, side: 'raider', x: 0, z: 0 });
  const childThere = c.status === 'held';
  let childHit: 'wounded' | 'killed' | null = null;
  let assault = false, end: CampFight['result'] | null = null;
  const eff = (f: Side) => Math.max(0.15, Math.min(1, f.hp / 100));
  const hurt = (b: Side, sev: number, t: number, part?: 'head' | 'torso' | 'arm' | 'leg') => {
    if (b.dead) return;
    b.hp -= sev;
    if (b.hp <= 0) { b.dead = true; b.out = true; ev.push({ t, kind: 'death', unit: b.id }); return; }
    ev.push({ t, kind: 'wound', unit: b.id, sev: Math.round(sev), ...(part ? { part } : {}) });
    if (b.hp < (b.home ? 45 : 55)) b.out = true;
  };
  const shoot = (a: Side, b: Side, t: number, d: number, cover: number, sleeping = false) => {
    const cost = a.arm.auto ? 3 : 1;
    if (a.home && a.arm.cal) { if (a.rounds < cost) return; a.rounds -= cost; spent[a.arm.cal] = (spent[a.arm.cal] ?? 0) + cost; }
    else if (a.arm !== FISTS) { if (a.rounds < cost) return; a.rounds -= cost; }
    const rangeF = Math.max(0.15, 1 - d / (a.arm.range * 1.2));
    // the dark: the camp's fires light them up, the team is in the trees
    const see = a.home ? (a.nvg || sleeping ? 0.9 : 0.6) : (a.nvg ? 0.8 : 0.35);
    const steady = 1 / (1 + a.supp * (a.vet ? 0.07 : 0.16));
    let p = (0.06 + 0.025 * a.skill) * a.arm.acc * rangeF * cover * see * steady * eff(a);
    if (a.arm.auto) p *= 1.6;
    const hit = r() < Math.min(0.9, p);
    ev.push({ t, kind: 'shot', from: a.id, to: b.id, hit, ...(a.arm.auto ? { auto: true } : {}) });
    b.supp += a.arm.auto ? 2 : 1;
    // a round loose in the camp can find the child
    if (childThere && !childHit && r() < (assault ? 0.003 : 0.0008) * cost) childHit = r() < 0.5 ? 'killed' : 'wounded';
    if (!hit) return;
    const h = hitRoll(r, cover < 0.9, a.arm.range >= 30, b.armor);
    if (h.kind === 'stopped') { ev.push({ t, kind: 'wound', unit: b.id, sev: 5, part: h.part, stopped: true }); b.hp -= 4; return; }
    if (h.kind === 'helmet') { b.hp -= 15; ev.push({ t, kind: 'wound', unit: b.id, sev: 15, part: 'head' }); return; }
    hurt(b, h.kind === 'kill' ? b.hp + 1 : h.sev, t, h.part);
  };
  const breakAt = Math.ceil(c.camp * (c.temper === 'savage' ? 0.55 : c.temper === 'hard' ? 0.5 : 0.4));
  // with the camp asleep, the quietest way: cut through the back of the trailer and carry the child out before anyone wakes
  const snatch = childThere && surprise && r() < Math.max(0.05, Math.min(0.6, 0.15 + 0.05 * hunter - 0.06 * (H.length - 1) + (anyNvg ? 0.1 : 0)));
  if (snatch) end = 'snatched';
  for (let t = 0; t < 240 && !end; t++) {
    for (const f of [...H, ...R]) f.supp *= 0.6;
    const hUp = H.filter(f => !f.out), rUp = R.filter(f => !f.out);
    if (!rUp.length) { end = 'wiped'; break; }
    if (R.filter(f => f.out).length >= breakAt) { end = 'routed'; break; }
    if (!hUp.length || (H.filter(f => f.out).length >= Math.ceil(H.length / 2) && rUp.length > hUp.length) || (t >= 30 && rUp.length >= 2 * hUp.length + 2)) { end = 'failed'; break; }
    // in for the child once the camp is down to their number, or after a minute of it
    if (!assault && (rUp.length <= hUp.length || t >= 60)) assault = true;
    const d = assault ? 3 : 8;
    for (const a of hUp) {
      if (t < a.ready || r() > a.arm.rate * (0.5 + 0.5 * eff(a))) continue;
      if (a.arm === FISTS && !assault) continue;
      const tg = rUp.sort((x, y) => Number(x.ready > t) - Number(y.ready > t) || x.hp - y.hp)[0];
      // asleep in a tent, a man has no cover; up and behind the trucks, he does
      shoot(a, tg, t, a.arm === FISTS ? 0.5 : d, tg.ready > t ? 1 : 0.6, tg.ready > t);
    }
    for (const a of rUp) {
      if (t < a.ready || r() > a.arm.rate * (0.5 + 0.5 * eff(a))) continue;
      const tg = hUp[Math.floor(r() * hUp.length)];
      shoot(a, tg, t, d, assault ? 0.9 : 0.5);
    }
    if (t === 239) end = 'failed';
  }
  // after: the badly hurt bleed out unless someone gets a tourniquet or a seal on them in time
  let ifaks = n('ifak');
  const medic = H.some(f => f.medic && !f.out);
  for (const f of H) if (f.out && !f.dead && f.hp < 25) {
    const kit = ifaks > 0; if (kit) ifaks--;
    if (r() < (kit || medic ? 0.12 : 0.35)) { f.dead = true; ev.push({ t: 241, kind: 'death', unit: f.id }); }
  }
  // driven off: the downed who couldn't be carried out are left behind
  if (end === 'failed') {
    const up = H.filter(f => !f.out).length;
    const left = H.filter(f => f.out && !f.dead).slice(up);
    // in the dark, a wounded man left behind sometimes crawls off and makes it home
    for (const f of left) if (r() >= 0.5) { f.dead = true; ev.push({ t: 242, kind: 'death', unit: f.id, ...(c.temper !== 'desperate' ? { executed: true } : {}) }); }
  }
  // a savage crew that loses doesn't leave the child behind alive, sometimes
  if ((end === 'routed') && childThere && !childHit && c.temper === 'savage' && r() < 0.08) childHit = 'killed';
  ev.push({ t: 245, kind: 'end', result: end === 'failed' ? 'repelled' : 'overrun' });
  const child: CampFight['child'] = !childThere ? 'not_there' : childHit === 'killed' ? 'killed' : end === 'failed' ? 'still_held' : childHit === 'wounded' ? 'wounded' : 'freed';
  if (!end) end = 'failed';
  return { result: end, child, surprise, battle: { night: true, units, events: ev, duration: 246 }, spent, campDown: R.filter(f => f.out).length, allies: { wounded: H.filter(f => !f.pid && f.hp < 100 && !f.dead).length, dead: H.filter(f => !f.pid && f.dead).length }, lines };
}

/** Rough odds of bringing the child home, from what the lead says (the family's guess, not the truth). */
export function rescueOdds(s: GameState, pid: string, team: string[], tries = 40, withAllies = false): number {
  const c = openCaptives(s).find(x => x.pid === pid);
  const l = c && c.leads.filter(x => !x.far).pop();
  const allyN = withAllies ? alliesFor(s).reduce((a, x) => a + x.n, 0) : 0;
  if (!c || !l || !team.length) return 0;
  let ok = 0;
  for (let i = 0; i < tries; i++) {
    const f = fightAtCamp(s, team, { camp: l.count, temper: c.temper, status: 'held' }, 9001 + i, allyN);
    if (f.child === 'freed' || f.child === 'wounded') ok++;
  }
  return ok / tries;
}

/** Hit the camp (on the raid's day): the fight, the wounds, what becomes of the child. Returns the card. */
function hitCamp(s: GameState, raid: RescueRaid): Outcome {
  const R = rescueOf(s);
  const c = R.captives.find(x => x.pid === raid.captive)!;
  const child = person(s, c.pid)!;
  const day = dayIndex(s.clock.t);
  const l = c.leads.filter(x => !x.far).pop()!;
  const r = mulberry32(s.seed * 6151 + day * 7 + 3);
  raid.resolved = true;
  const names = raid.team.map(id => person(s, id)?.first).filter(Boolean).join(', ');
  // a wrong lead, or they've moved on: nobody there
  if (!l.true || l.where !== c.where) {
    l.true = false; l.day = Math.min(l.day, day - LEAD_COLD - 1);   // that lead is dead now
    return { title: 'The camp was empty', text: `${names} crept up on ${l.where} before dawn. Cold ashes, tire tracks, ${child.kid ? 'a child\'s sock' : `${child.first}'s jacket`} in the mud. They're on their way home.`, tone: 'bad', lines: [voice(s, child, r, ['We were so close. We were so close.', `${child.first} was here. ${child.first} was HERE.`], ['They moved. We start again.', 'Next time we go the same day. The same hour.'])].filter(Boolean) };
  }
  const allyN = (raid.allies ?? []).reduce((a, x) => a + x.n, 0);
  const f = fightAtCamp(s, raid.team, c, s.seed * 389 + day * 11 + 5, allyN);
  const lines: string[] = [];
  lines.push(f.surprise ? 'They got to the edge of the firelight without a sound. Most of the camp was asleep.' : 'The dogs started up before they were halfway there. The camp came awake shooting.');
  lines.push(...applyCasualties(s, f.battle));
  peopleAfterFight(s, f.battle);
  let rounds = 0;
  for (const [cal, nn] of Object.entries(f.spent) as Array<[Caliber, number]>) { s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - nn); rounds += nn; }
  if (rounds) { lines.push(`${rounds} rounds fired.`); for (const g of s.armory.guns) if (raid.team.includes(g.carrier ?? '')) { g.fired += Math.round(rounds / raid.team.length); g.condition = Math.max(0, g.condition - 0.01); } }
  lines.push(...alliesAfter(s, raid, f, r));
  const [sh, him] = they(child);
  let title = '', text = '', tone: Outcome['tone'] = 'mixed';
  if (f.result === 'wiped' || f.result === 'routed') {
    // what's in the camp is theirs now; word gets round that this family comes for its own
    const canned = 4 + Math.floor(r() * 10), fuel = 1 + Math.floor(r() * 4);
    s.stock.canned += canned; s.stock.fuel += fuel;
    lines.push(`Brought back from the camp: ${canned} canned, ${fuel} fuel.`);
    s.gate.respect = Math.min(1, (s.gate.respect ?? 0) + 0.3);
    title = f.result === 'wiped' ? `${c.crew[0].toUpperCase() + c.crew.slice(1)} are finished` : `${c.crew[0].toUpperCase() + c.crew.slice(1)} broke and ran`;
  } else if (f.result === 'snatched') {
    title = 'Out without a shot';
  } else {
    title = 'Driven back';
    // the crew moves, and a savage one takes it out on the child
    c.where = pick(r, PLACES.filter(p => p !== c.where)); c.km = 4 + Math.round(r() * 30); c.dir = pick(r, DIRS);
    if (c.status === 'held' && c.temper === 'savage' && r() < 0.25) { c.status = 'dead'; c.statusDay = day; }
  }
  if (f.child === 'freed' || f.child === 'wounded') {
    raid.freed = true;
    if (f.child === 'wounded') { const ps = stateOf(s, c.pid); if (ps) ps.needs.hurt.push({ what: 'grazed by a round in the camp', sev: 35, trauma: true }); }
    text = f.result === 'snatched' ? `${names} cut through the back of a stock trailer while the camp slept and carried ${child.first} out into the dark. Nobody woke. They're bringing ${him} home.`
      : `${names} went in for ${child.first} and found ${him} tied in the back of a stock trailer${f.child === 'wounded' ? ', bleeding from a graze' : ''}. They're bringing ${him} home.`;
    lines.push(`${child.first}: "${pick(r, child.kid ? ['I knew you\'d come. I knew it. I knew it.', 'Is it really you? Is it really — ', 'Don\'t let go. Please don\'t let go.'] : ['You came. You actually came.', 'Get the others — there are others in the shed —', 'Go, go, before they wake up.'])}"`);
    lines.push(voice(s, child, r, ['I\'ve got you, baby. Don\'t look. Just hold on to me.', 'You\'re safe. You\'re safe now. We\'re going home.'], ['I\'ve got you, kiddo. Eyes on me. Don\'t look back there.', 'Hold on to my neck. We\'re going home.'], [`Lean on me. Can you walk? We're going home.`, `I'm here. I came. We're going home.`]));
    tone = 'good';
  } else if (f.child === 'killed') {
    text = `${child.first} was hit in the crossfire. ${sh[0].toUpperCase() + sh.slice(1)} died before they could get ${him} out.`;
    c.status = 'dead'; c.statusDay = day; c.known = 'dead'; c.closed = 'dead'; c.closedDay = day;
    const ps = stateOf(s, c.pid); if (ps) ps.needs.taken = false;
    for (const q of s.personState) if (q.needs.died == null) q.needs.morale = Math.max(0, q.needs.morale - 20);
    if (child.kin) chronicle(s, 'death', `${fullName(child)} was killed in the rescue at ${l.where}, aged ${child.age}.`);
    lines.push(voice(s, child, r, ['No. No no no. Give ' + him + ' to me. GIVE ME MY BABY.', 'We did this. We came and we did this.'], ['I carried ' + him + ' the whole way back. I couldn\'t leave ' + him + ' there.', 'It was us. It was our shooting. It was us.'], ['We came all that way. All that way.', 'I should have gone alone. Quieter. I should have —']));
    tone = 'bad';
  } else if (f.child === 'not_there') {
    // somebody in the camp knew: traded on, or the grave
    text = c.status === 'traded' ? `${child.first} wasn't there. One of them, bleeding out by the trucks, said they'd traded ${him} to a convoy going south two weeks back.` : `${child.first} wasn't there. Behind the camp there was a grave${child.kid ? ', small,' : ''} with a name scratched on a board.`;
    c.known = c.status === 'traded' ? 'traded' : 'dead';
    if (c.status === 'dead') {
      c.closed = 'dead'; c.closedDay = day;
      const ps = stateOf(s, c.pid); if (ps) ps.needs.taken = false;
      if (child.kin) chronicle(s, 'death', `${fullName(child)} died in captivity with ${c.crew}, aged ${child.age}.`);
    }
    tone = 'bad';
  } else {
    text = `They couldn't get to ${child.first}. They pulled back into the dark with what they could carry.`;
    tone = 'bad';
  }
  return { title, text, tone, lines: lines.filter(Boolean) };
}

/** What it cost the neighbors who sent men: their dead and wounded, and how they feel about you now. */
function alliesAfter(s: GameState, raid: RescueRaid, f: CampFight, r: () => number): string[] {
  const out: string[] = [];
  const went = (raid.allies ?? []).map(a => ({ a, n: s.neighbors.find(x => x.id === a.id) })).filter(x => x.n);
  if (!went.length) return out;
  const good = f.child === 'freed' || f.child === 'wounded' || f.result === 'wiped' || f.result === 'routed';
  let dead = f.allies.dead, hurt = f.allies.wounded;
  for (const { a, n } of went) {
    const N = n!.name[0].toUpperCase() + n!.name.slice(1);
    let loss = good ? 0 : 10;
    for (let k = 0; k < a.n; k++) {
      if (dead > 0) {
        dead--; loss += 25; n!.members = Math.max(0, n!.members - 1);
        out.push(`${pick(r, ALLY_FIRST)} from ${n!.name} was killed. ${N} will bury their own.`);
      } else if (hurt > 0) { hurt--; loss += 3; out.push(`${pick(r, ALLY_FIRST)} from ${n!.name} was hit; they carried him home.`); }
    }
    if (n!.members === 0) { n!.status = 'gone'; out.push(`There's nobody left at ${n!.name}' place.`); }
    n!.disposition = Math.max(-100, Math.min(100, n!.disposition + (good && loss === 0 ? 8 : -loss)));
  }
  if (!good) out.push('The neighbors\' men rode home without a word.');
  return out;
}

/** The ones who went come home (the freed child with them). */
function raidHome(s: GameState, raid: RescueRaid): void {
  const R = rescueOf(s);
  const c = R.captives.find(x => x.pid === raid.captive);
  R.raid = null;
  const back = raid.team.filter(id => stateOf(s, id)?.needs.died == null);
  for (const id of back) { const ps = stateOf(s, id); if (ps) { ps.task = 'idle'; ps.target = null; } }
  const names = back.map(id => person(s, id)?.first).filter(Boolean).join(', ');
  if (c && raid.freed && !c.closed) bringHome(s, c, raid.kind === 'trip' ? 'trip' : 'rescue');
  else if (names) log(s, `${names} ${back.length === 1 ? 'is' : 'are'} home from ${c?.crew ?? 'the raid'}.`);
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day
// ─────────────────────────────────────────────────────────────────────────

/** Once a day: what becomes of the taken, leads, word from the crews, the raid. Returns a card when something needs seeing. */
export function rescueDay(s: GameState): Outcome | null {
  const R = rescueOf(s);
  if (s.ending && !s.ending.continued) return null;
  const day = dayIndex(s.clock.t);
  // anyone taken without a record (an old save, a fight replayed): the crew that hit the place
  for (const [i, p] of s.people.entries()) {
    const n = s.personState[i]?.needs;
    if (!n?.taken || n.died == null) continue;
    const last = R.captives.filter(c => c.pid === p.id).pop();
    // (taken again after coming home: a new record)
    if (!last || (last.closed === 'home' && n.died >= (last.closedDay ?? 0))) recordTaken(s, p.id, 6, 'savage');
  }
  let card: Outcome | null = null;
  // the raid: the fight on its day, home the day after
  const raid = R.raid;
  if (raid && !raid.resolved && day >= raid.hitDay) card = raid.kind === 'trip' ? tripArrive(s, raid) : hitCamp(s, raid);
  else if (raid && raid.resolved && day >= raid.backDay) raidHome(s, raid);
  const someone = s.people.some(p => !p.kid && free(s, p) && !isAway(s, p.id));
  for (const c of R.captives) {
    if (c.closed) continue;
    fateDay(s, c, day);
    const r = mulberry32(s.seed * 4447 + day * 53 + hashId(c.pid) % 6007);
    farRumorDay(s, c, day, mulberry32(s.seed * 1931 + day * 61 + hashId(c.pid) % 5003));
    const since = day - c.day, trail = Math.exp(-since / 60);
    // leads: the radio (a ham rig and someone who can work it hear the most), the neighbors riding over
    const set = radioSet(s);
    const radioP = s.disaster.phase === 'impact' || s.disaster.phase === 'survival' ? (set === 'ham' ? 0.05 : set === 'shortwave' ? 0.025 : 0) : 0;
    const friends = s.neighbors.filter(n => n.status === 'home' && n.disposition > 20);
    if (since >= 1 && r() < radioP * trail) addLead(s, c, 'radio', r);
    else if (since >= 2 && friends.length && r() < 0.012 * Math.min(3, friends.length) * trail) {
      const nb = pick(r, friends);
      addLead(s, c, 'neighbor', r, nb.name[0].toUpperCase() + nb.name.slice(1));
    }
    // word from the crew: an answer to the family's word, or an offer of their own
    if (!someone || s.gate.pending || (raid && raid.captive === c.pid)) continue;
    const answer = c.offerDue != null && day >= c.offerDue;
    const offer = c.deals && c.status === 'held' && since >= 4 && (c.lastOffer == null || day - c.lastOffer >= 10) && r() < 0.035 * (c.temper === 'hard' ? 1.5 : 1) * Math.exp(-since / 50);
    if (answer && !c.deals) { c.offerDue = undefined; c.lastOffer = day; log(s, `No answer came from ${c.crew}.`); continue; }
    if (answer || offer) { s.gate.pending = ransomEncounter(s, c, r); log(s, `${s.gate.pending.title}.`); }
  }
  if (card) { s.gate.card = card; log(s, `${card.title}.`); }
  return card;
}
