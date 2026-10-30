/**
 * The weekender (docs/DECISIONS.md: "Weekend getaway, both a setup option and
 * an early-game phase"). The family keeps the town house and the jobs and comes
 * up to the place on weekends, holidays and vacations; the rest of the week
 * the compound sits empty. Later, as the warning signs grow, they decide
 * whether to move in for good. Pure (tested); the engine calls the steps.
 *
 *  Calendar     `isFreeDay` (weekends, a few holidays, three vacation weeks, and
 *               the first week while they settle in) and `onSiteAt`: they drive
 *               up Friday at 19:00 and leave Sunday at 16:00, or stay through a
 *               run of free days. Relatives who moved in, and anyone who
 *               arrived later, live on the place and stay.
 *  Trips        the fleet drives them (sim/vehicles.ts): the vehicles leave
 *               and come back, miles and fuel are counted, a town car covers
 *               the seats the fleet lacks, a breakdown on the road can hold
 *               them up.
 *  Empty place  chores stop growing for the house (nobody is using it) but
 *               the animals, the garden and the greenhouse go on; a caretaker
 *               (a neighbor, a visiting one, a live-in one) does their share;
 *               break-ins, vandalism, squatters and frozen pipes are likelier
 *               the emptier and darker it looks.
 *  The sale     the town house has a market value that falls as the collapse
 *               approaches, a mortgage that comes out first, and a sale that
 *               cannot close once the banks shut or the market freezes.
 *  Moving in    a decision card (EncounterKind 'move_in'): sell, move in and
 *               keep the house as a fallback, or hold on. If the hit comes
 *               while they are in town, a second card ('stranded') asks how
 *               they get home, and the road decides the rest.
 */
import { dayIndex, type GameState } from './state';
import { mulberry32 } from './rng';
import { tension, type Phase } from './disaster';
import { CLEAR_HOURS, dailyOf, type ChoreId } from './daily';
import { fleetOf, refuel, roadTrouble, runs, VEHICLES, type Vehicle } from './vehicles';
import { ROAD_CLOSED_TEXT, roadClosedFor } from './slope';
import { syncParking } from './parking';
import { wayCut } from './corridors';
import { stealTools } from './tools';
import { burgle } from './breakins';
import type { Person } from './family';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { raidPressure } from './opsec';
import { demandNow } from './heating';
import { logGate } from './nag';
import type { Encounter, Outcome, Stance } from './encounters';

// ── Types ──────────────────────────────────────────────────────────────────

export type CaretakerKind = 'neighbor' | 'visiting' | 'live_in';
export interface Caretaker {
  kind: CaretakerKind;
  /** The neighbor who looks in (kind 'neighbor'). */
  neighbor?: string;
  since: number;
  /** Did they come today (rolled each dawn from their reliability)? */
  on: boolean;
  /** Days they did not come, in all. */
  missed: number;
}

export interface TownHouse {
  /** Market value in a normal market, and the mortgage still owed. */
  value: number;
  mortgage: number;
  /** owned: lived in on weekdays · kept: moved up but not sold (a fallback) · sold. */
  status: 'owned' | 'kept' | 'sold';
  soldFor?: number;
  /**
   * Rented, not owned (the family chose to sell the house at setup and rent in town): the monthly rent. The house reads as
   * sold from the first day; there is no mortgage, no property tax, nothing to sell and no fallback house.
   */
  rent?: number;
  /** What the sale cleared after the agent and the mortgage. */
  net?: number;
  soldDay?: number;
}

/** Caught in town when it hit: the way home. */
export interface Stranded {
  since: number;
  /** card: waiting for the player's choice · road: on the way · (gone when they arrive). */
  phase: 'card' | 'road';
  how?: 'drive_now' | 'back_roads' | 'resupply';
  /** Game time they arrive, and what happens on the way (told on arrival). */
  until?: number;
  notes?: string[];
  /** Applied on arrival: wounds, a lost vehicle, money. */
  hurt?: Array<{ who: string; what: string; sev: number }>;
  lostVehicles?: string[];
  walking?: boolean;
}

export interface Weekend {
  /** split: weekdays in town, weekends here · moved: living here (the town house may be kept). */
  mode: 'split' | 'moved';
  /** The people who go back and forth (the household at the start, relatives who came along included); anyone who joins later lives here. */
  travelers: string[];
  /** Miles each way between the town house and the place. */
  driveMiles: number;
  town: TownHouse;
  caretaker: Caretaker | null;
  /** What the empty place does with its lights: timers (looks lived in) or dark. */
  lights: 'timers' | 'dark';
  /** Tighten the belt in town (save v66): cheaper upkeep and groceries on the weekdays, a little lower mood. */
  belt?: boolean;
  /** Is the family on the place right now (updated each sub-step). */
  here: boolean;
  /** The vehicles that made the trip (away while the family is). */
  cars: string[];
  /** They arrive late (a breakdown on the road), game time. */
  lateUntil?: number;
  /** Move in: keep the jobs that can be done from home (the rest are quit). */
  keepJobs: boolean;
  /** The move-in card shows when the warning reaches this share, and how many times they have been asked. */
  askAt: number;
  asked: number;
  movedDay?: number;
  stranded: Stranded | null;
  /** News from the empty place, told when they next arrive. */
  found: string[];
  /** Counts for the Family tab. */
  tally: { trips: number; miles: number; spent: number; breakIns: number; vandalism: number; squatters: number; pipes: number; theft: number; lapses: number };
  /** Day of the last daily step. */
  day: number;
}

// ── The calendar ───────────────────────────────────────────────────────────

/** They drive up Friday after work and leave Sunday afternoon. */
export const ARRIVE_H = 19, DEPART_H = 16;
/** The first week they have taken off to settle in. */
export const SETTLE_DAYS = 7;
/** Vacation weeks (day of the year, inclusive): spring break, two weeks in July, Christmas to New Year. */
export const VACATIONS: ReadonlyArray<readonly [number, number]> = [[69, 75], [196, 209], [357, 365], [1, 2]];

const dow = (d: number): number => ((d % 7) + 7) % 7;   // 0 = Monday
export const doyOf = (startDoy: number, d: number): number => (((startDoy - 1 + d) % 365) + 365) % 365 + 1;

/** A day off work for the family: weekends, holidays, vacations, and the first week. */
export function isFreeDay(startDoy: number, d: number): boolean {
  if (d < SETTLE_DAYS) return true;
  const w = dow(d), doy = doyOf(startDoy, d);
  if (w >= 5) return true;
  if (VACATIONS.some(([a, b]) => doy >= a && doy <= b)) return true;
  if (w === 0 && ((doy >= 145 && doy <= 151) || (doy >= 244 && doy <= 250))) return true;   // Memorial Day, Labor Day
  if (doy === 185) return true;                                                              // the Fourth
  if (w === 3 && doy >= 326 && doy <= 332) return true;                                      // Thanksgiving
  if (w === 4 && doy >= 327 && doy <= 333) return true;                                      // and the Friday after
  return false;
}

/** On the place at this day and hour (the calendar alone). */
export function onSiteAt(startDoy: number, d: number, h: number): boolean {
  const free = isFreeDay(startDoy, d), next = isFreeDay(startDoy, d + 1);
  return free ? next || h < DEPART_H : next && h >= ARRIVE_H;
}

