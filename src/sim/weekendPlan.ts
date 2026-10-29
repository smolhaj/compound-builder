/**
 * Weekender early-game guidance (docs/DECISIONS.md, "Weekender cash pacing"): where the money goes,
 * which stage of the cabin to order first, when the long stays are, and when a crew is worth hiring.
 * Pure (tested) numbers for the Next-step cards and the Projects tab; nothing here changes the game.
 *
 * The weekender's problem is cash before it is hours: two homes cost about what the two jobs pay, so
 * the account barely moves. The levers are a cheaper town position (rent, the belt), ordering a stage
 * at a time (the Shop's all-or-nothing "Order what the plans need" does not fit a $30k account), and
 * putting the paid-for hours where they count: the long stays for the family, the weekdays for a crew.
 */
import { BLUEPRINTS } from './blueprints';
import { isFinished } from './construction';
import { CREW_RATE, CREW_SIZE, crewProblem, crewQuote, hoursLeft } from './crews';
import { onOrder, orderCost, prices } from './economy';
import { livingPerDay } from './engine';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from './materials';
import { paceOf, weeksFor } from './pace';
import type { GameState, OrderLine, Structure } from './state';
import { dayIndex } from './state';
import {
  BELT_LIVING, BELT_UPKEEP, CARETAKER, doyOf, isFreeDay, isRented, paidLeaveDay, SETTLE_DAYS, townTaxHalf, townUpkeep, workDay,
} from './weekender';

