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
import { calendarOf, dayIndex, hourOf, type GameState, type PersonState, type TaskKind } from './state';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { gardenSeason } from './greenhouse';
import { REGIONS, seasons } from './regions';
import { greenRicks } from './upkeep';
import { routineAt } from './schedule';
import { raidPressure } from './opsec';
import type { Person } from './family';

// ─────────────────────────────────────────────────────────────────────────
// Duties
// ─────────────────────────────────────────────────────────────────────────

export type Duty =
  | 'sleep' | 'meal' | 'leisure' | 'school'
  | 'build' | 'garden' | 'fields' | 'livestock' | 'wood' | 'water' | 'kitchen' | 'laundry' | 'repairs'
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
  garden: { name: 'Garden', short: 'G', color: '#5a9a48', work: true, tire: 4, kid: true, hint: 'Weeding, watering and picking the kitchen garden.' },
  fields: { name: 'Fields', short: 'F', color: '#b8a040', work: true, tire: 6, kid: false, hint: 'Hoeing and, in the fall, getting the harvest in.' },
  livestock: { name: 'Livestock', short: 'L', color: '#c08a5a', work: true, tire: 3, kid: true, hint: 'Feed and water the animals, collect the eggs, milk.' },
  wood: { name: 'Wood', short: 'W', color: '#7a5030', work: true, tire: 6, kid: false, hint: 'Felling marked trees, splitting and stacking the rounds.' },
  water: { name: 'Water', short: 'H', color: '#4a90b0', work: true, tire: 4.5, kid: true, hint: 'Hauling water, cleaning the filters.' },
  kitchen: { name: 'Kitchen', short: 'K', color: '#c06a4a', work: true, tire: 3, kid: true, hint: 'Cooking, canning and washing up.' },
  laundry: { name: 'Laundry', short: 'Ld', color: '#9aa8c0', work: true, tire: 3.5, kid: true, hint: 'Washing by hand and hanging it on the line.' },
  repairs: { name: 'Repairs', short: 'R', color: '#8a8a7a', work: true, tire: 4.5, kid: false, hint: 'Fences, roofs, the generator, cleaning the guns.' },
  hunt: { name: 'Hunt & fish', short: 'Hu', color: '#6a7a3a', work: true, tire: 4.5, kid: false, hint: 'Hunting, fishing, running the trap line.' },
  medic: { name: 'Medic', short: '+', color: '#c04a5a', work: true, tire: 3, kid: false, hint: 'Tending the sick and the wounded.' },
  teach: { name: 'Teaching', short: 'T', color: '#6a8ac8', work: true, tire: 2.5, kid: false, hint: 'Teaching the kids.' },
  radio: { name: 'Radio', short: 'Ra', color: '#7a6aa8', work: true, tire: 1.5, kid: false, hint: 'Listening on the radio for news and the net.' },
  watch: { name: 'Watch', short: '!', color: '#c8a030', work: true, tire: 4, kid: false, hint: 'On watch: the wall, the tower, the gate. Helps see trouble coming.' },
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

export type ChoreId = 'weeds' | 'harvest' | 'animals' | 'hauling' | 'filters' | 'woodpile' | 'kitchen' | 'laundry' | 'fences' | 'gear';
export const CHORES: readonly ChoreId[] = ['weeds', 'harvest', 'animals', 'hauling', 'filters', 'woodpile', 'kitchen', 'laundry', 'fences', 'gear'];

export const CHORE_NAME: Record<ChoreId, string> = {
  weeds: 'Garden weeding', harvest: 'Harvest in the fields', animals: 'Feeding the animals', hauling: 'Hauling water', filters: 'Water filters',
  woodpile: 'Splitting and stacking', kitchen: 'Kitchen', laundry: 'Laundry', fences: 'Fences and roofs', gear: 'Guns, tools, the generator',
};
/** What happens when it falls behind (the UI's tooltip). */
export const CHORE_WHY: Record<ChoreId, string> = {
  weeds: 'Weeds choke the beds: the garden yields less.',
  harvest: 'The crop stands in the field and spoils: less of it comes in.',
  animals: 'The hens go off lay and the animals suffer: fewer eggs, lower morale.',
  hauling: 'Short of washing water: morale drops.',
  filters: 'A fouled filter lets bugs through: stomach sickness.',
  woodpile: 'Unsplit rounds dry slowly: firewood seasons at half speed.',
  kitchen: 'A dirty kitchen: food poisoning.',
  laundry: 'Dirty clothes and bedding: morale and hygiene drop.',
  fences: 'Fences sag and gaps open: the line holds people out less well.',
  gear: 'Guns foul and rust, tools dull: less firepower at the gate.',
};
/** Which duty works which chores (first one that needs it). */
export const DUTY_CHORES: Partial<Record<Duty, ChoreId[]>> = {
  garden: ['weeds'], fields: ['harvest', 'weeds'], livestock: ['animals'], water: ['hauling', 'filters'], wood: ['woodpile'],
  kitchen: ['kitchen'], laundry: ['laundry'], repairs: ['fences', 'gear'],
};
/** Person-hours to clear a full backlog (100). */
const CLEAR_HOURS: Record<ChoreId, number> = { weeds: 10, harvest: 8, animals: 2, hauling: 3, filters: 2, woodpile: 8, kitchen: 3, laundry: 5, fences: 10, gear: 6 };