/** A weekday off that is still paid: a holiday or a vacation day (not the week they take to settle in, and not a weekend). */
export const paidLeaveDay = (startDoy: number, d: number): boolean => d >= SETTLE_DAYS && dow(d) < 5 && isFreeDay(startDoy, d);

/** Whether the jobs are working today (the family's weekdays; not on a holiday). */
export const workDay = (startDoy: number, d: number): boolean => !isFreeDay(startDoy, d);
/** Is the day-job day (for whoever holds one): Monday to Friday, less the weekender's holidays and vacations. */
export const jobDayOf = (s: GameState, d: number): boolean => (s.weekend?.mode === 'split' ? workDay(s.clock.startDoy, d) : ((d % 7) + 7) % 7 < 5);

/** Days a week the family is on the place and can build, over a year: Saturday and part of Sunday, plus the holidays and vacations. */
export function siteDaysPerWeek(startDoy: number): number {
  let sum = 0;
  for (let d = SETTLE_DAYS; d < SETTLE_DAYS + 364; d++) {
    const free = isFreeDay(startDoy, d), next = isFreeDay(startDoy, d + 1);
    sum += free ? (next ? 1 : 0.7) : 0;
  }
  return sum / 52;
}

// ── State ──────────────────────────────────────────────────────────────────

export const weekendOf = (s: GameState): Weekend | undefined => s.weekend;
/** Weekdays in town, weekends here. */
export const isSplit = (s: GameState): boolean => s.weekend?.mode === 'split';
export const hourNow = (s: GameState): number => (s.clock.ticks * 0.25 + 6) % 24;

import { equityNet, mortgagePayment, rentFor, SALE_FEES, townHouseFor, townTaxHalf, townUpkeep, type TownPlan } from './townHouse';
export { townHouseFor, mortgagePayment, townUpkeep, townTaxHalf, SALE_FEES, rentFor, equityNet, RENT_DEPOSIT_MONTHS, type TownPlan } from './townHouse';

/** Tightening the belt in town: the share of the upkeep that is left (thermostat down, the streaming and the yard service dropped, the second car parked). */
export const BELT_UPKEEP = 0.55;
/** ... and of the household's groceries and bills (the weekday meals out, the kids' activities, the shopping). */
export const BELT_LIVING = 0.85;
/** ... and what it takes out of the mood of the people in town (points of the morale a day settles toward). */
export const BELT_MORALE = 3;

export const isRented = (t: Pick<TownHouse, 'rent'>): boolean => t.rent !== undefined;
/** Belt-tightening is on for a family that splits its week. */
export const beltOn = (s: GameState): boolean => s.weekend?.mode === 'split' && !!s.weekend.belt;
/** Mood lost to a lean household in town (only the people who go back and forth feel it). */
export const beltMorale = (s: GameState, id: string): number => (beltOn(s) && s.weekend!.travelers.includes(id) ? BELT_MORALE : 0);
/** The share of the household's groceries and bills that is paid while the belt is tight. */
export const livingShare = (s: GameState): number => (beltOn(s) ? BELT_LIVING : 1);

/** The town house's upkeep a month at the moment: less with the belt tight. */
export const townUpkeepNow = (w: Pick<Weekend, 'town' | 'belt' | 'mode'>): number => Math.round(townUpkeep(w.town) * (w.belt && w.mode === 'split' ? BELT_UPKEEP : 1));
/** What the town home costs a month while the banks work: the rent, or the mortgage and the upkeep (the property tax comes twice a year, apart). */
export const townCostPerMonth = (w: Pick<Weekend, 'town' | 'belt' | 'mode'>): number =>
  w.town.rent !== undefined ? w.town.rent : w.town.status === 'sold' ? 0 : mortgagePayment(w.town) + townUpkeepNow(w);
/** ... by the day. */
export const townCostPerDay = (w: Pick<Weekend, 'town' | 'belt' | 'mode'>): number => townCostPerMonth(w) / 30;
/** Everything the town home costs in a year, tax included (the number the setup screen and the Family tab show). */
export const townCostPerYear = (w: Pick<Weekend, 'town' | 'belt' | 'mode'>): number =>
  townCostPerMonth(w) * 12 + (w.town.status === 'sold' ? 0 : townTaxHalf(w.town) * 2);

export function newWeekend(people: readonly Person[], seed: number, siteMiles: number, plan: TownPlan = 'own'): Weekend {
  const th = townHouseFor(people, seed);
  const r = mulberry32(seed * 7001 + 3);
  return {
    mode: 'split',
    travelers: people.map(p => p.id),
    driveMiles: Math.round(35 + siteMiles * 1.2 + r() * 55),
    town: plan === 'rent'
      ? { ...th, mortgage: 0, status: 'sold', soldFor: th.value, net: equityNet(th), soldDay: -1, rent: rentFor(th.value) }
      : { ...th, status: 'owned' },
    caretaker: null, lights: 'timers', here: true, cars: [], keepJobs: true, belt: false,
    askAt: -1, asked: 0, stranded: null, found: [],
    tally: { trips: 0, miles: 0, spent: 0, breakIns: 0, vandalism: 0, squatters: 0, pipes: 0, theft: 0, lapses: 0 },
    day: -1,
  };
}

/** The calendar says they are on the place (and they are not caught in town). */
export function calendarHere(s: GameState): boolean {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return true;
  if (w.stranded) return false;
  return onSiteAt(s.clock.startDoy, dayIndex(s.clock.t), hourNow(s));
}

/** Is this person somewhere else right now (at the town house, at work in town, on the road)? */
export function isAbsent(s: GameState, personId: string): boolean {
  const w = s.weekend;
  return !!w && w.mode === 'split' && !w.here && w.travelers.includes(personId);
}
/** The same by index in `s.people`. */
export const absentIdx = (s: GameState, i: number): boolean => { const p = s.people[i]; return !!p && isAbsent(s, p.id); };

/** People who live on the place (relatives who moved in, anyone taken in) and so are home on weekdays. */
export function residents(s: GameState): Person[] {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return s.people.filter((_, i) => s.personState[i]?.needs.died == null);
  return s.people.filter((p, i) => !w.travelers.includes(p.id) && s.personState[i]?.needs.died == null && !s.personState[i]?.needs.taken);
}

/** Someone is on the place: the family, a resident, or a live-in caretaker. */
export function occupied(s: GameState): boolean {
  const w = s.weekend;
  if (!w || w.mode !== 'split' || w.here) return true;
  return residents(s).length > 0 || w.caretaker?.kind === 'live_in';
}
/** Nobody at all (the case the burglar, the squatter and the winter pipes care about). */
export const emptyNow = (s: GameState): boolean => !occupied(s);

/** Fraction of the heating the place burns: an empty house is kept at frost-protection. */
export const heatShare = (s: GameState): number => (occupied(s) ? 1 : 0.15);

// ── Caretakers ─────────────────────────────────────────────────────────────

