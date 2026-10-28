/**
 * Daily life (decided with the user: "able bodied people inside the compound
 * should have assignments/tasks they do at different times of the day. a
 * schedule players can set or automate … chores to upkeep the compound").
 * Pure; the engine calls it every quarter-hour sub-step and once a day.
 *
 *  Day plan   every person has 24 hour slots, each one a duty (sleep, meals,
 *             school, the garden, wood, watch…). The player paints the roster
 *             or leaves it on Auto: the planner fills it each dawn from
 *             skills, the season, what the place has and the threat.
 *  Chores     the place falls behind without them: weeds in the garden, the
 *             harvest left standing, hungry hens, dirty filters, sagging
 *             fences, unsplit rounds, a dirty kitchen, laundry, gear. Each
 *             chore has a backlog 0 (kept up) … 100 (badly behind) that grows
 *             by the day and comes down with person-hours on its duty.
 *  Fatigue    0–100: long days and night watch tire people, sleep brings it
 *             back. A tired person works slower and a tired guard sees less.
 *  Watch      who is on watch right now (`watchNow`): helps detection at the
 *             gate (`watchDetection`, read by encounters.ts / battle.ts) and
 *             the atmosphere layer's flashlights.
 */
import { dogCount } from './pets';
import { calendarOf, dayIndex, hourOf, type GameState, type PersonState, type TaskKind } from './state';
import { isFinished } from './construction';
import { hasWalkway } from './walkway';
import { isHome } from './blueprints';
import { gardenSeason, selfSufficiencyRates } from './greenhouse';
import { REGIONS, seasons } from './regions';
import { greenRicks } from './upkeep';
import { routineAt } from './schedule';
import { raidPressure } from './opsec';
import { logGate } from './nag';
import type { Person } from './family';

// ─────────────────────────────────────────────────────────────────────────
// Duties
// ─────────────────────────────────────────────────────────────────────────

export type Duty =
  | 'sleep' | 'meal' | 'leisure' | 'school'
  | 'build' | 'garden' | 'fields' | 'livestock' | 'pets' | 'wood' | 'water' | 'kitchen' | 'cleaning' | 'laundry' | 'repairs'
  | 'hunt' | 'medic' | 'teach' | 'radio' | 'watch';

export interface DutyDef {
  name: string;
  /** One or two letters for the roster grid. */
  short: string;
  color: string;
  /** Counts toward the working day (the planner caps it). */
  work: boolean;
  /** Fatigue an hour. */
  tire: number;
  /** A kid (8+) may be given it. */
  kid: boolean;
  hint: string;
}

export const DUTY: Record<Duty, DutyDef> = {
  sleep: { name: 'Sleep', short: 'z', color: '#2b3448', work: false, tire: -8, kid: true, hint: 'In bed: fatigue comes down.' },
  meal: { name: 'Meal', short: 'M', color: '#8a6a3a', work: false, tire: -1, kid: true, hint: 'Eating together at the table.' },
  leisure: { name: 'Free time', short: '·', color: '#3e4a3a', work: false, tire: -1.5, kid: true, hint: 'Rest, the porch, games, the fire.' },
  school: { name: 'School', short: 'S', color: '#4a6aa0', work: false, tire: 1, kid: true, hint: 'Kids at the table with their books.' },
  build: { name: 'Projects', short: 'B', color: '#a0703a', work: true, tire: 5.5, kid: true, hint: 'Construction, fences, fittings, felling: the projects already staked out.' },
  garden: { name: 'Garden', short: 'G', color: '#5a9a48', work: true, tire: 4, kid: true, hint: 'Weeding, watering and picking the kitchen garden; venting and tending the greenhouses; pruning and picking the orchard.' },
  fields: { name: 'Fields', short: 'F', color: '#b8a040', work: true, tire: 6, kid: false, hint: 'Hoeing and, in the fall, getting the harvest in.' },
  livestock: { name: 'Livestock', short: 'L', color: '#c08a5a', work: true, tire: 3, kid: true, hint: 'Feed and water the animals, collect the eggs, milk; feed the fish and clear the pond screens.' },
  pets: { name: 'Pet care', short: 'P', color: '#b0784a', work: true, tire: 2.5, kid: true, hint: 'Feeding and watering the dogs, a walk, the vet.' },
  wood: { name: 'Wood', short: 'W', color: '#7a5030', work: true, tire: 6, kid: false, hint: 'Felling marked trees, splitting and stacking the rounds.' },
  water: { name: 'Water', short: 'H', color: '#4a90b0', work: true, tire: 4.5, kid: true, hint: 'Hauling water, cleaning the filters.' },
  kitchen: { name: 'Cooking', short: 'K', color: '#c06a4a', work: true, tire: 3, kid: true, hint: 'Cooking the meals, canning and putting food by.' },
  cleaning: { name: 'Cleaning', short: 'C', color: '#6aa0a0', work: true, tire: 3, kid: true, hint: 'Sweeping, scrubbing, the dishes and the latrine: keeping the house clean.' },
  laundry: { name: 'Laundry', short: 'Ld', color: '#9aa8c0', work: true, tire: 3.5, kid: true, hint: 'Washing by hand and hanging it on the line.' },
  repairs: { name: 'Repairs', short: 'R', color: '#8a8a7a', work: true, tire: 4.5, kid: false, hint: 'Fences, roofs, the generator, cleaning the guns.' },
  hunt: { name: 'Hunt & fish', short: 'Hu', color: '#6a7a3a', work: true, tire: 4.5, kid: false, hint: 'Hunting, fishing, running the trap line.' },
  medic: { name: 'Medic', short: '+', color: '#c04a5a', work: true, tire: 3, kid: false, hint: 'Tending the sick and the wounded.' },
  teach: { name: 'Teaching', short: 'T', color: '#6a8ac8', work: true, tire: 2.5, kid: false, hint: 'Teaching the kids.' },
  radio: { name: 'Radio', short: 'Ra', color: '#7a6aa8', work: true, tire: 1.5, kid: false, hint: 'Listening on the radio for news and the net.' },
  watch: { name: 'Watch', short: '!', color: '#c8a030', work: true, tire: 4, kid: false, hint: 'On watch: the tower, the wall (or its walkway, if there is one), the gate. Helps see trouble coming.' },
};
export const DUTIES = Object.keys(DUTY) as Duty[];

/** Duties that are an adult's job (a teen 15+ can stand watch). */
export function canDo(p: Person, d: Duty): boolean {
  if (!p.kid) return d !== 'school';
  if (p.age < 5) return d === 'sleep' || d === 'meal' || d === 'leisure';
  if (d === 'watch') return p.age >= 15;
  return DUTY[d].kid || p.age >= 14;
}

// ─────────────────────────────────────────────────────────────────────────
// Chores
// ─────────────────────────────────────────────────────────────────────────

export type ChoreId = 'weeds' | 'harvest' | 'animals' | 'pets' | 'hauling' | 'filters' | 'woodpile' | 'kitchen' | 'house' | 'laundry' | 'fences' | 'gear' | 'orchard' | 'greenhouse' | 'pond';
export const CHORES: readonly ChoreId[] = ['weeds', 'harvest', 'animals', 'pets', 'hauling', 'filters', 'woodpile', 'kitchen', 'house', 'laundry', 'fences', 'gear', 'orchard', 'greenhouse', 'pond'];

