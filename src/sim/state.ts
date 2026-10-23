/**
 * GameState — everything the simulation owns and the save file stores.
 * Plain JSON (no classes, no Maps) so it saves / loads / migrates as is.
 * Bump SAVE_VERSION and add a migration in save/migrations.ts whenever a
 * field changes (CLAUDE.md rule 5).
 */
import { emptyStock, type Stock, type MaterialId } from './materials';
import { generateFamily, type Person } from './family';
import type { StageId } from './blueprints';

export const SAVE_VERSION = 1;

/** Starting savings (GDS §1 peacetime money constraint). */
export const STARTING_MONEY = 30000;

export type Speed = 0 | 1 | 2 | 3 | 4;
/** Real seconds per in-game day at each speed (docs/DECISIONS.md: 1× = 60 s … 1.5 s). */
export const SECONDS_PER_DAY: Record<Exclude<Speed, 0>, number> = { 1: 60, 2: 20, 3: 6, 4: 1.5 };

export interface Clock {
  /** Days since the start of the game (fractional; 0 = start, 06:00 on the start date). */
  t: number;
  /** Quarter-hour sub-steps already simulated (integer; the systems run on these). */
  ticks: number;
  /** Day of the year the game started on (1–365). */
  startDoy: number;
  startYear: number;
  speed: Speed;
}

export interface OrderLine { material: MaterialId; qty: number }

export interface Order {
  id: string;
  lines: OrderLine[];
  cost: number;
  /** Game time placed / due (days). */
  placedAt: number;
  dueAt: number;
  status: 'ordered' | 'delivered';
}

export interface Structure {
  id: string;
  kind: string;
  x: number;
  z: number;
  rot: number;
  /** Index of the stage being worked (stages.length = finished). */
  stage: number;
  /** Person-hours done on the current stage. */
  done: number;
  /** Materials for the current stage taken from the stockpile. */
  supplied: boolean;
  /** Game time it was finished (days), or null. */
  finishedAt: number | null;
}

export type TaskKind = 'idle' | 'build' | 'sleep' | 'chores' | 'school' | 'leisure';

export interface PersonState {
  id: string;
  task: TaskKind;
  /** Structure id when building. */
  target: string | null;
}

export interface LogEntry { t: number; text: string }

export interface GameState {
  version: number;
  seed: number;
  clock: Clock;
  money: number;
  stock: Stock;
  orders: Order[];
  people: Person[];
  personState: PersonState[];
  structures: Structure[];
  /** Recent events for the HUD log (newest last, capped). */
  log: LogEntry[];
  /** Next id counter. */
  nextId: number;
}

export function newGame(seed: number, startDoy = 105, startYear = 2027): GameState {
  const people = generateFamily(seed);
  return {
    version: SAVE_VERSION,
    seed,
    clock: { t: 0, ticks: 0, startDoy, startYear, speed: 1 },
    money: STARTING_MONEY,
    stock: emptyStock(),
    orders: [],
    people,
    personState: people.map(p => ({ id: p.id, task: 'idle', target: null })),
    structures: [],
    log: [{ t: 0, text: `The ${people[0].last} family arrives on the land.` }],
    nextId: 1,
  };
}

/** Hour of day 0–24 (the clock starts at 06:00). */
export function hourOf(t: number): number {
  const f = ((t % 1) + 1) % 1;
  return (f * 24 + 6) % 24;
}

/** Whole days since the start (a day turns at midnight). */
export function dayIndex(t: number): number {
  return Math.floor(t + 0.25);
}

/** Day of year (1–365) and year for a game time. */
export function calendarOf(c: Clock, t = c.t): { doy: number; year: number } {
  const days = c.startDoy - 1 + dayIndex(t);
  return { doy: (days % 365) + 1, year: c.startYear + Math.floor(days / 365) };
}

export type { StageId };