export interface CaretakerDef {
  name: string;
  blurb: string;
  perMonth: number;
  /** Hours a day of chores when they come. */
  hours: number;
  reliability: number;
  /** The chores they do, most important first. */
  chores: ChoreId[];
  /** Burglars and vandals: the share of the risk that is left (1 = none saved). */
  watch: number;
}
export const CARETAKER: Record<CaretakerKind, CaretakerDef> = {
  neighbor: { name: 'A neighbor looks in', blurb: 'Someone down the road feeds the animals and checks the doors each day. Gas money and a case of beer; they have their own troubles, and miss a day now and then.', perMonth: 150, hours: 1.2, reliability: 0.88, chores: ['animals', 'pond'], watch: 0.6 },
  visiting: { name: 'A hired caretaker', blurb: 'A property caretaker comes every day for a couple of hours: the animals, the greenhouse, the garden beds, a walk round the doors and a light left on.', perMonth: 1400, hours: 3, reliability: 0.96, chores: ['animals', 'greenhouse', 'pond', 'weeds', 'orchard', 'filters'], watch: 0.35 },
  live_in: { name: 'A live-in caretaker', blurb: 'A couple who live in the guest house and run the place while you are away: everything the visiting one does, the fences and the woodpile, and someone is always home.', perMonth: 4200, hours: 7, reliability: 0.99, chores: ['animals', 'greenhouse', 'pond', 'weeds', 'harvest', 'orchard', 'fences', 'woodpile', 'filters'], watch: 0.1 },
};
export const CARETAKER_KINDS: readonly CaretakerKind[] = ['neighbor', 'visiting', 'live_in'];

/** A neighbor who would look in: friendly, still home, nearest first. */
export function willingNeighbor(s: GameState): string | null {
  const ok = s.neighbors.filter(n => n.status === 'home' && n.disposition >= 0 && n.members >= 1).sort((a, b) => b.disposition - a.disposition || a.km - b.km);
  return ok[0]?.id ?? null;
}

/** Why a caretaker of this kind cannot be arranged now (null: they can). */
export function caretakerProblem(s: GameState, kind: CaretakerKind): string | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return 'the family lives on the place';
  if (s.disaster.tracks.banks < 0.5) return 'nobody takes money now';
  if (w.caretaker?.kind === kind) return 'already arranged';
  if (kind === 'neighbor' && !willingNeighbor(s)) return 'no neighbor is friendly enough yet (talk to them at the gate)';
  if (kind === 'live_in' && !s.structures.some(st => isFinished(st) && isHome(st.kind))) return 'needs a finished house for them to live in';
  if (kind !== 'neighbor' && s.money < CARETAKER[kind].perMonth) return 'not enough money for the first month';
  return null;
}

export function hireCaretaker(s: GameState, kind: CaretakerKind): string | null {
  const why = caretakerProblem(s, kind);
  if (why) return why;
  const w = s.weekend!;
  const nb = kind === 'neighbor' ? willingNeighbor(s) : null;
  w.caretaker = { kind, ...(nb ? { neighbor: nb } : {}), since: s.clock.t, on: true, missed: 0 };
  const who = nb ? s.neighbors.find(n => n.id === nb)?.name : null;
  s.log.push({ t: s.clock.t, text: kind === 'neighbor' ? `${who ? who[0].toUpperCase() + who.slice(1) : 'A neighbor'} will look in on the place while the family is away.` : `${CARETAKER[kind].name} hired: $${CARETAKER[kind].perMonth.toLocaleString('en-US')} a month.` });
  return null;
}

export function dismissCaretaker(s: GameState): void {
  const w = s.weekend;
  if (w) w.caretaker = null;
}

/** Break-in, vandalism and squatter risk, as a multiplier on an ordinary place's (1 = nobody saved anything). */
export function watchShare(s: GameState): number {
  const w = s.weekend;
  if (!w) return 1;
  const c = w.caretaker ? CARETAKER[w.caretaker.kind].watch : 1;
  return c * (w.lights === 'timers' ? 0.75 : 1);
}
/** An empty place is a mark: five or six times as likely to be hit as one with people in it, less what a caretaker and the lights save. */
export const EMPTY_MULT = 6;
export function emptyMultiplier(s: GameState): number {
  return emptyNow(s) ? EMPTY_MULT * watchShare(s) : 1;
}

/** The chore rates while nobody is at home: nobody uses the kitchen, the wash or the water barrels; the animals and the garden carry on. */
export function awayRates(s: GameState, rates: Record<ChoreId, number>): Record<ChoreId, number> {
  if (!emptyNow(s)) return rates;
  return { ...rates, kitchen: 0, house: 0, laundry: 0, hauling: 0 };
}

/** What a caretaker does with their hours (called once a day at 10:00 while the place is empty). */
export function caretakerWork(s: GameState, rates: Record<ChoreId, number>): void {
  const w = s.weekend;
  if (!w || !w.caretaker || !w.caretaker.on || w.here) return;
  const def = CARETAKER[w.caretaker.kind];
  const lv = dailyOf(s).chores.levels;
  let left = def.hours;
  // each chore gets what a day's growth plus a third of the backlog asks for, most important first
  for (const c of def.chores) {
    if (left <= 0.01) break;
    const want = (rates[c] + lv[c] / 3) / 100 * CLEAR_HOURS[c];
    if (want <= 0.01) continue;
    const use = Math.min(left, want);
    lv[c] = Math.max(0, lv[c] - use * 100 / CLEAR_HOURS[c]);
    left -= use;
  }
}

// ── Trips ──────────────────────────────────────────────────────────────────

const TRIP_KINDS = ['suv', 'pickup', 'old_pickup'] as const;

/** The vehicles that take the family: as few as seat them, the big wagon first. */
export function tripVehicles(s: GameState): Vehicle[] {
  const w = s.weekend;
  if (!w) return [];
  if (wayCut(s)) return [];     // every vehicle on the place is cut off from the road (a lost bridge, a fallen tunnel): they walk out to the town car
  const need = w.travelers.filter(id => { const i = s.people.findIndex(p => p.id === id); return i >= 0 && s.personState[i]?.needs.died == null; }).length;
  const cands = fleetOf(s).filter(v => (TRIP_KINDS as readonly string[]).includes(v.kind) && runs(v) && !v.away && v.condition > 0.1)
    .sort((a, b) => TRIP_KINDS.indexOf(a.kind as typeof TRIP_KINDS[number]) - TRIP_KINDS.indexOf(b.kind as typeof TRIP_KINDS[number]));
  const out: Vehicle[] = [];
  let seats = 0;
  for (const v of cands) { if (seats >= need) break; out.push(v); seats += VEHICLES[v.kind].seats; }
  return out;
}

/** Cars the household needs beyond the fleet's seats: the town car, four to a car. */
export function townCars(s: GameState, taken: readonly Vehicle[]): number {
  const w = s.weekend;
  if (!w) return 0;
  const need = w.travelers.length, seats = taken.reduce((a, v) => a + VEHICLES[v.kind].seats, 0);
  return need > seats ? Math.ceil((need - seats) / 4) : 0;
}

/** A cost a mile for the town car (gas, tires, wear). */
export const TOWN_CAR_USD_MILE = 0.4;

/** Drive a leg: the miles, the fuel (filled at the pump while it works, from the cans after) and the wear. */
function driveLeg(s: GameState, v: Vehicle, miles: number): void {
  const def = VEHICLES[v.kind];
  if (def.tankL <= 0) return;
  const litres = miles / def.mpg * 3.785;
  if (v.fuel < litres) refuel(s, v);
  v.fuel = Math.max(0, v.fuel - litres);
  v.mileage += miles;
}