export interface ChoreState { levels: Record<ChoreId, number> }

/** Backlog growth a day, given the place (0 = the chore doesn't apply). */
export function choreRates(s: GameState): Record<ChoreId, number> {
  const fin = s.structures.filter(isFinished);
  const count = (k: string) => fin.filter(st => st.kind === k).length;
  const doy = calendarOf(s.clock).doy;
  const [g0, g1] = gardenSeason(s), H = seasons(REGIONS[s.site.region]).harvest;
  const heads = Math.max(1, s.personState.filter(ps => ps.needs.died == null).length);
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const animals = count('chicken_coop') + (n('goat') + n('pig') + n('steer') + n('rabbit')) / 4;
  const filters = n('water_filter') + n('ro_system') + count('filtration_shed');
  const runs = s.perimeter.filter(r => r.finishedAt !== null).length;
  // without power, the wash is done by hand (half again as long)
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  return {
    weeds: doy >= g0 && doy <= g1 ? 9 * count('garden') : 0,
    harvest: doy >= H[0] && doy < H[1] ? 22 * count('field') : 0,
    animals: animals > 0 ? 50 * Math.min(4, animals) : 0,
    hauling: s.utilities.hauling ? (s.utilities.haulFar ? 60 : 35) : 0,
    filters: filters > 0 ? 4 : 0,
    woodpile: greenRicks(s) > 0.2 ? 8 : 0,
    kitchen: 30 * heads / 4,
    laundry: 14 * heads / 4 * (powered ? 0.6 : 1),
    fences: runs > 0 ? 1.6 + 0.2 * Math.min(10, runs) : 0,
    gear: s.armory.guns.length > 0 || n('generator') > 0 ? 3 : 0,
  };
}

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
}

export interface Daily { plan: DayPlan; chores: ChoreState; /** Gatherings (sim/gatherings.ts). */ social: import('./gatherings').Social }

export function newDaily(): Daily {
  return {
    plan: { auto: true, hours: {}, locked: [], day: -1, threat: 0 },
    chores: { levels: Object.fromEntries(CHORES.map(c => [c, 0])) as Record<ChoreId, number> },
    social: { active: null, last: {}, glow: 0, glowAt: 0, noise: 0, noiseAt: 0, grief: [], held: 0 },
  };
}

/** The daily-life state (lazily made, so old saves and tests that build state by hand work). */
export const dailyOf = (s: GameState): Daily => (s.daily ??= newDaily());

/** choreRates, once per game hour (the engine asks every quarter-hour). */
let _rates: { s: GameState | null; hour: number; v: Record<ChoreId, number> } = { s: null, hour: -1, v: {} as Record<ChoreId, number> };
export function choreRatesCached(s: GameState): Record<ChoreId, number> {
  const hour = Math.floor(s.clock.ticks / 4);
  if (_rates.s !== s || _rates.hour !== hour) _rates = { s, hour, v: choreRates(s) };
  return _rates.v;
}

// ─────────────────────────────────────────────────────────────────────────
// Threat and the auto-planner
// ─────────────────────────────────────────────────────────────────────────

const HOSTILE = new Set(['looters', 'gang', 'horde', 'militia', 'break_in', 'ransom']);

