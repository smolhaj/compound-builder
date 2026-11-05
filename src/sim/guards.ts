/**
 * Hired security staff (docs/DECISIONS.md "Security staff"): contract guards posted at the gate, modelled on the hired crews (sim/crews.ts).
 * About $5,200 a month each (2025 armed contract guard, agency rate), billed by the day, up to three.
 *
 *  Shifts     like a real security contract: each guard works one 8-hour shift (06-14, 14-22, 22-06). One guard covers a third of the day,
 *             three cover all of it. Only the guards on shift add anything (a fighter at the gate and a pair of eyes on the road, capped).
 *  Quarters   with a hardened gate house (sim/richSinks.ts) the guard on shift sits in it and the rest sleep there; without one the
 *             guards drive up in their own cars and park at the drive (drawn: game/HomesteadWorld).
 *  Quitting   ordinary disasters do not send them home: the contract pays on while the money lasts. They walk off only in a PERMANENT
 *             collapse: the banks and the law both down (below 25 %) for a week running. Then each one leaves on his own day, not all at
 *             once: a few days to a couple of weeks after the week is up, longer for tenure, for a decent wage, and for a guard whose
 *             family lives nearby (a "local"). Payroll stops with the last one.
 *
 * Monotone (property test, sim/guards.test.ts): everything a guard adds is >= 0 and goes when he goes, and nothing here changes anything else,
 * so once the last guard has left the family is exactly where it would be had it never hired anyone (less the wages paid). Pure.
 */
import { log } from './economy';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { hourOf, type GameState } from './state';

export interface Guard {
  id: string;
  name: string;
  /** Day hired (clock.t). */
  hiredAt: number;
  /** Shift start hour: 6, 14 or 22. */
  shift: 6 | 14 | 22;
  /** Family close by: stays longer in a collapse. */
  local: boolean;
  /** Days of permanent collapse this one holds out before leaving (the stagger). */
  holds: number;
}
export interface Guards {
  staff: Guard[];
  /** Days on the payroll in all, and dollars paid. */
  days: number; paid: number;
  /** Consecutive days of permanent collapse. */
  collapseDays: number;
  /** The last one to leave, and when (for the card). */
  lastQuit: { name: string; day: number; left: number } | null;
}
export const newGuards = (): Guards => ({ staff: [], days: 0, paid: 0, collapseDays: 0, lastQuit: null });

export const MAX_GUARDS = 3;
export const GUARD_MONTH = 5200;
/** $ per guard per day. */
export const GUARD_DAY = Math.round(GUARD_MONTH * 12 / 365);
/** What each guard on shift adds at the gate: a fighter and warning points (capped in total). */
export const GUARD = { fighters: 1, detection: 4, detectionCap: 12 };
/** A permanent collapse: banks and law below this, for this many days running. */
export const COLLAPSE = { track: 0.25, days: 7 };
export const SHIFTS: ReadonlyArray<6 | 14 | 22> = [6, 14, 22];
const NAMES = ['Dale', 'Marcus', 'Ray', 'Luis', 'Greg', 'Tony', 'Walt', 'Hector', 'Nate', 'Boyd'];

export const guardsOf = (s: GameState): Guards => (s.guards ??= newGuards());
export const guardCount = (s: GameState): number => s.guards?.staff.length ?? 0;

/** Is a guard on shift at this hour of the day? */
export const onShift = (g: Pick<Guard, 'shift'>, hour: number): boolean => { const e = (g.shift + 8) % 24; return g.shift < e ? hour >= g.shift && hour < e : hour >= g.shift || hour < e; };
/** The guards on shift now. */
export const onDuty = (s: GameState, hour = hourOf(s.clock.t)): Guard[] => (s.guards?.staff ?? []).filter(g => onShift(g, hour));
/** The share of the 24 hours someone is on shift (3 guards on different shifts: 1). */
export const coverage = (s: GameState): number => new Set((s.guards?.staff ?? []).map(g => g.shift)).size / SHIFTS.length;

/** What the guards on shift add to the gate's posture right now. */
export function guardPosture(s: GameState): { fighters: number; detection: number } {
  const n = onDuty(s).length;
  return { fighters: n * GUARD.fighters, detection: Math.min(GUARD.detectionCap, n * GUARD.detection) };
}