function payTrip(s: GameState, w: Weekend, usd: number): void {
  if (usd <= 0 || s.disaster.tracks.banks < 0.5) return;
  s.money -= usd; w.tally.spent += usd;
}

/** The family leaves (Sunday afternoon) or arrives (Friday evening): the vehicles go or return, the fuel is burned, the bills are paid. Returns log lines. */
function travel(s: GameState, w: Weekend, arriving: boolean): string[] {
  const out: string[] = [];
  if (!arriving) {
    const cars = tripVehicles(s);
    const cut = wayCut(s);
    if (cut) out.push(`${cut[0].toUpperCase()}${cut.slice(1)}: nothing with wheels gets out. They walk to the road and take the town car; the vehicles stay where they are.`);
    w.cars = cars.map(v => v.id);
    for (const v of cars) { v.away = true; driveLeg(s, v, w.driveMiles); }
    const extra = townCars(s, cars);
    payTrip(s, w, extra * w.driveMiles * TOWN_CAR_USD_MILE);
    w.tally.miles += w.driveMiles * Math.max(1, cars.length + extra);
    syncParking(s);
    return out;
  }
  // arriving: the week's commute too (the lead vehicle drives to the jobs in town), then up the road
  const cars = w.cars.map(id => fleetOf(s).find(v => v.id === id)).filter((v): v is Vehicle => !!v);
  const commute = s.personState.some((ps, i) => ps.employed && !!s.people[i]?.job && w.travelers.includes(s.people[i].id));
  if (cars[0] && commute) driveLeg(s, cars[0], 150);
  for (const v of cars) {
    driveLeg(s, v, w.driveMiles);
    const trouble = roadTrouble(s, v, w.driveMiles * 1.609, 11 + Math.floor(s.clock.t));
    if (trouble.line) {
      out.push(trouble.line);
      if (trouble.extraDays > 0) w.lateUntil = Math.max(w.lateUntil ?? 0, s.clock.t + Math.min(1.5, trouble.extraDays * 0.5 + 0.25));
    }
  }
  // the last stretch: a hill road the snow has shut holds them at the bottom of it (sim/slope.ts)
  const shut = roadClosedFor(s);
  if (shut > 0) {
    out.push(`They got to the foot of the hill and ${ROAD_CLOSED_TEXT}. They wait it out${s.stock.plow >= 1 ? '' : ' (a plow blade on the truck would have had them up the hill)'}.`);
    w.lateUntil = Math.max(w.lateUntil ?? 0, s.clock.t + Math.min(1.5, shut * 0.5 + 0.25));
  }
  // the way in is cut (the bridge is down, the tunnel is choked): the cars are left outside, cut off, and the family carries its bags in on foot
  const cut = wayCut(s);
  if (cut) {
    for (const v of cars) v.stranded = true;
    out.push(`${cut[0].toUpperCase()}${cut.slice(1)}. They leave ${cars.length === 1 ? 'the car' : 'the cars'} at the outer end and walk in with the bags.`);
    w.lateUntil = Math.max(w.lateUntil ?? 0, s.clock.t + 0.2);
  }
  const extra = townCars(s, cars);
  payTrip(s, w, extra * w.driveMiles * TOWN_CAR_USD_MILE);
  w.tally.miles += w.driveMiles * Math.max(1, cars.length + extra) + (commute ? 150 : 0);
  w.tally.trips += 1;
  // top the tanks up in town before the trip back
  for (const v of cars) { if (runs(v) && v.fuel < VEHICLES[v.kind].tankL * 0.5) refuel(s, v); }
  return out;
}

/** The family arrives or leaves when the calendar says so. Called every sub-step. Returns log lines. */
export function presenceStep(s: GameState): string[] {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return [];
  const cal = calendarHere(s);
  const out: string[] = [];
  if (!cal) {
    // Sunday came before they got up the road: nobody made it this time
    if (!w.here) { delete w.lateUntil; return out; }
    w.here = false;
    delete w.lateUntil;
    out.push(...travel(s, w, false));
    dailyOf(s).plan.day = -1;   // the roster is made again for who is left
    return out;
  }
  if (w.here) return out;
  // arriving: the road first (a breakdown can hold them up), then the place
  if (w.lateUntil === undefined) out.push(...travel(s, w, true));
  if (w.lateUntil !== undefined && s.clock.t < w.lateUntil) return out;
  w.here = true;
  delete w.lateUntil;
  for (const v of fleetOf(s)) if (w.cars.includes(v.id) && !v.stranded) delete v.away;
  syncParking(s);
  if (logGate(s, 'wk-first', 1e9)) out.push('The family drives up from the town house for the weekend: Friday night to Sunday afternoon, and the holidays.');
  if (w.found.length) { out.push(`Up for the weekend: ${w.found.join(' ')}`); w.found = []; }
  dailyOf(s).plan.day = -1;   // the roster is made again for who is here
  return out;
}

/** When the calendar next changes (in days from now; null within a fortnight: never), for the Family tab. */
export function nextChange(s: GameState): { t: number; arriving: boolean } | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split' || w.stranded) return null;
  const now = calendarHere(s);
  for (let k = 1; k <= 24 * 14; k++) {
    const t = s.clock.t + k / 24;
    const d = dayIndex(t), h = ((t + 0.25) % 1) * 24;
    if (onSiteAt(s.clock.startDoy, d, h) !== now) return { t, arriving: !now };
  }
  return null;
}

// ── Where everyone is ──────────────────────────────────────────────────────

export type Where = 'here' | 'work' | 'town_house' | 'road';
/** Where a person is, for the Family tab. */
export function whereIs(s: GameState, personId: string): Where {
  const w = s.weekend;
  if (!isAbsent(s, personId)) return 'here';
  if (w?.stranded?.phase === 'road') return 'road';
  if (w?.stranded) return 'town_house';
  const i = s.people.findIndex(p => p.id === personId), ps = s.personState[i], p = s.people[i];
  const h = hourNow(s);
  if (ps?.employed && p?.job && !p.kid && workDay(s.clock.startDoy, dayIndex(s.clock.t)) && h >= 7 && h < 16) return 'work';
  return 'town_house';
}
export const WHERE_TEXT: Record<Exclude<Where, 'here'>, string> = { work: 'At work in town', town_house: 'At the town house', road: 'On the road home' };

// ── What an empty place invites ────────────────────────────────────────────

const lawWorks = (s: GameState) => s.disaster.tracks.law >= 0.5;
const banksOpen = (s: GameState) => s.disaster.tracks.banks >= 0.5;

/** Chances in a night that the empty place suffers something other than a break-in (which breakins.ts rolls): vandals, squatters, frozen pipes, a delivery stolen from the road. */
export function emptyRisk(s: GameState, coldDemand = 0): { vandal: number; squat: number; pipes: number; roadside: number } {
  if (!lawWorks(s) || !emptyNow(s)) return { vandal: 0, squat: 0, pipes: 0, roadside: 0 };
  const w = s.weekend!;
  const shield = watchShare(s);
  const seen = Math.min(2, Math.max(0.6, raidPressure(s) / 0.835));   // a talked-about place draws more
  const visiting = !!w.caretaker && w.caretaker.kind !== 'neighbor';
  return {
    vandal: (0.35 / 365) * shield * seen,
    squat: (0.1 / 365) * shield * seen,
    pipes: coldDemand > 1.2 && !visiting ? 0.012 : 0,
    roadside: s.roadside?.length && !w.caretaker ? 0.03 : 0,
  };
}