/** 0 calm (the law works), 1 guarded (no law), 2 high (no law, and raided lately or everyone knows you have stores). */
export function threatLevel(s: GameState): number {
  if (s.disaster.tracks.law >= 0.5) return 0;
  const day = dayIndex(s.clock.t);
  const recent = s.gate.history.some(h => HOSTILE.has(h.kind) && day - h.day <= 21);
  return recent || raidPressure(s) >= 1.25 ? 2 : 1;
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
 * Fill everyone's day (people the player locked keep their rows). Rules:
 * kids at school, everyone sleeps 7–8 h and nobody works more than 14;
 * chores go to whoever is best at them, the most behind first; with no law,
 * someone is on watch through the night in two shifts (rotating by day);
 * at high threat someone also watches by day.
 */
export function autoPlan(s: GameState, ctx: { build: boolean; fell: boolean }): void {
  const d = dailyOf(s), plan = d.plan;
  const day = dayIndex(s.clock.t);
  const c: PlanCtx = { ...ctx, doy: calendarOf(s.clock).doy, threat: threatLevel(s), after: s.disaster.phase === 'impact' || s.disaster.phase === 'survival' };
  const rates = choreRates(s), lv = d.chores.levels;
  const free = s.people.map((p, i) => ({ p, i })).filter(({ p, i }) => ableAt(s, i) && !plan.locked.includes(p.id));
  const rows = new Map<string, Duty[]>();
  for (const { p } of free) {
    const work = p.kid ? (ctx.build ? 'build' : 'garden') : ctx.build ? 'build' : seasonalWork(s, c, p);
    rows.set(p.id, baseRow(p, work as Duty));
  }
  const adults = free.filter(({ p }) => !p.kid && !p.elder);
  const helpers = free.filter(({ p }) => !p.kid || p.age >= 8);
  // ── chores: the dawn hour and the late-afternoon two; most behind (and most needed) first, to whoever is best ──
  const SKILL: Partial<Record<Duty, keyof Person['skills']>> = { garden: 'gardener', fields: 'gardener', livestock: 'gardener', repairs: 'mechanic', wood: 'builder', water: 'builder', kitchen: 'medic', hunt: 'hunter' };
  const needed = (Object.entries(DUTY_CHORES) as Array<[Duty, ChoreId[]]>)
    .map(([duty, cs]) => ({ duty, urgency: Math.max(...cs.map(ch => (rates[ch] > 0 || lv[ch] > 5 ? lv[ch] + rates[ch] : -1))) }))
    .filter(x => x.urgency >= 0)
    .sort((a, b) => b.urgency - a.urgency);
  let k = day;
  for (const { p } of helpers) {
    const row = rows.get(p.id)!;
    for (let h = 0; h < 24; h++) {
      // the routine's chore hours (dawn, late afternoon) carry a placeholder: give each a real chore
      if (row[h] !== 'kitchen' || h === 12 || h === 18) continue;
      const top = needed.filter(x => canDo(p, x.duty)).slice(0, 3);
      if (!top.length) { row[h] = p.kid ? 'leisure' : 'repairs'; continue; }
      const turn = top[k++ % top.length];
      // someone good at one of them takes it every other hour
      const fit = top.find(x => SKILL[x.duty] && p.skills[SKILL[x.duty]!] >= 5);
      row[h] = fit && k % 2 === 0 ? fit.duty : turn.duty;
    }
  }
  // someone cooks supper (the hour before it) and washes up
  const cook = adults.length ? adults[day % adults.length] : free.find(({ p }) => !p.kid);
  if (cook) { const row = rows.get(cook.p.id)!; row[17] = 'kitchen'; }
  // ── after the hit: the teacher teaches, the medic tends, the radio is listened to ──
  const schoolKids = free.filter(({ p }) => p.kid && p.age >= 5).length;
  if (c.after && schoolKids && adults.length >= 2) {
    const t = [...adults].sort((a, b) => b.p.skills.teacher - a.p.skills.teacher)[0];
    const row = rows.get(t.p.id)!;
    for (let h = 8; h < 11; h++) row[h] = 'teach';
  }
  const hurt = s.personState.some(ps => ps.needs.died == null && ps.needs.hurt.length > 0);
  if (hurt) {
    const m = [...free.filter(({ p }) => !p.kid)].sort((a, b) => b.p.skills.medic - a.p.skills.medic)[0];
    if (m && m.p.skills.medic >= 2) { const row = rows.get(m.p.id)!; for (let h = 13; h < 15; h++) row[h] = 'medic'; }
  }
  if (c.after && (s.stock.ham_rig >= 1 || s.stock.sw_radio >= 1)) {
    const r = [...free.filter(({ p }) => !p.kid || p.age >= 12)].sort((a, b) => b.p.skills.radio - a.p.skills.radio)[0];
    if (r) rows.get(r.p.id)![20] = 'radio';
  }
  // ── the watch ──
  if (c.threat >= 1) {
    const guards = free.filter(({ p }) => !p.kid || p.age >= 15)
      .sort((a, b) => (s.personState[a.i].fatigue ?? 0) - (s.personState[b.i].fatigue ?? 0) || b.p.skills.hunter - a.p.skills.hunter);
    // rotate who takes which shift by day (the least tired first)
    const g = guards.length ? [...guards.slice(day % guards.length), ...guards.slice(0, day % guards.length)] : [];
    const first = g[0], second = g.length > 1 ? g[1] : null;
    if (first) {
      const row = rows.get(first.p.id)!;
      // 22–02 on the wall, then sleep to 9
      for (const h of [22, 23, 0, 1]) row[h] = 'watch';
      for (let h = 2; h < 9; h++) row[h] = 'sleep';
      if (!second) for (const h of [2, 3]) row[h] = 'sleep';
    }
    if (second) {
      const row = rows.get(second.p.id)!;
      // to bed at 20, up at 02 for the second watch, back to bed 06–08
      for (const h of [20, 21, 22, 23, 0, 1]) row[h] = 'sleep';
      for (let h = 2; h < 6; h++) row[h] = 'watch';
      for (const h of [6, 7]) row[h] = 'sleep';
    }
    if (c.threat >= 2 && g.length >= 3) {
      // a day watch, split between two who are not on the night
      const day1 = g[2], day2 = g[3] ?? g[2];
      for (let h = 7; h < 12; h++) rows.get(day1.p.id)![h] = 'watch';
      for (let h = 13; h < 17; h++) rows.get(day2.p.id)![h] = 'watch';
    }
  }
  // ── nobody works more than 14 hours; everyone gets 7 of sleep ──
  for (const [, row] of rows) capRow(row);
  for (const [id, row] of rows) plan.hours[id] = row;
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
  const plan = dailyOf(s).plan;
  const row = (plan.hours[personId] ??= baseRow(p));
  for (const h of hours) row[((h % 24) + 24) % 24] = duty;
  if (!plan.locked.includes(personId)) plan.locked.push(personId);
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
  sleep: 'sleep', meal: 'meal', leisure: 'leisure', school: 'school', garden: 'garden', fields: 'fields', livestock: 'livestock', wood: 'wood',
  water: 'water', kitchen: 'kitchen', laundry: 'laundry', repairs: 'repairs', hunt: 'hunt', medic: 'medic', teach: 'teach', radio: 'radio', watch: 'watch',
};

/** Restedness multiplier on work: full to fatigue 50, half at 100. */
export const restFactor = (ps: PersonState | undefined) => 1 - Math.max(0, (ps?.fatigue ?? 0) - 50) / 100;

/** Fatigue for `hours` on a duty (night hours awake tire more). */
export function tire(ps: PersonState, duty: Duty, hour: number, hours: number): void {
  const night = hour >= 22 || hour < 6;
  const t = DUTY[duty].tire + (night && duty !== 'sleep' ? 2.5 : 0);
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
  for (const c of CHORES) lv[c] = rates[c] > 0 ? Math.min(100, lv[c] + rates[c] * days) : Math.max(0, lv[c] - 20 * days);
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

/** The duty a person is on this game hour, resolved (nothing to do → the fallback), cached for the hour's four sub-steps. */
let _duties: { s: GameState | null; hour: number; m: Map<string, Duty> } = { s: null, hour: -1, m: new Map() };
export function hourDuty(s: GameState, p: Person, h: number, rates: Record<ChoreId, number>, canWork: boolean): Duty {
  const hour = Math.floor(s.clock.ticks / 4);
  if (_duties.s !== s || _duties.hour !== hour) _duties = { s, hour, m: new Map() };
  let d = _duties.m.get(p.id);
  if (d === undefined) {
    d = dutyAt(s, p, h);
    if (!dutyApplies(s, d, rates) || (d === 'build' && !canWork)) d = fallbackDuty(s, p, rates);
    _duties.m.set(p.id, d);
  }
  return d;
}

/** An hour slice of a duty's work: chores come down; the medic tends the hurt. */
export function dutyWork(s: GameState, p: Person, ps: PersonState, duty: Duty, personHours: number): void {
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
export interface Watcher { id: string; post: WatchPost; night: boolean; alert: number }

/**
 * Who is on watch right now (reads the tasks the last sub-step set). For the
 * gate (detection) and the atmosphere layer (flashlights at night). Posts:
 * the first watcher takes the tower if there is one, the next walks the wall
 * (if there's a perimeter), the rest the gate.
 */
export function watchNow(s: GameState): Watcher[] {
  const h = hourOf(s.clock.t), night = h >= 20 || h < 6;
  const tower = s.structures.some(st => isFinished(st) && st.kind.includes('tower'));
  const wall = s.perimeter.some(r => r.finishedAt !== null);
  const out: Watcher[] = [];
  for (const ps of s.personState) {
    if (ps.task !== 'watch' || ps.needs.died != null) continue;
    const k = out.length;
    const post: WatchPost = k === 0 && tower ? 'tower' : wall && k <= 1 ? 'wall' : 'gate';
    out.push({ id: ps.id, post, night, alert: Math.max(0.3, 1 - (ps.fatigue ?? 0) / 140) });
  }
  return out;
}

/** Detection points the posted watch adds (0–20): a rested guard adds about ten, the next six. */
export function watchDetection(s: GameState): number {
  const w = watchNow(s).sort((a, b) => b.alert - a.alert);
  let sum = 0;
  w.forEach((x, k) => { sum += (k === 0 ? 10 : k === 1 ? 6 : 2) * x.alert * (x.post === 'tower' ? 1.2 : 1); });
  return Math.min(20, sum);
}

// ─────────────────────────────────────────────────────────────────────────
// Once a day: what falling behind does
// ─────────────────────────────────────────────────────────────────────────

/** Yield multiplier on a crop from its chore (needs.ts reads it): weeds take up to half the garden, the field loses up to 60 % standing, hungry hens lay 60 % less. */
export function careYield(s: GameState, c: 'weeds' | 'harvest' | 'animals'): number {
  const v = s.daily?.chores.levels[c] ?? 0;
  return 1 - (c === 'weeds' ? 0.5 : 0.6) * Math.max(0, v - 20) / 80;
}

/** How much the line still holds with the fences behind (encounters.ts postureOf). */
export const fenceHold = (s: GameState) => 1 - 0.3 * Math.max(0, (s.daily?.chores.levels.fences ?? 0) - 30) / 70;

/** Daily consequences; returns log lines. `r` is the day's random. */
export function choresDay(s: GameState, r: () => number): string[] {
  const out: string[] = [];
  const d = dailyOf(s), lv = d.chores.levels;
  // unsplit rounds season slowly: the pile ages half a day less
  if (lv.woodpile > 60) for (const g of s.upkeep.green) g.at += 0.5;
  // sickness: a fouled filter, a dirty kitchen, dirty laundry
  const sick = (lv.filters > 60 ? (lv.filters - 60) / 40 * 0.05 : 0) + (lv.kitchen > 60 ? (lv.kitchen - 60) / 40 * 0.04 : 0) + (lv.laundry > 80 ? 0.01 : 0);
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
      out.push(BEHIND_LINE[c]);
    } else if (v < 40 && (d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned?.[c]) delete (d.chores as { warned?: Partial<Record<ChoreId, number>> }).warned![c];
  }
  return out;
}

const BEHIND_LINE: Record<ChoreId, string> = {
  weeds: 'The weeds are winning in the garden. Somebody needs to get out there with a hoe.',
  harvest: 'The harvest is standing in the field. "If we don\'t get it in this week, we lose it."',
  animals: 'The hens are off lay and the animals are bawling. Who was supposed to feed them?',
  hauling: 'The water barrels are near empty. Nobody\'s been down to haul.',
  filters: 'The water filter is clogged and slow. It needs cleaning before someone gets sick.',
  woodpile: 'The rounds are piling up unsplit: they won\'t dry like that.',
  kitchen: 'The kitchen\'s a mess: dishes piled up, flies on the counter.',
  laundry: 'Nobody has a clean shirt left. The laundry needs doing.',
  fences: 'The fence is sagging in places. A gap like that lets anyone walk in.',
  gear: 'The guns need cleaning and the tools are dull. "Don\'t want to find out it jams when it matters."',
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
  if (lv.kitchen < 40 && s.structures.some(st => isFinished(st) && isHome(st.kind))) m += 2;
  if ((ps?.fatigue ?? 0) > 70) m -= 6;
  if ((s.daily?.plan.threat ?? 0) >= 1 && Object.values(s.daily!.plan.hours).some(r => r[1] === 'watch' || r[23] === 'watch')) m += 2;
  return m;
}
