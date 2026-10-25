/**
 * Farm and kitchen labor (decided with the user: "each method has a labor
 * cost; expose it so the daily-life schedule's kitchen or preserving task
 * can drive it later"). Pure.
 *
 * Every chore the farm systems do books person-hours here, by task, for
 * the day. Animal care (feeding, milking, mucking out) is always done and
 * is booked first; the kitchen work that can wait (canning, drying,
 * cheese, boiling sap, haying, fishing) only gets what's left of the day's
 * budget. Until the schedule drives it, the budget is the routine's chore
 * time: an adult at a day job has about 3 hours (dawn and the evening), one
 * at home about 5 (chores plus part of the work block), an elder 3, a kid
 * of 10–15 one hour; less for the hurt and the hungry.
 *
 * `LABOR` holds the person-hours a unit of each job takes, from extension
 * and homesteading sources (a canning day of 14 quarts ≈ 7 hours; a hog
 * ≈ 8 hours to kill, scald, scrape, gut and cut; milking a goat ≈ 15
 * minutes twice a day; a scythe mows about an acre a day).
 */
import type { GameState } from './state';

export type FarmTask = 'animals' | 'milking' | 'butchering' | 'canning' | 'drying' | 'smoking' | 'curing' | 'dairy' | 'haying' | 'fishing' | 'sugaring' | 'sowing';
export const FARM_TASKS: readonly FarmTask[] = ['animals', 'milking', 'butchering', 'canning', 'drying', 'smoking', 'curing', 'dairy', 'haying', 'fishing', 'sugaring', 'sowing'];

/** Person-hours a unit of each job takes. */
export const LABOR = {
  /** A case of 12 quarts put up: picking over, washing, peeling, packing, the canner (water bath / pressure). */
  caseWaterBath: 2.5, casePressure: 3,
  /** A case of 12 quarts of meat (cutting up, packing raw, 75–90 minutes in the canner). */
  caseMeat: 3.5,
  /** A basket (≈ 2,000 kcal, 6–8 lb) sliced onto dehydrator trays or sun screens. */
  dryBasket: 1,
  /** 10,000 kcal of meat (≈ 10 lb) cut, brined and smoked / rubbed with the cure and overhauled. */
  smoke10k: 1, cure10k: 0.5,
  /** A pound of hard cheese (a 2-gallon batch makes about 1.7 lb in ≈ 3 hours); a pound of butter skimmed and churned. */
  cheeseLb: 1.5, butterLb: 0.4,
  /** Daily care a head: feeding, water, mucking out; milking a doe / a cow twice a day. */
  careGoat: 0.15, careCow: 0.35, carePig: 0.1, careRabbit: 0.03, careHen: 0.01, milkDoe: 0.5, milkCow: 0.75,
  /** Butchering a head. */
  butcher: { pig: 8, sow: 10, boar: 10, steer: 24, cow: 24, goat: 4, goat_buck: 4, kid: 3, calf: 12, piglet: 8, rabbit: 0.3, hen: 0.4 } as Record<string, number>,
  /** Rendering a hog's fat into lard. */
  renderLard: 3,
  /** A bale of hay by hand (scythe, rake, fork) or with a tractor and baler. */
  baleHand: 0.25, baleTractor: 0.02,
  /** A day's fishing on the pond (a couple of hours at dawn or dusk). */
  fishDay: 1.5,
  /** Maple: running a bucket line (an hour for 25 taps), boiling (tending the arch per 10 gallons of sap on an evaporator). */
  sapPerTap: 0.04, boil10Gal: 1,
} as const;

export interface WorkDay {
  /** Day index the ledger is for. */
  day: number;
  /** Person-hours the household has for farm and kitchen work today. */
  budget: number;
  /** Booked, by task. */
  used: Partial<Record<FarmTask, number>>;
}
export const newWorkDay = (): WorkDay => ({ day: -1, budget: 0, used: {} });

/** The day's farm and kitchen budget (person-hours) from who is on the place (see the header). */
export function farmHours(s: GameState): number {
  const weekday = Math.floor(s.clock.t + 0.25) % 7 < 5;
  let h = 0;
  s.people.forEach((p, i) => {
    const ps = s.personState[i], n = ps?.needs;
    if (!n || n.died != null || n.taken || ps.task === 'away') return;
    const fit = Math.min(1, Math.max(0.2, n.health / 60)) * (n.hurt.some(x => x.trauma && x.sev >= 50) ? 0.1 : 1);
    const base = p.kid ? (p.age >= 10 ? 1 : 0) : p.elder ? 3 : ps.employed && weekday ? 3 : 5;
    h += base * fit;
  });
  return h;
}

/** The ledger for today (a fresh one at the turn of the day). */
export function workDay(s: GameState): WorkDay {
  const f = s.farm;
  const day = Math.floor(s.clock.t + 0.25);
  if (f.work.day !== day) f.work = { day, budget: farmHours(s), used: {} };
  return f.work;
}

export const hoursUsed = (w: WorkDay) => Object.values(w.used).reduce((a, x) => a + (x ?? 0), 0);
/** Person-hours left today. */
export const hoursLeft = (s: GameState) => { const w = workDay(s); return Math.max(0, w.budget - hoursUsed(w)); };

/** Book `hours` of a task: all of it if `force` (animal care, a butchering), else only what's left of the day. Returns the hours granted. */
export function book(s: GameState, task: FarmTask, hours: number, force = false): number {
  if (!(hours > 0)) return 0;
  const w = workDay(s), got = force ? hours : Math.min(hours, hoursLeft(s));
  if (got > 0) w.used[task] = (w.used[task] ?? 0) + got;
  return got;
}