const money = (x: number) => `$${Math.round(x).toLocaleString('en-US')}`;

/** News from the empty place: told at once when a caretaker is there to ring, otherwise on the next Friday night. */
export function reportFound(s: GameState, text: string): string | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split' || w.here || !text) return text || null;
  if (w.caretaker?.on) return `The caretaker called: ${text[0].toLowerCase()}${text.slice(1)}`;
  w.found.push(text);
  return null;
}

function emptyEvents(s: GameState, w: Weekend, r: () => number): string[] {
  const out: string[] = [];
  const risk = emptyRisk(s, demandNow(s));
  const say = (t: string) => { const l = reportFound(s, t); if (l) out.push(l); };
  if (r() < risk.vandal) {
    w.tally.vandalism++;
    const cost = Math.round((250 + 1550 * r()) / 10) * 10;
    s.money -= cost;
    let text = `Vandals got in: a shed door smashed, paint on the barn, windows broken. About ${money(cost)} to put right.`;
    const th = stealTools(s, 0.15, 3);
    if (th.lines.length) text += ` ${th.lines[0]}`;
    say(text);
  }
  if (r() < risk.squat) {
    w.tally.squatters++;
    const cost = Math.round((900 + 2100 * r()) / 10) * 10 + 400;
    s.money -= cost;
    for (const k of ['canned', 'staples', 'firewood'] as const) s.stock[k] = Math.max(0, s.stock[k] - (k === 'firewood' ? 1 : 2 * r()));
    for (const ps of s.personState) ps.needs.morale = Math.max(0, ps.needs.morale - 6);
    say(`Squatters had been living in the place: the sheriff cleared them out, and the eviction, the lawyer and the cleaning came to ${money(cost)}. They ate through some of the food and burned a rick of wood.`);
  }
  if (r() < risk.pipes) {
    w.tally.pipes++;
    const cost = Math.round((900 + 3100 * r()) / 10) * 10;
    s.money -= cost;
    say(`A pipe froze and split in the cold. Water ran all week: ${money(cost)} in repairs and a ruined floor.`);
  }
  if (r() < risk.roadside && s.roadside.length) {
    const lost = s.roadside.shift()!;
    w.tally.theft++;
    say(`A delivery left at the road was gone when they got there: ${lost.lines.length} line${lost.lines.length === 1 ? '' : 's'} of materials, taken by someone with a truck.`);
  }
  return out;
}

// ── The town house: the market, the sale ───────────────────────────────────

/** Price level of the town market, 1 in a normal market, down to 0.55 at the hit: panic sales as the signs grow. */
export function marketFactor(s: GameState): number {
  const d = s.disaster;
  if (!d.kind || d.mode === 'sandbox') return 1;
  const w = tension(d, s.clock.t);
  return 1 - 0.45 * Math.pow(w, 1.15);
}

export interface Quote { value: number; fees: number; mortgage: number; net: number; factor: number }
/** What a sale clears today: the market price, the agent and closing, then the mortgage. */
export function saleQuote(s: GameState): Quote | null {
  const w = s.weekend;
  if (!w || w.town.status === 'sold' || isRented(w.town)) return null;
  const factor = marketFactor(s), value = Math.round(w.town.value * factor / 1000) * 1000;
  const fees = Math.round(value * SALE_FEES);
  return { value, fees, mortgage: w.town.mortgage, net: value - fees - w.town.mortgage, factor };
}

/** Why the house cannot be sold now (null: it can): the banks are shut, the buyers have gone, you cannot cover the shortfall. */
export function saleBlock(s: GameState): string | null {
  const w = s.weekend, q = saleQuote(s);
  if (!w || !q) return 'there is no town house to sell';
  const d = s.disaster, tr = d.tracks;
  if (tr.banks < 0.5) return 'the banks are closed: no sale can close and no mortgage can be paid off';
  if (d.kind && (d.phase === 'impact' || d.phase === 'survival') && (tr.banks < 0.8 || tr.stores < 0.5 || tr.law < 0.5)) return 'the market is frozen: there are no buyers';
  if (d.kind && d.mode !== 'sandbox' && tension(d, s.clock.t) >= 0.93) return 'buyers have walked away: the market has frozen';
  if (q.net < 0 && s.money < -q.net) return `the sale would leave ${money(-q.net)} owed on the mortgage and you cannot cover it`;
  return null;
}

// ── Moving in ──────────────────────────────────────────────────────────────

/** Jobs that can be done from the compound (the rest are a long drive each way). */
export const REMOTE_JOBS: ReadonlySet<string> = new Set(['software', 'accountant', 'insurance']);
export const canWorkFromHere = (p: Person): boolean => !!p.job && REMOTE_JOBS.has(p.job.id ?? '');

/** The jobs and what moving in does to each: kept (works from the compound) or quit (the drive is 90 minutes each way). */
export function jobOutlook(s: GameState): Array<{ person: Person; keep: boolean; remote: boolean }> {
  const w = s.weekend;
  return s.people.filter((p, i) => p.job && !p.kid && w?.travelers.includes(p.id) && s.personState[i]?.employed).map(p => {
    const remote = canWorkFromHere(p);
    return { person: p, remote, keep: remote && (w?.keepJobs ?? true) };
  });
}

/** Why moving in is not possible now (null: it is). */
export function moveInProblem(s: GameState): string | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return 'the family already lives here';
  if (w.stranded) return 'they are not on the place';
  return null;
}

interface MoveOpts { sell: boolean; reason: 'chosen' | 'hit' | 'home' }