export const CHORE_NAME: Record<ChoreId, string> = {
  weeds: 'Garden weeding', harvest: 'Harvest in the fields', animals: 'Feeding the animals', pets: 'Caring for the dogs', hauling: 'Hauling water', filters: 'Water filters',
  woodpile: 'Splitting and stacking', kitchen: 'Cooking and washing up', house: 'Cleaning the house', laundry: 'Laundry', fences: 'Fences and roofs', gear: 'Guns, tools, the generator', orchard: 'Pruning and picking the orchard', greenhouse: 'Tending the greenhouses', pond: 'Feeding the fish',
};
/** What happens when it falls behind (the UI's tooltip). */
export const CHORE_WHY: Record<ChoreId, string> = {
  weeds: 'Weeds choke the beds: the garden yields less.',
  harvest: 'The crop stands in the field and spoils: less of it comes in.',
  animals: 'The hens go off lay and the animals suffer: fewer eggs, lower morale.',
  pets: 'Hungry, unwalked dogs are a poor alarm and a sad sight: their warning and deterrence slip, and the kids mind.',
  hauling: 'Short of washing water: morale drops.',
  filters: 'A fouled filter lets bugs through: stomach sickness.',
  woodpile: 'Unsplit rounds dry slowly: firewood seasons at half speed.',
  kitchen: 'A dirty kitchen: food poisoning.',
  house: 'Dust, dishes and a stinking latrine: morale drops and sickness spreads.',
  laundry: 'Dirty clothes and bedding: morale and hygiene drop.',
  fences: 'Fences sag and gaps open: the line holds people out less well.',
  gear: 'Guns foul and rust, tools dull: less firepower at the gate.',
  orchard: 'Unpruned trees bear less and the pests get in; fruit left on the tree drops and rots.',
  greenhouse: 'Unvented, unwatered benches scorch and stall: the greenhouses grow less.',
  pond: 'Fish go unfed and the screens clog: they grow slowly and the pond sours.',
};
/** Which duty works which chores (first one that needs it). */
export const DUTY_CHORES: Partial<Record<Duty, ChoreId[]>> = {
  garden: ['weeds', 'greenhouse', 'orchard'], fields: ['harvest', 'weeds', 'orchard'], livestock: ['animals', 'pond'], pets: ['pets'], water: ['hauling', 'filters'], wood: ['woodpile'],
  kitchen: ['kitchen'], cleaning: ['house'], laundry: ['laundry'], repairs: ['fences', 'gear'],
};
/** Person-hours to clear a full backlog (100). */
export const CLEAR_HOURS: Record<ChoreId, number> = { weeds: 10, harvest: 8, animals: 2, pets: 2.5, hauling: 3, filters: 2, woodpile: 8, kitchen: 3, house: 4, laundry: 5, fences: 10, gear: 6, orchard: 12, greenhouse: 6, pond: 3 };

export interface ChoreState { levels: Record<ChoreId, number> }

/**
 * Harvest backlog growth a day per field, only inside the harvest window. Sixteen fields at this rate need
 * about ten person-hours a day to hold the line (CLEAR_HOURS.harvest), which two adults on Auto can find;
 * the old flat 22 needed 28 and pinned the backlog at its cap all season.
 */
export const HARVEST_RATE = 7;

/** Backlog growth a day, given the place (0 = the chore doesn't apply). */
export function choreRates(s: GameState): Record<ChoreId, number> {
  const fin = s.structures.filter(isFinished);
  const count = (k: string) => fin.filter(st => st.kind === k).length;
  const doy = calendarOf(s.clock).doy;
  const [g0, g1] = gardenSeason(s), H = seasons(REGIONS[s.site.region]).harvest;
  const heads = Math.max(1, s.personState.filter(ps => ps.needs.died == null).length);
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const animals = count('chicken_coop') + (n('goat') + n('pig') + n('steer') + n('rabbit') + n('sheep')) / 4;
  const filters = n('water_filter') + n('ro_system') + count('filtration_shed');
  const runs = s.perimeter.filter(r => r.finishedAt !== null).length;
  // without power, the wash is done by hand (half again as long)
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  return {
    weeds: doy >= g0 && doy <= g1 ? 9 * count('garden') : 0,
    harvest: doy >= H[0] && doy < H[1] ? HARVEST_RATE * count('field') : 0,
    animals: animals > 0 ? 50 * Math.min(4, animals) : 0,
    pets: petDogs(s) > 0 ? Math.min(100, 40 * petDogs(s)) : 0,
    hauling: s.utilities.hauling ? (s.utilities.haulFar ? 60 : 35) : 0,
    filters: filters > 0 ? 4 : 0,
    woodpile: greenRicks(s) > 0.2 ? 8 : 0,
    kitchen: 30 * heads / 4,
    house: 14 * heads / 4,
    laundry: 14 * heads / 4 * (powered ? 0.6 : 1),
    fences: runs > 0 ? 1.6 + 0.2 * Math.min(10, runs) : 0,
    gear: s.armory.guns.length > 0 || n('generator') > 0 ? 3 : 0,
    ...selfSufficiencyRates(s, doy),
  };
}

/**
 * How many dogs need looking after.
 *
 * The named dogs (sim/pets.ts). The pets chore backlog here is the roster's
 * view of their care; pets.ts does the feeding, bonding and grief, and hands
 * out its own care hours (`careHours`, `assignCare(s, { capacity })`).
 */
export const petDogs = (s: GameState): number => dogCount(s);

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type TemplateId = 'auto' | 'homestead' | 'harvest' | 'lockdown' | 'rest';
export const TEMPLATE_NAME: Record<TemplateId, string> = {
  auto: 'Auto (planner)', homestead: 'Homestead day', harvest: 'Harvest crunch', lockdown: 'Lockdown: watch first', rest: 'Rest day',
};

export interface DayPlan {
  /** The planner refills the roster every dawn (people in `locked` keep the player's hours). */
  auto: boolean;
  /** Person id → 24 duties (index = hour of day). */
  hours: Record<string, Duty[]>;
  /** People whose row the player painted (the planner leaves them be). */
  locked: string[];
  /** Day index the planner last ran, and the threat it planned for. */
  day: number;
  threat: number;
  /** Standing assignments: a person who is always put on this duty first (the player's override; the planner does the rest). */
  focus?: Record<string, Duty>;
  /** Consecutive night watches per person (the planner rotates so nobody goes more than two nights running). */
  nights?: Record<string, number>;
  /** Why the planner gave someone an odd day ("Night watch 02:00 to 06:00", "Resting: too unwell"). */
  notes?: Record<string, string>;
}

/** Person-hours put into the duties that have an effect of their own, today and yesterday (rolled over each dawn), and who was out hunting at dusk. */
export interface Tally { today: Partial<Record<Duty, number>>; yesterday: Partial<Record<Duty, number>>; dusk: string[] }

export interface Daily {
  plan: DayPlan; chores: ChoreState;
  /** Gatherings (sim/gatherings.ts). */ social: import('./gatherings').Social;
  /** Cooking, hunting and teaching hours (`tallyOf` makes it lazily). */ tally?: Tally;
  /** Days in a row the animals have gone unfed (livestock chore at its worst): sickness, then deaths. */ neglect?: number;
}

/** Yesterday is assumed to have had its cooking (so a new game doesn't start with cold suppers). */
export const newTally = (): Tally => ({ today: {}, yesterday: { kitchen: 99 }, dusk: [] });
export const tallyOf = (s: GameState): Tally => (dailyOf(s).tally ??= newTally());

export function newDaily(): Daily {
  return {
    plan: { auto: true, hours: {}, locked: [], day: -1, threat: 0 },
    chores: { levels: Object.fromEntries(CHORES.map(c => [c, 0])) as Record<ChoreId, number> },
    social: { active: null, last: {}, glow: 0, glowAt: 0, noise: 0, noiseAt: 0, held: 0 },
  };
}

/** The daily-life state (lazily made, so old saves and tests that build state by hand work). */
export const dailyOf = (s: GameState): Daily => (s.daily ??= newDaily());

// ─────────────────────────────────────────────────────────────────────────
// Threat and the auto-planner
// ─────────────────────────────────────────────────────────────────────────

const HOSTILE = new Set(['looters', 'gang', 'horde', 'militia', 'break_in', 'ransom']);