/** Banks and law both gone and staying gone: the world has ended, not just a bad week. */
export const permanentCollapse = (s: GameState): boolean => (s.guards?.collapseDays ?? 0) >= COLLAPSE.days;
const failed = (s: GameState): boolean => { const t = s.disaster.tracks; return t.banks < COLLAPSE.track && t.law < COLLAPSE.track; };

/** Where the guards sleep and wait: the gate house, or their own cars at the drive. */
export const bunk = (s: GameState): 'gate_house' | 'cars' => ((s.stock.gate_house ?? 0) >= 1 ? 'gate_house' : 'cars');
/** Cars parked at the drive (one per guard on the place, off shift or on, when there is no gate house to sleep in). */
export const parkedCars = (s: GameState): number => (bunk(s) === 'cars' ? guardCount(s) : 0);

/** Why a guard cannot be hired now (null: one can). */
export function guardProblem(s: GameState): string | null {
  if (guardCount(s) >= MAX_GUARDS) return `${MAX_GUARDS} guards is the most the contract covers`;
  if (permanentCollapse(s) || failed(s)) return 'no agency is sending guards now';
  if (!s.structures.some(st => isHome(st.kind) && isFinished(st))) return 'there is nothing to guard yet: build a home first';
  if (s.money < GUARD_MONTH) return 'not enough money for the first month';
  return null;
}

export function hireGuard(s: GameState): string | null {
  const why = guardProblem(s);
  if (why) return why;
  const g = guardsOf(s);
  const r = mulberry32(s.seed * 7919 + g.staff.length * 131 + Math.floor(s.clock.t));
  const used = new Set(g.staff.map(x => x.shift));
  const shift = SHIFTS.find(x => !used.has(x)) ?? SHIFTS[g.staff.length % 3];
  const name = NAMES[Math.floor(r() * NAMES.length)];
  const local = r() < 0.3;
  g.staff.push({ id: `g${s.nextId++}`, name, hiredAt: s.clock.t, shift, local, holds: 2 + Math.floor(r() * 9) });
  const where = bunk(s) === 'gate_house' ? 'He will have the gate house.' : 'He will park at the drive.';
  log(s, `Hired ${name} as a contract guard (${String(shift).padStart(2, '0')}:00 to ${String((shift + 8) % 24).padStart(2, '0')}:00): $${GUARD_MONTH.toLocaleString('en-US')} a month. ${where}`);
  return null;
}

export function dismissGuard(s: GameState): void {
  const g = guardsOf(s);
  const out = g.staff.pop();
  if (out) log(s, `${out.name} was let go (${g.staff.length} left).`);
}

/** Days a guard holds out in a permanent collapse: his own draw, plus tenure, a decent wage and family nearby. */
export function holdDays(s: GameState, g: Guard): number {
  const years = Math.max(0, (s.clock.t - g.hiredAt) / 365);
  return g.holds + Math.min(8, Math.round(years * 2)) + 3 + (g.local ? 6 : 0);
}

/** One day: pay the payroll; in a permanent collapse they leave one at a time. */
export function guardDay(s: GameState): string[] {
  const g = s.guards;
  if (!g) return [];
  const out: string[] = [];
  g.collapseDays = failed(s) ? g.collapseDays + 1 : 0;
  if (!g.staff.length) return out;
  if (permanentCollapse(s)) {
    const sinceWeek = g.collapseDays - COLLAPSE.days;
    for (const x of [...g.staff]) {
      if (sinceWeek >= holdDays(s, x)) {
        g.staff = g.staff.filter(y => y.id !== x.id);
        g.lastQuit = { name: x.name, day: Math.floor(s.clock.t), left: g.staff.length };
        out.push(g.staff.length ? `${x.name} quit: he is going to his family. ${g.staff.length} guard${g.staff.length > 1 ? 's' : ''} still on the place.` : `${x.name}, the last guard, quit and drove off. Nobody is coming back.`);
      }
    }
  }
  if (!g.staff.length) return out;
  const bill = g.staff.length * GUARD_DAY;
  if (s.money < bill) { const n = g.staff.length; g.staff = []; out.push(`The ${n > 1 ? `${n} guards` : 'guard'} went home: there was no money to pay them.`); return out; }
  s.money -= bill; g.paid += bill; g.days += 1;
  return out;
}