/** The move itself: lifestyle, the household's belongings, the town house, the jobs, the money. Returns the lines for the card. */
export function moveIn(s: GameState, opts: MoveOpts): string[] {
  const w = s.weekend;
  const out: string[] = [];
  if (!w || w.mode !== 'split') return out;
  const q = saleQuote(s);
  w.mode = 'moved'; w.movedDay = dayIndex(s.clock.t); w.here = true; w.stranded = null; delete w.lateUntil;
  s.lifestyle = 'fulltime';
  // the vehicles are home to stay
  for (const v of fleetOf(s)) if (w.cars.includes(v.id)) delete v.away;
  w.cars = [];
  syncParking(s);
  // the town home
  if (isRented(w.town)) {
    out.push(opts.reason === 'hit'
      ? 'The lease on the rented place in town runs on without them; nobody there is going to chase the rent.'
      : `They give notice on the rented place in town: the lease ends and the deposit comes back (${money(w.town.rent! * 1)}).`);
    if (opts.reason !== 'hit' && s.disaster.tracks.banks >= 0.5) s.money += w.town.rent!;
    delete w.town.rent;
  } else if (opts.sell && q && !saleBlock(s)) {
    s.money += q.net;
    w.town.status = 'sold'; w.town.soldFor = q.value; w.town.net = q.net; w.town.soldDay = dayIndex(s.clock.t);
    out.push(`The town house sold for ${money(q.value)} (${Math.round(q.factor * 100)} % of what it was worth): the agent and closing took ${money(q.fees)}, the mortgage ${money(q.mortgage)}, and ${q.net >= 0 ? `${money(q.net)} went into the account` : `${money(-q.net)} came out of it`}.`);
    if (s.startFunds) { s.startFunds.lines.push({ label: 'Town house sold (after the mortgage)', usd: q.net }); s.startFunds.budget += q.net; }
    w.town.mortgage = 0;
  } else {
    w.town.status = 'kept';
    out.push(opts.reason === 'hit'
      ? 'The town house stands locked with the mortgage unpaid; nobody is coming to take it, and nobody to buy it.'
      : `The town house is kept: shut up, with the mortgage (${money(mortgagePayment(w.town))} a month) and the bills still running while the banks do. It is somewhere to go if this place falls.`);
  }
  // the household's belongings come up in the trucks
  const moveCost = opts.reason === 'hit' || s.disaster.tracks.banks < 0.5 ? 0 : 1800 + 350 * s.people.length;
  if (moveCost) { s.money -= moveCost; out.push(`The movers and a rented truck: ${money(moveCost)}.`); }
  s.stock.canned += 3; s.stock.staples += 2; s.stock.hygiene = (s.stock.hygiene ?? 0) + 1;
  out.push('The kitchen, the clothes, the books and the good tools come up with them; the pantry from town is added to the stores.');
  // the jobs
  const jobs: string[] = [];
  s.people.forEach((p, i) => {
    const ps = s.personState[i];
    if (!ps?.employed || !p.job) return;
    if (opts.reason !== 'hit' && canWorkFromHere(p) && w.keepJobs) { jobs.push(`${p.first} keeps the job (${p.job.title.toLowerCase()}) and works from the place`); }
    else { ps.employed = false; if (opts.reason !== 'hit') jobs.push(`${p.first} ${canWorkFromHere(p) ? 'quits the job' : 'gives notice: the drive is too far'} (${p.job.title.toLowerCase()})`); }
  });
  if (jobs.length) out.push(`${jobs.join('; ')}.`);
  dailyOf(s).plan.day = -1;
  return out;
}

/** What the empty place does with its lights (the Family tab). */
export function setAwayLights(s: GameState, mode: 'timers' | 'dark'): string | null {
  if (!s.weekend) return 'not a weekender';
  s.weekend.lights = mode;
  return null;
}
/** Tighten the belt in town (or loosen it again): the Family tab and the Next-step card. */
export function setBelt(s: GameState, on: boolean): string | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return 'the family lives on the place';
  w.belt = on;
  return null;
}
/** On the move-in card: keep the jobs that can be done from the place, or quit them all. */
export function setKeepJobs(s: GameState, keep: boolean): string | null {
  if (!s.weekend) return 'not a weekender';
  s.weekend.keepJobs = keep;
  // the open card tells the jobs' fate: say it again with the new choice
  const e = s.gate.pending;
  if (e?.kind === 'move_in') s.gate.pending = moveInCard(s, e.id, !e.title.startsWith('Time'));
  return null;
}

/** Sell the town house after the move (it was kept): the same sale, the same market. Null on success. */
export function sellTown(s: GameState): string | null {
  const w = s.weekend;
  if (!w || w.mode !== 'moved' || w.town.status !== 'kept') return 'there is no town house to sell';
  const why = saleBlock(s), q = saleQuote(s);
  if (why || !q) return why ?? 'no sale';
  s.money += q.net;
  w.town.status = 'sold'; w.town.soldFor = q.value; w.town.net = q.net; w.town.soldDay = dayIndex(s.clock.t); w.town.mortgage = 0;
  if (s.startFunds) { s.startFunds.lines.push({ label: 'Town house sold (after the mortgage)', usd: q.net }); s.startFunds.budget += q.net; }
  s.log.push({ t: s.clock.t, text: `The town house sold for ${money(q.value)}: ${money(q.fees)} to the agent, ${money(q.mortgage)} to the bank, ${q.net >= 0 ? money(q.net) + ' to you' : money(-q.net) + ' still owed, paid from the account'}.` });
  return null;
}

/** The move-in card is due: the signs are out, the family splits its week, and nothing else is waiting on the player. */
export function moveInDue(s: GameState): boolean {
  const w = s.weekend, d = s.disaster;
  if (!w || w.mode !== 'split' || w.stranded || !d.kind || d.mode === 'sandbox') return false;
  if (s.gate.pending || s.gate.card || s.gate.aftermath || s.ending) return false;
  if (d.phase !== 'warning' || w.asked >= 6) return false;
  const t = tension(d, s.clock.t);
  return w.askAt < 0 ? t >= (d.hitAt - d.warnAt <= 12 ? 0 : 0.2) : t >= w.askAt;
}

const headlines = (s: GameState): string[] => s.disaster.news.filter(n => n.tone >= 1).slice(-2).map(n => n.text);

/** The decision card: the signs, the market, the sale, the jobs. */
export function moveInCard(s: GameState, id: string, voluntary = false): Encounter {
  const w = s.weekend!, q = saleQuote(s), block = saleBlock(s), rented = isRented(w.town);
  const day = dayIndex(s.clock.t);
  const news = headlines(s);
  const jobs = jobOutlook(s);
  const dossier = [
    voluntary ? 'You decide to settle the question: is it time to live on the place?' : (news.length ? `The signs are everywhere. ${news.join(' ')}` : 'The talk in town has changed. People are stocking up and watching the news.'),
    rented
      ? `The place in town is rented, ${money(w.town.rent!)} a month. Nothing to sell and no market to fall: give notice and the deposit comes back. The rent is the cost of every week they wait.`
      : q ? `The town house: worth about ${money(w.town.value)} in a normal market, ${money(q.value)} now (${Math.round(q.factor * 100)} %) with ${money(q.mortgage)} still owed. ${block ? `You cannot sell: ${block}.` : q.net >= 0 ? `Sold today it would clear ${money(q.net)} after the agent and the mortgage. Next month it will be worth less, and soon it will not sell at all.` : `Sold today it would leave ${money(-q.net)} owed on the mortgage, which you would have to cover. Next month it will be worth less, and soon it will not sell at all.`}` : 'The town house is already sold.',
    jobs.length ? `Jobs: ${jobs.map(j => `${j.person.first} (${j.person.job!.title.toLowerCase()}) ${j.remote ? (w.keepJobs ? 'can keep working from the place' : 'would quit (you chose to quit them all)') : 'would have to quit: the drive is ' + Math.round(w.driveMiles / 55 * 60) + ' minutes each way'}`).join('; ')}.` : 'Nobody has a job left to give up.',
    `The place is ${w.driveMiles} miles up the road: about ${Math.round(w.driveMiles / 55 * 10) / 10} hours each way. Every week in town is a week not building, and the day the roads close they are on the wrong end.`,
  ];
  return {
    id, kind: 'move_in', day,
    title: voluntary ? 'Move in for good?' : 'Time to move in?',
    dossier, size: 0, armed: false, strength: 0,
    stances: rented ? ['move_lease', 'hold_on'] : block ? ['move_keep', 'hold_on'] : ['move_sell', 'move_keep', 'hold_on'],
  };
}