/** 0 calm (the law works), 1 guarded (no law), 2 high (no law, and raided lately or everyone knows you have stores). */
export function threatLevel(s: GameState, pressure?: number): number {
  if (s.disaster.tracks.law >= 0.5) return 0;
  const day = dayIndex(s.clock.t);
  const recent = s.gate.history.some(h => HOSTILE.has(h.kind) && day - h.day <= 21);
  return recent || (pressure ?? raidPressure(s)) >= 1.25 ? 2 : 1;
}

/** Is a person here and able (alive, not taken or away)? */
const ableAt = (s: GameState, i: number) => {
  const ps = s.personState[i];
  return !!ps && ps.needs.died == null && ps.task !== 'away' && !ps.needs.hurt.some(h => h.trauma && h.sev >= 50);
};

/** The hour after which a kid is in bed. */
const bedOf = (p: Person) => (p.kid ? (p.age < 12 ? 20 : 22) : 22);

/** The old fixed routine (sim/schedule.ts) as duties: the starting point every row is built from. */
export function baseRow(p: Person, work: Duty = 'build'): Duty[] {
  const row: Duty[] = [];
  for (let h = 0; h < 24; h++) {
    const slot = routineAt(p, h + 0.5);
    row.push(slot === 'work' ? (p.kid && p.age < 5 ? 'leisure' : work) : slot === 'chores' ? (p.kid && p.age < 5 ? 'leisure' : 'kitchen') : slot === 'school' ? (p.age < 5 ? 'leisure' : 'school') : slot);
  }
  if (!p.kid || p.age >= 5) { row[12] = 'meal'; if (!p.kid) row[18] = 'meal'; else if (bedOf(p) > 18) row[18] = 'meal'; }
  if (p.elder) for (let h = 13; h < 16; h++) row[h] = 'leisure';
  return row;
}

/** Hours of work in a row. */
export const workHours = (row: readonly Duty[]) => row.filter(d => DUTY[d].work).length;

// ─────────────────────────────────────────────────────────────────────────
// Chronotypes: who is up late
// ─────────────────────────────────────────────────────────────────────────

export type Chrono = 'early' | 'normal' | 'owl';
export const CHRONO_NAME: Record<Chrono, string> = { early: 'Early bird', normal: 'Keeps regular hours', owl: 'Night owl' };

