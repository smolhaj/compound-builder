/**
 * People at the gate (GDS §4–5, decided with the user): named neighbor
 * households, arrivals asking to be taken in, and groups that come for what
 * you have. Combat is abstract: an encounter shows a dossier, the player
 * picks a stance (hide / parley / warn off / defend / trade), and the sim
 * resolves it from detection, deterrence, defense and people; the result is
 * a short vignette card.
 *
 * Visibility is a threat-type matrix: a fortress look deters opportunists
 * and draws organized groups; staying unseen avoids both but deters no one
 * who finds you. Gate choices move a humanity track the report card grades.
 *
 * The escape tunnel is never a way in (perimeter.canEnter): no outcome here
 * ever reaches the family through it. Pure and seeded.
 */
import { mulberry32, pick } from './rng';
import { forewarned } from './radio';
import { gearPosture } from './gear';
import { armed, firepower } from './armory';
import { applyBattle, planBattle } from './battle';
import { breakInDay, resolveBreakIn } from './breakins';
import type { Aftermath, Prisoner } from './aftermath';
import { isHome } from './blueprints';
import { log } from './economy';
import { isFinished } from './construction';
import { raidPressure } from './opsec';
import { PERIMETER, runFinished, runGrowth, wallLength } from './perimeter';
import { freshNeeds } from './needs';
import { contagion, infect } from './effects';
import { dayJob, type Person, type SkillId, SKILL_IDS } from './family';
import { dayIndex, type GameState } from './state';
import type { Stock } from './materials';
import type { Battle } from './battleTypes';

// ─────────────────────────────────────────────────────────────────────────
// Neighbors
// ─────────────────────────────────────────────────────────────────────────

export type NeighborKind = 'old_farmer' | 'young_family' | 'prepper' | 'widow' | 'ranch' | 'loner';
export interface Neighbor {
  id: string;
  name: string;
  kind: NeighborKind;
  /** −100 (feud) … 100 (allies). */
  disposition: number;
  members: number;
  /** Direction and road distance (km), for flavor and how fast help comes. */
  dir: 'north' | 'south' | 'east' | 'west';
  km: number;
  /** Ham radio / CB: on the neighborhood net (warnings, help). */
  radio: boolean;
  /** Their own skill: what they're good for in a trade or a pinch. */
  skill: SkillId;
  status: 'home' | 'left' | 'gone' | 'joined';
}

const NEIGHBOR_NAMES = ['Henderson', 'Kowalski', 'Bauer', 'Ortiz', 'Lindqvist', 'McAllister', 'Petersen', 'Running Horse', 'Delgado', 'Whitaker', 'Novak', 'Brennan'];
const NEIGHBOR_KINDS: Array<[NeighborKind, SkillId, number]> = [
  ['old_farmer', 'gardener', 40], ['young_family', 'teacher', 20], ['prepper', 'radio', 0], ['widow', 'medic', 30], ['ranch', 'hunter', 25], ['loner', 'mechanic', -10],
];
export const NEIGHBOR_BLURB: Record<NeighborKind, string> = {
  old_farmer: 'Farmed here fifty years. Knows the weather and the soil; slow to trust.',
  young_family: 'Moved out from the city two years ago. Willing, green, scared.',
  prepper: 'Has a radio mast and a locked gate. Will trade, won\'t share.',
  widow: 'A retired nurse living alone since her husband passed.',
  ranch: 'Cattle and hay on the bench. Good shots, good with stock.',
  loner: 'Keeps to himself up the draw. Fixes anything with an engine.',
};