/** Open the card (the Family tab's "Move in now"); false when something else is waiting. */
export function openMoveIn(s: GameState): string | null {
  const why = moveInProblem(s);
  if (why) return why;
  if (s.gate.pending || s.gate.card || s.gate.aftermath) return 'something else needs an answer first';
  s.gate.pending = moveInCard(s, `e${s.nextId++}`, true);
  return null;
}

export function resolveMoveIn(s: GameState, stance: Stance): Outcome {
  const w = s.weekend!;
  if (stance === 'hold_on') {
    w.asked++;
    const t = s.disaster.kind ? tension(s.disaster, s.clock.t) : 0;
    w.askAt = Math.min(0.9, t + 0.22);
    return { title: 'Holding on', text: 'You decide to wait one more week. The jobs pay, and the place is not done. The price of the house will be lower next time, and you will have less time to move.', tone: 'mixed', lines: [] };
  }
  const lease = stance === 'move_lease' || isRented(w.town);
  const sell = stance === 'move_sell';
  const lines = moveIn(s, { sell, reason: 'chosen' });
  if (lease) return { title: 'Notice given, and home', text: 'The landlord gets the keys on Sunday. The family drives up with the trucks loaded and does not go back.', tone: 'good', lines };
  return { title: sell ? 'Sold, and home' : 'Moved in', text: sell ? 'The For Sale sign goes up in town on Saturday and comes down on Sunday: sold. The family drives up and does not go back.' : 'The family drives up with the trucks loaded and stays. The town house is locked, the key on the hook.', tone: 'good', lines };
}

// ── Caught in town ─────────────────────────────────────────────────────────

/** How hard the road is, 0 (clear) to 1 (closed): the disaster, the fuel and the law. */
export function roadJam(s: GameState): number {
  const d = s.disaster, tr = d.tracks;
  const kindJam: Partial<Record<string, number>> = { wildfire: 0.5, pandemic: 0.4, nuclear: 0.6, zombies: 0.85, civil_war: 0.7, invasion: 0.7, bioweapon: 0.6, asteroid: 0.6, unknown: 0.5, solar_flare: 0.4, grid_down: 0.3, cyberattack: 0.35, ash_winter: 0.5 };
  return Math.min(1, 0.12 + (kindJam[d.kind ?? ''] ?? 0.2) * 0.6 + (1 - tr.fuel) * 0.35 + (1 - tr.law) * 0.2);
}

function strandedCard(s: GameState, id: string): Encounter {
  const w = s.weekend!, day = dayIndex(s.clock.t);
  const cars = w.cars.map(i => fleetOf(s).find(v => v.id === i)).filter((v): v is Vehicle => !!v);
  const running = cars.filter(v => runs(v)).length;
  const jam = roadJam(s);
  return {
    id, kind: 'stranded', day, title: 'Caught in town',
    dossier: [
      `${s.disaster.phase === 'impact' ? 'It has happened' : 'It has hit'} and the family is at the town house, ${w.driveMiles} miles from the place, with the kids at school and two jobs to leave. The compound stands empty${w.caretaker ? `, except for the ${CARETAKER[w.caretaker.kind].name.toLowerCase().replace(/^a /, '')}` : ''}.`,
      running ? `${running} vehicle${running === 1 ? '' : 's'} ${running === 1 ? 'runs' : 'run'} with ${Math.round(cars.reduce((a, v) => a + (runs(v) ? v.fuel : 0), 0))} L between them. Traffic out of the city is ${jam > 0.65 ? 'at a standstill' : jam > 0.4 ? 'heavy, with checkpoints reported' : 'thick but moving'}.` : 'Nothing runs. The place is a long walk up the road.',
      'Behind them the place keeps going without anybody: the animals, the garden, the doors. Every hour you lose it is open.',
    ],
    size: 0, armed: false, strength: 0,
    stances: ['drive_now', 'back_roads', 'resupply'],
  };
}

/** The hit lands. In the compound: they stay. In town: the stranded card. */
function onHit(s: GameState, w: Weekend): string[] {
  // a move-in card nobody answered: the moment has passed
  if (s.gate.pending?.kind === 'move_in') s.gate.pending = null;
  if (w.here) {
    const lines = moveIn(s, { sell: false, reason: 'hit' });
    return ['The hit comes while the family is up at the place. They are not going back to town.', ...lines];
  }
  w.stranded = { since: s.clock.t, phase: 'card' };
  return ['It hit while the family was in town. The place is ' + w.driveMiles + ' miles away and empty.'];
}

export function resolveStranded(s: GameState, stance: Stance): Outcome {
  const w = s.weekend!, st = w.stranded!;
  const how = stance === 'back_roads' ? 'back_roads' : stance === 'resupply' ? 'resupply' : 'drive_now';
  const r = mulberry32(s.seed * 5821 + dayIndex(s.clock.t) * 17 + how.length);
  const cars = w.cars.map(id => fleetOf(s).find(v => v.id === id)).filter((v): v is Vehicle => !!v);
  const lines: string[] = [];
  const jam = roadJam(s);
  const tr = s.disaster.tracks;
  // fuel: a fill-up and cans first when they stop to shop, while the pumps still work
  if (how === 'resupply') {
    let got = 0;
    for (const v of cars) if (runs(v) && tr.fuel >= 0.2 && refuel(s, v)) got++;
    if (tr.stores >= 0.15 && s.money > 400) {
      const spend = Math.min(s.money * 0.4, 2500);
      s.money -= spend; s.stock.canned += Math.round(spend / 500); s.stock.staples += Math.round(spend / 700);
      lines.push(`They filled ${got ? 'the tanks' : 'what they could'} and grabbed ${Math.round(spend / 500)} cases of food for ${money(spend)} before the shelves went.`);
    }
    if (tr.fuel >= 0.2) s.stock.fuel += 2;
  }
  const running = cars.filter(v => runs(v) && v.fuel > 4);
  const walking = running.length === 0;
  const driveDays = Math.max(1, Math.ceil(0.4 + 2.4 * jam));
  const days = walking ? Math.ceil(w.driveMiles / 14) : Math.ceil(driveDays * (how === 'back_roads' ? 1.6 : 1) + (how === 'resupply' ? 1 : 0));
  const pDay = (how === 'back_roads' ? 0.07 : how === 'resupply' ? 0.16 : 0.12) + 0.35 * jam * (walking ? 1.4 : 1);
  const notes: string[] = [walking ? `On foot: ${w.driveMiles} miles at fourteen a day with the kids.` : `${how === 'back_roads' ? 'Back roads' : 'The highway'}: ${driveDays === 1 ? 'a day' : driveDays + ' days'} in the traffic.`];
  const hurt: NonNullable<Stranded['hurt']> = [];
  const lost: string[] = [];
  let extra = 0;
  for (let d = 0; d < days; d++) {
    if (r() >= pDay) continue;
    const u = r();
    const alive = s.people.filter((p, i) => w.travelers.includes(p.id) && s.personState[i]?.needs.died == null);
    if (u < 0.3 && running[0]) {
      const t = roadTrouble(s, running[0], w.driveMiles * 1.609, 900 + d);
      if (t.line) { notes.push(t.line); extra += t.extraDays; }
    } else if (u < 0.55) {
      const taken = Math.min(s.money, Math.round(s.money * 0.12));
      s.money -= taken; extra += 1;
      notes.push(`A checkpoint on the county road shook them down for ${money(taken)} and a day's wait in line.`);
    } else if (u < 0.78 && alive.length) {
      const p = alive[Math.floor(r() * alive.length)];
      hurt.push({ who: p.id, what: 'hurt in the crush at a gas station', sev: 18 + Math.floor(r() * 25) });
      notes.push(`${p.first} was hurt in the crush at a gas station.`);
    } else if (running[0] && tr.law < 0.6 && r() < 0.5) {
      const v = running.splice(0, 1)[0];
      lost.push(v.id);
      notes.push(`Men with guns took the ${VEHICLES[v.kind].name.toLowerCase()} at a roadblock. The rest of the way is on foot.`);
      extra += Math.ceil(w.driveMiles / 40);
    } else { extra += 1; notes.push('The road was closed at a bridge. They went round.'); }
  }
  // the fuel the trip burns
  if (!walking) for (const v of running) v.fuel = Math.max(0, v.fuel - w.driveMiles / VEHICLES[v.kind].mpg * 3.785 * (how === 'back_roads' ? 1.3 : 1.1));
  st.phase = 'road'; st.how = how; st.walking = walking || lost.length > 0;
  st.until = s.clock.t + days + extra; st.notes = notes; st.hurt = hurt; st.lostVehicles = lost;
  lines.push(...notes);
  const total = days + extra;
  return { title: how === 'resupply' ? 'Shopping first, then home' : how === 'back_roads' ? 'The back roads' : 'Straight home', text: `They load the cars and go. About ${total} day${total === 1 ? '' : 's'} on the road. Behind them the place sits empty.`, tone: 'mixed', lines };
}