const dow = (d: number): number => ((d % 7) + 7) % 7;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Fri May 28" for a sim day. */
export function dayLabel(startDoy: number, startYear: number, d: number): string {
  const doy = doyOf(startDoy, d);
  const t = new Date(Date.UTC(startYear, 0, doy));
  return `${DAYS[dow(d)]} ${t.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
}

// ── where the money goes ──────────────────────────────────────────────────

export interface Budget {
  /** What the jobs pay a month (workdays and paid time off, over the coming year). */
  wages: number;
  /** The household's groceries and bills a month. */
  living: number;
  /** The town home: rent, or mortgage + upkeep + the property tax spread over the year. */
  town: number;
  /** A caretaker, if hired. */
  caretaker: number;
  /** wages − living − town − caretaker. */
  net: number;
  /** What tightening the belt would save a month (0 when it is already tight). */
  beltSaves: number;
  /** The belt is tight now. */
  belt: boolean;
  rented: boolean;
}

/** A month of the weekender's money, at today's wages, prices and choices. */
export function weekendBudget(s: GameState): Budget | null {
  const w = s.weekend;
  if (!w || w.mode !== 'split') return null;
  const today = dayIndex(s.clock.t);
  let paidDays = 0;
  for (let d = today; d < today + 365; d++) if (workDay(s.clock.startDoy, d) ? dow(d) < 5 : paidLeaveDay(s.clock.startDoy, d)) paidDays++;
  const perDay = s.people.reduce((a, p, i) => a + (s.personState[i]?.employed && p.job && !p.kid && w.travelers.includes(p.id) && s.personState[i].needs.died == null ? p.job.wage : 0), 0);
  const wages = perDay * paidDays / 12;
  const full = livingPerDay(s) * 30, living = full * (w.belt ? BELT_LIVING : 1);
  const rented = isRented(w.town);
  const tax = w.town.status === 'sold' ? 0 : townTaxHalf(w.town) * 2 / 12;
  const upkeepFull = rented || w.town.status === 'sold' ? 0 : townUpkeep(w.town);
  const mortgage = rented || w.town.status === 'sold' ? 0 : Math.round(w.town.mortgage * 0.0062);
  const town = rented ? w.town.rent! : mortgage + upkeepFull * (w.belt ? BELT_UPKEEP : 1) + tax;
  const caretaker = w.caretaker ? CARETAKER[w.caretaker.kind].perMonth : 0;
  const beltSaves = w.belt ? 0 : full * (1 - BELT_LIVING) + upkeepFull * (1 - BELT_UPKEEP);
  return { wages, living, town, caretaker, net: wages - living - town - caretaker, beltSaves, belt: !!w.belt, rented };
}

// ── the next stage to order ───────────────────────────────────────────────

export interface StageOrder {
  /** The building, its kind and the stages in this order. */
  id: string;
  kind: string;
  name: string;
  stages: Array<{ index: number; name: string; hours: number }>;
  lines: OrderLine[];
  cost: number;
  /** Person-hours of work the order unlocks. */
  hours: number;
}

/** The buyable lines for the next `ahead` stages of the oldest building that lacks materials, less the stockpile and what is on the way. Null when every open building is supplied. */
export function nextStageOrder(s: GameState, ahead = 1): StageOrder | null {
  const avail: Partial<Record<MaterialId, number>> = {};
  const pending = onOrder(s);
  for (const m of MATERIAL_IDS) avail[m] = s.stock[m] + (pending[m] ?? 0);
  for (const st of s.structures) {
    if (isFinished(st)) continue;
    const stages = BLUEPRINTS[st.kind]?.stages ?? [];
    const from = st.supplied ? st.stage + 1 : st.stage;
    const lines: Partial<Record<MaterialId, number>> = {};
    const picked: StageOrder['stages'] = [];
    for (let i = from; i < Math.min(stages.length, from + ahead); i++) {
      let need = false;
      for (const [m, q] of Object.entries(stages[i].materials) as Array<[MaterialId, number]>) {
        const short = Math.max(0, Math.ceil(q - (avail[m] ?? 0) - 1e-6));
        avail[m] = Math.max(0, (avail[m] ?? 0) - q);
        if (short > 0 && MATERIALS[m].price !== null) { lines[m] = (lines[m] ?? 0) + short; need = true; }
      }
      if (need) picked.push({ index: i, name: stages[i].name, hours: stages[i].hours });
    }
    const order = (Object.entries(lines) as Array<[MaterialId, number]>).map(([material, qty]) => ({ material, qty }));
    if (order.length) return { id: st.id, kind: st.kind, name: st.kind.replace(/_/g, ' '), stages: picked, lines: order, cost: orderCost(order, prices(s)), hours: picked.reduce((a, x) => a + x.hours, 0) };
  }
  return null;
}

// ── long stays ────────────────────────────────────────────────────────────

export interface LongStay { startDay: number; days: number; name: string; label: string }

const holidayName = (doy: number, w: number): string | null => {
  if (doy >= 69 && doy <= 75) return 'Spring break';
  if (doy >= 196 && doy <= 209) return 'The July vacation';
  if (doy >= 357 || doy <= 2) return 'Christmas and New Year';
  if (w === 0 && doy >= 145 && doy <= 151) return 'Memorial Day weekend';
  if (doy === 185) return 'The Fourth of July';
  if (w === 0 && doy >= 244 && doy <= 250) return 'Labor Day weekend';
  if ((w === 3 && doy >= 326 && doy <= 332) || (w === 4 && doy >= 327 && doy <= 333)) return 'Thanksgiving';
  return null;
};

/** The next run of free days longer than a plain weekend, from day `from` (they come up Friday night: a 4-day weekend is Friday to Monday). */
export function nextLongStay(startDoy: number, startYear: number, from: number, horizon = 90): LongStay | null {
  for (let d = Math.max(from, SETTLE_DAYS); d < from + horizon; d++) {
    if (!isFreeDay(startDoy, d) || isFreeDay(startDoy, d - 1)) continue;   // the first free day of a run
    let n = 0;
    while (isFreeDay(startDoy, d + n)) n++;
    // a plain weekend is Saturday and Sunday: look for a weekday in the run
    let name: string | null = null;
    for (let k = 0; k < n; k++) if (dow(d + k) < 5) { name = holidayName(doyOf(startDoy, d + k), dow(d + k)); if (name) break; }
    if (n >= 3 && name) return { startDay: d, days: n, name, label: dayLabel(startDoy, startYear, d) };
  }
  return null;
}

// ── a crew for the weekdays ───────────────────────────────────────────────

export interface CrewIdea { st: Structure; usd: number; weeks: number; hours: number }

/** A building the crew could work on the weekdays: supplied, big enough to be worth it, no crew on it, and the money to pay for a week. */
export function crewIdea(s: GameState): CrewIdea | null {
  if (s.weekend?.mode !== 'split') return null;
  if ((s.crews ?? []).length) return null;
  for (const st of s.structures) {
    if (isFinished(st) || !st.supplied) continue;
    const hours = hoursLeft(st);
    if (hours < 150 || crewProblem(s, st)) continue;
    const q = crewQuote(st);
    return { st, usd: q.usd, weeks: q.weeks, hours };
  }
  return null;
}
/** A crew's day: the pay of four, nine hours. */
export const CREW_DAY_USD = CREW_RATE * CREW_SIZE * 9;

// ── the plan in words (the Projects tab) ──────────────────────────────────

/** Hours of the next order's work, in weekends at the family's pace. */
export function weekendsFor(s: GameState, hours: number): number | null {
  const pace = paceOf(s);
  const wk = weeksFor(hours, pace);
  return wk === null ? null : Math.max(0.5, Math.round(wk * 2) / 2);
}