/** 4–6 households round the place (user), deterministic per seed. */
export function generateNeighbors(seed: number): Neighbor[] {
  const r = mulberry32(seed * 6151 + 3);
  const n = 4 + Math.floor(r() * 3);
  const names = [...NEIGHBOR_NAMES].sort(() => r() - 0.5);
  const kinds = [...NEIGHBOR_KINDS].sort(() => r() - 0.5);
  const dirs = ['north', 'south', 'east', 'west'] as const;
  return Array.from({ length: n }, (_, i) => {
    const [kind, skill, base] = kinds[i % kinds.length];
    return {
      id: `n${i + 1}`, name: `the ${names[i]}s`, kind, skill,
      disposition: base + Math.round((r() - 0.5) * 30),
      members: kind === 'young_family' ? 4 : kind === 'widow' || kind === 'loner' ? 1 : 2 + Math.floor(r() * 3),
      dir: dirs[Math.floor(r() * 4)], km: Math.round((0.8 + r() * 4) * 10) / 10,
      radio: kind === 'prepper' || r() < 0.35,
      status: 'home' as const,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// How the place looks and holds
// ─────────────────────────────────────────────────────────────────────────

export interface Posture {
  /** 0–100: how much it shows (buildings, lights at night, the generator, smoke). */
  visibility: number;
  /** 0–100: walls and the look of a place that will fight. */
  fortress: number;
  /** 0–100: how well the line holds people out. */
  barrier: number;
  /** 0–100: how early they're seen (walls you can see over, dogs/alarms later, a watch). */
  detection: number;
  /** Fighting adults, and how well armed (guns with ammo, skill, condition: 0.6 bare hands … ~1.6 well armed and trained). */
  fighters: number;
  armed: boolean;
  firepower: number;
  /** A bunker to hide in. */
  bunker: boolean;
  /** A guard dog's bark (warns them off), a safe room to hide in. */
  deter?: number;
  safeRoom?: boolean;
}

export function postureOf(s: GameState): Posture {
  const fin = s.structures.filter(isFinished);
  const homes = fin.filter(st => isHome(st.kind));
  const lit = s.utilities.lit.some(id => homes.some(h => h.id === id));
  const surface = fin.filter(st => !st.kind.startsWith('bunker_')).length;
  const visibility = Math.min(100, 12 + surface * 5 + (lit ? 18 : 0) + (s.utilities.report.genKwh > 0.1 ? 15 : 0) + (homes.length ? 8 : 0));
  // the line: barrier runs weighted by how much they stop people, against a ring of ≈ 240 m
  let held = 0, look = 0;
  for (const r of s.perimeter) {
    const d = PERIMETER[r.kind];
    if (!runFinished(r) || d.blocks.people <= 0) continue;
    const g = runGrowth(r, s.clock.t), len = wallLength(r);
    held += len * d.blocks.people * g;
    look += len * (d.height > 0.35 ? 1 : 0.3) * g;
  }
  const barrier = Math.min(100, held / 40 * 100), fortress = Math.min(100, look / 40 * 100);
  const adults = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null);
  const fighters = adults.length + s.people.filter((p, i) => p.kid && p.age >= 15 && s.personState[i]?.needs.died == null).length * 0.5;
  const watch = Math.max(0, ...adults.map(p => p.skills.hunter));
  const radioNet = s.neighbors.some(n => n.radio && n.status === 'home' && n.disposition > 30);
  const gear = gearPosture(s, fighters);
  const detection = Math.min(100, 25 + watch * 5 + (radioNet ? 20 : 0) + (barrier > 50 ? 10 : 0) + gear.detection + forewarned(s));
  return { visibility: Math.min(100, visibility + gear.visibility), fortress, barrier: Math.min(100, barrier + gear.barrier), detection, fighters, deter: gear.deter, safeRoom: gear.safeRoom, armed: armed(s), firepower: firepower(s) * gear.fight, bunker: fin.some(st => st.kind === 'bunker_hatch' || st.kind === 'bunker_stairs') };
}

// ─────────────────────────────────────────────────────────────────────────
// Encounters
// ─────────────────────────────────────────────────────────────────────────

export type EncounterKind = 'arrival' | 'looters' | 'gang' | 'refugees' | 'requisition' | 'neighbor_help' | 'trader' | 'horde' | 'patrol' | 'militia' | 'break_in';
export type Stance = 'hide' | 'parley' | 'warn' | 'defend' | 'trade' | 'take_in' | 'trial' | 'turn_away' | 'call_911' | 'shout' | 'confront';

export interface Encounter {
  id: string;
  kind: EncounterKind;
  day: number;
  /** Who: a line for the dossier. */
  title: string;
  dossier: string[];
  size: number;
  armed: boolean;
  /** 0–100 how strong they are in a fight. */
  strength: number;
  /** Arrivals: who they are (taken in → join the family). */
  people?: Person[];
  /** What they bring (arrivals, traders) or want. */
  brings?: Partial<Stock>;
  wants?: Partial<Stock>;
  neighbor?: string;
  stances: Stance[];
}

export interface Outcome { title: string; text: string; tone: 'good' | 'mixed' | 'bad'; lines: string[] }

export interface GateState {
  /** Waiting for the player's stance (the game pauses). */
  pending: Encounter | null;
  /** The last result card (dismissed by the UI). */
  card: Outcome | null;
  /** Humanity: the family's sense of who they still are (0–100), and the tallies the report card reads. */
  humanity: number;
  tookIn: number;
  turnedAway: number;
  raidsHeld: number;
  raidsLost: number;
  /** Government after the collapse: help (aid, order back sooner) or hindrance (checkpoints, requisition). Rolled per run. */
  government: 'help' | 'hindrance';
  /** Day index of the last check, and the next encounter day. */
  day: number;
  next: number;
  history: Array<{ day: number; kind: EncounterKind; stance: Stance; tone: Outcome['tone'] }>;
  /** The last fight at the compound, for playback (optional; not migrated). */
  battle?: Battle;
  /** Raiders left wounded / dead on the drive after a fight the family won: a decision is waiting (sim/aftermath.ts). */
  aftermath?: Aftermath | null;
  /** Raiders held prisoner. */
  prisoners?: Prisoner[];
  /** Tallies: wounded raiders patched up and let go; executed. */
  mercy?: number;
  executed?: number;
  /** A prisoner told you how his crew comes in: they're spotted sooner. */
  forewarned?: boolean;
}

export function newGate(seed: number): GateState {
  const r = mulberry32(seed * 811 + 5);
  return { pending: null, card: null, humanity: 70, tookIn: 0, turnedAway: 0, raidsHeld: 0, raidsLost: 0, government: r() < 0.5 ? 'help' : 'hindrance', day: -1, next: -1, history: [], aftermath: null, prisoners: [] };
}

const FIRST = ['Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Jamie', 'Drew', 'Quinn', 'Avery', 'Rowan', 'Elena', 'Marcus', 'Dolores', 'Hector', 'Lena', 'Walt', 'Tomas', 'Bea'];
const LAST = ['Reyes', 'Holt', 'Vance', 'Okafor', 'Brandt', 'Sato', 'Larkin', 'Moreau', 'Pruitt', 'Szabo'];
const STORY = [
  ['Your cousin', 'drove up from the city on back roads; the car died at the county line.'],
  ['A family from town', 'walked out when the water stopped. The youngest has a fever.'],
  ['A couple', 'from the subdivision by the highway. Their house was broken into last night.'],
  ['A man alone', 'says he was a lineman for the co-op. Carries his own tools.'],
  ['A nurse and her son', 'left the county hospital when the generators ran dry.'],
  ['Two brothers', 'from a ranch to the south. Good shots; they want work and a roof.'],
];

function makeArrival(r: () => number, id: string, day: number, seed: number): Encounter {
  const [who, story] = pick(r, STORY);
  const n = who.startsWith('A man') ? 1 : who.startsWith('A couple') || who.startsWith('Two') || who.startsWith('A nurse') ? 2 : 3 + Math.floor(r() * 2);
  const last = pick(r, LAST);
  const people: Person[] = Array.from({ length: n }, (_, i) => {
    const kid = n > 2 && i >= 2;
    const skills = Object.fromEntries(SKILL_IDS.map(k => [k, Math.floor(r() * (kid ? 2 : 4))])) as Record<SkillId, number>;
    if (!kid) skills[pick(r, SKILL_IDS)] = 5 + Math.floor(r() * 4);
    if (story.includes('nurse') && i === 0) skills.medic = 8;
    if (story.includes('lineman') && i === 0) skills.mechanic = 8;
    if (story.includes('ranch')) skills.hunter = 6 + Math.floor(r() * 3);
    const body: 'f' | 'm' = story.includes('nurse') && i === 0 ? 'f' : r() < 0.5 ? 'f' : 'm';
    const p: Person = { id: `p${id}_${i}`, first: pick(r, FIRST), last, age: kid ? 5 + Math.floor(r() * 10) : 22 + Math.floor(r() * 40), kid, body, skills, shirt: Math.floor(r() * 0xffffff) & 0x7f7f7f };
    if (!kid) p.job = dayJob(p, seed);
    return p;
  });
  const best = people.filter(p => !p.kid).map(p => { const top = SKILL_IDS.reduce((a, b) => (p.skills[b] > p.skills[a] ? b : a)); return `${p.first} (${top} ${p.skills[top]})`; });
  return {
    id, kind: 'arrival', day, title: `${who} at the gate`,
    dossier: [story, `${n} ${n === 1 ? 'person' : 'people'}${people.some(p => p.kid) ? `, ${people.filter(p => p.kid).length} kids` : ''}.`, `Good at: ${best.join(', ') || 'not much yet'}.`, `${n} more to feed: about ${n * 2200} kcal a day.`],
    size: n, armed: false, strength: 0, people, brings: r() < 0.5 ? { canned: 1 + Math.floor(r() * 3) } : {},
    stances: ['take_in', 'trial', 'trade', 'turn_away'],
  };
}

/** How often someone comes (days between), from law and order outside and how much the place shows. */
function cadence(s: GameState, p: Posture): number {
  const law = s.disaster.tracks.law;
  // playtest: every 3–6 days was relentless; real accounts are weeks between visits, more as order fails
  const base = 45 - 30 * (1 - law);
  return Math.max(10, base * (1.3 - p.visibility / 200) / raidPressure(s));
}

/**
 * The threat matrix: who comes. Opportunists (looters) are put off by a
 * fortress look; organized groups (gangs, requisition) are drawn by it and by
 * visibility. Desperate refugees come to anyone they can see.
 */
export function whoComes(s: GameState, p: Posture, r: () => number): EncounterKind {
  const law = s.disaster.tracks.law;
  const w: Array<[EncounterKind, number]> = [
    ['arrival', 30],
    ['refugees', 12 * (p.visibility / 50)],
    ['looters', 30 * (1 - law) * (1 - p.fortress / 130)],
    ['gang', 18 * (1 - law) * (0.3 + p.fortress / 100 + p.visibility / 150)],
    ['requisition', s.gate.government === 'hindrance' ? 10 * (0.5 + p.visibility / 100) : 0],
    ['trader', 10],
    ['neighbor_help', s.gate.government === 'help' ? 8 : 4],
  ];
  // each disaster has its own crowd at the gate
  const k = s.disaster.kind, scale = (kind: EncounterKind, f: number) => { for (const e of w) if (e[0] === kind) e[1] *= f; };
  if (k === 'zombies') { w.push(['horde', 60 * (0.5 + p.visibility / 100)]); scale('trader', 0.2); scale('refugees', 0.5); scale('requisition', 0); }
  if (k === 'invasion') { w.push(['patrol', 40 * (0.5 + p.visibility / 100)]); scale('requisition', 0); scale('trader', 0.3); }
  if (k === 'civil_war') { w.push(['militia', 35 * (0.4 + p.fortress / 100 + p.visibility / 150)]); }
  if (k === 'pandemic' || k === 'bioweapon') { scale('arrival', 1.4); scale('refugees', 1.5); scale('trader', 0.5); }
  if (k === 'drought') { scale('refugees', 1.6); scale('looters', 1.3); }
  if (k === 'unknown') { scale('arrival', 0.4); scale('looters', 0.3); scale('gang', 0.3); scale('trader', 0.1); }
  // OPSEC: the more the county knows, the more of them come for what you have
  const rp = raidPressure(s);
  for (const kind of ['looters', 'gang', 'requisition', 'horde', 'militia'] as EncounterKind[]) scale(kind, rp);
  const tot = w.reduce((a, [, x]) => a + Math.max(0, x), 0);
  let x = r() * tot;
  for (const [k, v] of w) { x -= Math.max(0, v); if (x <= 0) return k; }
  return 'arrival';
}

function makeThreat(kind: EncounterKind, r: () => number, id: string, day: number, s: GameState): Encounter {
  switch (kind) {
    case 'looters': {
      const size = 2 + Math.floor(r() * 4);
      return { id, kind, day, title: 'Looters on the county road', dossier: [`${size} men in a pickup, slowing at your drive.`, 'Opportunists: they want easy food and fuel, not a fight.'], size, armed: r() < 0.6, strength: size * 9, wants: { canned: 3, fuel: 2 }, stances: ['hide', 'warn', 'defend', 'parley'] };
    }
    case 'gang': {
      const size = 5 + Math.floor(r() * 8);
      return { id, kind, day, title: 'An armed crew', dossier: [`${size} of them, organized, rifles. They've been working the farms east of town.`, 'They know what they want, and they think you have it.'], size, armed: true, strength: size * 12, wants: { canned: 8, staples: 1, fuel: 4, meds: 1 }, stances: ['hide', 'parley', 'defend', 'trade'] };
    }
    case 'refugees': {
      const size = 6 + Math.floor(r() * 10);
      return { id, kind, day, title: 'A column of refugees', dossier: [`${size} people walking out of the city, families, a few carts.`, 'Hungry and desperate. Most just want water and to keep moving.'], size, armed: r() < 0.2, strength: size * 3, wants: { canned: 2 }, stances: ['hide', 'parley', 'trade', 'warn'] };
    }
    case 'requisition': {
      return { id, kind, day, title: 'A county requisition team', dossier: ['A deputy and four National Guard in a Humvee, with a clipboard.', 'Emergency order: fuel, food and medical supplies "for the common good". They say they\'ll be back.'], size: 5, armed: true, strength: 70, wants: { fuel: 4, canned: 6, meds: 2 }, stances: ['hide', 'parley', 'trade', 'defend'] };
    }
    case 'trader': {
      const brings: Partial<Stock> = pick(r, [{ meds: 2 }, { fuel: 4 }, { staples: 1 }, { hardware: 2 }]);
      const wants: Partial<Stock> = pick(r, [{ canned: 4 }, { firewood: 3 }, { fresh: 10 }, { lumber: 3 }]);
      return { id, kind, day, title: 'A trader with a loaded truck', dossier: ['An old man with a stock trailer full of odds and ends.', `Offers ${Object.entries(brings).map(([k, n]) => `${n} ${k}`).join(', ')} for ${Object.entries(wants).map(([k, n]) => `${n} ${k}`).join(', ')}.`], size: 1, armed: true, strength: 10, brings, wants, stances: ['trade', 'turn_away'] };
    }
    case 'neighbor_help': {
      const n = s.neighbors.filter(x => x.status === 'home').sort((a, b) => b.disposition - a.disposition)[0];
      const name = n?.name ?? 'a neighbor';
      return { id, kind, day, title: `${name[0].toUpperCase()}${name.slice(1)} come by`, dossier: [n ? NEIGHBOR_BLURB[n.kind] : '', 'They\'re sharing what they\'ve heard on the radio and asking how you\'re fixed. A chance to swap news, food or a hand.'], size: n?.members ?? 2, armed: false, strength: 0, neighbor: n?.id, brings: { fresh: 5 }, wants: { canned: 1 }, stances: ['trade', 'parley', 'turn_away'] };
    }
    case 'horde': {
      const size = 15 + Math.floor(r() * 40);
      return { id, kind, day, title: 'A herd of the dead', dossier: [`${size} of them shambling up the county road, drawn by ${s.utilities.report.genKwh > 0.1 ? 'the generator' : 'something'}.`, "They don't talk and they don't stop. Noise and light pull them in; walls hold them; the bunker hides you."], size, armed: false, strength: Math.round(size * 2.2), wants: { fresh: 5, frozen: 2 }, stances: ['hide', 'defend', 'warn'] };
    }
    case 'patrol': {
      return { id, kind, day, title: 'An occupation patrol', dossier: ['Six soldiers and an armored car. They check papers, count heads, take what they like.', 'Resisting brings the rest of them back.'], size: 6, armed: true, strength: 95, wants: { fuel: 4, canned: 6, meds: 1 }, stances: ['hide', 'parley', 'trade', 'defend'] };
    }
    case 'militia': {
      const size = 6 + Math.floor(r() * 8);
      return { id, kind, day, title: 'Militia at the gate', dossier: [`${size} armed men from the Plains Alliance, a recruiter with a list.`, 'They want food, fuel, and a fighting-age man or woman for the line.'], size, armed: true, strength: size * 11, wants: { canned: 5, fuel: 3 }, stances: ['parley', 'trade', 'hide', 'defend'] };
    }
    default: return makeArrival(r, id, day, s.seed);
  }
}

/** Once a day after the hit: maybe someone comes. Returns the encounter set as pending (the UI pauses), or null. */
export function gateDay(s: GameState): Encounter | null {
  const day = dayIndex(s.clock.t);
  const g = s.gate;
  if (day === g.day) return null;
  g.day = day;
  if (g.pending) return null;
  const d = s.disaster;
  // while the law works (before the collapse, or once it's back): now and then a break-in (sim/breakins.ts)
  if (d.tracks.law >= 0.5) { const b = breakInDay(s, day); if (b) { g.pending = b; return b; } }
  if (!d.kind || s.clock.t < d.hitAt + 1) return null;
  // fallout keeps everyone indoors for the first two weeks of a nuclear war
  if (d.kind === 'nuclear' && s.clock.t < d.hitAt + 14) return null;
  const r = mulberry32(s.seed * 7907 + day * 31);
  const p = postureOf(s);
  if (g.next < 0) g.next = day + Math.round(cadence(s, p) * (0.4 + 0.6 * r()));
  if (day < g.next) return null;
  g.next = day + Math.round(cadence(s, p) * (0.6 + 0.8 * r()));
  const kind = whoComes(s, p, r);
  const e = makeThreat(kind, r, `e${s.nextId++}`, day, s);
  if (s.disaster.difficulty === 'hardcore' && e.strength) e.strength = Math.round(e.strength * 1.35);
  if (s.disaster.difficulty === 'cozy' && e.strength) e.strength = Math.round(e.strength * 0.6);
  g.pending = e;
  return e;
}

// ─────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────

const take = (s: GameState, what: Partial<Stock>, share = 1): string[] => {
  const out: string[] = [];
  for (const [k, n] of Object.entries(what) as Array<[keyof Stock, number]>) {
    const t = Math.min(s.stock[k], Math.ceil(n * share));
    if (t > 0) { s.stock[k] -= t; out.push(`${t} ${k}`); }
  }
  return out;
};
const give = (s: GameState, what: Partial<Stock>) => { for (const [k, n] of Object.entries(what) as Array<[keyof Stock, number]>) s.stock[k] += n; };
const hasAllOf = (s: GameState, what: Partial<Stock>) => (Object.entries(what) as Array<[keyof Stock, number]>).every(([k, n]) => s.stock[k] >= n);

/** Someone of the family gets hurt (adults first); maybe dies on a bad day (never on Cozy). */
function wound(s: GameState, r: () => number, sev: number, what: string): string {
  const idx = s.people.map((_, i) => i).filter(i => !s.people[i].kid && s.personState[i]?.needs.died == null);
  if (!idx.length) return '';
  const i = idx[Math.floor(r() * idx.length)];
  const n = s.personState[i].needs;
  n.hurt.push({ what, sev });
  n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 0, n.health - sev * 0.5);
  if (n.health <= 0) { n.died = Math.floor(s.clock.t); return `${s.people[i].first} was killed.`; }
  return `${s.people[i].first}: ${what}.`;
}

/** The family's fighting strength against a group (0–100+). */
export function defenseOf(p: Posture): number {
  return p.barrier * 0.45 + p.fighters * 9 * (p.firepower ?? (p.armed ? 1.4 : 1)) + p.detection * 0.15;
}

/** Apply the player's stance. Returns the vignette card. */
export function resolve(s: GameState, stance: Stance): Outcome {
  const e = s.gate.pending;
  if (!e) return { title: '', text: '', tone: 'mixed', lines: [] };
  const r = mulberry32(s.seed * 92821 + e.day * 7 + stance.length);
  const p = postureOf(s);
  const g = s.gate;
  const negotiator = Math.max(0, ...s.people.filter((x, i) => !x.kid && s.personState[i]?.needs.died == null).map(x => x.skills.negotiator));
  const lines: string[] = [];
  let title = '', text = '', tone: Outcome['tone'] = 'mixed';
  if (e.kind === 'break_in') {
    const o = resolveBreakIn(s, e, stance);
    title = o.title; text = o.text; tone = o.tone; lines.push(...o.lines);
  } else if (e.kind === 'arrival') {
    if (stance === 'take_in' || stance === 'trial') {
      for (const person of e.people ?? []) { s.people.push(person); s.personState.push({ id: person.id, task: 'idle', target: null, needs: freshNeeds() }); }
      give(s, e.brings ?? {});
      g.tookIn += e.size; g.humanity = Math.min(100, g.humanity + 6);
      title = stance === 'take_in' ? 'They\'re family now' : 'On trial';
      text = stance === 'take_in' ? `You open the gate. ${e.size} more at the table tonight.` : `They can stay a month and work for their keep. Then you'll see.`;
      tone = 'good';
    } else if (stance === 'trade') {
      give(s, e.brings ?? {});
      title = 'A meal and the road'; text = 'You trade a hot meal and a jug of water for what they carry, and point them north.'; tone = 'mixed';
      g.humanity = Math.max(0, g.humanity - 1);
    } else {
      g.turnedAway += e.size; g.humanity = Math.max(0, g.humanity - 8);
      title = 'The gate stays shut'; text = 'You watch them walk on until they\'re out of sight. Nobody says much at supper.'; tone = 'bad';
    }
  } else if (e.kind === 'trader' || e.kind === 'neighbor_help') {
    if (stance === 'trade' && e.wants && hasAllOf(s, e.wants)) {
      lines.push(`Gave: ${take(s, e.wants).join(', ')}`); give(s, e.brings ?? {}); lines.push(`Got: ${Object.entries(e.brings ?? {}).map(([k, n]) => `${n} ${k}`).join(', ')}`);
      title = 'A fair trade'; text = 'Handshakes at the gate.'; tone = 'good';
      if (e.neighbor) { const n = s.neighbors.find(x => x.id === e.neighbor); if (n) n.disposition = Math.min(100, n.disposition + 10); }
    } else if (stance === 'parley') {
      title = 'News over the fence'; text = 'An hour of talk: who\'s left, who\'s gone, where the trouble is.'; tone = 'good';
      if (e.neighbor) { const n = s.neighbors.find(x => x.id === e.neighbor); if (n) n.disposition = Math.min(100, n.disposition + 6); }
    } else {
      title = 'Not today'; text = stance === 'trade' ? 'You don\'t have what they want.' : 'You wave them off.'; tone = 'mixed';
      if (e.neighbor) { const n = s.neighbors.find(x => x.id === e.neighbor); if (n) n.disposition = Math.max(-100, n.disposition - 8); }
    }
  } else {
    // a threat: looters, a gang, refugees, a requisition team
    // allies on the radio net ride over to help when there's shooting
    const allies = s.neighbors.filter(n => n.status === 'home' && n.radio && n.disposition > 50);
    const help = allies.reduce((a, n) => a + n.members * 6, 0);
    if (stance === 'hide') {
      // everyone underground (or in the timber); they take what's lying about. Nobody gets in by the tunnel: it only opens from inside.
      const found = r() * 100 < p.visibility * 0.6;
      if (!found) { title = 'They never knew'; text = p.bunker ? 'Lights out, everyone down the hatch. Boots on the porch, voices, then the truck pulls away.' : 'Everyone into the timber, flat in the deadfall. Boots on the porch, voices, then the truck pulls away.'; tone = 'good'; }
      else {
        const lost = take(s, e.wants ?? {}, p.bunker ? 1 : 1.5);
        title = 'They took what they found'; text = p.bunker ? 'From the bunker you hear them go through the house and the shop.' : 'From the trees you watch them load your stores into the truck.'; tone = 'bad';
        if (lost.length) lines.push(`Lost: ${lost.join(', ')}`);
        if (!p.bunker && !p.safeRoom && r() < 0.3) lines.push(wound(s, r, 30, 'hurt running for the timber'));
        if (!p.bunker && p.safeRoom) lines.push('Everyone sat it out behind the safe-room door.');
      }
    } else if (stance === 'parley' || stance === 'trade') {
      const calm = r() * 100 < 35 + negotiator * 7 + (e.kind === 'refugees' ? 30 : 0) + (e.kind === 'requisition' ? 15 : 0) - (e.kind === 'gang' ? 15 : 0);
      if (calm) {
        const paid = take(s, e.wants ?? {}, stance === 'trade' ? 0.5 : 0.3);
        title = 'Talked down'; text = `${negotiator >= 5 ? 'A good talker at the gate. ' : ''}They leave with something, and nobody fired a shot.`; tone = 'mixed';
        if (paid.length) lines.push(`Paid: ${paid.join(', ')}`);
        if (e.kind === 'refugees') g.humanity = Math.min(100, g.humanity + 4);
      } else {
        stance = 'defend';
        lines.push('Talks broke down.');
      }
    }
    if (stance === 'warn') {
      const deterred = r() * 100 < p.fortress * 0.6 + (p.deter ?? 0) + (p.armed ? 15 : -10) + (e.armed ? 0 : 25) + (e.kind === 'looters' ? 20 : 0) - (e.kind === 'gang' ? 25 : 0);
      if (deterred) { title = 'They thought better of it'; text = 'A shot over the truck and the walls behind it. They turn around in the road.'; tone = 'good'; if (e.kind === 'refugees') g.humanity = Math.max(0, g.humanity - 5); }
      else stance = 'defend';
    }
    if (stance === 'defend') {
      // the fight itself, second by second (sim/battle.ts); the world can play it back from g.battle
      const b = planBattle(s, Math.max(1, e.size - Math.floor(help / 12)), s.seed * 131 + e.day * 7 + 1, { armed: e.armed });
      g.battle = b;
      lines.push(...applyBattle(s, b));
      if (b.result === 'repelled' || b.result === 'fled') {
        title = 'The line held'; text = `${help ? `${allies.map(a => a.name).join(' and ')} came over the ridge when they heard the shooting. ` : ''}${b.result === 'fled' ? 'They broke off and ran.' : 'None of them got past the line.'}`; tone = 'good';
        for (const n of allies) n.disposition = Math.min(100, n.disposition + 5);
      } else {
        const lost = take(s, e.wants ?? {}, 1);
        title = 'They got in'; text = b.result === 'overrun' ? 'They overran the place and took what they came for.' : 'They broke through the line and took what they came for.'; tone = 'bad';
        if (lost.length) lines.push(`Lost: ${lost.join(', ')}`);
      }
      if (e.kind === 'refugees') g.humanity = Math.max(0, g.humanity - 10);
    }
  }
  // a sickness abroad: anyone you let close may bring it in
  const c = contagion(s);
  const close = (e.kind === 'arrival' && stance !== 'turn_away') || ((stance === 'trade' || stance === 'parley') && e.kind !== 'horde');
  if (c.contact > 0 && close && r() < c.contact) { const l = infect(s, r, e.kind === 'arrival' ? 'they brought it in' : 'from the trade at the gate'); if (l) lines.push(l); }
  g.history.push({ day: e.day, kind: e.kind, stance, tone });
  g.pending = null;
  const out: Outcome = { title, text, tone, lines: lines.filter(Boolean) };
  g.card = out;
  log(s, `${e.title}: ${title}.`);
  return out;
}

/** Warning-phase gossip from the neighbors (a line for the ticker/log), sometimes. */
export function neighborGossip(s: GameState, r: () => number): string | null {
  const home = s.neighbors.filter(n => n.status === 'home');
  if (!home.length || r() > 0.15) return null;
  const n = pick(r, home);
  const N = n.name[0].toUpperCase() + n.name.slice(1);
  return pick(r, [
    `${N} are buying feed and fuel by the pickup load.`,
    `${N} say their cousin in the city can't get cash out of the bank.`,
    `${N} have been digging something behind their barn.`,
    `${N} are talking about going to family in Idaho.`,
    `${N} asked if you'd heard anything on the radio.`,
  ]);
}