/** A stable 0–1 hash of a person (their id and the game's seed): a person's chronotype never changes. */
export function hash01(id: string, seed: number): number {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** How many night owls a household of `n` has: none in a family of up to six (everyone is in bed), a few in a big party. */
export const owlCount = (n: number): number => (n <= 6 ? 0 : Math.floor((n - 6) * 0.6));

/** The chronotype of everyone (teens and adults can be owls; the youngest keep early hours). Deterministic. */
export function chronotypes(s: GameState): Record<string, Chrono> {
  const out: Record<string, Chrono> = {};
  const alive = s.people.filter((_, i) => s.personState[i]?.needs.died == null);
  const eligible = alive.filter(p => !p.kid || p.age >= 15).map(p => ({ id: p.id, h: hash01(p.id, s.seed) })).sort((a, b) => a.h - b.h || (a.id < b.id ? -1 : 1));
  const owls = new Set(eligible.slice(0, owlCount(alive.length)).map(x => x.id));
  for (const p of s.people) out[p.id] = owls.has(p.id) ? 'owl' : p.kid && p.age < 15 ? 'normal' : hash01(p.id, s.seed) > 0.8 ? 'early' : 'normal';
  return out;
}

/** Shift a row to the person's body clock: owls sit up until four and sleep in until eleven, early birds are in bed by nine. */
function applyChrono(row: Duty[], c: Chrono): void {
  if (c === 'owl') {
    for (const h of [22, 23, 0, 1, 2, 3]) if (row[h] === 'sleep') row[h] = 'leisure';
    for (let h = 4; h < 11; h++) row[h] = 'sleep';
  } else if (c === 'early') {
    if (row[21] === 'leisure') row[21] = 'sleep';
    if (row[5] === 'sleep') row[5] = 'leisure';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Who suits what
// ─────────────────────────────────────────────────────────────────────────

/** Duties that take a strong, healthy body. */
export const HEAVY = new Set<Duty>(['build', 'fields', 'wood', 'repairs', 'hunt', 'water', 'watch']);
const SKILL: Partial<Record<Duty, keyof Person['skills']>> = { garden: 'gardener', fields: 'gardener', livestock: 'gardener', repairs: 'mechanic', wood: 'builder', water: 'builder', kitchen: 'medic', hunt: 'hunter', build: 'builder', medic: 'medic', teach: 'teacher', radio: 'radio', watch: 'hunter' };

/**
 * How well person `i` suits a duty right now: 0 = should not (too young, too
 * ill or hurt for heavy work, too old for the heavy jobs), 1 = fine, more =
 * skilled or glad of it. Skill, health, age, fatigue and the player's
 * standing assignment (`plan.focus`) all count. The planner picks the best.
 */
export function fitness(s: GameState, i: number, duty: Duty): number {
  const p = s.people[i], ps = s.personState[i];
  if (!p || !ps || ps.needs.died != null || !canDo(p, duty)) return 0;
  const hp = ps.needs.health, hurt = ps.needs.hurt.reduce((a, h) => Math.max(a, h.sev), 0);
  if (duty === 'sleep' || duty === 'meal' || duty === 'leisure' || duty === 'school') return 1;
  if (hp < 35 || hurt >= 60) return 0;
  const heavy = HEAVY.has(duty);
  if (heavy && (hp < 60 || hurt >= 25)) return 0;
  if (heavy && p.elder && p.age >= 70) return 0;
  let f = 1;
  const sk = SKILL[duty];
  if (sk) f += (p.skills[sk] - 3) * 0.12;
  const fat = ps.fatigue ?? 0;
  if (fat > 60) f *= heavy ? 0.5 : 0.8;
  if (duty === 'watch' && fat > 75) f *= 0.4;
  if (duty === 'pets' && (p.kid || p.elder)) f *= 1.3;
  if (p.elder && heavy) f *= 0.5;
  if (s.daily?.plan.focus?.[p.id] === duty) f *= 3;
  return Math.max(0.05, f);
}

/** Someone who should rest rather than work (ill, or hurt). */
export const unwell = (ps: PersonState | undefined): boolean => !!ps && (ps.needs.health < 45 || ps.needs.hurt.some(h => h.sev >= 40));

/** Person-hours a day each chore-duty needs to keep up, plus a third of what has piled up. */
export function dutyWants(s: GameState, rates: Record<ChoreId, number>): Array<[Duty, number]> {
  const lv = dailyOf(s).chores.levels, out: Array<[Duty, number]> = [];
  for (const duty of Object.keys(DUTY_CHORES) as Duty[]) {
    let h = 0;
    for (const c of DUTY_CHORES[duty]!) if (rates[c] > 0 || lv[c] > 5) h += (rates[c] + lv[c] / 3) / 100 * CLEAR_HOURS[c];
    if (duty === 'kitchen') h += cookNeed(s);                     // somebody has to cook the meals and put the harvest by
    if (h > 0.3) out.push([duty, h]);
  }
  // after the hit the wild is part of the larder: somebody hunts
  if (s.disaster.phase === 'impact' || s.disaster.phase === 'survival') out.push(['hunt', 2]);
  return out;
}

/** While there is a project staked out, this share of a person's project hours is kept for it; the chores use the morning, midday and late-afternoon chore slots (animals, dogs and cooking are reserved ahead and may take project hours). */
export const BUILD_KEEP = 1;
/** The crop duties override the project hours once their backlog passes this (the food comes in before the next building goes up). */
export const CROP_BACKLOG = 50;
/** Small, daily, can't-skip duties the planner staffs before the big jobs. */
const RESERVED: readonly Duty[] = ['livestock', 'pets', 'kitchen'];

interface PlanCtx {
  build: boolean;
  fell: boolean;
  doy: number;
  threat: number;
  after: boolean;
}

/** What the place needs from the work hours when there is nothing to build (season first). */
function seasonalWork(s: GameState, c: PlanCtx, p: Person): Duty {
  const fin = s.structures.filter(isFinished);
  const has = (k: string) => fin.some(st => st.kind === k);
  const H = seasons(REGIONS[s.site.region]).harvest, [g0, g1] = gardenSeason(s);
  if (has('field') && c.doy >= H[0] && c.doy < H[1]) return 'fields';
  if (c.fell) return 'wood';
  if (has('garden') && c.doy >= g0 && c.doy <= g1 && p.skills.gardener >= 3) return 'garden';
  // autumn: wood for the winter
  if (c.doy >= 245 && c.doy <= 320 && greenRicks(s) + s.stock.firewood < 8) return 'wood';
  if (c.after && p.skills.hunter >= 4 && (c.doy >= 260 || c.doy <= 30)) return 'hunt';
  if (has('garden') && c.doy >= g0 && c.doy <= g1) return 'garden';
  return 'repairs';
}

/**
 * Fill everyone's day (people the player locked keep their rows). The rules:
 *  - kids at school; everyone sleeps 7–8 h at night and nobody works more than 14;
 *    nobody works between ten at night and six unless posted on watch
 *  - the work hours go where the place needs them (the chore backlogs and
 *    their daily growth), each need to the person who suits it best: skill,
 *    health, age and tiredness (`fitness`); the ill rest; a standing
 *    assignment from the player (`plan.focus`) is honoured first
 *  - with no law, someone is on watch through the night in two shifts, night
 *    owls and volunteers first, rotating so nobody has more than two night
 *    shifts running; at high threat someone also watches by day
 */
export function autoPlan(s: GameState, ctx: { build: boolean; fell: boolean }, ratesNow?: Record<ChoreId, number>, pressure?: number): void {
  const d = dailyOf(s), plan = d.plan;
  const focus = (plan.focus ??= {}), nights = (plan.nights ??= {}), notes: Record<string, string> = {};
  const day = dayIndex(s.clock.t);
  const c: PlanCtx = { ...ctx, doy: calendarOf(s.clock).doy, threat: threatLevel(s, pressure), after: s.disaster.phase === 'impact' || s.disaster.phase === 'survival' };
  const rates = ratesNow ?? choreRates(s);
  const weekday = day % 7 < 5;
  const chrono = chronotypes(s);
  const free: Array<{ p: Person; i: number }> = [];
  s.people.forEach((p, i) => { if (ableAt(s, i) && !plan.locked.includes(p.id)) free.push({ p, i }); });
  const rows = new Map<string, Duty[]>();
  for (const { p, i } of free) {
    const ill = unwell(s.personState[i]);
    const work = p.kid ? (ctx.build ? 'build' : 'garden') : ctx.build ? 'build' : seasonalWork(s, c, p);
    const row = baseRow(p, work as Duty);
    applyChrono(row, chrono[p.id] ?? 'normal');
    if (ill) {
      // the ill rest in bed; the mildly unwell do the light jobs below
      const bad = s.personState[i].needs.health < 35;
      for (let h = 6; h < 22; h++) if (DUTY[row[h]].work) row[h] = bad ? 'sleep' : 'leisure';
      notes[p.id] = bad ? 'Resting: too unwell to work' : 'Light duty: not well';
    }
    rows.set(p.id, row);
  }
  const hoursLeft = new Map<string, number[]>();   // each person's work hours still open to be given a job
  for (const { p, i } of free) {
    const row = rows.get(p.id)!, open: number[] = [];
    const atJob = weekday && !!s.personState[i].employed && !!p.job;   // (the engine sends them to town 07:00 to 16:00: those hours can't be given a chore)
    for (let h = 6; h < 22; h++) if (DUTY[row[h]].work && h !== 12 && h !== 18 && !(atJob && h >= 7 && h < 16)) open.push(h);
    // the mildly unwell can take light jobs in their rest hours
    if (unwell(s.personState[i]) && s.personState[i].needs.health >= 35) for (let h = 8; h < 17; h++) if (row[h] === 'leisure' && open.length < 4) open.push(h);
    // after the day job there are still the evening hours for the animals, the dogs and the stove
    if (atJob) for (const h of [19, 20]) if (row[h] === 'leisure' && !open.includes(h)) open.push(h);
    // chores take the chore slots (early morning, midday, late afternoon, the evening) first and the project hours last
    open.sort((a, b) => (row[a] === 'build' ? 1 : 0) - (row[b] === 'build' ? 1 : 0) || a - b);
    hoursLeft.set(p.id, open);
  }
  // with a project staked out, each person keeps most of their project hours for it (a weekend is the family's build time)
  const keep = new Map<string, number>();
  const cropsBehind = (duty: Duty) => (duty === 'fields' || duty === 'garden') && (DUTY_CHORES[duty] ?? []).some(c => dailyOf(s).chores.levels[c] >= CROP_BACKLOG);
  for (const { p } of free) keep.set(p.id, ctx.build ? Math.floor(hoursLeft.get(p.id)!.filter(h => rows.get(p.id)![h] === 'build').length * BUILD_KEEP) : 0);
  const want = new Map(dutyWants(s, rates));
  const give = (p: Person, i: number, duty: Duty, n: number): number => {
    const open = hoursLeft.get(p.id)!, row = rows.get(p.id)!;
    let used = 0;
    while (used < n && open.length) { row[open.shift()!] = duty; used++; }
    want.set(duty, (want.get(duty) ?? 0) - used * choreRate(p) * Math.max(0.3, restFactor(s.personState[i])));
    return used;
  };
  // ── the player's standing assignments first (watch is dealt with below) ──
  for (const { p, i } of free) {
    const f = focus[p.id];
    if (!f || f === 'watch' || fitness(s, i, f) <= 0) continue;
    if (DUTY_CHORES[f] && !dutyApplies(s, f, rates)) continue;   // nothing to do of it just now: the planner uses them elsewhere
    const n = give(p, i, f, 99);
    if (n) notes[p.id] = `Assigned: ${DUTY[f].name.toLowerCase()}`;
  }
  // ── the animals, the dogs and the stove come before the big jobs: they are small, they can't wait, and a harvest that
  //    is 24 hours of work must not starve them (priority by consequence, not by size) ──
  for (const duty of RESERVED) {
    for (let guard = 0; guard < 8; guard++) {
      const w = want.get(duty) ?? 0;
      if (w <= 0.35) break;
      let best: { p: Person; i: number } | null = null, bestScore = 0;
      for (const x of free) {
        const open = hoursLeft.get(x.p.id)!;
        if (!open.length) continue;
        const f = fitness(s, x.i, duty);
        if (f <= 0) continue;
        const score = f * (1 + 0.05 * open.length);
        if (score > bestScore) { best = x; bestScore = score; }
      }
      if (!best) break;
      const rate = Math.max(0.1, choreRate(best.p) * Math.max(0.3, restFactor(s.personState[best.i])));
      give(best.p, best.i, duty, Math.min(3, Math.max(1, Math.ceil(w / rate))));
    }
  }
  // ── then the biggest need to the best-suited person, a spell at a time ──
  for (let guard = 0; guard < 60; guard++) {
    let top: Duty | null = null, topW = 0.35;
    for (const [duty, w] of want) if (w > topW) { top = duty; topW = w; }
    if (!top) break;
    let best: { p: Person; i: number } | null = null, bestScore = 0;
    for (const x of free) {
      const open = hoursLeft.get(x.p.id)!;
      if (open.length <= (cropsBehind(top) ? 0 : keep.get(x.p.id)!)) continue;
      const f = fitness(s, x.i, top);
      if (f <= 0) continue;
      const score = f * (1 + 0.05 * open.length);
      if (score > bestScore) { best = x; bestScore = score; }
    }
    if (!best) { want.set(top, 0); continue; }
    const rate = Math.max(0.1, choreRate(best.p) * Math.max(0.3, restFactor(s.personState[best.i])));
    const n = Math.min(3, Math.max(1, Math.ceil(topW / rate)));
    give(best.p, best.i, top, n);
  }
  // supper: the best cook of the evening takes the stove (two cooks swap by day)
  const adults = free.filter(({ p }) => !p.kid && !p.elder);
  const cooks = [...(adults.length ? adults : free.filter(({ p }) => !p.kid))].filter(x => fitness(s, x.i, 'kitchen') > 0).sort((a, b) => fitness(s, b.i, 'kitchen') - fitness(s, a.i, 'kitchen'));
  const cook = cooks.length ? cooks[day % Math.min(2, cooks.length)] : null;
  if (cook) rows.get(cook.p.id)![17] = 'kitchen';
  // ── after the hit: the teacher teaches, the medic tends, the radio is listened to ──
  const schoolKids = free.filter(({ p }) => p.kid && p.age >= 5).length;
  if (c.after && schoolKids && adults.length >= 2) {
    const t = [...adults].sort((a, b) => fitness(s, b.i, 'teach') * (1 + b.p.skills.teacher) - fitness(s, a.i, 'teach') * (1 + a.p.skills.teacher))[0];
    const row = rows.get(t.p.id)!;
    for (let h = 8; h < 11; h++) row[h] = 'teach';
  }
  const hurt = s.personState.some(ps => ps.needs.died == null && ps.needs.hurt.length > 0);
  if (hurt) {
    const m = free.filter(({ p, i }) => !p.kid && fitness(s, i, 'medic') > 0).sort((a, b) => b.p.skills.medic - a.p.skills.medic)[0];
    if (m && m.p.skills.medic >= 2) { const row = rows.get(m.p.id)!; for (let h = 13; h < 15; h++) row[h] = 'medic'; }
  }
  if (c.after && (s.stock.ham_rig >= 1 || s.stock.sw_radio >= 1)) {
    const r = [...free.filter(({ p }) => !p.kid || p.age >= 12)].sort((a, b) => b.p.skills.radio - a.p.skills.radio)[0];
    if (r) rows.get(r.p.id)![20] = 'radio';
  }
  // ── the watch ──
  const onNight = new Set<string>();
  if (c.threat >= 1) {
    const guards = free.filter(({ p, i }) => fitness(s, i, 'watch') > 0 && (!p.kid || p.age >= 15));
    // volunteers (a standing watch assignment) and night owls first, then the least tired; two nights running and you are off
    const klass = (x: { p: Person }) => (focus[x.p.id] === 'watch' ? 0 : chrono[x.p.id] === 'owl' ? 1 : 2);
    guards.sort((a, b) => (nights[a.p.id] ?? 0) >= 2 === ((nights[b.p.id] ?? 0) >= 2) ? klass(a) - klass(b) || (s.personState[a.i].fatigue ?? 0) - (s.personState[b.i].fatigue ?? 0) || b.p.skills.hunter - a.p.skills.hunter : (nights[a.p.id] ?? 0) >= 2 ? 1 : -1);
    // rotate who takes which shift by day among those of the same standing
    const head = guards.length ? guards.filter(x => klass(x) === klass(guards[0]) && ((nights[x.p.id] ?? 0) >= 2) === ((nights[guards[0].p.id] ?? 0) >= 2)) : [];
    const g = head.length ? [...head.slice(day % head.length), ...head.slice(0, day % head.length), ...guards.filter(x => !head.includes(x))] : [];
    const first = g[0], second = g.length > 1 ? g[1] : null;
    if (first) {
      const row = rows.get(first.p.id)!;
      // 22–02 on the wall, then sleep to 9
      for (const h of [22, 23, 0, 1]) row[h] = 'watch';
      for (let h = 2; h < 9; h++) row[h] = 'sleep';
      if (!second) for (const h of [2, 3]) row[h] = 'sleep';
      notes[first.p.id] = 'Night watch 22:00 to 02:00, sleeps after';
      onNight.add(first.p.id);
    }
    if (second) {
      const row = rows.get(second.p.id)!;
      // to bed at 20, up at 02 for the second watch, back to bed 06–08
      for (const h of [20, 21, 22, 23, 0, 1]) row[h] = 'sleep';
      for (let h = 2; h < 6; h++) row[h] = 'watch';
      for (const h of [6, 7]) row[h] = 'sleep';
      notes[second.p.id] = 'Night watch 02:00 to 06:00, sleeps before and after';
      onNight.add(second.p.id);
    }
    if (c.threat >= 2 && g.length >= 3) {
      // a day watch, split between two who are not on the night
      const day1 = g[2], day2 = g[3] ?? g[2];
      for (let h = 7; h < 12; h++) rows.get(day1.p.id)![h] = 'watch';
      for (let h = 13; h < 17; h++) rows.get(day2.p.id)![h] = 'watch';
    }
  }
  for (const { p } of free) nights[p.id] = onNight.has(p.id) ? (nights[p.id] ?? 0) + 1 : 0;
  // ── nobody works more than 14 hours; everyone gets 7 of sleep ──
  for (const [, row] of rows) capRow(row);
  for (const [id, row] of rows) plan.hours[id] = row;
  plan.notes = { ...Object.fromEntries(Object.entries(plan.notes ?? {}).filter(([id]) => plan.locked.includes(id))), ...notes };
  // people who've left or died drop off the roster
  for (const id of Object.keys(plan.hours)) if (!s.people.some(p => p.id === id)) delete plan.hours[id];
  plan.day = day; plan.threat = c.threat;
}

/** At most 14 working hours and at least 7 asleep: trim the latest work into free time. */
export function capRow(row: Duty[]): void {
  for (let h = 21; h >= 6 && workHours(row) > 14; h--) if (DUTY[row[h]].work && row[h] !== 'watch') row[h] = 'leisure';
  if (row.filter(d => d === 'sleep').length < 7) for (const h of [21, 20, 6, 7, 8]) { if (row.filter(d => d === 'sleep').length >= 7) break; if (row[h] !== 'watch') row[h] = 'sleep'; }
}

/** A ready-made day for everyone (the roster's template buttons). Auto hands it back to the planner. */
export function applyTemplate(s: GameState, t: TemplateId, ctx: { build: boolean; fell: boolean }): void {
  const plan = dailyOf(s).plan;
  if (t === 'auto') { plan.auto = true; plan.locked = []; autoPlan(s, ctx); return; }
  plan.auto = false;
  plan.locked = [];
  autoPlan(s, ctx);
  const doy = calendarOf(s.clock).doy;
  s.people.forEach((p, i) => {
    const row = plan.hours[p.id];
    if (!row || !ableAt(s, i)) return;
    for (let h = 0; h < 24; h++) {
      const d = row[h];
      if (t === 'rest' && DUTY[d].work && d !== 'watch' && d !== 'livestock' && d !== 'kitchen') row[h] = 'leisure';
      if (t === 'harvest' && (d === 'build' || d === 'repairs' || d === 'hunt') && !p.kid) row[h] = doy > 200 && doy < 320 ? 'fields' : 'garden';
      if (t === 'harvest' && p.kid && d === 'school' && h >= 10) row[h] = 'garden';
    }
    if (t === 'lockdown' && (!p.kid || p.age >= 15)) {
      // two on watch at any hour where possible: staggered 6-hour posts
      const k = i % 4;
      for (let j = 0; j < 6; j++) row[(k * 6 + 22 + j) % 24] = 'watch';
    }
    capRow(row);
  });
}

/** Paint one hour (or a run of hours) of a person's day; the planner then leaves them be. */
export function setDuty(s: GameState, personId: string, hours: number[], duty: Duty): string | null {
  const p = s.people.find(x => x.id === personId);
  if (!p) return 'nobody by that name';
  if (!canDo(p, duty)) return `${p.first} can't do that`;
  if (DUTY[duty].work && duty !== 'watch' && hours.some(h => isNightHour(((h % 24) + 24) % 24))) return `${p.first} needs the night's sleep: only the night watch is up between 10 pm and 6 am`;
  const plan = dailyOf(s).plan;
  const row = (plan.hours[personId] ??= baseRow(p));
  for (const h of hours) row[((h % 24) + 24) % 24] = duty;
  if (!plan.locked.includes(personId)) plan.locked.push(personId);
  return null;
}

/** A standing assignment: this person is put on `duty` first whenever there is work of it (null: back to the planner's choice). */
export function setFocus(s: GameState, personId: string, duty: Duty | null): string | null {
  const i = s.people.findIndex(x => x.id === personId);
  if (i < 0) return 'nobody by that name';
  const plan = dailyOf(s).plan;
  plan.focus ??= {};
  if (duty === null) delete plan.focus[personId];
  else if (!canDo(s.people[i], duty) || DUTY[duty].work === false) return `${s.people[i].first} can't do that`;
  else plan.focus[personId] = duty;
  plan.day = -1;   // the planner runs again at once
  return null;
}

/** Give a person back to the planner. */
export function unlockPerson(s: GameState, personId: string): void {
  const plan = dailyOf(s).plan;
  plan.locked = plan.locked.filter(id => id !== personId);
  plan.day = -1;
}

/** What a person's plan says at an hour (falls back to the old routine for anyone not on the roster). */
export function dutyAt(s: GameState, p: Person, hour: number): Duty {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const row = s.daily?.plan.hours[p.id];
  return row?.[h] ?? baseRow(p)[h];
}

// ─────────────────────────────────────────────────────────────────────────
// The sub-step: duty → task, chore work, fatigue
// ─────────────────────────────────────────────────────────────────────────

/** Task kinds the renderer reads, per duty (build is decided by the engine: build or forestry). */
export const DUTY_TASK: Record<Exclude<Duty, 'build'>, TaskKind> = {
  sleep: 'sleep', meal: 'meal', leisure: 'leisure', school: 'school', garden: 'garden', fields: 'fields', livestock: 'livestock', pets: 'pets', wood: 'wood',
  water: 'water', kitchen: 'kitchen', cleaning: 'cleaning', laundry: 'laundry', repairs: 'repairs', hunt: 'hunt', medic: 'medic', teach: 'teach', radio: 'radio', watch: 'watch',
};

/** Restedness multiplier on work: full to fatigue 50, half at 100. */
export const restFactor = (ps: PersonState | undefined) => 1 - Math.max(0, (ps?.fatigue ?? 0) - 50) / 100;

/** Fatigue for `hours` on a duty (night hours awake tire more). */
export function tire(ps: PersonState, duty: Duty, hour: number, hours: number): void {
  const night = hour >= 22 || hour < 6;
  // sleeping through the day (a watcher's owed sleep) restores less than a night in bed
  const t = duty === 'sleep' ? DUTY.sleep.tire * (night ? 1 : 0.7) : DUTY[duty].tire + (night ? 2.5 : 0);
  ps.fatigue = Math.max(0, Math.min(100, (ps.fatigue ?? 0) + t * hours));
}

/** Person-hours on a duty's chores (the most behind of them first). */
export function addChoreWork(s: GameState, duty: Duty, personHours: number): ChoreId | null {
  const cs = DUTY_CHORES[duty];
  if (!cs) return null;
  const lv = dailyOf(s).chores.levels;
  const c = cs.reduce((a, b) => (lv[b] > lv[a] ? b : a));
  lv[c] = Math.max(0, lv[c] - personHours * 100 / CLEAR_HOURS[c]);
  // the gun cleaning in the repairs hours keeps the guns up even without a kit
  if (duty === 'repairs' && c === 'gear') for (const g of s.armory.guns) g.condition = Math.min(1, g.condition + 0.004 * personHours);
  return c;
}

/** The backlogs grow (each sub-step). */
export function choresStep(s: GameState, days: number, rates = choreRates(s)): void {
  const lv = dailyOf(s).chores.levels;
  for (let i = 0; i < CHORES.length; i++) { const c = CHORES[i], r = rates[c]; lv[c] = r > 0 ? Math.min(100, lv[c] + r * days) : Math.max(0, lv[c] - 20 * days); }
}

/** A duty with nothing to work on (the garden in January): what it falls back to. */
export function dutyApplies(s: GameState, duty: Duty, rates: Record<ChoreId, number>): boolean {
  const cs = DUTY_CHORES[duty];
  if (!cs) return true;
  const lv = dailyOf(s).chores.levels;
  return cs.some(c => rates[c] > 0 || lv[c] > 1);
}

/** How much chore work a person gets through an hour (1 = an able adult). */
export function choreRate(p: Person): number {
  if (p.elder) return p.age >= 75 ? 0.4 : 0.7;
  if (!p.kid) return 1;
  return p.age < 8 ? 0.15 : p.age < 12 ? 0.35 : p.age < 15 ? 0.6 : 0.8;
}

/** A duty with nothing to do (no garden, nothing to build): the most-behind chore the person can do, else general chores. */
export function fallbackDuty(s: GameState, p: Person, rates: Record<ChoreId, number>): Duty {
  const lv = dailyOf(s).chores.levels;
  let best: Duty | null = null, top = 5;
  for (const duty of FALLBACK) {
    if (!canDo(p, duty)) continue;
    for (const c of DUTY_CHORES[duty]!) if ((rates[c] > 0 || lv[c] > 1) && lv[c] > top) { top = lv[c]; best = duty; }
  }
  return best ?? (p.kid && p.age < 8 ? 'leisure' : 'build');
}
const FALLBACK = Object.keys(DUTY_CHORES) as Duty[];

/**
 * What the engine needs from daily life each sub-step, worked out once and
 * kept: the chore rates and the raid pressure once a day, the roster and each
 * person's resolved duty once a game hour (the four quarter-hour sub-steps of
 * an hour share it). Keyed on the state object, so every `step()` call
 * (which clones the state) starts fresh.
 */
export interface DailyTick {
  day: number;
  hour: number;
  /** raidPressure(s), once a day (it walks every OPSEC source). */
  pressure: number;
  rates: Record<ChoreId, number>;
  /** The duty each person (by index in `s.people`) is on this hour, resolved. */
  duties: Duty[];
}
const TICKS = new WeakMap<GameState, DailyTick>();

export function dailyTick(s: GameState, ctx: { build: boolean; fell: boolean }): DailyTick {
  const day = dayIndex(s.clock.t), hour = Math.floor(s.clock.ticks / 4);
  let tk = TICKS.get(s);
  if (!tk || tk.day !== day) { tk = { day, hour: -1, pressure: raidPressure(s), rates: choreRates(s), duties: [] }; TICKS.set(s, tk); }
  if (tk.hour !== hour || tk.duties.length !== s.people.length) {
    const plan = dailyOf(s).plan;
    // the roster is refilled each day on Auto, and when the threat changes (checked hourly)
    if (plan.auto ? plan.day !== day || threatLevel(s, tk.pressure) !== plan.threat : plan.day !== day) {
      if (plan.auto) autoPlan(s, ctx, tk.rates, tk.pressure);
      else { for (const p of s.people) plan.hours[p.id] ??= baseRow(p); plan.day = day; }
    }
    const h = (hour + 6) % 24, canWork = ctx.build || ctx.fell;
    const em = isNightHour(h) ? emergencyOf(s) : null;
    tk.duties = s.people.map((p, i) => (ableAt(s, i) ? nightDuty(s, p, i, resolveDuty(s, p, h, tk!.rates, canWork), h, em) : 'leisure'));
    tk.hour = hour;
  }
  return tk;
}

/** Between ten at night and six in the morning. */
export const isNightHour = (h: number): boolean => h >= 22 || h < 6;

/** What breaks the night's sleep: someone at the gate, or someone badly hurt or sick (a child with any illness counts). */
export interface Emergency { gate: boolean; /** Index of the person who tends the sick, or -1. */ medic: number }
export function emergencyOf(s: GameState): Emergency | null {
  const gate = !!s.gate.pending || !!s.gate.incoming;
  let sick = false;
  s.people.forEach((p, i) => { const ps = s.personState[i]; if (ps && ps.needs.died == null && ps.needs.hurt.some(h => h.sev >= 40 || (p.kid && h.sev >= 10))) sick = true; });
  if (!gate && !sick) return null;
  let medic = -1, best = -1;
  if (sick) s.people.forEach((p, i) => { if (!p.kid && ableAt(s, i) && fitness(s, i, 'medic') > 0 && p.skills.medic > best) { best = p.skills.medic; medic = i; } });
  return { gate, medic };
}

/**
 * The night rule: nobody works between ten and six unless posted on watch, or
 * it is an emergency (someone at the gate: the adults stand to; someone
 * badly hurt or a sick child: the best medic is up). Everyone else sleeps.
 */
export function nightDuty(s: GameState, p: Person, i: number, duty: Duty, h: number, em: Emergency | null): Duty {
  if (!isNightHour(h) || duty === 'watch' || !DUTY[duty].work) return duty;
  if (em?.gate && !p.kid && ableAt(s, i) && fitness(s, i, 'watch') > 0) return 'watch';
  if (em && em.medic === i) return 'medic';
  return 'sleep';
}

/** A person's planned duty at an hour, or what they do instead when it has nothing to work on. */
export function resolveDuty(s: GameState, p: Person, h: number, rates: Record<ChoreId, number>, canWork: boolean): Duty {
  const d = dutyAt(s, p, h);
  return !dutyApplies(s, d, rates) || (d === 'build' && !canWork) ? fallbackDuty(s, p, rates) : d;
}

/** An hour slice of a duty's work: chores come down; the medic tends the hurt. */
export function dutyWork(s: GameState, p: Person, ps: PersonState, duty: Duty, personHours: number, hour = 12): void {
  if (duty === 'kitchen' || duty === 'hunt' || duty === 'teach') {
    const t = tallyOf(s).today;
    // skilled hunters and teachers count for more
    t[duty] = (t[duty] ?? 0) + personHours * (duty === 'hunt' ? 0.5 + p.skills.hunter / 10 : duty === 'teach' ? 0.5 + p.skills.teacher / 10 : 1);
    if (duty === 'hunt' && hour >= 17 && !tallyOf(s).dusk.includes(p.id)) tallyOf(s).dusk.push(p.id);
  }
  if (DUTY_CHORES[duty]) { addChoreWork(s, duty, personHours); return; }
  if (duty === 'medic') {
    // the worst wound gets the care (on top of the daily healing in needs.ts)
    let worst: { sev: number } | null = null;
    for (const x of s.personState) if (x.needs.died == null) for (const h of x.needs.hurt) if (!worst || h.sev > worst.sev) worst = h;
    if (worst) worst.sev = Math.max(0, worst.sev - personHours * 0.15 * (1 + p.skills.medic / 5));
  }
  void ps;
}

// ─────────────────────────────────────────────────────────────────────────
// Watch
// ─────────────────────────────────────────────────────────────────────────

export type WatchPost = 'tower' | 'wall' | 'gate';
export interface Watcher { id: string; post: WatchPost; night: boolean; alert: number; /** On the patrol deck of the wall (sim/walkway.ts): the people renderer puts them on top of it. */ walk?: boolean }

/**
 * Who is on watch right now (reads the tasks the last sub-step set). For the
 * gate (detection) and the atmosphere layer (flashlights at night). Posts:
 * the first watcher takes the tower if there is one, the next walks the wall
 * (if there's a perimeter; with a wall-top walkway, up to two walk the deck),
 * the rest the gate.
 */
export function watchNow(s: GameState): Watcher[] {
  const h = hourOf(s.clock.t), night = h >= 20 || h < 6;
  const tower = s.structures.some(st => isFinished(st) && st.kind.includes('tower'));
  const wall = s.perimeter.some(r => r.finishedAt !== null);
  const deck = hasWalkway(s);
  const out: Watcher[] = [];
  for (const ps of s.personState) {
    if (ps.task !== 'watch' || ps.needs.died != null) continue;
    const k = out.length;
    const post: WatchPost = k === 0 && tower ? 'tower' : wall && k <= (deck ? 2 : 1) ? 'wall' : 'gate';
    out.push({ id: ps.id, post, night, alert: Math.max(0.3, 1 - (ps.fatigue ?? 0) / 140), ...(post === 'wall' && deck ? { walk: true } : {}) });
  }
  return out;
}

/** Detection points the posted watch adds (0–20): a rested guard adds about ten, the next six. */
export function watchDetection(s: GameState): number {
  const w = watchNow(s).sort((a, b) => b.alert - a.alert);
  let sum = 0;
  const owl = w.length ? chronotypes(s) : {};
  w.forEach((x, k) => { sum += ((k === 0 ? 10 : k === 1 ? 6 : 2) + (owl[x.id] === 'owl' ? 1.5 : 0)) * x.alert * (x.post === 'tower' ? 1.2 : x.walk ? 1.1 : 1); });
  return Math.min(20, sum);
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day: what falling behind does
// ─────────────────────────────────────────────────────────────────────────

/** The most a standing crop loses to a full backlog (a crop left a few weeks is still mostly there). */
export const HARVEST_FLOOR_LOSS = 0.3;
/** Yield multiplier on a crop from its chore (needs.ts reads it): weeds take up to half the garden, the field loses up to 30 % standing, hungry hens lay 60 % less; a neglected greenhouse, orchard or pond loses up to 40 / 35 / 50 %. */
export function careYield(s: GameState, c: 'weeds' | 'harvest' | 'animals' | 'orchard' | 'greenhouse' | 'pond'): number {
  const v = s.daily?.chores.levels[c] ?? 0;
  const k = c === 'weeds' ? 0.5 : c === 'harvest' ? HARVEST_FLOOR_LOSS : c === 'greenhouse' ? 0.4 : c === 'orchard' ? 0.35 : c === 'pond' ? 0.5 : 0.6;
  return 1 - k * Math.max(0, v - 20) / 80;
}

/** Person-hours of cooking the household needs a day (about one an hour-and-a-bit per three mouths). */
export const cookNeed = (s: GameState): number => Math.max(1, s.personState.filter(ps => ps.needs.died == null).length / 3);
/** 0 (nobody cooked yesterday) to 1 (the stove was kept): canning and hot meals depend on it. */
export const cookRatio = (s: GameState): number => { const t = s.daily?.tally; return t ? Math.min(1, (t.yesterday.kitchen ?? 0) / cookNeed(s)) : 1; };
/** Canner loads a day: two when the kitchen is kept, fewer as the cooking falls short, none when nobody cooks. */
export const canningCases = (s: GameState, max: number): number => Math.floor(max * cookRatio(s) + 1e-9);
/** Fresh food spoils half again as fast when nobody is cooking or putting it by. */
export const spoilFactor = (s: GameState): number => (cookRatio(s) < 0.3 ? 1.5 : 1);
/** Hunting effort yesterday scales what the wild gives: a casual 0.6 with nobody on Hunt, to 1.6 with a skilled hunter out four hours. */
export const huntFactor = (s: GameState): number => 0.6 + Math.min(1, (s.daily?.tally?.yesterday.hunt ?? 0) / 4);

/** How well the dogs are kept (1 = fed, watered and walked; down to a half when the care is badly behind): scales their alarm and deterrence (gear.ts). */
export const petCare = (s: GameState): number => 1 - 0.5 * Math.max(0, Math.min(1, ((s.daily?.chores.levels.pets ?? 0) - 40) / 60));

/** How much the line still holds with the fences behind (encounters.ts postureOf). */
export const fenceHold = (s: GameState) => 1 - 0.3 * Math.max(0, (s.daily?.chores.levels.fences ?? 0) - 30) / 70;

/** Daily consequences; returns log lines. `r` is the day's random. */
export function choresDay(s: GameState, r: () => number): string[] {
  const out: string[] = [];
  const d = dailyOf(s), lv = d.chores.levels;
  // yesterday's hours become the record the effects read (cooking, hunting, teaching), and the day's dusk hunters meet what's out there
  const tl = tallyOf(s);
  const taught = tl.today.teach ?? 0;
  for (const id of tl.dusk) {
    const i = s.people.findIndex(x => x.id === id), ps = s.personState[i];
    if (!ps || ps.needs.died != null) continue;
    // a hunter out at dusk: a fall, a bad shot, something in the dark (worse with no law and no one to send after them)
    if (r() < (s.disaster.tracks.law < 0.5 ? 0.07 : 0.03) && !ps.needs.hurt.some(h => h.what === 'hunting accident')) {
      ps.needs.hurt.push({ what: 'hunting accident', sev: 20 + Math.floor(r() * 25) });
      out.push(`${s.people[i].first} came back from the woods after dark limping, with a gash. "Should've been in before the light went."`);
    }
  }
  tl.yesterday = tl.today; tl.today = {}; tl.dusk = [];
  // teaching: school kids pick up a little of one skill a day, more with a good teacher and long lessons
  if (taught > 0) s.people.forEach((p, i) => {
    if (!p.kid || p.age < 5 || p.age > 17 || s.personState[i]?.needs.died != null) return;
    const keys = Object.keys(p.skills) as Array<keyof Person['skills']>;
    const k = keys[Math.floor(r() * keys.length)];
    p.skills[k] = Math.min(6, p.skills[k] + 0.006 * taught);
  });
  // animals unfed for days: first off their feed, then they die one by one
  d.neglect = lv.animals >= 90 ? (d.neglect ?? 0) + 1 : Math.max(0, (d.neglect ?? 0) - 2);
  if (d.neglect === 4) out.push('The animals are standing about, off their feed. Something is wrong if nobody has seen to them in days.');
  if (d.neglect >= 7 && r() < 0.12) {
    const sp = (['rabbit', 'goat', 'pig', 'steer', 'sheep'] as const).find(a => Math.floor((s.stock as unknown as Record<string, number>)[a] ?? 0) > 0);
    if (sp) { (s.stock as unknown as Record<string, number>)[sp] -= 1; out.push(`A ${sp} sickened and died. A week of neglect will do that.`); }
  }
  // unsplit rounds season slowly: the pile ages half a day less
  if (lv.woodpile > 60) for (const g of s.upkeep.green) g.at += 0.5;
  // sickness: a fouled filter, a dirty kitchen, dirty laundry
  const sick = (lv.filters > 60 ? (lv.filters - 60) / 40 * 0.05 : 0) + (lv.kitchen > 60 ? (lv.kitchen - 60) / 40 * 0.04 : 0) + (lv.laundry > 80 ? 0.01 : 0) + (lv.house > 70 ? (lv.house - 70) / 30 * 0.03 : 0);
  if (sick > 0 && r() < sick) {
    const alive = s.people.map((p, i) => ({ p, ps: s.personState[i] })).filter(x => x.ps && x.ps.needs.died == null);
    if (alive.length) {
      const { p, ps } = alive[Math.floor(r() * alive.length)];
      const what = lv.filters >= lv.kitchen ? 'stomach bug from the water' : 'food poisoning';
      if (!ps.needs.hurt.some(h => h.what === what)) {
        ps.needs.hurt.push({ what, sev: 12 + Math.floor(r() * 10) });
        out.push(what.startsWith('stomach') ? `${p.first} is sick to the stomach. "When did anyone last clean that filter?"` : `${p.first} has food poisoning. The kitchen needs a proper scrub.`);
      }
    }
  }
  // a warning the first day a chore goes badly behind
  for (const c of CHORES) {
    const v = lv[c];
    if (v >= 80 && (d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned?.[c] !== 1) {
      ((d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned ??= {})[c] = 1;
      if (logGate(s, `behind:${c}`, BEHIND_NAG_DAYS)) out.push(BEHIND_LINE[c]);
    } else if (v < 40 && (d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned?.[c]) delete (d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned![c];
  }
  return out;
}

/** A chore's "falling behind" line shows at most this often (days). */
export const BEHIND_NAG_DAYS = 21;

const BEHIND_LINE: Record<ChoreId, string> = {
  weeds: 'The weeds are winning in the garden. Somebody needs to get out there with a hoe.',
  harvest: 'The harvest is standing in the field. "If we don\'t get it in this week, we lose it."',
  animals: 'The hens are off lay and the animals are bawling. Who was supposed to feed them?',
  pets: 'The dogs have been hanging around the empty bowl. Somebody needs to feed and walk them.',
  hauling: 'The water barrels are near empty. Nobody\'s been down to haul.',
  filters: 'The water filter is clogged and slow. It needs cleaning before someone gets sick.',
  woodpile: 'The rounds are piling up unsplit: they won\'t dry like that.',
  kitchen: 'The kitchen\'s a mess: dishes piled up, flies on the counter.',
  house: 'The house is filthy: dust, dirty dishes and a latrine nobody wants to go near.',
  laundry: 'Nobody has a clean shirt left. The laundry needs doing.',
  fences: 'The fence is sagging in places. A gap like that lets anyone walk in.',
  gear: 'The guns need cleaning and the tools are dull. "Don\'t want to find out it jams when it matters."',
  orchard: 'The orchard is going to seed: unpruned limbs, windfalls rotting under the trees. Somebody needs the loppers and a ladder.',
  greenhouse: 'The greenhouse benches are dry and the vents are shut: the seedlings are scorching.',
  pond: 'Nobody has fed the fish or cleared the screens. The pond is starting to smell.',
};

/** The chores most behind (the UI's "falling behind" list). */
export function behind(s: GameState, min = 40): Array<[ChoreId, number]> {
  const lv = s.daily?.chores.levels;
  if (!lv) return [];
  return CHORES.map(c => [c, lv[c]] as [ChoreId, number]).filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]);
}

/** Morale target terms from daily life (needs.ts adds them): chores behind, hot meals, fatigue, a posted watch at night; gatherings and grief come from gatherings.ts. */
export function lifeMorale(s: GameState, i: number): number {
  const lv = s.daily?.chores.levels;
  if (!lv) return 0;
  const ps = s.personState[i];
  let m = 0;
  if (lv.laundry > 60) m -= 4;
  if (lv.hauling > 70) m -= 4;
  if (lv.animals > 80) m -= 3;
  if (lv.house > 60) m -= 3;
  const cr = cookRatio(s);
  if (cr < 0.6) m -= 4 * (1 - cr / 0.6);   // cold, scrappy meals when nobody cooks
  if (lv.pets > 70 && petDogs(s) > 0) m -= 2;
  // a night owl on the late watch is doing what suits them
  if (ps?.task === 'watch' && s.people[i] && chronotypes(s)[s.people[i].id] === 'owl') m += 1.5;
  if (lv.kitchen < 40 && s.structures.some(st => isFinished(st) && isHome(st.kind))) m += 2;
  if ((ps?.fatigue ?? 0) > 70) m -= 6;
  if ((s.daily?.plan.threat ?? 0) >= 1 && Object.values(s.daily!.plan.hours).some(r => r[1] === 'watch' || r[23] === 'watch')) m += 2;
  return m;
}
