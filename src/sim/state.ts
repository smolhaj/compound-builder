/**
 * GameState — everything the simulation owns and the save file stores.
 * Plain JSON (no classes, no Maps) so it saves / loads / migrates as is.
 * Bump SAVE_VERSION and add a migration in save/migrations.ts whenever a
 * field changes (CLAUDE.md rule 5).
 */
import { foundLineage, newLineage, type Lineage } from './lineage';
import { emptyStock, type Stock, type MaterialId } from './materials';
import { generateFamily, type Person } from './family';
import type { StageId } from './blueprints';
import type { PerimeterRun } from './perimeter';
import { emptyUtilities, type Utilities } from './utilities';

import type { HardenId, HardenJob, Tier } from './hardening';
import { newLand, type LandState } from './land';
import { CLASSIC, LIFESTYLE, type Lifestyle, type Site } from './site';
import { REGIONS } from './regions';
import type { Crew } from './crews';
import { improvementStructures, type Fix, type SiteJobs } from './improvements';
import { CLOSING_COSTS, newPaper, type Paper } from './paperwork';
import { newUpkeep, type Upkeep } from './upkeep';
import { newShelf, type Shelf } from './shelf';
import { conditionsFor, newBody, type Body } from './body';
import { newFin, type Fin } from './finance';
import { newArmory, type Armory } from './armory';
import { newWild, type Wild } from './wildfood';
import { emptyStats, type Ending, type RunStats } from './report';
import { generateNeighbors, newGate, type GateState, type Neighbor } from './encounters';
import { freshNeeds, type FoodReport, type Needs } from './needs';
import { newDisaster, type Difficulty, type DisasterKind, type Mode, type PeaceLength, type DisasterState } from './disaster';
import type { BlackMarket } from './blackMarket';
export const SAVE_VERSION = 30;

/** Starting savings (GDS §1 peacetime money constraint). */
export const STARTING_MONEY = 30000;

/** Ricks of firewood brought along (a couple of weeks of spring nights). */
export const STARTING_FIREWOOD = 2;

/** A delivery dropped at the road, and the person-hours to carry it in. */
export interface Roadside { lines: OrderLine[]; hours: number; done: number }

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
  /** Bunker hardening fitted (tier per upgrade; absent = none). */
  hardening?: Partial<Record<HardenId, Tier>>;
  /** Came with the land (sim/improvements.ts); `unplaced` until the world finds it a spot. */
  pre?: boolean;
  unplaced?: boolean;
  /** Repairs it needs (old roof, wiring, plumbing, septic field). */
  fixes?: Fix[];
  /** County permit (sim/paperwork.ts): under review, approved, built without one, or stopped by the inspector; when review / the stop ends. */
  permit?: 'review' | 'ok' | 'none' | 'stopped';
  permitAt?: number;
}

export type TaskKind = 'idle' | 'build' | 'forestry' | 'sleep' | 'chores' | 'school' | 'leisure' | 'job' | 'gone' | 'shelter';

export interface PersonState {
  id: string;
  task: TaskKind;
  /** Structure id when building, felling job id when in the woods. */
  target: string | null;
  /** Still going to the day job (adults; ends when the disaster hits, or when they quit). */
  employed?: boolean;
  /** Lost the job when it hit (gets it back if the town comes back). */
  laidOff?: boolean;
  /** Health, morale, hunger, dose, wounds. */
  needs: Needs;
}

/** A tree marked for felling (GDS §2.1 "fell own timber"; docs/DECISIONS.md). */
export interface FellJob {
  id: string;
  /** Stable parcel tree id (planParcelTrees cell index). */
  treeId: number;
  x: number;
  z: number;
  kind: 'conifer' | 'oval' | 'broad';
  scale: number;
  /** marked → felled (on the ground) → bucked (cut to length) → hauled (done). */
  stage: 'marked' | 'felled' | 'bucked';
  /** Person-hours done on the current stage. */
  done: number;
  /** Hours to skid the logs to the yard (from the distance, set when marked). */
  haulHours: number;
}

export interface Forestry {
  jobs: FellJob[];
  /** Trees felled and hauled (stumps). */
  cleared: number[];
}