/** Each day on the road, and the arrival. Returns log lines. */
function strandedDay(s: GameState, w: Weekend): string[] {
  const st = w.stranded;
  if (!st) return [];
  const out: string[] = [];
  if (st.phase === 'card') {
    // the card could not show (something else was waiting); after three days they just go
    if (!s.gate.pending && !s.gate.card && !s.gate.aftermath) s.gate.pending = strandedCard(s, `e${s.nextId++}`);
    else if (s.clock.t - st.since > 3) { resolveStranded(s, 'drive_now'); out.push('They did not wait for anyone to decide: they went.'); }
    return out;
  }
  if (st.until === undefined || s.clock.t < st.until) return out;
  // home
  const lines = [...(st.notes ?? [])];
  for (const h of st.hurt ?? []) {
    const i = s.people.findIndex(p => p.id === h.who);
    if (i >= 0 && s.personState[i]?.needs.died == null) s.personState[i].needs.hurt.push({ what: h.what, sev: h.sev });
  }
  for (const id of st.lostVehicles ?? []) { const vs = fleetOf(s); const k = vs.findIndex(v => v.id === id); if (k >= 0) vs.splice(k, 1); }
  w.stranded = null;
  const reasonHome = moveIn(s, { sell: false, reason: 'hit' });
  void reasonHome;
  const text = `The family reaches the place after ${Math.max(1, Math.round(s.clock.t - st.since))} days. ${lines.length > 1 ? lines.slice(1).join(' ') : ''}`.trim();
  s.gate.card = { title: 'Home at last', text, tone: 'mixed', lines: ['The town house is locked up behind them.', ...reasonHome.slice(0, 1)] };
  out.push(`The family is home, after ${Math.max(1, Math.round(s.clock.t - st.since))} days on the road from town.`);
  return out;
}

/** What breaks into an empty place after the law is gone: nobody to stop them, only a caretaker. Returns the log line, if any. */
export function emptyLooting(s: GameState, r: () => number): string | null {
  const w = s.weekend;
  if (!w || !emptyNow(s) || lawWorks(s)) return null;
  const guard = w.caretaker && w.caretaker.kind !== 'neighbor' ? 0.25 : 1;
  if (r() >= 0.1 * guard) return null;
  const lost = burgle(s, r, 1);
  return `Strangers went through the empty place. ${lost.join(' ')}`;
}

// ── Once a day ─────────────────────────────────────────────────────────────

/**
 * The weekender's day (the engine calls it right after the collapse clock):
 * the bills for two homes, the caretaker, an empty place's troubles, the move-in card,
 * the hit, the road home. Returns log lines.
 */
export function weekenderDay(s: GameState, before: Phase): string[] {
  const w = s.weekend;
  if (!w) return [];
  const day = dayIndex(s.clock.t);
  if (w.day === day) return [];
  w.day = day;
  const out: string[] = [];
  const hit = before !== 'impact' && s.disaster.phase === 'impact';
  // the town home costs money while the banks work, whether or not they live in it: the rent, or the mortgage and the upkeep
  if (banksOpen(s) && (w.town.status !== 'sold' || (w.town.rent !== undefined && w.mode === 'split'))) {
    const c = townCostPerDay(w);
    s.money -= c; w.tally.spent += c;
    if (w.town.status !== 'sold') w.town.mortgage = Math.max(0, w.town.mortgage - mortgagePayment(w.town) * 0.22 / 30);
  }
  // paid time off: a vacation week or a holiday that falls on a workday is still paid (the jobs are salaried), the first week's settling in is not
  if (w.mode === 'split' && banksOpen(s) && paidLeaveDay(s.clock.startDoy, day)) {
    const pay = s.people.reduce((a, p, i) => a + (s.personState[i]?.employed && p.job && !p.kid && w.travelers.includes(p.id) && s.personState[i].needs.died == null ? p.job.wage : 0), 0);
    if (pay > 0) s.money += pay;
  }
  if (w.mode === 'moved') return out;
  // the caretaker: paid, reliable or not, gone when the money is
  const c = w.caretaker;
  if (c) {
    const def = CARETAKER[c.kind];
    if (!banksOpen(s) || s.disaster.phase === 'impact' || s.disaster.phase === 'survival') {
      out.push(`${def.name.replace(/^An? /, 'The ')} stopped coming: ${banksOpen(s) ? 'they have their own to look after now' : 'nobody can pay them'}.`);
      w.caretaker = null;
    } else if (c.kind === 'neighbor' && !s.neighbors.some(n => n.id === c.neighbor && n.status === 'home')) {
      out.push('The neighbor who looked in is gone. Nobody is watching the place now.');
      w.caretaker = null;
    } else {
      s.money -= def.perMonth / 30; w.tally.spent += def.perMonth / 30;
      const u = mulberry32(s.seed * 4813 + day * 29 + 3)();
      c.on = u < def.reliability;
      if (!c.on) { c.missed++; w.tally.lapses++; }
    }
  }
  const r = mulberry32(s.seed * 8867 + day * 61 + 5);
  // the hit
  if (hit) out.push(...onHit(s, w));
  // the empty place
  if (!w.stranded && !s.gate.pending) out.push(...emptyEvents(s, w, r));
  // the move-in card
  if (moveInDue(s)) s.gate.pending = moveInCard(s, `e${s.nextId++}`);
  // the road home
  if (w.mode === 'split' && w.stranded) out.push(...strandedDay(s, w));
  return out;
}

/** The house after the family is gone for good from town (kept): who can still use it. Bug-out reads this. */
export function fallbackHouse(s: GameState): { name: string; miles: number } | null {
  const w = s.weekend;
  if (!w || w.town.status === 'sold' || isRented(w.town)) return null;
  return { name: 'the town house', miles: w.driveMiles };
}