export interface Heat {
  /** Firewood burned toward the next whole rick. */
  burned: number;
  /** Day index of the last "out of firewood" warning. */
  warned: number;
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
  forestry: Forestry;
  heat: Heat;
  /** Fences, hedges, walls, berms, ditches. */
  perimeter: PerimeterRun[];
  /** Water and power: fittings, battery, storage, the last day's balance. */
  utilities: Utilities;
  /** Bunker hardening retrofits, ordered and in progress. */
  hardenJobs: HardenJob[];
  /** The neighbor parcels on the survey grid (who owns them, for sale, what they are). */
  land: LandState;
  /** The place itself: the listing the family bought (size, creek, groundwater, timber, soil). */
  site: Site;
  /** How the family lives in peacetime (budget, jobs, passive income). */
  lifestyle: Lifestyle;
  /** Hired crews at work on the place. */
  crews: Crew[];
  /** The co-op's line extension and the drive contractor, when due (null = not ordered). */
  siteJobs: SiteJobs;
  /** Deliveries left at the road (no drive yet): carried in by hand, oldest first. */
  roadside: Roadside[];
  /** Permits, property tax, insurance. */
  paper: Paper;
  /** Seasoning firewood, creosote in the flue. */
  upkeep: Upkeep;
  /** How old the stores are, rotation, traps. */
  shelf: Shelf;
  /** Medicine on hand per person. */
  body: Body;
  /** Savings, the brokerage account, cash in the safe, gold and silver. */
  fin: Fin;
  /** Guns, ammo by caliber, who can shoot. */
  armory: Armory;
  /** The game in the woods and the creek, licenses. */
  wild: Wild;
  /** The long game: eras, the chronicle, milestones, the dynasty score. */
  lineage: Lineage;
  /** The black market contact, deals and heat (lazily created by sim/blackMarket.ts; optional, no save bump). */
  blackMarket?: BlackMarket;
  /** The households round the place. */
  neighbors: Neighbor[];
  /** Who comes to the gate: the pending encounter, the last result, humanity and tallies. */
  gate: GateState;
  /** Tallies since the hit (the report card), and how the run ended (null while it goes on). */
  stats: RunStats;
  ending: Ending | null;
  /** Yesterday's eating (HUD). */
  food: FoodReport;
  /** The collapse clock: mode, the disaster to come, the outside world's services, the news ticker. */
  disaster: DisasterState;
  /** Recent events for the HUD log (newest last, capped). */
  log: LogEntry[];
  /** Next id counter. */
  nextId: number;
}

/** New-game choices (the setup screen). Defaults (tests, the dev scene): Free build, no day jobs. */
export interface RunSetup { site?: Site; lifestyle?: Lifestyle; difficulty?: Difficulty; mode?: Mode; peace?: PeaceLength; kind?: DisasterKind | null; variant?: string; dayJobs?: boolean; grid?: boolean; family?: Person[] }

export function newGame(seed: number, startDoy = 105, startYear = 2027, setup: RunSetup = {}): GameState {
  const people = setup.family ? structuredClone(setup.family) : generateFamily(seed);
  for (const p of people) p.conditions ??= conditionsFor(p, seed);
  foundLineage(people, seed);
  const site = setup.site ?? CLASSIC;
  const g: GameState = {
    version: SAVE_VERSION,
    seed,
    clock: { t: 0, ticks: 0, startDoy, startYear, speed: 1 },
    money: setup.site ? LIFESTYLE[setup.lifestyle ?? 'fulltime'].budget - Math.round(setup.site.price * (1 + CLOSING_COSTS)) : STARTING_MONEY,
    lifestyle: setup.lifestyle ?? 'fulltime',
    crews: [],
    siteJobs: { power: null, drive: null },
    roadside: [],
    paper: newPaper(),
    upkeep: newUpkeep(),
    shelf: newShelf(),
    body: newBody(),
    fin: newFin(),
    armory: newArmory(),
    wild: newWild(),
    lineage: newLineage(people[0].last),
    site,
    stock: { ...emptyStock(), firewood: STARTING_FIREWOOD, canned: 2 },
    neighbors: generateNeighbors(seed),
    land: newLand(seed, generateNeighbors(seed).map(n => n.id), (setup.site ?? CLASSIC).home),
    gate: newGate(seed),
    stats: emptyStats(),
    ending: null,
    food: { needKcal: 0, ateKcal: 0, producedKcal: 0, spoiledKcal: 0, fromStores: true, kinds: [], daysLeft: 0 },
    orders: [],
    people,
    personState: people.map(p => ({ id: p.id, task: 'idle', target: null, needs: freshNeeds(), ...(setup.dayJobs && p.job ? { employed: true } : {}) })),
    structures: [],
    forestry: { jobs: [], cleared: [] },
    heat: { burned: 0, warned: -1 },
    perimeter: [],
    utilities: { ...emptyUtilities(), grid: (setup.grid ?? false) && site.improvements.power },
    hardenJobs: [],
    disaster: newDisaster(seed, setup.mode ?? 'sandbox', setup.peace ?? 'random', setup.kind ?? null, setup.variant, setup.difficulty ?? 'standard', REGIONS[(setup.site ?? CLASSIC).region].odds),
    log: [{ t: 0, text: `The ${people[0].last} family arrives on the land.` }],
    nextId: 1,
  };
  g.structures.push(...improvementStructures(g));
  return g;
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
